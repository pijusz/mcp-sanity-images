import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  API_VERSION,
  buildQueryRequest,
  choosePatchTarget,
  DEFAULT_PERSPECTIVE,
  mutateUrl,
  PERSPECTIVES,
} from "../src/sanity";
import { registerQueryTools } from "../src/tools/query";
import { registerUploadTools } from "../src/tools/upload";

const config = { projectId: "abc123", dataset: "production" };

function getTools(server: McpServer): Record<string, any> {
  return (server as any)._registeredTools;
}

describe("API version", () => {
  test("is pinned to v2025-02-19", () => {
    expect(API_VERSION).toBe("2025-02-19");
    expect(buildQueryRequest("*", config).url).toStartWith(
      "https://abc123.api.sanity.io/v2025-02-19/data/query/production?",
    );
    expect(mutateUrl(config)).toStartWith(
      "https://abc123.api.sanity.io/v2025-02-19/data/mutate/production?",
    );
  });
});

describe("buildQueryRequest", () => {
  test("always sends a perspective, defaulting to raw", () => {
    expect(DEFAULT_PERSPECTIVE).toBe("raw");
    const url = new URL(buildQueryRequest("*[0]", config).url);
    expect(url.searchParams.get("perspective")).toBe("raw");
    expect(url.searchParams.get("query")).toBe("*[0]");
  });

  test("passes an explicit perspective", () => {
    for (const perspective of PERSPECTIVES) {
      const url = new URL(buildQueryRequest("*", config, { perspective }).url);
      expect(url.searchParams.get("perspective")).toBe(perspective);
    }
  });

  test("JSON-encodes params as $-prefixed URL params", () => {
    const req = buildQueryRequest("*[_id in $ids]", config, {
      params: { ids: ["a", "b"] },
    });
    const url = new URL(req.url);
    expect(req.method).toBe("GET");
    expect(url.searchParams.get("$ids")).toBe('["a","b"]');
  });

  test("long queries use POST with perspective in the URL, not the body", () => {
    const query = `*[_id in [${Array.from({ length: 2000 }, (_, i) => `"id-${i}"`).join(",")}]]`;
    const req = buildQueryRequest(query, config, {
      perspective: "published",
      params: { x: 1 },
    });
    expect(req.method).toBe("POST");
    expect(new URL(req.url).searchParams.get("perspective")).toBe("published");
    const body = JSON.parse(req.body ?? "{}");
    expect(body).toEqual({ query, params: { x: 1 } });
  });
});

describe("mutateUrl", () => {
  test("asks for ids and synchronous visibility", () => {
    const url = new URL(mutateUrl(config));
    expect(url.searchParams.get("returnIds")).toBe("true");
    expect(url.searchParams.get("visibility")).toBe("sync");
  });
});

describe("choosePatchTarget", () => {
  test("published only: patches the published ID", () => {
    expect(choosePatchTarget("doc1", ["doc1"])).toEqual({ id: "doc1" });
  });

  test("published + draft, bare ID: patches published and warns about the draft", () => {
    const t = choosePatchTarget("doc1", ["doc1", "drafts.doc1"]);
    expect(t.id).toBe("doc1");
    expect(t.note).toContain("drafts.doc1");
  });

  test("explicit draft ID: patches the draft", () => {
    expect(choosePatchTarget("drafts.doc1", ["doc1", "drafts.doc1"])).toEqual({
      id: "drafts.doc1",
    });
  });

  test("draft-only document addressed by its bare ID: patches the draft", () => {
    const t = choosePatchTarget("doc1", ["drafts.doc1"]);
    expect(t.id).toBe("drafts.doc1");
    expect(t.note).toContain("never been published");
  });

  test("missing draft ID with published doc: throws with a hint", () => {
    expect(() => choosePatchTarget("drafts.doc1", ["doc1"])).toThrow(
      "The published document doc1 exists",
    );
  });

  test("nothing exists: throws", () => {
    expect(() => choosePatchTarget("doc1", [])).toThrow(
      "Document not found: doc1 (also checked drafts.doc1)",
    );
  });

  test("release version IDs are patched as given", () => {
    expect(choosePatchTarget("versions.r1.doc1", ["versions.r1.doc1"])).toEqual({
      id: "versions.r1.doc1",
    });
  });
});

describe("groq_query perspective param", () => {
  test("accepts raw/published/drafts and rejects others", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTools(server);
    const schema = getTools(server)["groq_query"].inputSchema;
    for (const p of PERSPECTIVES) {
      expect(schema.safeParse({ query: "*", perspective: p }).success).toBe(true);
    }
    expect(schema.safeParse({ query: "*" }).success).toBe(true);
    expect(schema.safeParse({ query: "*", perspective: "previewDrafts" }).success).toBe(
      false,
    );
  });
});

describe("tool calls with mocked fetch", () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return new Response(JSON.stringify(handler(url, init)), { status: 200 });
    }) as typeof fetch;
    return calls;
  }

  test("groq_query sends the default raw perspective and an explicit one", async () => {
    process.env.SANITY_PROJECT_ID = "abc123";
    process.env.SANITY_TOKEN = "t";
    const calls = mockFetch(() => ({ result: 42 }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTools(server);
    const tool = getTools(server)["groq_query"];
    const r1 = await tool.handler({ query: "count(*)" }, {} as any);
    const r2 = await tool.handler(
      { query: "count(*)", perspective: "published" },
      {} as any,
    );
    expect(r1.content[0].text).toBe("42");
    expect(r2.content[0].text).toBe("42");
    expect(new URL(calls[0].url).searchParams.get("perspective")).toBe("raw");
    expect(new URL(calls[1].url).searchParams.get("perspective")).toBe("published");
  });

  function setupImage() {
    const dir = join(tmpdir(), `mcp-sanity-images-api-${Date.now()}-${Math.random()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "hero-banner.png");
    writeFileSync(file, "fake");
    return { dir, file };
  }

  test("upload_and_set fails before uploading when the document is missing", async () => {
    process.env.SANITY_PROJECT_ID = "abc123";
    process.env.SANITY_TOKEN = "t";
    const { dir, file } = setupImage();
    const calls = mockFetch(() => ({ result: [] }));
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerUploadTools(server);
    const tool = getTools(server)["upload_and_set"];
    await expect(
      tool.handler({ filePath: file, documentId: "doc1", fieldPath: "image" }, {} as any),
    ).rejects.toThrow("Document not found: doc1");
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain("/data/query/");
    expect(calls.some((c) => c.url.includes("/assets/"))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  test("upload_and_set patches the draft of a never-published document", async () => {
    process.env.SANITY_PROJECT_ID = "abc123";
    process.env.SANITY_TOKEN = "t";
    const { dir, file } = setupImage();
    const calls = mockFetch((url) => {
      if (url.includes("/data/query/")) return { result: ["drafts.doc1"] };
      if (url.includes("/assets/images/"))
        return { document: { _id: "image-abc-1x1-png", url: "https://cdn/x.png" } };
      return {
        transactionId: "tx",
        results: [{ id: "drafts.doc1", operation: "update" }],
      };
    });
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerUploadTools(server);
    const tool = getTools(server)["upload_and_set"];
    const result = await tool.handler(
      { filePath: file, documentId: "doc1", fieldPath: "hero.image" },
      {} as any,
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.documentId).toBe("drafts.doc1");
    expect(data.requestedDocumentId).toBe("doc1");
    expect(data.note).toContain("never been published");

    const queryUrl = new URL(calls[0].url);
    expect(queryUrl.searchParams.get("perspective")).toBe("raw");
    expect(JSON.parse(queryUrl.searchParams.get("$ids") ?? "[]")).toEqual([
      "doc1",
      "drafts.doc1",
    ]);
    const mutateCall = calls.find((c) => c.url.includes("/data/mutate/"));
    expect(mutateCall?.url).toContain("returnIds=true");
    const body = JSON.parse(String(mutateCall?.init?.body));
    expect(body.mutations[0].patch.id).toBe("drafts.doc1");
    expect(body.mutations[0].patch.set["hero.image"].asset._ref).toBe(
      "image-abc-1x1-png",
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

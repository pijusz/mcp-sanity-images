import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBatchTools } from "../src/tools/batch.js";
import { registerBrowseTools } from "../src/tools/browse.js";
import { registerQueryTools } from "../src/tools/query.js";
import { registerUploadTools } from "../src/tools/upload.js";

function getTools(server: McpServer): Record<string, any> {
  return (server as any)._registeredTools;
}

describe("tool registration", () => {
  test("registers all upload tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerUploadTools(server);
    const tools = getTools(server);
    expect(tools["upload_image"]).toBeDefined();
    expect(tools["upload_and_set"]).toBeDefined();
  });

  test("registers batch tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBatchTools(server);
    const tools = getTools(server);
    expect(tools["batch_upload"]).toBeDefined();
  });

  test("registers browse tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBrowseTools(server);
    const tools = getTools(server);
    expect(tools["list_images"]).toBeDefined();
  });

  test("registers query tools", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerQueryTools(server);
    const tools = getTools(server);
    expect(tools["groq_query"]).toBeDefined();
  });

  test("all 5 tools registered together", () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerUploadTools(server);
    registerBatchTools(server);
    registerBrowseTools(server);
    registerQueryTools(server);
    const tools = getTools(server);
    expect(Object.keys(tools)).toHaveLength(5);
  });
});

describe("list_images", () => {
  const tmpDir = `/tmp/mcp-sanity-images-browse-${Date.now()}`;

  beforeEach(async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(`${tmpDir}/nested`, { recursive: true });
    writeFileSync(`${tmpDir}/photo.png`, Buffer.alloc(1024));
    writeFileSync(`${tmpDir}/icon.svg`, "<svg></svg>");
    writeFileSync(`${tmpDir}/readme.txt`, "not an image");
    writeFileSync(`${tmpDir}/nested/deep.jpg`, Buffer.alloc(512));
  });

  afterEach(async () => {
    const { rmSync } = await import("node:fs");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("lists images in directory", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBrowseTools(server);
    const tool = getTools(server)["list_images"];
    const result = await tool.handler({ directory: tmpDir, recursive: false }, {} as any);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(2);
    expect(data.images.some((i: any) => i.name === "photo.png")).toBe(true);
    expect(data.images.some((i: any) => i.name === "icon.svg")).toBe(true);
  });

  test("lists recursively", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBrowseTools(server);
    const tool = getTools(server)["list_images"];
    const result = await tool.handler({ directory: tmpDir, recursive: true }, {} as any);
    const data = JSON.parse(result.content[0].text);
    expect(data.count).toBe(3);
  });

  test("returns error for missing directory", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBrowseTools(server);
    const tool = getTools(server)["list_images"];
    const result = await tool.handler({ directory: "/nonexistent/path" }, {} as any);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  test("returns message for empty directory", async () => {
    const { mkdirSync } = await import("node:fs");
    const emptyDir = `${tmpDir}/empty`;
    mkdirSync(emptyDir);
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBrowseTools(server);
    const tool = getTools(server)["list_images"];
    const result = await tool.handler({ directory: emptyDir }, {} as any);
    expect(result.content[0].text).toContain("No image files");
  });

  test("includes file metadata", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBrowseTools(server);
    const tool = getTools(server)["list_images"];
    const result = await tool.handler({ directory: tmpDir, recursive: false }, {} as any);
    const data = JSON.parse(result.content[0].text);
    const photo = data.images.find((i: any) => i.name === "photo.png");
    expect(photo.size).toBe(1024);
    expect(photo.extension).toBe("png");
    expect(photo.path).toContain(tmpDir);
  });
});

describe("batch_upload error paths", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns error for missing directory", async () => {
    process.env.SANITY_PROJECT_ID = "test-project";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBatchTools(server);
    const tool = getTools(server)["batch_upload"];
    const result = await tool.handler({ directory: "/nonexistent" }, {} as any);
    expect(result.isError).toBe(true);
  });

  test("returns message for empty directory", async () => {
    const { mkdirSync } = await import("node:fs");
    const tmpDir = `/tmp/mcp-sanity-images-batch-empty-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });

    process.env.SANITY_PROJECT_ID = "test-project";
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBatchTools(server);
    const tool = getTools(server)["batch_upload"];
    const result = await tool.handler({ directory: tmpDir }, {} as any);
    expect(result.content[0].text).toContain("No image files");

    const { rmSync } = await import("node:fs");
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("throws without project ID", async () => {
    delete process.env.SANITY_PROJECT_ID;
    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerBatchTools(server);
    const tool = getTools(server)["batch_upload"];
    expect(tool.handler({ directory: "/tmp" }, {} as any)).rejects.toThrow(
      "No project ID",
    );
  });
});

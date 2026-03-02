import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

describe("MCP server", () => {
  test("responds to initialize", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts"], {
      cwd: ROOT,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const initMsg = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });

    proc.stdin.write(initMsg + "\n");
    proc.stdin.flush();

    const reader = proc.stdout.getReader();
    const { value } = await reader.read();
    const response = JSON.parse(new TextDecoder().decode(value));

    expect(response.result.serverInfo.name).toBe("mcp-sanity-images");
    expect(response.result.capabilities.tools).toBeDefined();

    proc.kill();
  });

  test("lists all 5 tools", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts"], {
      cwd: ROOT,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const messages = [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    ].join("\n");

    proc.stdin.write(messages + "\n");
    proc.stdin.flush();

    const reader = proc.stdout.getReader();
    let output = "";
    for (let i = 0; i < 2; i++) {
      const { value } = await reader.read();
      output += new TextDecoder().decode(value);
    }

    const responses = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const toolsResponse = responses.find((r) => r.id === 2);
    const toolNames = toolsResponse.result.tools.map((t: any) => t.name);

    expect(toolNames).toContain("upload_image");
    expect(toolNames).toContain("upload_and_set");
    expect(toolNames).toContain("batch_upload");
    expect(toolNames).toContain("list_images");
    expect(toolNames).toContain("groq_query");
    expect(toolNames).toHaveLength(5);

    proc.kill();
  });
});

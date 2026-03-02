import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (output: string) => boolean,
  timeoutMs = 10_000,
): Promise<string> {
  const decoder = new TextDecoder();
  let output = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
    if (predicate(output)) return output;
  }
  return output;
}

describe("MCP server", () => {
  test(
    "responds to initialize",
    async () => {
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

      const output = await readUntil(
        proc.stdout.getReader(),
        (s) => s.includes('"id":1'),
      );
      const response = JSON.parse(output.split("\n").filter(Boolean)[0]);

      expect(response.result.serverInfo.name).toBe("mcp-sanity-images");
      expect(response.result.capabilities.tools).toBeDefined();

      proc.kill();
    },
    15_000,
  );

  test(
    "lists all 5 tools",
    async () => {
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

      const output = await readUntil(
        proc.stdout.getReader(),
        (s) => s.includes('"id":2'),
      );

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
    },
    15_000,
  );
});

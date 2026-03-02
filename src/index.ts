#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json";
import { registerBatchTools } from "./tools/batch.js";
import { registerBrowseTools } from "./tools/browse.js";
import { registerQueryTools } from "./tools/query.js";
import { registerUploadTools } from "./tools/upload.js";

export const VERSION = pkg.version;

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(`mcp-sanity-images v${VERSION}`);
  process.exit(0);
}

const server = new McpServer({
  name: "mcp-sanity-images",
  version: VERSION,
});

registerUploadTools(server);
registerBatchTools(server);
registerBrowseTools(server);
registerQueryTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`mcp-sanity-images v${VERSION} running on stdio`);

checkForUpdates();

function checkForUpdates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  fetch("https://api.github.com/repos/pijusz/mcp-sanity-images/releases/latest", {
    headers: { Accept: "application/vnd.github+json" },
    signal: controller.signal,
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { tag_name?: string } | null) => {
      if (!data?.tag_name) return;
      const latest = data.tag_name.replace(/^v/, "");
      if (latest !== VERSION) {
        console.error(
          `[update] v${latest} available (current: v${VERSION}). Download: https://github.com/pijusz/mcp-sanity-images/releases/latest`,
        );
      }
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
}

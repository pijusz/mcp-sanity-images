#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pkg from "../package.json";
import { log } from "./log";
import { registerBatchTools } from "./tools/batch";
import { registerBrowseTools } from "./tools/browse";
import { registerQueryTools } from "./tools/query";
import { registerUploadTools } from "./tools/upload";
import { checkForUpdates } from "./update-check";

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
log.info(`v${VERSION} running on stdio`);

checkForUpdates(VERSION);

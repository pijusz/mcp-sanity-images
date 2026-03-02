#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBatchTools } from "./tools/batch.js";
import { registerBrowseTools } from "./tools/browse.js";
import { registerQueryTools } from "./tools/query.js";
import { registerUploadTools } from "./tools/upload.js";

const server = new McpServer({
  name: "mcp-sanity-images",
  version: "0.1.0",
});

registerUploadTools(server);
registerBatchTools(server);
registerBrowseTools(server);
registerQueryTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("mcp-sanity-images running on stdio");

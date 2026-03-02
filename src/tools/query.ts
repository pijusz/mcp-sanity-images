import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { groq, resolveConfig } from "../sanity";
import type { ToolResponse } from "../types";

export function registerQueryTools(server: McpServer): void {
  server.tool(
    "groq_query",
    "Run a GROQ query against the Sanity dataset (useful to find document IDs before attaching images)",
    {
      query: z.string().describe("GROQ query string"),
      projectId: z
        .string()
        .optional()
        .describe("Sanity project ID (falls back to SANITY_PROJECT_ID env)"),
      dataset: z
        .string()
        .optional()
        .describe("Sanity dataset (falls back to SANITY_DATASET env, then 'production')"),
    },
    async ({ query, projectId, dataset }): Promise<ToolResponse> => {
      const config = resolveConfig({ projectId, dataset });
      const result = await groq(query, config);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

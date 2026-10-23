import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_PERSPECTIVE, groq, PERSPECTIVES, resolveConfig } from "../sanity";
import type { ToolResponse } from "../types";
import { readTool } from "../utils/register-tool";

export function registerQueryTools(server: McpServer): void {
  readTool(
    server,
    "groq_query",
    'Run a read-only GROQ query against the Sanity dataset and return the result as JSON. Useful to find document IDs and field names before upload_and_set. Uses the `raw` perspective by default, so drafts are included and every `_id` is the real stored ID (`drafts.`-prefixed for drafts) that upload_and_set can patch. Filter drafts out with `!(_id in path("drafts.**"))` or pass perspective `published`.',
    {
      query: z.string().describe("GROQ query string"),
      perspective: z
        .enum(PERSPECTIVES)
        .optional()
        .describe(
          "Which documents the query sees (default: 'raw'). 'raw': published documents and drafts side by side, with real IDs. 'published': published documents only, no drafts. 'drafts': as if every draft were published; drafts replace their published document, and `_id` shows the published ID even for never-published drafts (the stored ID is in `_originalId`).",
        ),
      projectId: z
        .string()
        .optional()
        .describe("Sanity project ID (falls back to SANITY_PROJECT_ID env)"),
      dataset: z
        .string()
        .optional()
        .describe("Sanity dataset (falls back to SANITY_DATASET env, then 'production')"),
    },
    async ({
      query,
      perspective = DEFAULT_PERSPECTIVE,
      projectId,
      dataset,
    }): Promise<ToolResponse> => {
      const config = resolveConfig({ projectId, dataset });
      const result = await groq(query, config, { perspective });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}

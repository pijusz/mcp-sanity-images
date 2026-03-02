import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  altFromFilename,
  collectImages,
  imageRef,
  resolveConfig,
  uploadAsset,
} from "../sanity.js";
import type { BatchUploadResult, ToolResponse } from "../types.js";

export function registerBatchTools(server: McpServer): void {
  server.tool(
    "batch_upload",
    "Upload all images from a folder as Sanity assets (no document patching)",
    {
      directory: z.string().describe("Path to the folder with images"),
      recursive: z
        .boolean()
        .optional()
        .describe("Include subdirectories (default: false)"),
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
      directory,
      recursive = false,
      projectId,
      dataset,
    }): Promise<ToolResponse> => {
      const config = resolveConfig({ projectId, dataset });

      if (!existsSync(directory)) {
        return {
          content: [{ type: "text", text: `Directory not found: ${directory}` }],
          isError: true,
        };
      }

      const files = collectImages(directory, recursive);
      if (files.length === 0) {
        return {
          content: [{ type: "text", text: "No image files found in directory" }],
        };
      }

      const results: BatchUploadResult[] = [];

      for (const file of files) {
        const asset = await uploadAsset(file, config);
        const alt = altFromFilename(basename(file));
        results.push({
          filePath: file,
          assetId: asset._id,
          url: asset.url,
          alt,
          reference: imageRef(asset._id, alt),
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ uploaded: results.length, assets: results }, null, 2),
          },
        ],
      };
    },
  );
}

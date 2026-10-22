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
} from "../sanity";
import type { BatchUploadResult, ToolResponse } from "../types";
import { writeTool } from "../utils/register-tool";

export function registerBatchTools(server: McpServer): void {
  writeTool(
    server,
    "batch_upload",
    "Upload every image (png, jpg, jpeg, webp, gif, svg) in a local folder as Sanity assets. Does not patch any documents. Files that fail are reported in `failed` while the rest still upload. Returns asset IDs, URLs and ready-to-use image references.",
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
      const failed: { filePath: string; error: string }[] = [];

      // Keep going on per-file errors: aborting mid-batch would throw away the
      // asset IDs of everything already uploaded, and a retry would duplicate them.
      for (const file of files) {
        try {
          const asset = await uploadAsset(file, config);
          const alt = altFromFilename(basename(file));
          results.push({
            filePath: file,
            assetId: asset._id,
            url: asset.url,
            alt,
            reference: imageRef(asset._id, alt),
          });
        } catch (err) {
          failed.push({
            filePath: file,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const summary: Record<string, unknown> = {
        uploaded: results.length,
        assets: results,
      };
      if (failed.length > 0) {
        summary.failedCount = failed.length;
        summary.failed = failed;
      }

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        ...(results.length === 0 ? { isError: true } : {}),
      };
    },
  );
}

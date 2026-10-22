import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { collectImages } from "../sanity";
import type { ImageInfo, ToolResponse } from "../types";
import { readTool } from "../utils/register-tool";

export function registerBrowseTools(server: McpServer): void {
  readTool(
    server,
    "list_images",
    "List image files (png, jpg, jpeg, webp, gif, svg) in a local directory with their sizes, so you can see what is available to upload. Does not contact Sanity.",
    {
      directory: z.string().describe("Path to the directory to list"),
      recursive: z
        .boolean()
        .optional()
        .describe("Include subdirectories (default: false)"),
    },
    async ({ directory, recursive = false }): Promise<ToolResponse> => {
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

      const images: ImageInfo[] = files.map((path) => {
        const stat = statSync(path);
        const name = basename(path);
        return {
          path,
          name,
          size: stat.size,
          extension: name.split(".").pop()?.toLowerCase() ?? "",
        };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: images.length, images }, null, 2),
          },
        ],
      };
    },
  );
}

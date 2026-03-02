import { existsSync, statSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { collectImages } from "../sanity.js";
import type { ImageInfo, ToolResponse } from "../types.js";

export function registerBrowseTools(server: McpServer): void {
  server.tool(
    "list_images",
    "List image files in a directory so you can see what's available to upload",
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
        const name = path.split("/").pop() ?? "";
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

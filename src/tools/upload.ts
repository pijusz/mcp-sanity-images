import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  altFromFilename,
  imageRef,
  mutate,
  resolveConfig,
  uploadAsset,
} from "../sanity.js";
import type { ToolResponse, UploadResult } from "../types.js";

const projectIdParam = z
  .string()
  .optional()
  .describe("Sanity project ID (falls back to SANITY_PROJECT_ID env)");
const datasetParam = z
  .string()
  .optional()
  .describe("Sanity dataset (falls back to SANITY_DATASET env, then 'production')");

export function registerUploadTools(server: McpServer): void {
  server.tool(
    "upload_image",
    "Upload a local image file to Sanity as an image asset",
    {
      filePath: z.string().describe("Absolute path to the image file"),
      alt: z.string().optional().describe("Alt text (derived from filename if omitted)"),
      projectId: projectIdParam,
      dataset: datasetParam,
    },
    async ({ filePath, alt, projectId, dataset }): Promise<ToolResponse> => {
      const config = resolveConfig({ projectId, dataset });
      const asset = await uploadAsset(filePath, config);
      const altText = alt ?? altFromFilename(filePath.split("/").pop() ?? "image");
      const reference = imageRef(asset._id, altText);

      const result: UploadResult = {
        assetId: asset._id,
        url: asset.url,
        alt: altText,
        reference,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.tool(
    "upload_and_set",
    "Upload an image and patch it onto a Sanity document field in one call",
    {
      filePath: z.string().describe("Absolute path to the image file"),
      documentId: z.string().describe("Sanity document ID to patch"),
      fieldPath: z.string().describe("Dot-path to the image field (e.g. 'hero.image')"),
      alt: z.string().optional().describe("Alt text (derived from filename if omitted)"),
      projectId: projectIdParam,
      dataset: datasetParam,
    },
    async ({
      filePath,
      documentId,
      fieldPath,
      alt,
      projectId,
      dataset,
    }): Promise<ToolResponse> => {
      const config = resolveConfig({ projectId, dataset });
      const asset = await uploadAsset(filePath, config);
      const altText = alt ?? altFromFilename(filePath.split("/").pop() ?? "image");
      const ref = imageRef(asset._id, altText);

      const mutationResult = await mutate(
        [{ patch: { id: documentId, set: { [fieldPath]: ref } } }],
        config,
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                assetId: asset._id,
                url: asset.url,
                alt: altText,
                documentId,
                fieldPath,
                mutationResult,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}

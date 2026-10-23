import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  altFromFilename,
  imageRef,
  mutate,
  resolveConfig,
  resolvePatchTarget,
  uploadAsset,
} from "../sanity";
import type { ToolResponse, UploadResult } from "../types";
import { writeTool } from "../utils/register-tool";

const projectIdParam = z
  .string()
  .optional()
  .describe("Sanity project ID (falls back to SANITY_PROJECT_ID env)");
const datasetParam = z
  .string()
  .optional()
  .describe("Sanity dataset (falls back to SANITY_DATASET env, then 'production')");

export function registerUploadTools(server: McpServer): void {
  writeTool(
    server,
    "upload_image",
    "Upload a local image file (png, jpg, jpeg, webp, gif, svg) to Sanity as an image asset. Returns the asset ID, CDN URL, and an image `reference` object ready to set on any image field.",
    {
      filePath: z.string().describe("Absolute path to the image file"),
      alt: z.string().optional().describe("Alt text (derived from filename if omitted)"),
      projectId: projectIdParam,
      dataset: datasetParam,
    },
    async ({ filePath, alt, projectId, dataset }): Promise<ToolResponse> => {
      const config = resolveConfig({ projectId, dataset });
      const asset = await uploadAsset(filePath, config);
      const altText = alt ?? altFromFilename(filePath.split(/[/\\]/).pop() ?? "image");
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

  writeTool(
    server,
    "upload_and_set",
    "Upload a local image and set it on a field of an existing Sanity document in one call. Overwrites the current value of that field. Use groq_query first to find the document ID. The document is checked before uploading, so a wrong ID uploads nothing. The given ID is patched exactly as written (use `drafts.<id>` to patch a draft). A bare ID that has only ever existed as a draft patches `drafts.<id>`. If you patch a published document that also has a draft, the response includes a `note` saying so.",
    {
      filePath: z.string().describe("Absolute path to the image file"),
      documentId: z
        .string()
        .describe(
          "Sanity document ID to patch: a published ID, or `drafts.<id>` to patch the draft",
        ),
      fieldPath: z
        .string()
        .describe(
          "Path to the image field, dot-separated for nested objects (e.g. 'hero.image')",
        ),
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
      // Resolve the target first so a missing document doesn't leave an orphan asset.
      const target = await resolvePatchTarget(documentId, config);
      const asset = await uploadAsset(filePath, config);
      const altText = alt ?? altFromFilename(filePath.split(/[/\\]/).pop() ?? "image");
      const ref = imageRef(asset._id, altText);

      const mutationResult = await mutate(
        [{ patch: { id: target.id, set: { [fieldPath]: ref } } }],
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
                documentId: target.id,
                ...(target.id !== documentId ? { requestedDocumentId: documentId } : {}),
                fieldPath,
                ...(target.note ? { note: target.note } : {}),
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

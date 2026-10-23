import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "./log";
import type { Perspective, SanityAsset, SanityConfig, SanityImageRef } from "./types";

// Pinned Content Lake API version. v2025-02-19 changed the query default
// perspective from `raw` to `published`, so every query sends one explicitly.
export const API_VERSION = "2025-02-19";
export const PERSPECTIVES = [
  "raw",
  "published",
  "drafts",
] as const satisfies readonly Perspective[];
export const DEFAULT_PERSPECTIVE: Perspective = "raw";
const DRAFTS_PREFIX = "drafts.";
const DEFAULT_DATASET = "production";
const MAX_GET_URL_LENGTH = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit & { retries?: number; retryDelay?: number; timeout?: number } = {},
): Promise<Response> {
  const { retries = 2, retryDelay = 1000, timeout = 30_000, ...fetchInit } = init;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      let res: Response;
      try {
        res = await fetch(url, { ...fetchInit, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const delay = retryDelay * 2 ** attempt;
        log.warn(
          `HTTP ${res.status} — retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`,
        );
        await sleep(delay);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = retryDelay * 2 ** attempt;
        log.warn(
          `Fetch error — retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error("Fetch failed after retries");
}

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function baseUrl(projectId: string): string {
  return `https://${projectId}.api.sanity.io/v${API_VERSION}`;
}

export function getToken(): string {
  const token = process.env.SANITY_TOKEN;
  if (token) return token;

  // Sanity CLI stores auth in ~/.config/sanity/config.json (all platforms)
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const candidates: { path: string; field: string }[] = [];
  if (home) {
    candidates.push({
      path: join(home, ".config", "sanity", "config.json"),
      field: "authToken",
    });
    candidates.push({
      path: join(home, ".config", "sanity", "auth.json"),
      field: "token",
    });
  }

  for (const { path, field } of candidates) {
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, "utf8"));
        if (data?.[field]) return data[field];
      } catch {}
    }
  }

  throw new Error(
    "No SANITY_TOKEN env var and no Sanity CLI auth found. " +
      "Set SANITY_TOKEN or run: npx sanity login",
  );
}

export function resolveConfig(opts?: {
  projectId?: string;
  dataset?: string;
}): SanityConfig {
  const projectId = opts?.projectId || process.env.SANITY_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "No project ID. Set SANITY_PROJECT_ID env var or pass projectId parameter.",
    );
  }
  return {
    projectId,
    dataset: opts?.dataset || process.env.SANITY_DATASET || DEFAULT_DATASET,
  };
}

export async function uploadAsset(
  filePath: string,
  config: SanityConfig,
): Promise<SanityAsset> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  if (!statSync(filePath).isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_TYPES[ext];
  if (!mime) {
    throw new Error(
      `Unsupported image type ".${ext}" for ${filePath}. Supported: ${Object.keys(MIME_TYPES).join(", ")}`,
    );
  }
  const token = getToken();
  const buffer = await readFile(filePath);
  const filename = filePath.split(/[/\\]/).pop() ?? "image.png";

  const res = await fetchWithRetry(
    `${baseUrl(config.projectId)}/assets/images/${config.dataset}?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
      body: buffer,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed for ${filePath}: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { document: SanityAsset };
  return json.document;
}

export function mutateUrl(config: SanityConfig): string {
  // returnIds: report which document each mutation touched.
  // visibility=sync (the API default, made explicit): return only once the
  // change is visible to queries, so a follow-up groq_query sees it.
  return `${baseUrl(config.projectId)}/data/mutate/${config.dataset}?returnIds=true&visibility=sync`;
}

export async function mutate(
  mutations: Record<string, unknown>[],
  config: SanityConfig,
): Promise<unknown> {
  const token = getToken();
  const res = await fetchWithRetry(mutateUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mutations }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mutation failed: ${res.status} ${text}`);
  }

  return res.json();
}

export interface GroqOptions {
  params?: Record<string, unknown>;
  perspective?: Perspective;
}

export interface QueryRequest {
  url: string;
  method: "GET" | "POST";
  body?: string;
}

export function buildQueryRequest(
  query: string,
  config: SanityConfig,
  opts: GroqOptions = {},
): QueryRequest {
  const endpoint = `${baseUrl(config.projectId)}/data/query/${config.dataset}`;
  const perspective = opts.perspective ?? DEFAULT_PERSPECTIVE;
  // The query endpoint only takes `perspective` as a URL parameter, also for POST.
  const postUrl = `${endpoint}?perspective=${encodeURIComponent(perspective)}`;
  const search = new URLSearchParams({ query });
  for (const [key, value] of Object.entries(opts.params ?? {})) {
    search.set(`$${key}`, JSON.stringify(value));
  }
  search.set("perspective", perspective);
  const getUrl = `${endpoint}?${search.toString()}`;
  if (getUrl.length <= MAX_GET_URL_LENGTH) {
    return { url: getUrl, method: "GET" };
  }
  // Long queries overflow URL limits on GET; Sanity accepts the same query via POST.
  const body: Record<string, unknown> = { query };
  if (opts.params) body.params = opts.params;
  return { url: postUrl, method: "POST", body: JSON.stringify(body) };
}

export async function groq<T>(
  query: string,
  config: SanityConfig,
  opts: GroqOptions = {},
): Promise<T> {
  const token = getToken();
  const req = buildQueryRequest(query, config, opts);
  const res =
    req.method === "GET"
      ? await fetchWithRetry(req.url, { headers: { Authorization: `Bearer ${token}` } })
      : await fetchWithRetry(req.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: req.body,
        });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GROQ query failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { result: T };
  return json.result;
}

export interface PatchTarget {
  /** The document ID that will actually be patched. */
  id: string;
  /** Set when the target differs from what was asked for, or a draft is left untouched. */
  note?: string;
}

/**
 * Decide which document to patch, given the requested ID and the IDs that
 * exist among `<id>` and `drafts.<id>`.
 *
 * - The requested ID exists: patch it exactly. If it is a published ID with a
 *   pending draft, say so, because Studio shows the draft and publishing the
 *   draft would overwrite the change.
 * - A bare ID that only exists as a draft (never published, e.g. an `_id`
 *   taken from the `drafts` perspective): patch `drafts.<id>`.
 * - Nothing exists: throw before anything is uploaded.
 */
export function choosePatchTarget(
  requestedId: string,
  existingIds: string[],
): PatchTarget {
  const existing = new Set(existingIds);
  const isDraft = requestedId.startsWith(DRAFTS_PREFIX);
  const baseId = isDraft ? requestedId.slice(DRAFTS_PREFIX.length) : requestedId;
  const draftId = `${DRAFTS_PREFIX}${baseId}`;

  if (existing.has(requestedId)) {
    if (!isDraft && !requestedId.startsWith("versions.") && existing.has(draftId)) {
      return {
        id: requestedId,
        note: `Patched the published document. A draft (${draftId}) with unpublished changes also exists and was not changed: Studio shows the draft, and publishing it will overwrite this field. Pass documentId "${draftId}" to patch the draft instead.`,
      };
    }
    return { id: requestedId };
  }
  if (!isDraft && existing.has(draftId)) {
    return {
      id: draftId,
      note: `"${requestedId}" has never been published; patched its draft ${draftId} instead.`,
    };
  }
  if (isDraft && existing.has(baseId)) {
    throw new Error(
      `Document not found: ${requestedId}. The published document ${baseId} exists; pass that ID to patch it.`,
    );
  }
  throw new Error(
    isDraft || requestedId.startsWith("versions.")
      ? `Document not found: ${requestedId}`
      : `Document not found: ${requestedId} (also checked ${draftId})`,
  );
}

export async function resolvePatchTarget(
  documentId: string,
  config: SanityConfig,
): Promise<PatchTarget> {
  const baseId = documentId.startsWith(DRAFTS_PREFIX)
    ? documentId.slice(DRAFTS_PREFIX.length)
    : documentId;
  const ids = [...new Set([documentId, baseId, `${DRAFTS_PREFIX}${baseId}`])];
  // `raw` so drafts and published documents are both visible with their real IDs.
  const existing = await groq<string[]>("*[_id in $ids]._id", config, {
    params: { ids },
    perspective: "raw",
  });
  return choosePatchTarget(documentId, existing ?? []);
}

export function imageRef(assetId: string, alt?: string): SanityImageRef {
  const ref: SanityImageRef = {
    _type: "image",
    asset: { _type: "reference", _ref: assetId },
  };
  if (alt) ref.alt = alt;
  return ref;
}

export const IMAGE_EXTENSIONS = new Set(Object.keys(MIME_TYPES));

export function isImageFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export function altFromFilename(filename: string): string {
  const name = filename.replace(/\.[^.]+$/, "");
  return name
    .replace(/^\d+-/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function collectImages(dir: string, recursive: boolean): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (recursive) files.push(...collectImages(full, true));
    } else if (isImageFile(entry)) {
      files.push(full);
    }
  }
  return files.sort();
}

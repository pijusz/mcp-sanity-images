import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { log } from "./log.js";
import type { SanityAsset, SanityConfig, SanityImageRef } from "./types.js";

const API_VERSION = "2021-10-21";
const DEFAULT_DATASET = "production";

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
      const res = await fetch(url, { ...fetchInit, signal: controller.signal });
      clearTimeout(timer);

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

  const candidates: string[] = [];
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (home) candidates.push(join(home, ".config", "sanity", "auth.json"));
  const appdata = process.env.APPDATA;
  if (appdata) candidates.push(join(appdata, "sanity", "auth.json"));

  for (const authPath of candidates) {
    if (existsSync(authPath)) {
      try {
        const auth = JSON.parse(readFileSync(authPath, "utf8"));
        if (auth?.token) return auth.token;
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
  const token = getToken();
  const buffer = await readFile(filePath);
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "png";
  const mime = MIME_TYPES[ext] ?? "image/png";
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

export async function mutate(
  mutations: Record<string, unknown>[],
  config: SanityConfig,
): Promise<unknown> {
  const token = getToken();
  const res = await fetchWithRetry(
    `${baseUrl(config.projectId)}/data/mutate/${config.dataset}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mutations }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mutation failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function groq<T>(query: string, config: SanityConfig): Promise<T> {
  const token = getToken();
  const url = `${baseUrl(config.projectId)}/data/query/${config.dataset}?query=${encodeURIComponent(query)}`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GROQ query failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { result: T };
  return json.result;
}

export function imageRef(assetId: string, alt?: string): SanityImageRef {
  const ref: SanityImageRef = {
    _type: "image",
    asset: { _type: "reference", _ref: assetId },
  };
  if (alt) ref.alt = alt;
  return ref;
}

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

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

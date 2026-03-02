import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  altFromFilename,
  collectImages,
  getToken,
  IMAGE_EXTENSIONS,
  imageRef,
  isImageFile,
  resolveConfig,
} from "../src/sanity.js";

// --- Pure functions (no mocking needed) ---

describe("imageRef", () => {
  test("builds reference without alt", () => {
    const ref = imageRef("image-abc123-200x200-png");
    expect(ref).toEqual({
      _type: "image",
      asset: { _type: "reference", _ref: "image-abc123-200x200-png" },
    });
  });

  test("builds reference with alt", () => {
    const ref = imageRef("image-abc123-200x200-png", "A cat");
    expect(ref).toEqual({
      _type: "image",
      alt: "A cat",
      asset: { _type: "reference", _ref: "image-abc123-200x200-png" },
    });
  });

  test("omits alt when undefined", () => {
    const ref = imageRef("image-abc123-200x200-png", undefined);
    expect(ref).not.toHaveProperty("alt");
  });
});

describe("isImageFile", () => {
  test("accepts supported extensions", () => {
    for (const ext of IMAGE_EXTENSIONS) {
      expect(isImageFile(`photo.${ext}`)).toBe(true);
    }
  });

  test("rejects non-image files", () => {
    expect(isImageFile("doc.pdf")).toBe(false);
    expect(isImageFile("script.ts")).toBe(false);
    expect(isImageFile("data.json")).toBe(false);
    expect(isImageFile("noextension")).toBe(false);
  });

  test("is case-insensitive", () => {
    expect(isImageFile("photo.PNG")).toBe(true);
    expect(isImageFile("photo.JPG")).toBe(true);
    expect(isImageFile("photo.WebP")).toBe(true);
  });
});

describe("altFromFilename", () => {
  test("converts filename to title case", () => {
    expect(altFromFilename("hello-world.png")).toBe("Hello World");
  });

  test("strips leading numbers", () => {
    expect(altFromFilename("01-my-image.png")).toBe("My Image");
  });

  test("handles underscores", () => {
    expect(altFromFilename("my_cool_image.jpg")).toBe("My Cool Image");
  });

  test("handles mixed separators", () => {
    expect(altFromFilename("02-some_file-name.webp")).toBe("Some File Name");
  });

  test("handles single word", () => {
    expect(altFromFilename("hero.png")).toBe("Hero");
  });
});

// --- resolveConfig ---

describe("resolveConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("uses explicit params over env", () => {
    process.env.SANITY_PROJECT_ID = "env-project";
    process.env.SANITY_DATASET = "env-dataset";
    const opts = resolveConfig({ projectId: "my-project", dataset: "staging" });
    expect(opts).toEqual({ projectId: "my-project", dataset: "staging" });
  });

  test("falls back to env vars", () => {
    process.env.SANITY_PROJECT_ID = "env-project";
    process.env.SANITY_DATASET = "env-dataset";
    const opts = resolveConfig({});
    expect(opts).toEqual({ projectId: "env-project", dataset: "env-dataset" });
  });

  test("defaults dataset to production", () => {
    process.env.SANITY_PROJECT_ID = "my-project";
    delete process.env.SANITY_DATASET;
    const opts = resolveConfig({});
    expect(opts).toEqual({ projectId: "my-project", dataset: "production" });
  });

  test("throws without project ID", () => {
    delete process.env.SANITY_PROJECT_ID;
    expect(() => resolveConfig({})).toThrow("No project ID");
  });

  test("throws with empty project ID", () => {
    process.env.SANITY_PROJECT_ID = "";
    expect(() => resolveConfig({})).toThrow("No project ID");
  });
});

// --- getToken ---

describe("getToken", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("returns SANITY_TOKEN from env", () => {
    process.env.SANITY_TOKEN = "test-token-123";
    expect(getToken()).toBe("test-token-123");
  });

  test("reads authToken from config.json", () => {
    delete process.env.SANITY_TOKEN;
    const fakeHome = join(tmpdir(), `sanity-auth-test-${Date.now()}`);
    const configDir = join(fakeHome, ".config", "sanity");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), JSON.stringify({ authToken: "cli-token-456" }));
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    delete process.env.APPDATA;
    expect(getToken()).toBe("cli-token-456");
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test("reads token from legacy auth.json", () => {
    delete process.env.SANITY_TOKEN;
    const fakeHome = join(tmpdir(), `sanity-auth-legacy-${Date.now()}`);
    const configDir = join(fakeHome, ".config", "sanity");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "auth.json"), JSON.stringify({ token: "legacy-token-789" }));
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    delete process.env.APPDATA;
    expect(getToken()).toBe("legacy-token-789");
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test("prefers config.json over auth.json", () => {
    delete process.env.SANITY_TOKEN;
    const fakeHome = join(tmpdir(), `sanity-auth-priority-${Date.now()}`);
    const configDir = join(fakeHome, ".config", "sanity");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.json"), JSON.stringify({ authToken: "new-token" }));
    writeFileSync(join(configDir, "auth.json"), JSON.stringify({ token: "old-token" }));
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    delete process.env.APPDATA;
    expect(getToken()).toBe("new-token");
    rmSync(fakeHome, { recursive: true, force: true });
  });

  test("throws when no token available", () => {
    delete process.env.SANITY_TOKEN;
    const fake = join(tmpdir(), "nonexistent-sanity-auth");
    process.env.HOME = fake;
    process.env.USERPROFILE = fake;
    delete process.env.APPDATA;
    expect(() => getToken()).toThrow("No SANITY_TOKEN");
  });
});

// --- collectImages ---

describe("collectImages", () => {
  const tmpDir = join(tmpdir(), `mcp-sanity-images-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(join(tmpDir, "sub"), { recursive: true });
    writeFileSync(join(tmpDir, "a.png"), "");
    writeFileSync(join(tmpDir, "b.jpg"), "");
    writeFileSync(join(tmpDir, "c.txt"), "");
    writeFileSync(join(tmpDir, "sub", "d.webp"), "");
    writeFileSync(join(tmpDir, "sub", "e.pdf"), "");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("collects top-level images only by default", () => {
    const files = collectImages(tmpDir, false);
    expect(files).toHaveLength(2);
    expect(files[0]).toEndWith("a.png");
    expect(files[1]).toEndWith("b.jpg");
  });

  test("collects recursively", () => {
    const files = collectImages(tmpDir, true);
    expect(files).toHaveLength(3);
    expect(files.some((f) => f.endsWith("d.webp"))).toBe(true);
  });

  test("returns empty for missing directory", () => {
    const missing = join(tmpdir(), "nonexistent-collect-test");
    expect(collectImages(missing, false)).toEqual([]);
  });

  test("excludes non-image files", () => {
    const files = collectImages(tmpDir, true);
    expect(files.every((f) => !f.endsWith(".txt") && !f.endsWith(".pdf"))).toBe(true);
  });
});

import { log } from "./log";

const RELEASES_URL =
  "https://api.github.com/repos/pijusz/mcp-sanity-images/releases/latest";

/** True when `latest` is a strictly higher x.y.z version than `current`. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split("-")[0]
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export function checkForUpdates(current: string): void {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  fetch(RELEASES_URL, {
    headers: { Accept: "application/vnd.github+json" },
    signal: controller.signal,
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { tag_name?: string } | null) => {
      if (!data?.tag_name) return;
      const latest = data.tag_name.replace(/^v/, "");
      // Only nag when the release is actually newer — a plain `!==` told users
      // on an untagged npm release to "update" to an older GitHub tag.
      if (isNewerVersion(latest, current)) {
        log.warn(
          `v${latest} available (current: v${current}). Download: https://github.com/pijusz/mcp-sanity-images/releases/latest`,
        );
      }
    })
    .catch(() => {})
    .finally(() => clearTimeout(timeout));
}

# mcp-sanity-images

MCP server for uploading local images to Sanity CMS. Bun for dev; `bun run build:npm` bundles `dist/index.js` for the npm package.

See [README.md](./README.md) for full documentation.

## Quick reference

```bash
bun install
bun test
bun run typecheck
bun src/index.ts        # start server on stdio
```

## Architecture

```
src/
  index.ts              MCP entry point — server setup + stdio transport
  sanity.ts             Sanity REST API helpers (token, upload, mutate, groq)
  update-check.ts       GitHub release check (warns only when a newer version exists)
  utils/register-tool.ts  readTool/writeTool wrappers (registerTool + annotations)
  tools/
    upload.ts           upload_image, upload_and_set
    batch.ts            batch_upload (folder → assets)
    browse.ts           list_images (directory listing)
    query.ts            groq_query (GROQ queries)
```

## Key patterns

- All tools accept optional `projectId`/`dataset` params that override env vars
- `resolveConfig()` resolves config: tool params → env vars → defaults
- `getToken()` resolves auth: `SANITY_TOKEN` env → CLI auth (`~/.config/sanity/config.json`)
- `console.error` only — stdout is reserved for JSON-RPC (stdio transport)
- Sanity API version is pinned in `src/sanity.ts` (`API_VERSION = "2025-02-19"`). Since that version the API defaults to the `published` perspective, so `groq()` always sends `perspective` (default `raw`, overridable via groq_query's `perspective` param)
- `upload_and_set` calls `resolvePatchTarget()` before uploading: it checks `<id>`/`drafts.<id>` with a raw query and `choosePatchTarget()` picks the ID (exact ID if it exists, else the draft of a never-published doc, else error)
- `imageRef()` builds the `{ _type: "image", asset: { _ref } }` structure Sanity expects

## Adding a tool

1. Create `src/tools/newtool.ts` with a `registerXTools(server: McpServer)` function
2. Use `readTool(...)` or `writeTool(...)` from `src/utils/register-tool.ts` (sets MCP annotations)
3. Import and call register function in `src/index.ts`
4. Add test in `test/`

## Env vars

| Var | Required | Description |
|-----|----------|-------------|
| `SANITY_PROJECT_ID` | Yes | Sanity project ID |
| `SANITY_DATASET` | No | Dataset (default: production) |
| `SANITY_TOKEN` | No | API token (falls back to CLI auth) |

## Testing

```bash
bun test                      # all tests
bun test test/sanity.test.ts  # unit tests only
bun test test/tools.test.ts   # tool registration + list_images
bun test test/server.test.ts  # integration (spawns server process)
bun test test/api-version.test.ts  # API version, perspectives, patch-target logic (mocked fetch)
```

Tests use real filesystem (tmp dirs) for `collectImages` and `list_images`. API-calling tools are tested for registration and error paths only — actual uploads require a Sanity token.

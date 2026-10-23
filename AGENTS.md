# Agents

Instructions for AI agents working on this codebase.

See [README.md](./README.md) for full documentation, [CLAUDE.md](./CLAUDE.md) for quick reference.

## Conventions

- Bun for dev and tests; the npm package ships a Node bundle built by `bun run build:npm` (`dist/index.js`)
- `node:fs` and `node:path` are fine (Bun supports them natively)
- `Bun.file()` for async file reads
- All logging to `console.error` (stdout is JSON-RPC)
- Tests with `bun:test` — no external test framework
- Sanity API version is pinned as `API_VERSION` in `src/sanity.ts`. Don't bump it without checking the perspective default and the draft/published ID handling in `upload_and_set` (see test/api-version.test.ts)
- Every GROQ request sends an explicit `perspective` (default `raw`); never rely on the API default, which changed to `published` in v2025-02-19

## Before making changes

1. Run `bun test` to confirm all tests pass
2. Run `bun run typecheck` to confirm no type errors
3. Understand the tool registration pattern in `src/tools/`

## After making changes

1. Run `bun test` — all tests must pass
2. Run `bun run typecheck` — no errors
3. If adding a new tool, add corresponding tests in `test/`
4. Update README.md tool table if tool list changes

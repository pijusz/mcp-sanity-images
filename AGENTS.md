# Agents

Instructions for AI agents working on this codebase.

See [README.md](./README.md) for full documentation, [CLAUDE.md](./CLAUDE.md) for quick reference.

## Conventions

- Pure Bun runtime — no Node.js build step, ship `.ts` directly
- `node:fs` and `node:path` are fine (Bun supports them natively)
- `Bun.file()` for async file reads
- All logging to `console.error` (stdout is JSON-RPC)
- Tests with `bun:test` — no external test framework

## Before making changes

1. Run `bun test` to confirm all tests pass
2. Run `bun run typecheck` to confirm no type errors
3. Understand the tool registration pattern in `src/tools/`

## After making changes

1. Run `bun test` — all tests must pass
2. Run `bun run typecheck` — no errors
3. If adding a new tool, add corresponding tests in `test/`
4. Update README.md tool table if tool list changes

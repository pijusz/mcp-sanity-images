# mcp-sanity-images

MCP server for uploading local images to [Sanity CMS](https://www.sanity.io/). Lets AI assistants (Claude, etc.) upload files from your filesystem directly into Sanity as image assets — single files, batches, or upload-and-patch in one call.

Requires [Bun](https://bun.sh/).

## Tools

| Tool | Description |
|------|-------------|
| `upload_image` | Upload a single local image to Sanity as an asset |
| `upload_and_set` | Upload an image and patch it onto a document field |
| `batch_upload` | Upload all images from a folder as assets |
| `list_images` | List image files in a directory |
| `groq_query` | Run a GROQ query (find documents before attaching) |

Supported formats: PNG, JPG/JPEG, WebP, GIF, SVG.

## Setup

### Install

```bash
bun add -g mcp-sanity-images
```

Or clone and run directly:

```bash
git clone https://github.com/pijusz/mcp-sanity-images.git
cd mcp-sanity-images
bun install
```

### Authentication

The server resolves a Sanity auth token in order:

1. `SANITY_TOKEN` environment variable
2. Sanity CLI auth at `~/.config/sanity/auth.json` (from `npx sanity login`)

### Configuration

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `SANITY_PROJECT_ID` | Yes | — | Your Sanity project ID |
| `SANITY_DATASET` | No | `production` | Dataset name |
| `SANITY_TOKEN` | No* | — | API token (*falls back to CLI auth) |

All tools also accept `projectId` and `dataset` as parameters, overriding the env vars per-call.

## Usage with Claude Code

```bash
claude mcp add --scope user --transport stdio \
  -e SANITY_PROJECT_ID=your-project-id \
  -e SANITY_TOKEN=your-token \
  sanity-images -- bunx mcp-sanity-images
```

Or if installed globally / cloned locally:

```bash
claude mcp add --scope user --transport stdio \
  -e SANITY_PROJECT_ID=your-project-id \
  sanity-images -- bun /path/to/mcp-sanity-images/src/index.ts
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sanity-images": {
      "command": "bunx",
      "args": ["mcp-sanity-images"],
      "env": {
        "SANITY_PROJECT_ID": "your-project-id",
        "SANITY_TOKEN": "your-token"
      }
    }
  }
}
```

## Tool Details

### upload_image

Upload a single file and get back the asset reference.

```
filePath: "/path/to/hero.png"
alt: "Hero banner"  (optional — derived from filename)
```

Returns: `{ assetId, url, alt, reference }` — the `reference` object is ready to patch onto any Sanity image field.

### upload_and_set

Upload + patch in one call. Uploads the image, then sets it on the specified document field.

```
filePath: "/path/to/hero.png"
documentId: "product-123"
fieldPath: "hero.image"
```

### batch_upload

Upload all images from a directory. Optionally recursive.

```
directory: "/path/to/images"
recursive: true
```

Returns an array of `{ filePath, assetId, url, alt, reference }` per image.

### list_images

List image files without uploading — useful for the AI to see what's available.

```
directory: "/path/to/images"
recursive: true
```

### groq_query

Run any GROQ query. Useful to find document IDs before using `upload_and_set`.

```
query: "*[_type == 'product']{_id, title, slug}"
```

## Development

```bash
bun install
bun test          # run tests
bun run typecheck # type check
```

## License

MIT

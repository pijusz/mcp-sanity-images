<p align="center">
  <img src="logo.svg" alt="MCPi sanity-image" width="280" />
</p>

<p align="center">
  MCP server for uploading local images to <a href="https://www.sanity.io/">Sanity CMS</a>.
  <br/>
  Lets AI assistants upload files from your filesystem directly into Sanity as image assets.
</p>

---

## Tools

| Tool | Description |
|------|-------------|
| `upload_image` | Upload a single local image to Sanity as an asset |
| `upload_and_set` | Upload an image and patch it onto a document field |
| `batch_upload` | Upload all images from a folder as assets |
| `list_images` | List image files in a directory |
| `groq_query` | Run a GROQ query (find documents before attaching) |

Supported formats: PNG, JPG/JPEG, WebP, GIF, SVG.

## Install

### Option A: Download binary (recommended)

Download the latest binary for your platform from [Releases](https://github.com/pijusz/mcp-sanity-images/releases):

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `mcp-sanity-images-darwin-arm64` |
| macOS (Intel) | `mcp-sanity-images-darwin-x64` |
| Linux (x64) | `mcp-sanity-images-linux-x64` |

```bash
chmod +x mcp-sanity-images-darwin-arm64
mv mcp-sanity-images-darwin-arm64 /usr/local/bin/mcp-sanity-images
```

### Option B: From source (requires [Bun](https://bun.sh/))

```bash
git clone https://github.com/pijusz/mcp-sanity-images.git
cd mcp-sanity-images
bun install
```

### Build from source

```bash
bun run build  # produces ./mcp-sanity-images standalone binary
```

## Authentication

The server resolves a Sanity auth token in order:

1. `SANITY_TOKEN` environment variable
2. Sanity CLI auth at `~/.config/sanity/auth.json` (from `npx sanity login`)

## Configuration

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `SANITY_PROJECT_ID` | Yes | — | Your Sanity project ID |
| `SANITY_DATASET` | No | `production` | Dataset name |
| `SANITY_TOKEN` | No* | — | API token (*falls back to CLI auth) |

All tools also accept `projectId` and `dataset` as parameters, overriding the env vars per-call.

## Usage

### Claude Code (binary)

```bash
claude mcp add --scope user --transport stdio \
  -e SANITY_PROJECT_ID=your-project-id \
  -e SANITY_TOKEN=your-token \
  sanity-images -- /usr/local/bin/mcp-sanity-images
```

### Claude Code (from source)

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
      "command": "/usr/local/bin/mcp-sanity-images",
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
bun test          # 37 tests
bun run lint      # biome check
bun run typecheck # tsc --noEmit
bun run build     # compile standalone binary
```

## License

MIT

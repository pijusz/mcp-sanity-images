<p align="center">
  <img src="logo.svg" alt="MCPi sanity-images" width="280" />
</p>

<p align="center">
  MCP server for uploading local images to <a href="https://www.sanity.io/">Sanity CMS</a>.
  <br/>
  Lets AI assistants upload files from your filesystem directly into Sanity as image assets.
</p>

---

## Quick Start

### 1. Get your Sanity token

Either set the `SANITY_TOKEN` env var, or just log in with the Sanity CLI:

```bash
npx sanity login
```

The server reads the token from the Sanity CLI config automatically (`~/.config/sanity/config.json` on all platforms).

### 2. Add to Claude Code

```bash
claude mcp add sanity-images --scope user --transport stdio \
  -e SANITY_PROJECT_ID=your-project-id \
  -- npx -y mcp-sanity-images@latest
```

That's it. Restart Claude Code and the tools are available. Every session runs the latest version automatically.

> Also works with `bunx mcp-sanity-images@latest` if you have [Bun](https://bun.sh/).

<details>
<summary>Alternative: standalone binary</summary>

Download a pre-built binary from [Releases](https://github.com/pijusz/mcp-sanity-images/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `mcp-sanity-images-darwin-arm64` |
| macOS (Intel) | `mcp-sanity-images-darwin-x64` |
| Linux | `mcp-sanity-images-linux-x64` |
| Windows | `mcp-sanity-images-windows-x64.exe` |

**macOS / Linux:**

```bash
curl -Lo mcp-sanity-images https://github.com/pijusz/mcp-sanity-images/releases/latest/download/mcp-sanity-images-darwin-arm64
chmod +x mcp-sanity-images
sudo mv mcp-sanity-images /usr/local/bin/
claude mcp add sanity-images --scope user --transport stdio \
  -e SANITY_PROJECT_ID=your-project-id \
  -- /usr/local/bin/mcp-sanity-images
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri "https://github.com/pijusz/mcp-sanity-images/releases/latest/download/mcp-sanity-images-windows-x64.exe" -OutFile "$env:LOCALAPPDATA\mcp-sanity-images.exe"
claude mcp add sanity-images --scope user --transport stdio -e SANITY_PROJECT_ID=your-project-id -- "%LOCALAPPDATA%\mcp-sanity-images.exe"
```

</details>

### Claude Desktop

Add to your `claude_desktop_config.json`:

<details>
<summary>Using npx (auto-updates)</summary>

```json
{
  "mcpServers": {
    "sanity-images": {
      "command": "npx",
      "args": ["-y", "mcp-sanity-images@latest"],
      "env": {
        "SANITY_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

</details>

<details>
<summary>Using binary (macOS / Linux)</summary>

```json
{
  "mcpServers": {
    "sanity-images": {
      "command": "/usr/local/bin/mcp-sanity-images",
      "env": {
        "SANITY_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

</details>

<details>
<summary>Using binary (Windows)</summary>

```json
{
  "mcpServers": {
    "sanity-images": {
      "command": "%LOCALAPPDATA%\\mcp-sanity-images.exe",
      "env": {
        "SANITY_PROJECT_ID": "your-project-id"
      }
    }
  }
}
```

</details>

## Tools

| Tool | Description |
|------|-------------|
| `upload_image` | Upload a single local image to Sanity as an asset |
| `upload_and_set` | Upload an image and patch it onto a document field |
| `batch_upload` | Upload all images from a folder as assets |
| `list_images` | List image files in a directory |
| `groq_query` | Run a GROQ query (find documents before attaching); optional `perspective` (raw default, published, drafts) |

Supported formats: PNG, JPG/JPEG, WebP, GIF, SVG.

## Configuration

| Env var | Required | Default | Description |
|---------|----------|---------|-------------|
| `SANITY_PROJECT_ID` | Yes | — | Your Sanity project ID |
| `SANITY_DATASET` | No | `production` | Dataset name |
| `SANITY_TOKEN` | No* | — | API token (*falls back to CLI auth) |

All tools also accept `projectId` and `dataset` as parameters, overriding the env vars per-call.

## Tool Details

### upload_image

Upload a single file and get back the asset reference.

```
filePath: "/path/to/hero.png"
alt: "Hero banner"  (optional — derived from filename)
```

Returns `{ assetId, url, alt, reference }` — the `reference` is ready to patch onto any Sanity image field.

### upload_and_set

Upload + patch in one call.

```
filePath: "/path/to/hero.png"
documentId: "product-123"      # or "drafts.product-123" to patch the draft
fieldPath: "hero.image"
```

Before uploading, the tool checks which of `<id>` and `drafts.<id>` exist, so a wrong ID uploads nothing:

| You pass | Exists | Patched |
|----------|--------|---------|
| `product-123` | published only | `product-123` |
| `product-123` | published + draft | `product-123`, with a `note` that the draft was left alone (Studio shows the draft, and publishing it overwrites the field) |
| `product-123` | draft only (never published) | `drafts.product-123`, with a `note` and `requestedDocumentId` |
| `drafts.product-123` | draft | `drafts.product-123` |
| anything | neither | nothing; returns "Document not found" |

The response's `documentId` is the document actually patched. Mutations are sent with `returnIds=true&visibility=sync`, so a follow-up `groq_query` sees the change.

### batch_upload

Upload all images from a directory.

```
directory: "/path/to/images"
recursive: true
```

Returns `{ uploaded, assets }`. If some files fail, the rest still upload and the failures are listed in `failed` (with `failedCount`).

### list_images

List image files without uploading — useful for the AI to see what's available.

```
directory: "/path/to/images"
recursive: true
```

### groq_query

Run any GROQ query (read-only). Long queries are sent via POST automatically. Useful to find document IDs before using `upload_and_set`.

```
query: "*[_type == 'product']{_id, title, slug}"
perspective: "raw"   # optional: raw (default) | published | drafts
```

| Perspective | What the query sees |
|-------------|---------------------|
| `raw` (default) | Published documents and drafts side by side, with their real IDs (`drafts.`-prefixed for drafts). Pass these IDs straight to `upload_and_set`. |
| `published` | Published documents only; drafts are invisible. |
| `drafts` | Every draft applied as if published. `_id` is always the published ID (even for never-published drafts); the stored ID is in `_originalId`. |

The server pins Sanity API version `v2025-02-19`. That version made `published` the API's default perspective. This tool sends `raw` unless you ask otherwise, so results match what earlier releases (API `v2021-10-21`, default `raw`) returned.

## Updates

**Using `npx @latest`** (recommended): You always get the latest version — no manual updates needed.

**Using a binary**: The server checks for new releases on startup and logs to stderr if outdated:

```
[mcp-sanity-images] WARN v0.5.0 available (current: v0.4.1). Download: https://github.com/pijusz/mcp-sanity-images/releases/latest
```

Check your installed version:

```bash
mcp-sanity-images --version
```

To update, download the new binary and replace the old one.

## Development

Requires [Bun](https://bun.sh/).

```bash
git clone https://github.com/pijusz/mcp-sanity-images.git
cd mcp-sanity-images
bun install
bun test
bun run lint      # biome check
bun run build     # compile standalone binary
```

## License

MIT

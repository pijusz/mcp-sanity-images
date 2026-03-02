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

The server will read the token from `~/.config/sanity/auth.json` automatically.

### 2. Add to Claude Code

```bash
claude mcp add --scope user --transport stdio \
  -e SANITY_PROJECT_ID=your-project-id \
  sanity-images -- npx -y mcp-sanity-images@latest
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
claude mcp add --scope user --transport stdio \
  -e SANITY_PROJECT_ID=your-project-id \
  sanity-images -- /usr/local/bin/mcp-sanity-images
```

**Windows (PowerShell):**

```powershell
Invoke-WebRequest -Uri "https://github.com/pijusz/mcp-sanity-images/releases/latest/download/mcp-sanity-images-windows-x64.exe" -OutFile "$env:LOCALAPPDATA\mcp-sanity-images.exe"
claude mcp add --scope user --transport stdio -e SANITY_PROJECT_ID=your-project-id sanity-images -- "%LOCALAPPDATA%\mcp-sanity-images.exe"
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
| `groq_query` | Run a GROQ query (find documents before attaching) |

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
documentId: "product-123"
fieldPath: "hero.image"
```

### batch_upload

Upload all images from a directory.

```
directory: "/path/to/images"
recursive: true
```

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

## Updates

**Using `npx @latest`** (recommended): You always get the latest version — no manual updates needed.

**Using a binary**: The server checks for new releases on startup and logs to stderr if outdated:

```
[update] v0.2.0 available (current: v0.1.0). Download: https://github.com/pijusz/mcp-sanity-images/releases/latest
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
bun test          # 37 tests
bun run lint      # biome check
bun run build     # compile standalone binary
```

## License

MIT

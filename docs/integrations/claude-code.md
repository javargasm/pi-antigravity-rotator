# Claude Code

Connect Claude Code (Anthropic's CLI coding agent) to tuxevil-rotator using the Anthropic-compatible `/v1/messages` endpoint.

## Quick Start

```bash
export ANTHROPIC_BASE_URL=http://localhost:51200
export ANTHROPIC_AUTH_TOKEN=tuxevil   # or your rk-... Virtual Key
claude
```

> **Note:** Do NOT include `/v1` in `ANTHROPIC_BASE_URL`. Claude Code appends `/v1/messages` automatically.

## Configuration Options

### Option A: Shell environment variables

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
export ANTHROPIC_BASE_URL=http://localhost:51200
export ANTHROPIC_AUTH_TOKEN=tuxevil
export ANTHROPIC_MODEL=claude-sonnet-4-6
```

### Option B: Global settings file (`~/.claude/settings.json`)

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:51200",
    "ANTHROPIC_AUTH_TOKEN": "tuxevil",
    "ANTHROPIC_MODEL": "claude-sonnet-4-6"
  }
}
```

### Option C: Per-project settings (`.claude/settings.local.json`)

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:51200",
    "ANTHROPIC_AUTH_TOKEN": "tuxevil"
  },
  "model": "claude-sonnet-4-6"
}
```

Add `.claude/settings.local.json` to `.gitignore`.

## Available Models

```
claude-sonnet-4-6           (recommended)
claude-opus-4-6-thinking    (with extended thinking)
gemini-3.8-flash-high       (via Anthropic-compatible adapter)
```

## Verify the Connection

```bash
# Test the endpoint directly
curl -X POST http://localhost:51200/v1/messages \
  -H "Authorization: Bearer antigravity" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model": "claude-sonnet-4-6", "max_tokens": 10, "messages": [{"role": "user", "content": "pong"}]}'

# Check inside Claude Code
/status
```

## Environment Variable Reference

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_BASE_URL` | API base URL (without `/v1`) |
| `ANTHROPIC_AUTH_TOKEN` | Auth token sent as `Authorization: Bearer` — preferred for proxy setups |
| `ANTHROPIC_API_KEY` | Alternative auth token (sent as `x-api-key`) — requires one-time approval prompt |
| `ANTHROPIC_MODEL` | Default model |

## Notes

- `ANTHROPIC_AUTH_TOKEN` is preferred over `ANTHROPIC_API_KEY` for proxy setups — it takes effect immediately without requiring interactive approval
- The rotator's Anthropic adapter supports tool calling (`tool_use`/`tool_result`), thinking blocks, and image input

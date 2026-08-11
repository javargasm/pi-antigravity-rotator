# Open WebUI

Connect Open WebUI to pi-antigravity-rotator to use Google Antigravity models from the Open WebUI chat interface.

## Option A: Admin Panel UI (recommended)

1. Open Open WebUI (default: `http://localhost:3000`)
2. Go to **Admin Settings** → **Connections** → **OpenAI** section
3. Click **+ (Add Connection)**
4. Set **URL**: `http://localhost:51200/v1`
5. Set **API Key**: `tuxevil` (or your `rk-...` Virtual Key)
6. If model auto-discovery doesn't work, manually add model IDs:
   - Type the model name (e.g. `gemini-3.6-flash-high`) and click **+**
7. Click **Save**

> **Docker users:** If Open WebUI runs in Docker and the rotator is on the host, use `http://host.docker.internal:51200/v1` instead of `localhost`.

## Option B: Environment Variables

```bash
OPENAI_API_BASE_URL=http://localhost:51200/v1
OPENAI_API_KEY=tuxevil
```

For Docker Compose:

```yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    environment:
      OPENAI_API_BASE_URL: "http://host.docker.internal:51200/v1"
      OPENAI_API_KEY: "tuxevil"
      ENABLE_OLLAMA_API: "false"
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

## Available Models

```
gemini-3.6-flash-high     gemini-3.6-flash-medium    gemini-3.6-flash-low
gemini-3.5-flash-high     gemini-3.5-flash-medium    gemini-3.5-flash-low
gemini-3.1-pro-high       gemini-3.1-pro-low
claude-sonnet-4-6         claude-opus-4-6-thinking
gpt-oss-120b-medium
```

## Notes

- Environment variables (`OPENAI_API_BASE_URL`, `OPENAI_API_KEY`) are read on first launch and stored in the internal database. On subsequent restarts the database value takes precedence. To always use environment variables, set `ENABLE_PERSISTENT_CONFIG=False`.
- The rotator exposes a `/v1/models` endpoint for automatic model discovery
- If Open WebUI times out while fetching the model list, increase the timeout: `AIOHTTP_CLIENT_TIMEOUT_MODEL_LIST=30`

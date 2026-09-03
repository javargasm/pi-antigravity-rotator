# OpenClaw

Connect OpenClaw to tuxevil-rotator by adding a custom provider to `~/.openclaw/openclaw.json`.

## Configuration

Edit `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "mode": "merge",
    "providers": {
      "antigravity": {
        "baseUrl": "http://localhost:51200",
        "apiKey": "tuxevil",
        "api": "openai",
        "models": [
          {
            "id": "gemini-3.8-flash-high",
            "name": "Gemini 3.8 Flash High",
            "reasoning": true,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 1048576,
            "maxTokens": 65536
          },
          {
            "id": "claude-sonnet-4-6",
            "name": "Claude Sonnet 4.6",
            "reasoning": false,
            "input": ["text", "image"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 65536
          },
          {
            "id": "claude-opus-4-6-thinking",
            "name": "Claude Opus 4.6 Thinking",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 200000,
            "maxTokens": 65536
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "antigravity/gemini-3.8-flash-high"
      }
    }
  }
}
```

## Anthropic-Compatible Mode

For Claude models, you can alternatively use the Anthropic Messages API:

```json
{
  "models": {
    "providers": {
      "antigravity-anthropic": {
        "baseUrl": "http://localhost:51200",
        "apiKey": "tuxevil",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "claude-sonnet-4-6",
            "name": "Claude Sonnet 4.6",
            "contextWindow": 200000,
            "maxTokens": 65536
          }
        ]
      }
    }
  }
}
```

## Virtual Key Authentication

If you have Virtual Keys configured, replace `"tuxevil"` in `apiKey` with your `rk-...` key.

You can also store keys in the auth profiles file at `~/.openclaw/agents/main/agent/auth-profiles.json`:

```json
{
  "version": 1,
  "profiles": {
    "antigravity:default": {
      "type": "api_key",
      "provider": "antigravity",
      "key": "rk-your-virtual-key-here"
    }
  }
}
```

## CLI Commands

```bash
openclaw models list                          # List configured models
openclaw models set antigravity/gemini-3.8-flash-high  # Switch default model
openclaw status                               # Check gateway status
```

## Notes

- The `"mode": "merge"` setting adds the antigravity provider alongside existing built-in providers. Use `"replace"` to disable all other providers.
- Model `id` values must match what the rotator returns from `GET /v1/models`
- The `api` field supports `"openai"`, `"anthropic-messages"`, `"openai-completions"`, and `"google-generative-ai"`

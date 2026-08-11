# OpenCode

Connect OpenCode to tuxevil-rotator to use Google Antigravity models as your OpenCode provider.

## Configuration

Create or edit `~/.config/opencode/opencode.json` (global) or `opencode.json` in your project root:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "antigravity": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Antigravity (local)",
      "options": {
        "baseURL": "http://localhost:51200/v1"
      },
      "models": {
        "gemini-3.6-flash-high": {
          "name": "Gemini 3.6 Flash High",
          "limit": { "context": 200000, "output": 65536 }
        },
        "gemini-3.6-flash-medium": {
          "name": "Gemini 3.6 Flash Medium",
          "limit": { "context": 200000, "output": 65536 }
        },
        "gemini-3.1-pro-low": {
          "name": "Gemini 3.1 Pro",
          "limit": { "context": 200000, "output": 65536 }
        },
        "claude-sonnet-4-6": {
          "name": "Claude Sonnet 4.6",
          "limit": { "context": 200000, "output": 65536 }
        },
        "claude-opus-4-6-thinking": {
          "name": "Claude Opus 4.6 Thinking",
          "limit": { "context": 200000, "output": 65536 }
        }
      }
    }
  },
  "model": "antigravity/gemini-3.6-flash-high"
}
```

## Setting the API Key

**Option A: Via `/connect` command inside OpenCode (recommended)**

```
/connect
```

Select "Other", enter provider ID `antigravity`, then enter your key (`no-key` if no Virtual Keys are configured, or your `rk-...` Virtual Key).

**Option B: Environment variable in config**

```jsonc
{
  "provider": {
    "antigravity": {
      "options": {
        "baseURL": "http://localhost:51200/v1",
        "apiKey": "{env:TUXEVIL_ROTATOR_KEY}"
      }
    }
  }
}
```

Then set `TUXEVIL_ROTATOR_KEY=no-key` (or your `rk-...` key) in your shell.

## Selecting a Model

Set as default in config:

```json
{ "model": "antigravity/gemini-3.6-flash-high" }
```

Or via CLI flag:

```bash
opencode --model antigravity/gemini-3.6-flash-high
```

Or use `/models` inside OpenCode to pick interactively.

## Notes

- The `npm` field must be `"@ai-sdk/openai-compatible"` for the OpenAI Chat Completions endpoint
- Model IDs in the config must match what `GET /v1/models` returns from the rotator
- Add as many models as you want to the `models` map — only listed ones appear in the picker

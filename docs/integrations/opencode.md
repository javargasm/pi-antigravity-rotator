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
        "gemini-3.8-flash-high": {
          "name": "Gemini 3.8 Flash High",
          "limit": { "context": 1000000, "output": 65536 }
        },
        "gemini-3.8-flash-medium": {
          "name": "Gemini 3.8 Flash Medium",
          "limit": { "context": 1000000, "output": 65536 }
        },
        "gemini-3.8-flash-low": {
          "name": "Gemini 3.8 Flash Low",
          "limit": { "context": 1000000, "output": 65536 }
        },
        "gemini-3.7-flash-tiered": {
          "name": "Gemini 3.7 Flash Tiered (Thinking)",
          "limit": { "context": 1000000, "output": 65536 },
          "options": {
            "reasoningEffort": "high"
          }
        },
        "gemini-3.6-flash-high": {
          "name": "Gemini 3.6 Flash High",
          "limit": { "context": 1000000, "output": 65536 }
        },
        "gemini-3.6-flash-medium": {
          "name": "Gemini 3.6 Flash Medium",
          "limit": { "context": 1000000, "output": 65536 }
        },
        "gemini-3.1-pro-low": {
          "name": "Gemini 3.1 Pro",
          "limit": { "context": 1000000, "output": 65536 }
        },
        "claude-sonnet-4-6": {
          "name": "Claude Sonnet 4.6",
          "limit": { "context": 1000000, "output": 64000 }
        },
        "claude-opus-4-6-thinking": {
          "name": "Claude Opus 4.6 Thinking",
          "limit": { "context": 1000000, "output": 64000 }
        }
      }
    }
  },
  "model": "antigravity/gemini-3.8-flash-high"
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
{ "model": "antigravity/gemini-3.8-flash-high" }
```

Or via CLI flag:

```bash
opencode --model antigravity/gemini-3.8-flash-high
```

Or use `/models` inside OpenCode to pick interactively.

## Thinking & Reasoning Levels

Antigravity models handle reasoning and internal thinking in three ways:

### 1. Named Reasoning Levels (Gemini 3.8)

Gemini 3.8 exposes separate native model IDs for `low`, `medium`, and `high` reasoning. Select the desired level through the model ID; the rotator leaves thinking adaptive within that upstream level.

| Model ID | Context Window | Reasoning Level |
| :--- | :--- | :--- |
| `gemini-3.8-flash-high` | 1,000,000 | High |
| `gemini-3.8-flash-medium` | 1,000,000 | Medium |
| `gemini-3.8-flash-low` | 1,000,000 | Low |

### 2. Adaptive Thinking (`gemini-3.7-flash-tiered`)

`gemini-3.7-flash-tiered` uses Google's dynamic thinking level. By default, it operates adaptively (the model decides how many tokens to think). You can control the thinking depth using standard `reasoning_effort`:

| Level | Upstream `thinkingLevel` | Use Case |
| :--- | :--- | :--- |
| **`low`** | `LOW` | Quick responses, straightforward edits, simple questions. |
| **`medium`** | `MEDIUM` | Balanced reasoning for standard coding and multi-file refactors. |
| **`high`** | `HIGH` | Deep architectural design, complex bug diagnosis, deep multi-step planning. |
| *(default)* | Adaptive | Model dynamically adjusts thinking tokens based on prompt complexity. |

### 3. Fixed Token Budgets (Gemini 3.6 / 3.1 & Claude)

For earlier Gemini models and Claude, the thinking budget is predetermined by model ID:

| Model ID | Context Window | Thinking Budget |
| :--- | :--- | :--- |
| `gemini-3.7-flash-tiered` | 1,000,000 | Dynamic / Tiered (`low` / `medium` / `high`) |
| `gemini-3.6-flash-high` | 1,000,000 | 10,000 tokens (fixed) |
| `gemini-3.6-flash-medium` | 1,000,000 | 4,000 tokens (fixed) |
| `gemini-3.6-flash-low` | 1,000,000 | 1,000 tokens (fixed) |
| `gemini-3.1-pro-low` | 1,000,000 | 1,001 tokens (fixed) |
| `claude-sonnet-4-6` | 1,000,000 | 32,768 tokens (fixed) |
| `claude-opus-4-6-thinking` | 1,000,000 | 32,768 tokens (fixed) |

## Advanced Settings & Prompt Compression

You can pass custom headers in `opencode.json` to enable features like token compression:

```jsonc
{
  "provider": {
    "antigravity": {
      "options": {
        "baseURL": "http://localhost:51200/v1",
        "headers": {
          "X-Rotator-Compression": "rtk+lite"
        }
      }
    }
  }
}
```

## Notes

- The `npm` field must be `"@ai-sdk/openai-compatible"` for the OpenAI Chat Completions endpoint
- Model IDs in the config must match what `GET /v1/models` returns from the rotator
- Add as many models as you want to the `models` map — only listed ones appear in the picker
- `tuxevil-rotator` automatically sanitizes complex JSON schemas sent by OpenCode tools (`read`, `edit`, `shell`, `task`, `grep`, `glob`), stripping unsupported keywords so Antigravity executes them seamlessly.

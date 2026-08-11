# Aider

Connect Aider (AI pair programming CLI) to tuxevil-rotator using the OpenAI-compatible provider.

## Quick Start

```bash
export OPENAI_API_BASE=http://localhost:51200/v1
export OPENAI_API_KEY=tuxevil
aider --model openai/gemini-3.6-flash-high
```

> **Important:** The `openai/` prefix is required. It tells Aider/litellm to use the OpenAI-compatible provider path.

## Configuration Options

### Option A: `.env` file (project root or home directory)

```dotenv
OPENAI_API_BASE=http://localhost:51200/v1
OPENAI_API_KEY=tuxevil
AIDER_MODEL=openai/gemini-3.6-flash-high
```

### Option B: `.aider.conf.yml`

```yaml
openai-api-base: http://localhost:51200/v1
openai-api-key: tuxevil
model: openai/gemini-3.6-flash-high
show-model-warnings: false
```

### Option C: CLI flags

```bash
aider \
  --openai-api-base http://localhost:51200/v1 \
  --openai-api-key antigravity \
  --model openai/gemini-3.6-flash-high
```

## Available Models

Use the `openai/` prefix for all model names:

```
openai/gemini-3.6-flash-high
openai/gemini-3.6-flash-medium
openai/gemini-3.6-flash-low
openai/gemini-3.5-flash-high
openai/gemini-3.1-pro-low
openai/claude-sonnet-4-6
openai/claude-opus-4-6-thinking
openai/gpt-oss-120b-medium
```

## Notes

- The `OPENAI_API_KEY` must be set to a non-empty string even if the rotator doesn't validate it — use `tuxevil` or your `rk-...` Virtual Key
- Aider will show a warning that the model is not in its built-in registry — this is expected and can be suppressed with `show-model-warnings: false`
- Config files are loaded in order: home directory → git repo root → current directory (later files take priority)

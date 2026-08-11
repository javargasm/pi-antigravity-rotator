# Hermes

Connect Hermes AI agent to pi-antigravity-rotator using a custom provider configuration.

## Configuration

Edit `~/.hermes/config.yaml`:

```yaml
model:
  default: gemini-3.6-flash-high
  provider: custom
  base_url: http://localhost:51200/v1
  api_key: tuxevil
```

## Alternative: Named Custom Provider

For more control or multiple endpoints, use the `custom_providers` section:

```yaml
custom_providers:
  - name: antigravity
    base_url: http://localhost:51200/v1
    api_mode: chat_completions
```

Then select it with:

```bash
hermes model
# Select "Custom endpoint", choose "antigravity"
```

Or switch mid-session:

```
/model custom:antigravity:gemini-3.6-flash-high
```

## Interactive Setup

```bash
hermes model
# Select "Custom endpoint (self-hosted / VLLM / etc.)"
# API base URL: http://localhost:51200/v1
# API key: tuxevil
# Model name: gemini-3.6-flash-high
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

- The `OPENAI_BASE_URL` / `LLM_MODEL` environment variables are not supported in current Hermes — use `config.yaml`
- For Anthropic-compatible mode, set `api_mode: anthropic_messages` in the named provider config and use `claude-sonnet-4-6` or `claude-opus-4-6-thinking` as the model

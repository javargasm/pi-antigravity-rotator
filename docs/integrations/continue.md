# Continue

Connect Continue (VS Code / JetBrains extension) to tuxevil-rotator via the OpenAI-compatible provider.

## Configuration (YAML — recommended)

Edit `~/.continue/config.yaml`:

```yaml
name: My Config
version: 0.0.1
schema: v1

models:
  - name: Gemini 3.8 Flash High
    provider: openai
    model: gemini-3.8-flash-high
    apiBase: http://localhost:51200/v1
    apiKey: tuxevil
    roles:
      - chat
      - edit
      - apply
    defaultCompletionOptions:
      contextLength: 1000000
      maxTokens: 65536

  - name: Gemini 3.1 Pro
    provider: openai
    model: gemini-3.1-pro-low
    apiBase: http://localhost:51200/v1
    apiKey: tuxevil
    roles:
      - chat

  - name: Claude Sonnet 4.6
    provider: openai
    model: claude-sonnet-4-6
    apiBase: http://localhost:51200/v1
    apiKey: tuxevil
    roles:
      - chat
      - edit
      - apply
    capabilities:
      - tool_use
      - image_input
```

## Configuration (JSON — legacy)

Edit `~/.continue/config.json`:

```json
{
  "models": [
    {
      "title": "Gemini 3.8 Flash High",
      "provider": "openai",
      "model": "gemini-3.8-flash-high",
      "apiBase": "http://localhost:51200/v1",
      "apiKey": "tuxevil",
      "contextLength": 1000000
    },
    {
      "title": "Claude Sonnet 4.6",
      "provider": "openai",
      "model": "claude-sonnet-4-6",
      "apiBase": "http://localhost:51200/v1",
      "apiKey": "tuxevil",
      "contextLength": 200000
    }
  ]
}
```

## Multiple Models with YAML Anchors

```yaml
%YAML 1.1
---
name: Antigravity Config
version: 0.0.1
schema: v1

proxy_defaults: &proxy
  provider: openai
  apiBase: http://localhost:51200/v1
  apiKey: tuxevil

models:
  - name: Flash High
    <<: *proxy
    model: gemini-3.8-flash-high
    roles: [chat, edit, apply]
  - name: Pro
    <<: *proxy
    model: gemini-3.1-pro-low
    roles: [chat]
  - name: Claude
    <<: *proxy
    model: claude-sonnet-4-6
    roles: [chat, edit, apply]
```

## Notes

- The `provider` must be `openai` for any OpenAI-compatible endpoint
- `apiKey` can be `tuxevil` (open mode) or your `rk-...` Virtual Key
- Use `AUTODETECT` as the model value to have Continue query `/v1/models` and list all available models automatically (JSON format only)
- Declare `capabilities: [tool_use, image_input]` explicitly if Continue doesn't auto-detect them for your model

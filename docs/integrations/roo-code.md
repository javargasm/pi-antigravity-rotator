# Roo Code

Connect Roo Code (VS Code extension) to tuxevil-rotator using the OpenAI Compatible provider.

## Configuration

1. Click the **Roo Code icon** in the VS Code sidebar
2. Click the **gear/settings icon** at the top of the panel
3. In the **API Provider** dropdown, select **"OpenAI Compatible"**
4. Set **Base URL**: `http://localhost:51200/v1`
5. Set **API Key**: `tuxevil` (or your `rk-...` Virtual Key)
6. Set **Model ID**: e.g. `gemini-3.6-flash-high`

## Available Models

```
gemini-3.6-flash-high     gemini-3.6-flash-medium    gemini-3.6-flash-low
gemini-3.5-flash-high     gemini-3.5-flash-medium    gemini-3.5-flash-low
gemini-3.1-pro-high       gemini-3.1-pro-low
claude-sonnet-4-6         claude-opus-4-6-thinking
gpt-oss-120b-medium
```

Check all models: `curl http://localhost:51200/v1/models`

## Model Configuration

Configure the **Model Configuration** section to match actual capabilities:

| Setting | Recommended |
|---------|-------------|
| Max Output Tokens | `65536` |
| Context Window | `200000` |
| Image Support | `true` |
| Computer Use | `false` |

## API Configuration Profiles

Roo Code supports multiple saved profiles. You can keep the rotator profile alongside cloud provider profiles and switch between them from the settings panel.

## Notes

- Use **"OpenAI Compatible"** — not "OpenAI" (which hardcodes the base URL to `api.openai.com`)
- Roo Code requires native OpenAI-compatible tool calling — the rotator fully supports `tools`/`tool_choice`, so all agentic features work
- Verify the rotator is running: `curl http://localhost:51200/v1/models`

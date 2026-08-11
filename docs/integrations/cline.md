# Cline

Connect Cline (VS Code extension) to pi-antigravity-rotator using the OpenAI Compatible provider.

## Configuration

1. Open VS Code and click the **Cline icon** in the sidebar
2. Click the **gear/settings icon** at the top of the Cline panel
3. In the **API Provider** dropdown, select **"OpenAI Compatible"**
4. Set **Base URL**: `http://localhost:51200/v1`
5. Set **API Key**: `tuxevil` (or your `rk-...` Virtual Key)
6. Set **Model ID**: e.g. `gemini-3.6-flash-high`
7. Click **Verify** to test the connection

## Available Models

```
gemini-3.6-flash-high     gemini-3.6-flash-medium    gemini-3.6-flash-low
gemini-3.5-flash-high     gemini-3.5-flash-medium    gemini-3.5-flash-low
gemini-3.1-pro-high       gemini-3.1-pro-low
claude-sonnet-4-6         claude-opus-4-6-thinking
gpt-oss-120b-medium
```

Check all models: `curl http://localhost:51200/v1/models`

## Model Configuration Tips

After selecting a model, configure the **Model Configuration** section to match the actual model capabilities:

| Setting | Recommended |
|---------|-------------|
| Max Output Tokens | `65536` |
| Context Window | `200000` |
| Image Support | `true` |
| Computer Use | `false` |

Setting these correctly prevents Cline from truncating context prematurely.

## Notes

- Use **"OpenAI Compatible"** — not "OpenAI" (which hardcodes the base URL to `api.openai.com`)
- Cline requires native tool calling support — the rotator fully supports `tools`/`tool_choice` in the OpenAI format, so all agentic features work
- If the connection verification fails, confirm the rotator is running: `curl http://localhost:51200/v1/models`

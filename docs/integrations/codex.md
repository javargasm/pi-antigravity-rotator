# Codex (OpenAI CLI / VS Code Agent)

tuxevil-rotator has full support for the OpenAI Responses API (`/v1/responses`), which is what Codex uses natively. It can act as the multi-account rotation backend for Codex running in VS Code or in the terminal.

## Configuration

### Via environment variables (recommended)

```bash
export OPENAI_BASE_URL=http://localhost:51200/v1
export OPENAI_API_KEY=tuxevil   # or your rk-... Virtual Key
```

Then launch Codex normally. All requests will route through the rotator.

### Via Codex config file

```json
{
  "codex.openai.apiBase": "http://localhost:51200/v1",
  "codex.openai.apiKey": "tuxevil"
}
```

Or set in VS Code's `settings.json`:

```json
{
  "openai.baseURL": "http://localhost:51200/v1",
  "openai.apiKey": "tuxevil"
}
```

## Selecting a Model

```json
{
  "codex.model": "gemini-3.6-flash-high"
}
```

Supported models for Codex:

```
gemini-3.6-flash-high     (recommended: fast + reasoning)
gemini-3.6-flash-medium
gemini-3.5-flash-high
gemini-3.1-pro-low        (for deep reasoning tasks)
claude-sonnet-4-6
claude-opus-4-6-thinking
gpt-oss-120b-medium
```

## What Works with Codex

- **Responses API** — Full support for `POST /v1/responses` and all auxiliary endpoints (retrieve, delete, cancel, input_items)
- **Function/tool calling** — Fully translated to Gemini `functionCalls` and back. Multi-turn tool conversations work correctly
- **Reasoning visibility** — Thinking blocks streamed back as `reasoning_content` chunks so Codex can inspect the model's inner reasoning before acting
- **Strict validation** — Unsupported tools (e.g. `web_search`) are rejected proactively with a clear error message

## Notes

- If Codex uses `web_search` or other built-in tools, the rotator will reject them with a `400` error explaining the limitation
- The `developer` role in message history is fully supported (mapped to system instructions)

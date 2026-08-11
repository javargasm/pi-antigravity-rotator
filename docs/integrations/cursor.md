# Cursor

Connect Cursor IDE to tuxevil-rotator to use Google Antigravity models directly in Cursor's AI features.

## Configuration

1. Open Cursor Settings (`Ctrl+,` / `Cmd+,`)
2. Search for **"OpenAI"** or navigate to **Models > OpenAI API Key**
3. Set **Override OpenAI Base URL**: `http://localhost:51200/v1`
4. Set **OpenAI API Key**: `tuxevil` (or a Virtual Key `rk-...` if you have PostgreSQL configured)
5. In the model selector, choose or type a model name (e.g. `gemini-3.6-flash-high`)

## Alternative: Environment Variables

Set these before launching Cursor:

```bash
export OPENAI_BASE_URL=http://localhost:51200/v1
export OPENAI_API_KEY=tuxevil
```

## Available Models

```
gemini-3.6-flash-high     gemini-3.6-flash-medium    gemini-3.6-flash-low
gemini-3.5-flash-high     gemini-3.5-flash-medium    gemini-3.5-flash-low
gemini-3.1-pro-high       gemini-3.1-pro-low
claude-sonnet-4-6         claude-opus-4-6-thinking
gpt-oss-120b-medium
```

Check all available models:

```bash
curl http://localhost:51200/v1/models
```

## Notes

- If Cursor rejects a model name as invalid, try using `gpt-4o` as the model name — the rotator's alias system will route it to the default Gemini model. Or check if newer Cursor versions accept arbitrary model names when a custom base URL is set.
- If you have Virtual Keys configured, use an `rk-...` key instead of `tuxevil`

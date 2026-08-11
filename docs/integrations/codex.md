# OpenAI Codex provider

`openai-codex` is an isolated provider pool backed by ChatGPT OAuth. A Codex
model is never sent to Google Antigravity or Ollama; rotation can only choose
another eligible Codex credential.

## Login and import

Interactive login uses PKCE S256, a required OAuth `state`, a loopback callback,
an expiry timeout, and a manual callback paste fallback:

```bash
tuxevil-rotator login --provider openai-codex
```

The authenticated WebUI page at `/login-cli` also has an **OpenAI Codex** tab.
It starts the same PKCE flow and accepts the complete loopback callback URL;
the authorization code is exchanged server-side and only the refresh
credential is persisted.

Existing Codex CLI files can be imported from a path. The CLI accepts the nested
`{ "tokens": { ... } }` form and compatible flat/provider-wrapped exports. It
requires a `refresh_token`; access tokens are used only in memory and are never
written to `accounts.json` or printed.

```bash
tuxevil-rotator login --provider openai-codex --import ~/.codex/auth.json
```

One Codex credential is kept per email. An import with the same email but a
different `providerAccountId` is rejected instead of overwriting the existing
account.

## Configuration

Optional environment variables are available for deployments and tests:

| Variable | Default |
|---|---|
| `CODEX_OAUTH_CLIENT_ID` | Codex CLI public client id |
| `CODEX_OAUTH_AUTHORIZE_URL` | `https://auth.openai.com/oauth/authorize` |
| `CODEX_OAUTH_TOKEN_URL` | `https://auth.openai.com/oauth/token` |
| `CODEX_OAUTH_REDIRECT_URI` | `http://localhost:1455/auth/callback` |
| `CODEX_OAUTH_CALLBACK_HOST` | `127.0.0.1` |
| `CODEX_OAUTH_CALLBACK_PORT` | `1455` |
| `CODEX_BASE_URL` | `https://chatgpt.com/backend-api/codex` |

The persisted credential shape is:

```json
{
  "provider": "openai-codex",
  "refreshToken": "...",
  "providerAccountId": "...",
  "proxyUrl": "http://proxy.example:8080"
}
```

Refresh tokens are rotated and persisted atomically. Concurrent requests share
one refresh operation so an older one-time token is not reused. OAuth failures
such as `invalid_grant` and `refresh_token_reused` require re-authentication;
diagnostics omit token values.

## API and models

`/v1/responses` sends native Responses payloads to `/responses`, defaults
`store` to `false`, removes references to persisted response items, supports
SSE streaming and keeps upstream Responses events intact. `/v1/chat/completions`
uses an explicit Chat ↔ Responses conversion for multimodal input, tools,
reasoning, usage, and SSE chunks.

The safe base catalog contains the current Codex variants `gpt-5.6-sol`,
`gpt-5.6-terra`, and `gpt-5.6-luna`. Authenticated discovery from
`/backend-api/codex/models` can add validated IDs; a discovery failure leaves
the base catalog in place. Prices are not fabricated for subscription quota
models.

## Quotas and internal dependencies

Quota polling is best-effort against the internal endpoint
`GET https://chatgpt.com/backend-api/wham/usage`. It is cached for 60 seconds,
throttled, and times out after eight seconds. The worst of the primary and
secondary windows controls selection; Spark rows are preserved when exposed.
`401/403` invalidates only the Codex credential, while `429/5xx` applies a
Codex-local cooldown and allows another Codex account. Google and Ollama state
is not changed by these failures.

The OAuth host and backend endpoints are internal/no-garantizados and may change.
Codex WebSocket, background mode, persisted conversations, retrieve/delete/
cancel/input-items passthrough, and automatic cross-provider fallback are not
part of this first HTTP/SSE implementation.

## Operator smoke test

After authenticating a real account, the operator can verify without logging
tokens:

```bash
curl http://127.0.0.1:51200/v1/models
curl http://127.0.0.1:51200/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-5.6-luna","input":"Reply with one word.","store":false}'
```

Check that the response header identifies a Codex account and that the model
does not appear on a Google/Ollama route. Stop and re-authenticate if the
provider reports `401` or `403`.

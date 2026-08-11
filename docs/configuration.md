# Configuration

## Config File Location

Config files are stored in `~/.tuxevil-rotator/` by default. Override with:

```bash
export TUXEVIL_ROTATOR_DIR=/path/to/config

# Or CLI flag
pi-antigravity-rotator start --config-dir /path/to/config
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TUXEVIL_ROTATOR_DIR` | Config directory path (default: `~/.tuxevil-rotator/`) |
| `PI_ROTATOR_DATABASE_URL` | PostgreSQL connection string for Virtual Keys and Spend Logging |
| `DATABASE_URL` | Fallback PostgreSQL connection string |
| `PI_ROTATOR_ENCRYPTION_KEY` | Secret used to encrypt OAuth refresh tokens at rest. A 64-character hexadecimal key is recommended. `ENCRYPTION_KEY` is accepted as a fallback. |
| `PI_ROTATOR_ADMIN_TOKEN` | Admin token for dashboard/API access. If unset, a secure token is auto-generated on first run and saved to `.admin-token` |
| `PI_ROTATOR_BIND_HOST` | Network interface to bind on (default: `0.0.0.0`; set to `127.0.0.1` for local-only) |
| `PI_ROTATOR_MAX_BODY_BYTES` | Max accepted proxy request body size in bytes (default: `26214400` = 25 MiB) |
| `PI_ROTATOR_LOG_LEVEL` | Log verbosity: `debug`, `info`, `warn`, `error`, `silent` (default: `info`) |
| `PI_ROTATOR_LOG_RETENTION_DAYS` | Spend log retention in days (default: `30`) |
| `PI_ROTATOR_QUOTA_USER_AGENT` | Override the User-Agent for quota API fetches |
| `PI_AI_ANTIGRAVITY_VERSION` | Override the Antigravity version in quota fetch UA (default: `1.107.0`) |
| `PI_ROTATOR_TELEMETRY` | Set to `off`, `false`, or `0` to disable anonymous telemetry |
| `PI_ROTATOR_TELEMETRY_URL` | Custom HTTPS endpoint for telemetry (self-hosted receiver) |
| `ANTIGRAVITY_CLIENT_ID` | Your Google OAuth client ID (see [OAuth Setup](#oauth-client-credentials)) |
| `ANTIGRAVITY_CLIENT_SECRET` | Your Google OAuth client secret |
| `ANTIGRAVITY_REDIRECT_URI` | OAuth callback URI for hosted login (default: `http://localhost:51121/oauth-callback`) |
| `TUXEVIL_OPEN_BROWSER` | Set to `1`, `true`, or `yes` to open the CLI OAuth URL automatically. Disabled by default for headless environments. |

## OAuth Client Credentials

Existing installations continue to work with the legacy compatibility OAuth client. For new deployments, or when using hosted OAuth, register your own Google OAuth client:

```bash
export ANTIGRAVITY_CLIENT_ID="your-client-id"
export ANTIGRAVITY_CLIENT_SECRET="your-client-secret"
```

If either variable is missing, the rotator falls back to the legacy client and emits a one-time deprecation warning. Keep secrets in an environment manager or deployment secret store; do not commit them to the repository.

## Providers

The rotator routes through two provider families. Each account in `accounts.json`
carries a `provider` field selecting its family (default when absent: `google-antigravity`,
i.e. legacy configs).

| Provider | ID | Credential | Add accounts |
|----------|-----|------------|--------------|
| Google Antigravity | `google-antigravity` | OAuth refresh token (auto-discovered project) | `tuxevil-rotator login` |
| Ollama Cloud | `ollama` | Static API key from `ollama.com/settings/keys` (never expires) | `tuxevil-rotator login --provider ollama` |

Ollama Cloud models are exposed on the standard OpenAI/Anthropic-compatible routes:

- `POST /v1/chat/completions`, `/v1/responses`, and `/v1/messages` translate requests to
  the Ollama native `api/chat` endpoint and stream NDJSON deltas back as SSE (including
  `tool_calls` and usage in the final `[DONE]` chunk).
- `GET /v1/models` lists the Ollama catalog (`owned_by: "ollama"`).
- When the `ollama` provider is enabled, the native `POST /api/chat` endpoint routes to it.

Model names are matched per provider: models in Ollama's cloud catalog go to Ollama
accounts, everything else routes to Google Antigravity.

## accounts.json

The main configuration file. Created automatically by the `login` command, and editable by hand or via the dashboard UI.

```json
{
  "proxyPort": 51200,
  "requestsPerRotation": 5,
  "rotateOnQuotaDrop": 20,
  "quotaPollIntervalMs": 300000,
  "maxConcurrentRequestsPerAccount": 1,
  "maxConcurrentRequestsPerProjectModel": 1,
  "projectCircuitBreaker429Threshold": 3,
  "projectCircuitBreakerWindowMs": 600000,
  "projectCircuitBreakerCooldownMs": 3600000,
  "modelCircuitBreaker429Threshold": 3,
  "modelCircuitBreakerCooldownMs": 21600000,
  "dailyAccountSlowRequests": 250,
  "dailyAccountStopRequests": 350,
  "dailyProjectSlowRequests": 900,
  "dailyProjectStopRequests": 1200,
  "slowModeJitterMinMs": 8000,
  "slowModeJitterMaxMs": 25000,
  "protectivePauseMs": 21600000,
  "useRequestCountRotationWhenQuotaUnknownOnly": true,
  "idempotencyEnabled": true,
  "idempotencyWindowMs": 2000,
  "streamRecoveryMaxRetries": 2,
  "compressionMode": "off",
  "accounts": [
    {
      "email": "user@gmail.com",
      "refreshToken": "1//...",
      "projectId": "project-abc123",
      "label": "user"
    }
  ]
}
```

## Config Fields Reference

| Field | Default | Description |
|-------|---------|-------------|
| `proxyPort` | `51200` | Port the proxy listens on |
| `bindHost` | `0.0.0.0` | Interface to bind on. For local-only use, set to `127.0.0.1` |
| `routingPolicy` | `timer-first` | Routing policy: `timer-first`, `tier-first`, `quota-first`, `hybrid`, `sequential-quota`, or `sticky-quota` |
| `requestsPerRotation` | `5` | Max per-model requests before attempting request-count rotation |
| `rotateOnQuotaDrop` | `20` | Rotate when a model's quota drops this many %. Set to `0` to disable |
| `quotaPollIntervalMs` | `300000` | Quota poll interval in ms (5 minutes) |
| `maxConcurrentRequestsPerAccount` | `1` | Max simultaneous requests allowed per account |
| `maxConcurrentRequestsPerProjectModel` | `1` | Max simultaneous requests allowed across accounts sharing the same `projectId` for the same quota model |
| `projectCircuitBreaker429Threshold` | `3` | Unique accounts from the same `projectId` that must hit provider `429` before pausing that project/model |
| `projectCircuitBreakerWindowMs` | `600000` | Rolling window for the project/model `429` circuit breaker |
| `projectCircuitBreakerCooldownMs` | `3600000` | Minimum project/model pause after the circuit breaker trips |
| `modelCircuitBreaker429Threshold` | `3` | Unique accounts across all projects that must hit provider `429` for the same quota model before pausing that model globally |
| `modelCircuitBreakerCooldownMs` | `21600000` | Minimum model-wide pause after the global model circuit breaker trips |
| `dailyAccountSlowRequests` | `250` | Daily upstream attempts per account before slow-mode jitter starts |
| `dailyAccountStopRequests` | `350` | Daily upstream attempts per account before routing stops for that account until the next UTC day |
| `dailyProjectSlowRequests` | `900` | Daily upstream attempts per `projectId` before slow-mode jitter starts |
| `dailyProjectStopRequests` | `1200` | Daily upstream attempts per `projectId` before routing stops for that project until the next UTC day |
| `slowModeJitterMinMs` | `8000` | Minimum slow-mode delay before upstream request |
| `slowModeJitterMaxMs` | `25000` | Maximum slow-mode delay before upstream request |
| `protectivePauseMs` | `21600000` | Global routing pause after a serious provider enforcement signal (6 hours) |
| `useRequestCountRotationWhenQuotaUnknownOnly` | `true` | Use request-count rotation only until quota telemetry exists for the request's model. Set to `false` to keep rotating by request count even with known quotas |
| `tokenBucketEnabled` | `false` | Enables the local per-account request bucket used by `hybrid` policy |
| `tokenBucketMaxTokens` | `50` | Bucket capacity when enabled |
| `tokenBucketRefillPerMinute` | `6` | Refill speed when enabled |
| `tokenBucketInitialTokens` | `50` | Startup fill level when enabled |
| `idempotencyEnabled` | `true` | Deduplicate identical in-flight requests and short-window retries |
| `idempotencyWindowMs` | `2000` | Retention window for completed idempotent request results |
| `streamRecoveryMaxRetries` | `2` | Maximum account rotations for upstream failures before the response is flushed |
| `compressionMode` | `off` | Prompt compression mode: `off`, `lite`, `rtk`, or `rtk+lite`. Can be overridden by the `X-Rotator-Compression` request header |

## Account Fields

| Field | Description |
|-------|-------------|
| `email` | Account email (auto-filled by login) |
| `provider` | `google-antigravity` (default/legacy) or `ollama` — selects the credential fields required and the upstream routing |
| `refreshToken` | Google OAuth refresh token (auto-filled by `login`, Google accounts only) |
| `projectId` | Google Cloud project ID discovered during login (Google accounts only) |
| `projectSource` | Optional metadata: `google` when discovered from Google, `manual` if edited by hand |
| `apiKey` | Ollama Cloud API key (Ollama accounts only; never expires, see `ollama.com/settings/keys`) |
| `label` | Display name on the dashboard (auto-filled, defaults to email username) |
| `tier` | Optional: `ultra`, `pro`, `plus`, `free`, or `unknown` — used by `tier-first` and `hybrid` routing policies |

```json
{
  "email": "my-ollama-user@example.com",
  "provider": "ollama",
  "apiKey": "ok-...",
  "label": "ollama-cloud"
}
```

## Automatic Migration from the Legacy Rotator

On startup, the rotator checks for the predecessor product's account store
(`~/.ollama-rotator/accounts.json`, or the `OLLAMA_ROTATOR_DIR` override) and
imports any Ollama Cloud accounts found there into the active account store —
tagged `provider: "ollama"`, preserving `label`/`tier`/`type`. Accounts whose
email already exists are skipped (never overwritten), and entries without an
API key are ignored with a warning. The import runs before the account list is
loaded, so migrated accounts are usable on the very first boot.

## Model Configuration Overrides

You can override per-model output token limits and thinking budgets via `modelSpecs` in `accounts.json`:

```json
{
  "modelSpecs": {
    "gemini-3.6-flash-high": {
      "maxOutputTokens": 65536,
      "thinkingBudget": 8192
    }
  }
}
```

## Model Aliases

Remap model names to upstream model names via `modelAliases` in `accounts.json`:

```json
{
  "modelAliases": {
    "my-fast-model": "gemini-3.6-flash-high",
    "my-smart-model": "gemini-3.1-pro-low"
  }
}
```

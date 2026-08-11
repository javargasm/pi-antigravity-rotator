<div align="center">

[![npm version](https://img.shields.io/npm/v/pi-antigravity-rotator?logo=npm&label=version)](https://www.npmjs.com/package/pi-antigravity-rotator)
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen?logo=node.js)](package.json)
[![License](https://img.shields.io/github/license/tuxevil/pi-antigravity-rotator?logo=opensourceinitiative)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/tuxevil/pi-antigravity-rotator/ci.yml?logo=github&label=CI)](https://github.com/tuxevil/pi-antigravity-rotator/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker Image](https://img.shields.io/badge/ghcr.io-pi--antigravity--rotator-blue?logo=docker)](https://github.com/tuxevil/pi-antigravity-rotator/pkgs/container/pi-antigravity-rotator)
[![Stars](https://img.shields.io/github/stars/tuxevil/pi-antigravity-rotator?style=social)](https://github.com/tuxevil/pi-antigravity-rotator/stargazers)

[![Installations](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Ftelemetry.tuxevil.com%2Fv1%2Fpublic-stats&query=%24.installsFormatted&label=installations&color=6366f1)](https://telemetry.tuxevil.com/v1/public-stats)
[![Requests Routed](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Ftelemetry.tuxevil.com%2Fv1%2Fpublic-stats&query=%24.requestsFormatted&label=requests%20routed&color=10b981)](https://telemetry.tuxevil.com/v1/public-stats)
[![Input Tokens](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Ftelemetry.tuxevil.com%2Fv1%2Fpublic-stats&query=%24.tokensInputFormatted&label=input%20tokens&color=3b82f6)](https://telemetry.tuxevil.com/v1/public-stats)
[![Output Tokens](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Ftelemetry.tuxevil.com%2Fv1%2Fpublic-stats&query=%24.tokensOutputFormatted&label=output%20tokens&color=8b5cf6)](https://telemetry.tuxevil.com/v1/public-stats)
[![Estimated Savings](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Ftelemetry.tuxevil.com%2Fv1%2Fpublic-stats&query=%24.savingsFormatted&label=estimated%20savings&color=f59e0b)](https://telemetry.tuxevil.com/v1/public-stats)

[View live telemetry stats](https://telemetry.tuxevil.com/stats)

![Pi Antigravity Rotator logo](./pi-antigravity-rotator_logo.png)

</div>

# Pi Antigravity Rotator

**Production-ready OpenAI-compatible gateway for Google Antigravity.**

Multi-account load balancing, per-model quota routing, account health scoring, access control with Virtual Keys, and cost auditing — via a single local endpoint that any agent can use. Even with a single account.

> **⚠️ WARNING:** Using this proxy may put connected Google accounts at risk of Terms of Service enforcement, including restriction, suspension, or permanent bans. Use at your own risk.

<details>
<summary><strong>⚠️ Terms of Service Warning — Read Before Installing</strong></summary>

> [!CAUTION]
> This is an unofficial tool and is not endorsed by Google. Routing traffic through this proxy may violate Google's Terms of Service or trigger automated abuse or policy enforcement systems.
>
> **By using this proxy, you acknowledge:**
> - Your account may be restricted, suspended, shadow-banned, or permanently banned
> - Multi-account rotation and proxying can increase account risk compared to normal interactive usage
> - You assume all responsibility for the accounts and traffic routed through this tool
>
> **Recommendation:** Do not use your primary Google account. Prefer disposable or lower-risk accounts, and keep account exposure conservative.

</details>

---

## v2.8 Highlights

- **Parent-Account Credential Model**: Each account (email) is now the parent entity and may hold per-provider credentials — a single human with both a Google Antigravity OAuth token and an Ollama Cloud API key lives in one account row. Login (`login --provider <id>`) and the legacy importer merge credentials onto existing accounts instead of duplicating by email.
- **Antigravity quota pools consolidated by family**: One quota bucket per family — `claude` (every Claude variant + gpt-oss) and `gemini` (every Gemini variant) — instead of one per model. The Antigravity quota API reports the same bucket for all of them, and the dashboard's consolidated RAW POLL line now shows both providers at once, with Antigravity pools first and Ollama last.
- **Ollama model pricing in `MODEL_PRICING`**: Spend summaries now report real USD for Ollama traffic (18 entries ported from the predecessor project's catalog of paid prices). Unknown models still return 0.
- **Routing robustness**: Dispatch for Ollama models now keys on the live catalog (`rotator.getOllamaModels()`), so models without `:` in the name (`minimax-m3`, `kimi-k3`, `glm-5.1`, `nemotron-3-super`, `deepseek-v4-pro`) no longer leak to the Antigravity adapter. Multi-turn tool-call requests now parse `function.arguments` to a real object before forwarding, since Ollama's Go API rejects OpenAI-style JSON-encoded strings.

## v2.7 Highlights

- **Multi-Provider Support**: The rotator now routes through two provider families. Google Antigravity accounts (OAuth, default) and Ollama Cloud accounts (static API keys, `login --provider ollama`) coexist in one account store, with per-provider model catalog resolution.
- **Ollama Cloud Compatibility (B2)**: `POST /v1/chat/completions`, `/v1/responses`, and `/v1/messages` translate requests to Ollama's native `api/chat` NDJSON protocol for Ollama models; streaming deltas (including `tool_calls` and `usage`) are converted to SSE in both OpenAI and Anthropic formats. `GET /v1/models` lists the Ollama catalog (`owned_by: "ollama"`), and the native `POST /api/chat` endpoint routes Ollama models to Ollama accounts.
- **Legacy Account Migration**: On startup, Ollama Cloud accounts from `~/.ollama-rotator/accounts.json` (the predecessor product, overridable via `OLLAMA_ROTATOR_DIR`) are imported automatically and merged onto the matching email — `provider: "ollama"`, preserving `label`/`tier`/`type`. Re-import is idempotent.
- **Flat-shape compatibility**: Existing configs with the legacy flat field layout (`apiKey`/`refreshToken` at the top level) are still accepted and normalized on load to the parent-account credential model.

## v2.6 Highlights

- **Lossless Prompt Compression**: Optional Lite and RTK compression modes preserve code-critical content while reducing prompt size. Enable `compressionMode` in `accounts.json` or override a request with `X-Rotator-Compression: lite`, `rtk`, or `rtk+lite`.
- **Operational Observability**: `X-Rotator-*` response headers expose routing, latency, token, cost, health, idempotency, and compression metrics without changing response bodies.
- **Reliable Request Handling**: Configurable pre-flush stream recovery, duplicate-request idempotency, asynchronous persistence, and an active-account benchmark improve production operations.
- **Dashboard Workspaces**: Refined Accounts, Virtual Keys, Spend Logs, telemetry, and notification experiences with responsive layouts, filtering, and consistent PII masking.
- **Security Hardening**: Refresh tokens now use salted `scrypt` plus AES-256-GCM for new encrypted records, legacy encrypted tokens remain readable, and public error responses no longer expose internal details.

## v2.5 Highlights

- **Automated GHCR Multi-arch Builds**: Official Docker images (`linux/amd64`, `linux/arm64`) automatically built and published to GitHub Container Registry.
- **Pre-built Docker Deployment**: Updated `docker-compose.yml` to pull pre-built GHCR images directly out-of-the-box.

## v2.4 Highlights

- **Virtual Keys & Scoped Access Control**: Generate scoped API keys (`rk-...`) with per-key model authorization rules and user tracking.
- **Spend Logging & Audit Inspector**: PostgreSQL audit trail of all requests, token metrics, TTFB/Total duration, Base64 media sanitization, 6-decimal USD cost breakdown, and Request/Response payload viewer.
- **Multi-page Web Dashboard**: Unified header navigation connecting Accounts, Virtual Keys, and Spend Logs, featuring customizable column visibility, search/filtering, and instant PII masking.
- **PostgreSQL Persistence Backend**: Enable `PI_ROTATOR_DATABASE_URL` for high-concurrency key validation, persistent spend logging, and retention policies.

---

### Compression and token encryption

Compression is disabled by default. To enable a default mode, add this field to `accounts.json`:

```json
{
  "compressionMode": "lite"
}
```

For a single request, send `X-Rotator-Compression: lite`, `rtk`, or `rtk+lite`. The response reports the selected mode and savings through `X-Rotator-Compression-*` headers.

To encrypt refresh tokens at rest, set a secret before starting the rotator. A 64-character hexadecimal key is recommended:

```bash
export PI_ROTATOR_ENCRYPTION_KEY="$(openssl rand -hex 32)"
pi-antigravity-rotator start
```

Existing `enc:v1` records remain decryptable during migration; newly written records use `enc:v2`.

---

## Features

- **Multi-provider gateway** — OpenAI-compatible endpoint (`/v1/chat/completions`, `/v1/responses`, `/v1/messages`) plus native Ollama (`/api/chat`) routes; any agent or tool can use either
- **Google Antigravity accounts** — OAuth load balancing across a pool, with per-model independent routing
- **Ollama Cloud accounts** — Static-API-key accounts (`login --provider ollama`) for the Ollama Cloud catalog (`gpt-oss`, `gemma4`, `kimi-k3`, `minimax-m3`, `qwen3.5`, `glm-5`, `mistral-large-3`, `nemotron-3`, `deepseek-v4`)
- **Parent-account credentials** — One email, many providers; the same human with Google OAuth and an Ollama key is one row in `accounts.json`, with `credentials: [{provider, apiKey|refreshToken, projectId}]` instead of duplicate rows by email
- **Multi-account load balancing** — Distributes traffic across a pool of accounts with per-model independent routing
- **One-command account setup** — `pi-antigravity-rotator login` auto-discovers (or provisions) the Cloud Code companion project for brand-new Google accounts; `login --provider ollama` adds an Ollama Cloud API key to an existing email or creates a new one
- **Smart rotation & health scoring** — Four routing policies (`timer-first`, `tier-first`, `quota-first`, `hybrid`) with composite health scores per account
- **Real-time quota monitoring** — Polls each provider's quota API on its own cadence; Antigravity quota pools are consolidated by family (`claude`, `gemini`) and Ollama reports session/weekly usage
- **Infringement & abuse detection** — Flags accounts on enforcement signals and triggers protective pause to preserve the rest of the pool
- **Virtual Keys & access control** — Issue scoped `rk-...` keys for teams, agents, or CI pipelines with per-key model restrictions
- **Spend logging & audit inspector** — Full request/response audit trail with 6-decimal USD cost estimates for both Antigravity and Ollama traffic (requires PostgreSQL)
- **Legacy importer** — On startup, automatically merges Ollama Cloud accounts from `~/.ollama-rotator/accounts.json` (the predecessor product) onto existing accounts, idempotently
- **Web dashboard** — Real-time routing state, quota bars, latency tracking (p50/p95), savings chart, activity heatmap, and routing inspector
- **State persistence** — Survives restarts; routing assignments, cooldowns, and flags saved to disk or PostgreSQL
- **Tool/function calling** — Fully supported in OpenAI and Anthropic formats, including multi-turn and parallel tool calls, with reliable function-name resolution for tool responses across turns. Ollama forwards `function.arguments` as a parsed object (OpenAI sends it as a JSON string and Ollama's Go API rejects that).
- **Reasoning/thinking visibility** — Interleaved thinking blocks exposed as `reasoning_content` / `thinking_delta` in real time

[Full feature list →](docs/how-it-works.md)

---

## Quick Start

**Requirements:** Node.js 22+ for npm/source installs. Docker image uses Node 22.

### Option A: npm

```bash
npm install -g pi-antigravity-rotator
pi-antigravity-rotator login                  # Google Antigravity (default)
pi-antigravity-rotator login --provider ollama  # Ollama Cloud (static API key)
pi-antigravity-rotator start
```

Ollama Cloud accounts from a previous `~/ollama-rotator` install are imported automatically at startup — no manual step required.

### Option B: Docker

```bash
mkdir -p docker-data
docker compose up -d
```

### Option C: Source

```bash
git clone https://github.com/tuxevil/pi-antigravity-rotator.git
cd pi-antigravity-rotator
npm install
npm run login                       # Google Antigravity
npm run login -- --provider ollama  # Ollama Cloud
npm start
```

Dashboard opens at `http://localhost:51200/dashboard`

[Full deployment guide →](docs/deployment.md) · [Adding accounts →](docs/adding-accounts.md)

---

## Connect Your Agent

Point any OpenAI-compatible agent to `http://localhost:51200/v1` with API key `tuxevil` (or a [Virtual Key](docs/virtual-keys.md)):

| Agent | Guide |
|-------|-------|
| Pi | [docs/integrations/pi.md](docs/integrations/pi.md) |
| OpenCode | [docs/integrations/opencode.md](docs/integrations/opencode.md) |
| Hermes | [docs/integrations/hermes.md](docs/integrations/hermes.md) |
| OpenClaw | [docs/integrations/openclaw.md](docs/integrations/openclaw.md) |
| Cursor | [docs/integrations/cursor.md](docs/integrations/cursor.md) |
| Claude Code | [docs/integrations/claude-code.md](docs/integrations/claude-code.md) |
| Codex (OpenAI CLI) | [docs/integrations/codex.md](docs/integrations/codex.md) |
| Cline | [docs/integrations/cline.md](docs/integrations/cline.md) |
| Roo Code | [docs/integrations/roo-code.md](docs/integrations/roo-code.md) |
| Continue | [docs/integrations/continue.md](docs/integrations/continue.md) |
| Aider | [docs/integrations/aider.md](docs/integrations/aider.md) |
| Open WebUI | [docs/integrations/open-webui.md](docs/integrations/open-webui.md) |

---

## Architecture

```mermaid
graph LR
    A[Your Agent] -->|OpenAI / Anthropic API| B["pi-antigravity-rotator<br/>localhost:51200"]
    B -->|Smart Routing| C[Google Account 1]
    B -->|Smart Routing| D[Google Account 2]
    B -->|Smart Routing| E[Ollama Cloud Account 1]
    B -->|Smart Routing| F[Ollama Cloud Account 2]
    B -->|Smart Routing| G[... up to N]
    C --> H[Google Antigravity]
    D --> H
    E --> I[Ollama Cloud]
    F --> I
    G --> I

    H -.Quota API<br/>every 5 min.-> B
    I -.Usage API<br/>every 5 min.-> B
```

Each model routes to its own best available account independently. The same email can hold both a Google OAuth credential and an Ollama Cloud API key (parent-account model) — the rotator picks the right credential at request time based on the destination model.

How model routing works:
- **Antigravity pool** — Claude variants (`claude-opus-4-6-thinking`, `claude-sonnet-4-6`, `gpt-oss-120b`) share the `claude` quota bucket; Gemini variants share the `gemini` bucket.
- **Ollama pool** — Any model returned by `https://ollama.com/api/tags` (e.g. `gemma4:31b`, `gpt-oss:20b`, `minimax-m3`, `kimi-k3`) routes to an Ollama credential.
- The pool is selected by the destination model's provider; a single account with both credentials participates in both pools.

[How it works in detail →](docs/how-it-works.md)

---

## Dashboard

After starting the proxy, open `http://localhost:51200/dashboard`.

The dashboard shows:
- **Routing state** — real-time status, uptime, requests, protective pause timers
- **Account cards** — quota bars (Antigravity family buckets `claude` / `gemini`; Ollama session/weekly usage), per-model timers, health scores, flagged alerts
- **Token usage & savings** — interactive chart with time ranges and CSV/JSON export (real USD for both providers)
- **Latency (p50/p95)** — per-model TTFB and total duration
- **Activity heatmap** — 60-day GitHub-style request intensity grid
- **Quota forecast** — tier-weighted depletion predictions
- **Routing inspector** — on-demand modal with candidate scores, health-score breakdown, and rejection reasons

![Dashboard](dashboard.png)

[Dashboard reference →](docs/adding-accounts.md)

---

## Virtual Keys & Spend Logging

With PostgreSQL, the gateway adds enterprise-grade access control and cost auditing.

```bash
# Set up PostgreSQL (or paste the prompt in docs/integrations/setup-postgresql.md into your AI agent)
export PI_ROTATOR_DATABASE_URL="postgres://user:pass@localhost:5432/rotatordb"

# Generate a scoped key
pi-antigravity-rotator keys generate --alias "cursor-agent" --models "gemini-3.6-flash-high"
# → rk-a1b2c3d4...
```

[Virtual Keys guide →](docs/virtual-keys.md) · [Setting up PostgreSQL →](docs/integrations/setup-postgresql.md)

---

## Documentation

| Topic | Link |
|-------|------|
| How It Works | [docs/how-it-works.md](docs/how-it-works.md) |
| Configuration | [docs/configuration.md](docs/configuration.md) |
| Virtual Keys & Spend Logging | [docs/virtual-keys.md](docs/virtual-keys.md) |
| API Reference | [docs/api-reference.md](docs/api-reference.md) |
| Compatibility Adapters | [docs/compatibility.md](docs/compatibility.md) |
| Deployment | [docs/deployment.md](docs/deployment.md) |
| Adding Accounts | [docs/adding-accounts.md](docs/adding-accounts.md) |
| Troubleshooting | [docs/troubleshooting.md](docs/troubleshooting.md) |
| Telemetry | [docs/telemetry.md](docs/telemetry.md) |
| PostgreSQL Setup | [docs/integrations/setup-postgresql.md](docs/integrations/setup-postgresql.md) |

---

## Star History

<a href="https://www.star-history.com/?repos=tuxevil%2Fpi-antigravity-rotator&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=tuxevil/pi-antigravity-rotator&type=date&theme=dark&legend=top-left&sealed_token=obDO-nvWTZErW7T7dgOBp_5AMavHuc70IWvLlTQs9wfbuB4-NINioIoVFjcHccMOcJGmL7mm8JGodxBWC4vWl2W5FW7C1i_xak0Mc0mOD2HIowLdL2VS07heeIUk3YibkZcN0qAFzMFcH_B6_4wgzT-t-jTrOUEntcsmoVgjfFCGUA7hduT3LtyOzQiW" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=tuxevil/pi-antigravity-rotator&type=date&legend=top-left&sealed_token=obDO-nvWTZErW7T7dgOBp_5AMavHuc70IWvLlTQs9wfbuB4-NINioIoVFjcHccMOcJGmL7mm8JGodxBWC4vWl2W5FW7C1i_xak0Mc0mOD2HIowLdL2VS07heeIUk3YibkZcN0qAFzMFcH_B6_4wgzT-t-jTrOUEntcsmoVgjfFCGUA7hduT3LtyOzQiW" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=tuxevil/pi-antigravity-rotator&type=date&legend=top-left&sealed_token=obDO-nvWTZErW7T7dgOBp_5AMavHuc70IWvLlTQs9wfbuB4-NINioIoVFjcHccMOcJGmL7mm8JGodxBWC4vWl2W5FW7C1i_xak0Mc0mOD2HIowLdL2VS07heeIUk3YibkZcN0qAFzMFcH_B6_4wgzT-t-jTrOUEntcsmoVgjfFCGUA7hduT3LtyOzQiW" />
 </picture>
</a>

---

## Support

If this tool has saved you API costs, consider supporting its development!

<a href="https://ko-fi.com/tuxevil" target="_blank"><img src="https://storage.ko-fi.com/cdn/kofi2.png?v=3" height="36" alt="Buy Me a Coffee at ko-fi.com" /></a> <a href="https://discord.gg/GgwVqTaKgK" target="_blank"><img src="https://img.shields.io/badge/Discord-7289DA?style=for-the-badge&logo=discord&logoColor=white" height="36" alt="Join Discord" /></a>

To donate an authorized Google account for testing, see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Contributors

Thanks to these amazing people who have contributed to the project:

- **[@Codder-hermes](https://github.com/Codder-hermes)** — Fixed Claude Code tool-schema requests by stripping the unsupported JSON Schema `propertyNames` keyword for Gemini and Claude-via-Gemini routes, with regression coverage for both compatibility paths. ([PR #19](https://github.com/tuxevil/pi-antigravity-rotator/pull/19))
- **[@CyR1en](https://github.com/CyR1en)** (Ethan Bacurio) — Added the Gemini 3.6 Flash model family, shared quota-pool routing, pricing, dashboard support, and regression coverage. ([PR #18](https://github.com/tuxevil/pi-antigravity-rotator/pull/18))
- **[@josenicomaia](https://github.com/josenicomaia)** (José Nicodemos Maia Neto) — Modularized the compatibility layer architecture, added multimodal tool response support, and fixed streaming pass-through for tool executions. ([PR #8](https://github.com/tuxevil/pi-antigravity-rotator/pull/8), [PR #9](https://github.com/tuxevil/pi-antigravity-rotator/pull/9), [PR #11](https://github.com/tuxevil/pi-antigravity-rotator/pull/11))
- **[@yashyadav711](https://github.com/yashyadav711)** (Yash) — Fixed Draft-2020-12 inline JSON-Schema union type mapping for Gemini tools support. ([PR #10](https://github.com/tuxevil/pi-antigravity-rotator/pull/10))
- **[@javargasm](https://github.com/javargasm)** (Jeisson Alexander Vargas Marroquin) — Anthropic tool-use compatibility layer (`tool_use`/`tool_result` content block conversion), JSON schema round-trip fixes, and compat test suite expansion. ([PR #3](https://github.com/tuxevil/pi-antigravity-rotator/pull/3), [PR #7](https://github.com/tuxevil/pi-antigravity-rotator/pull/7))

---

## Development

```bash
npm run typecheck       # Type-check src/
npm run typecheck:test  # Type-check src/ + test/
npm test                # Run test suite
npm run check           # typecheck + test + lint (full gate)
```

# Roadmap — Pi Antigravity Rotator

3-month roadmap based on community feedback and strategic positioning goals.

> Status update (2026-07-30): The scheduled Month 1-3 work is implemented or
> resolved. The account-card health visual was descoped by product decision;
> the routing inspector now exposes its component breakdown, and the streaming
> adapters are covered by incremental-delivery tests.

---

## Month 1 — Positioning & Documentation

**Goal:** Make tuxevil-rotator the default recommendation when anyone asks about multi-provider AI proxies or gateways.

- [x] Restructure README as a gateway-first document (not "rotation proxy")
- [x] Add live stats badges (installations, requests routed, estimated savings)
- [x] Create full documentation in `docs/` — configuration, how it works, compatibility, deployment, troubleshooting, telemetry
- [x] Create integration guides for 12 agents: Pi, OpenCode, Hermes, OpenClaw, Cursor, Claude Code, Codex, Cline, Roo Code, Continue, Aider, Open WebUI
- [x] Add PostgreSQL setup guide with AI-agent-friendly prompt
- [x] Add architecture Mermaid diagram to README
- [x] Add `GET /v1/public-stats` to telemetry receiver (no auth, 5-min cache) for shields.io dynamic badges

---

## Month 2 — Dashboard & Observability

**Goal:** Make the dashboard a compelling reason to use the gateway even with a single account.

- [x] **Health score visual (descoped)** — The product decision was to avoid a prominent card badge. The current UI exposes the numeric health score in account cards and the routing inspector, and proxy responses expose it through `X-Rotator-Health-Score`.
- [x] **Benchmark tool** — Dashboard benchmark runs a latency/throughput probe against active accounts without persisting results. Output includes account, latency, success, and failure details.
- [x] **Dashboard improvements** — Routing Inspector shows the health score breakdown: quota component, error penalty, cooldown penalty, availability penalty, and final score.
- [x] **Public telemetry stats page** — Static page at `telemetry.tuxevil.com/stats` shows aggregated installation metrics powered by `/v1/public-stats`.

---

## Month 3 — Streaming & Performance

**Goal:** Eliminate the main technical gap vs. native API usage.

- [x] **Real token-by-token streaming** — OpenAI Chat, Responses, Anthropic, and native adapters forward upstream chunks before the upstream response completes; integration coverage protects this behavior.
- [x] **Async I/O migration** — Migrated the storage layer's persistence operations to async filesystem APIs to avoid blocking the event loop under high concurrency.

---

## Ongoing / Backlog

These items are tracked but not scheduled for the current 3-month window:

- **Public telemetry panel** — Full analytics page with historical charts, model distribution, flag incident analysis. Requires the Month 2 static page as a foundation.
- **Prometheus / OpenTelemetry export** — `/metrics` endpoint for Grafana/Prometheus integration. Low demand currently.
- **App of any kind** — No plans for a desktop app or Tauri wrapper. The target users are developers comfortable with CLI and Docker.
- **Multi-provider backends** — No plans to add direct OpenAI/Anthropic/Ollama upstream integrations. The gateway is purpose-built for Google Antigravity.

---

## Technical Debt (from architecture audit)

| # | Issue | Status |
|---|-------|--------|
| 1 | Responses API persistence (Codex sessions survive restarts) | Resolved — `responses-store.ts` with file/DB persistence |
| 2 | Real SSE streaming (token-by-token passthrough) | Resolved — adapters forward chunks incrementally |
| 3 | Admin routes secured by default | Resolved — auto-generated token on first run |
| 4 | External service dependencies (telemetry, version check) non-blocking | Resolved — all async with aggressive timeouts |
| 5 | Dynamic model configuration | Resolved — `modelSpecs` and `modelAliases` in config |
| 6 | Async I/O in storage layer | Resolved — storage persistence uses async filesystem APIs |

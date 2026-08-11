# Adding Accounts

## Login Flow

Run `tuxevil-rotator login` (or `npm run login` from source) once per Google account:

1. A Google OAuth URL is printed to the terminal — open it in your browser
2. Complete the sign-in and grant permissions
3. With the default loopback redirect, the CLI receives the callback automatically and the browser page can close itself
4. Set `TUXEVIL_OPEN_BROWSER=1` to open the URL automatically. If the loopback port is unavailable, the CLI falls back to pasting the **full URL** from the browser's address bar

The tool automatically:
- Creates or updates the account store with the account credentials
- Configures `~/.pi/agent/auth.json` with proxy-managed credentials (for the Pi agent)

The account store is either `accounts.json` in the config directory or the
PostgreSQL database, depending on whether `TUXEVIL_ROTATOR_DATABASE_URL` is set.
When the rotator is installed as a systemd service, the `login` CLI command
auto-detects the service environment (including `TUXEVIL_ROTATOR_DATABASE_URL` and
the OAuth client from `EnvironmentFile=` drop-ins) so login always writes to the
same backend the running service reads from.

Re-running with the same email updates the existing entry.

> Note: if `login` reports the account as added but it doesn't appear on the
> dashboard / in `status`, the CLI and the service are usually pointing at
> different backends. Install the unit (see `sudo install` / the systemd setup)
> or set `TUXEVIL_ROTATOR_DATABASE_URL` explicitly so both use PostgreSQL.

## Ollama Cloud Accounts

Ollama Cloud uses a static API key that never expires (`ollama.com/settings/keys`):

```bash
tuxevil-rotator login --provider ollama
```

The command prompts for a label and pastes the API key. The account is stored with
`provider: "ollama"` and is immediately usable for any model in the Ollama cloud
catalog. No OAuth, no project binding, no key refresh needed.

## Migrating from the Legacy Ollama Rotator

If you previously ran the standalone `ollama-rotator` (config dir
`~/.ollama-rotator/`, keyed by `OLLAMA_ROTATOR_DIR`), its Ollama Cloud accounts
are picked up automatically on the first startup of this rotator: each entry is
imported tagged `provider: "ollama"`, duplicates by email are skipped, and
entries without an API key are ignored. Once the log shows
`Imported N Ollama Cloud account(s) from legacy ...`, you can retire
`~/.ollama-rotator/`.

To migrate manually into a fresh install without starting the service, copy each
entry from `~/.ollama-rotator/accounts.json` into the active `accounts.json` as
`{ "email", "provider": "ollama", "apiKey", "label?" }`.

## Web-Based Login

The dashboard includes a web-based OAuth login flow at `/login`. This is useful for:
- Hosted deployments where CLI access is inconvenient
- Users who prefer a browser-only workflow

Set `ANTIGRAVITY_REDIRECT_URI` to the HTTPS callback registered in your OAuth client for hosted deployments.

## Activation Rule

New accounts usually get a companion project bound automatically during login: if `loadCodeAssist` returns no project yet, the tool provisions one through the same `onboardUser` flow the Antigravity IDE uses. In rare cases Google still has no project to bind (e.g. the account was never onboarded to Code Assist at all). If login fails at project discovery:

1. Open that exact Google account in Antigravity IDE
2. Send one message to any model
3. Re-run `tuxevil-rotator login`

## Account Management from Dashboard

The dashboard (`/dashboard`) provides a full account management UI:
- Add new accounts via web OAuth
- View account status, quota, timers, and error messages
- Enable/disable accounts
- Set account tier (`ultra`, `pro`, `plus`, `free`)
- Configure per-account fresh-window overrides
- Remove accounts

## Account Fields in accounts.json

```json
{
  "email": "user@gmail.com",
  "refreshToken": "1//...",
  "projectId": "project-abc123",
  "projectSource": "google",
  "label": "my-account",
  "tier": "pro"
}
```

| Field | Description |
|-------|-------------|
| `email` | Google account email (auto-filled by login) |
| `refreshToken` | OAuth refresh token (auto-filled by login) |
| `projectId` | Cloud project ID discovered during login |
| `projectSource` | `google` (auto-discovered) or `manual` (hand-edited) |
| `credentials[].proxyUrl` | Optional provider-scoped egress proxy: `http://`, `https://`, `socks5://`, or `socks5h://`. Credentials may be embedded in the URL. |
| `label` | Display name on the dashboard (defaults to email username) |
| `tier` | Optional: `ultra`, `pro`, `plus`, `free`, or `unknown` |

For accounts that use more than one provider, configure the proxy on the matching
credential so network identities stay separate:

```json
{
  "email": "user@gmail.com",
  "credentials": [
    {
      "provider": "google-antigravity",
      "refreshToken": "1//...",
      "projectId": "project-abc123",
      "proxyUrl": "socks5h://proxy-user:proxy-password@127.0.0.1:1080"
    },
    {
      "provider": "ollama",
      "apiKey": "ollama-key",
      "proxyUrl": "http://127.0.0.1:8080"
    }
  ]
}
```

Dispatchers are reused per configured proxy URL and closed during graceful shutdown.
The proxy is selected from stored account configuration only; incoming request headers
cannot choose or override it. The implementation opens ordinary HTTP/SOCKS5 egress
connections and does not install a CA, intercept TLS, or expose a MITM endpoint.

## Token Auto-Refresh

OAuth tokens are refreshed automatically before expiry. No manual token management is needed. If a token cannot be refreshed (revoked consent, expired session), the account is disabled and a clear error message is shown on the dashboard.

## Donating an Account

If you want to contribute quota to the project's development and testing, see the [Contributing](../CONTRIBUTING.md) guide for instructions on how to safely share an account.

# Troubleshooting

## Account shows `flagged` status

Google detected potential abuse or a policy enforcement signal. Review the exact error message on the dashboard card.

Flagged accounts are **quarantined** and cannot be re-enabled via `/api/enable/<email>` until the underlying provider-side block is resolved. Options:

- If the account was suspended, restore it from your Google Account settings and re-run `login`
- If the flag appears erroneous, wait for Google's enforcement window to pass
- Replace the account with a fresh one using `login`

## Account keeps getting disabled after 5 errors

The account has hit consecutive errors. Common causes:

- **Revoked OAuth consent** — the user removed the app from Google Account > Security > Third-party connections
- **Expired refresh token** — re-run `pi-antigravity-rotator login` for that account
- **Google account suspension** — check the account status in your Google Account settings

## Quota bars not showing

Quota data appears after the first poll cycle (up to 5 minutes after startup). Ensure:

1. Accounts have valid, non-expired tokens
2. The quota API is reachable (check logs for quota poll errors)
3. The account has been used in Antigravity IDE at least once (see [Activation Rule](adding-accounts.md#activation-rule))

## All accounts exhausted / 503 responses

- **Cooldown/circuit breaker**: The proxy returns `429` with `Retry-After` when it knows when accounts will recover. Clients must back off.
- **All disabled/flagged**: The proxy returns `503` when there is no known retry time. Check the dashboard for flagged or disabled accounts.
- **Daily budget hit**: Check if accounts have exceeded `dailyAccountStopRequests` (default 350/day). Resets at UTC midnight.

## Multiple agents on different models interfering

This should not happen — each model routes independently. Agent 1 using Gemini Pro and Agent 2 using Claude will each have their own active account assignment and won't affect each other's rotation. Verify both agents are using different model names.

## Proxy returns 401 to my agent

- If virtual keys are configured: ensure the agent is using a valid `rk-...` key in the `Authorization: Bearer` header
- If no virtual keys: any non-empty string works as the API key

## Dashboard shows "token expired" or admin token issues

After upgrading to v2.3.0+, the auto-generated admin token is regenerated. Check logs on startup for the new token, or set `PI_ROTATOR_ADMIN_TOKEN` explicitly in your environment.

## Login fails at project discovery

Login now auto-provisions a Cloud Code companion project for new accounts via the same `onboardUser` flow the Antigravity IDE uses, and it tries the production endpoints before the sandbox one. If it still fails, the account has no project to bind at all:

1. Open that exact Google account in Antigravity IDE
2. Send one message to any model
3. Re-run `pi-antigravity-rotator login`

## Docker container can't write to data directory

On Linux, `docker-data` must be writable by UID 1000 (the `node` user inside the container):

```bash
sudo chown -R 1000:1000 docker-data
```

## Streaming responses feel slow (high TTFB)

This is a known limitation. The current compatibility adapter buffers the full upstream response before emitting SSE to the client. Native token-by-token streaming passthrough is on the roadmap. See [ROADMAP.md](../ROADMAP.md).

## Running `doctor` for diagnostics

```bash
pi-antigravity-rotator doctor
```

Validates `accounts.json`, checks local state files, lists backups, and warns when admin auth is not configured.

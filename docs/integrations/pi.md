# Pi Agent

tuxevil-rotator was originally built for the Pi agent. The `login` command automatically configures Pi to route all its traffic through the proxy — no additional setup required.

## How It Works

Running `tuxevil-rotator login` writes two files that redirect Pi's API calls to the local rotator:

**`~/.pi/agent/auth.json`** — tells Pi that credentials are proxy-managed:

```json
{
  "google-antigravity": {
    "type": "oauth",
    "refresh": "proxy-managed",
    "access": "proxy-managed",
    "expires": 32503680000000,
    "projectId": "proxy-managed"
  }
}
```

**`~/.pi/agent/models.json`** — redirects Pi's upstream endpoint to the rotator:

```json
{
  "providers": {
    "google-antigravity": {
      "baseUrl": "http://localhost:51200"
    }
  }
}
```

With these files in place, Pi sends all requests to `http://localhost:51200` instead of `cloudcode-pa.googleapis.com`. The rotator intercepts each request, selects the best available Google account, and forwards to the real Antigravity endpoint — transparently.

## Starting the Proxy

```bash
# Start the rotator (if not already running)
tuxevil-rotator start

# Pi will now route through the proxy automatically
pi
```

## Multiple Accounts

The rotator manages all account rotation transparently. Pi doesn't need any additional configuration — it just sends requests and the rotator handles the rest.

## Notes

- The native `/v1internal:streamGenerateContent` endpoint used by Pi is passed through unchanged — no translation layer is applied
- The OpenAI-compatible adapter (`/v1/chat/completions`) is additive and does not affect Pi's native route
- Re-running `tuxevil-rotator login` updates credentials without disrupting the Pi configuration

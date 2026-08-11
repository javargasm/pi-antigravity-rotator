# Migrating from `pi-antigravity-rotator` to `tuxevil-rotator`

`tuxevil-rotator` is the v3 project, CLI, npm package, repository, container image, environment prefix, and default config directory. The rotator engine is unchanged: accounts, the dashboard, port `51200`, API routes, and the `accounts.json` shape remain compatible.

The former `pi-antigravity-rotator` npm package remains available as a deprecated package so existing installations do not break. New installations should use `tuxevil-rotator`.

## TL;DR

```bash
npm install -g tuxevil-rotator
tuxevil-rotator migrate
tuxevil-rotator doctor
```

The migration command copies files from `~/.pi-antigravity-rotator/` to `~/.tuxevil-rotator/` only when the destination does not already contain them. It never deletes the old directory.

The new package installs both `tuxevil-rotator` and a temporary legacy `pi-antigravity-rotator` shim. Existing scripts can continue running while they are updated.

## What changed

| Surface | Legacy | Current |
|---|---|---|
| npm package | `pi-antigravity-rotator` (deprecated) | `tuxevil-rotator` |
| CLI binary | `pi-antigravity-rotator` | `tuxevil-rotator` |
| Default config dir | `~/.pi-antigravity-rotator/` | `~/.tuxevil-rotator/` |
| Environment prefix | `PI_ROTATOR_*` | `TUXEVIL_ROTATOR_*` |
| Docker image | `ghcr.io/tuxevil/pi-antigravity-rotator` | `ghcr.io/tuxevil/tuxevil-rotator` |
| Repository | `github.com/tuxevil/pi-antigravity-rotator` | `github.com/tuxevil/tuxevil-rotator` |
| Config file | `accounts.json` | `accounts.json` |
| Proxy port | `51200` | `51200` |

When both old and new environment variables are set, the `TUXEVIL_ROTATOR_*` value wins.

## Existing npm installations

Install the new package before removing the old one:

```bash
npm install -g tuxevil-rotator
tuxevil-rotator migrate
tuxevil-rotator doctor
```

Then update long-lived services and scripts to use the new names. The old command remains available through the compatibility shim until the old package is removed:

```bash
pi-antigravity-rotator stop
tuxevil-rotator start
```

The migration command preserves existing files and permissions. It does not rewrite shell profiles or systemd units automatically; `doctor` reports the active config directory and the recommended settings so those changes can be made deliberately.

Once the new command is verified, remove the old package if it is still installed:

```bash
npm uninstall -g pi-antigravity-rotator
```

To silence the legacy shim warning in automation while scripts are being migrated:

```bash
export PI_ANTIGRAVITY_ROTATOR_SHIM_QUIET=1
```

## Docker deployments

Use the new image and service name:

```yaml
services:
  tuxevil-rotator:
    image: ghcr.io/tuxevil/tuxevil-rotator:latest
```

Then pull and restart:

```bash
docker compose pull
docker compose up -d
```

The old image remains available as a frozen compatibility reference and receives no further updates. Host volumes may be renamed from `./docker-data/pi-antigravity-rotator` to `./docker-data/tuxevil-rotator`; leaving the old volume path also works when `TUXEVIL_ROTATOR_DIR` points to it.

## Environment mapping

| Legacy | Current |
|---|---|
| `PI_ROTATOR_DATABASE_URL` | `TUXEVIL_ROTATOR_DATABASE_URL` |
| `PI_ROTATOR_ENCRYPTION_KEY` | `TUXEVIL_ROTATOR_ENCRYPTION_KEY` |
| `PI_ROTATOR_DIR` | `TUXEVIL_ROTATOR_DIR` |
| `PI_ROTATOR_ADMIN_TOKEN` | `TUXEVIL_ROTATOR_ADMIN_TOKEN` |
| `PI_ROTATOR_TELEMETRY` | `TUXEVIL_ROTATOR_TELEMETRY` |
| `PI_ROTATOR_TELEMETRY_URL` | `TUXEVIL_ROTATOR_TELEMETRY_URL` |
| `OLLAMA_ROTATOR_DIR` | unchanged; used by the Ollama legacy importer |

## Rollback

The previous npm package remains available for rollback:

```bash
npm uninstall -g tuxevil-rotator
npm install -g pi-antigravity-rotator@2.6.3
```

The current package keeps legacy config and cryptographic compatibility so a rollback does not require changing `accounts.json`.

## Questions

Open an issue at <https://github.com/tuxevil/tuxevil-rotator/issues> with the `migration` label.

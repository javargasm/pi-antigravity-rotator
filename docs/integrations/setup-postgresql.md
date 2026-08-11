# Setting Up PostgreSQL

PostgreSQL unlocks [Virtual Keys](../virtual-keys.md) and [Spend Logging](../virtual-keys.md#spend-logging) in tuxevil-rotator.

## Prompt for Your AI Agent

Copy and paste this prompt into any AI agent (OpenCode, Claude Code, Cursor, Codex, Cline, etc.) to have it install and configure PostgreSQL automatically:

---

```
Please set up PostgreSQL for tuxevil-rotator on this machine. I need you to:

1. Install PostgreSQL if it's not already installed (use the appropriate method for this OS: apt/brew/dnf/etc.)
2. Start the PostgreSQL service and enable it to start on boot
3. Create a dedicated database user named "rotator" with a secure random password
4. Create a database named "rotatordb" owned by the "rotator" user
5. Test the connection to confirm everything works
6. Output the final DATABASE_URL connection string in this format:
   postgres://rotator:<password>@localhost:5432/rotatordb
7. Add it to the environment for the current session and tell me how to make it permanent (e.g. .bashrc, .env, systemd service override, or docker-compose.yml)

The connection string should then be set as:
   export TUXEVIL_ROTATOR_DATABASE_URL="postgres://rotator:<password>@localhost:5432/rotatordb"

When the rotator starts with this variable set, it will automatically create the required tables (rotator_settings, rotator_virtual_keys, rotator_spend_logs, rotator_daily_spend) on first boot — no manual schema setup needed.
```

---

## Manual Setup

If you prefer to do it yourself:

```bash
# Install PostgreSQL (Ubuntu/Debian)
sudo apt-get install -y postgresql

# Install PostgreSQL (macOS with Homebrew)
brew install postgresql@16 && brew services start postgresql@16

# Create user and database
sudo -u postgres psql <<EOF
CREATE USER rotator WITH PASSWORD 'your-secure-password';
CREATE DATABASE rotatordb OWNER rotator;
GRANT ALL PRIVILEGES ON DATABASE rotatordb TO rotator;
EOF

# Set the environment variable
export TUXEVIL_ROTATOR_DATABASE_URL="postgres://rotator:your-secure-password@localhost:5432/rotatordb"
```

## Docker Compose with PostgreSQL

If you run the rotator in Docker, add a PostgreSQL service:

```yaml
services:
  rotator:
    image: ghcr.io/tuxevil/tuxevil-rotator:latest
    ports:
      - "127.0.0.1:51200:51200"
    environment:
      TUXEVIL_ROTATOR_DATABASE_URL: "postgres://rotator:yourpassword@postgres:5432/rotatordb"
      TUXEVIL_ROTATOR_DIR: /data
    volumes:
      - ./docker-data:/data
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: rotator
      POSTGRES_PASSWORD: yourpassword
      POSTGRES_DB: rotatordb
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rotator -d rotatordb"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

## What the Rotator Creates

On first boot with `TUXEVIL_ROTATOR_DATABASE_URL` set, the rotator automatically runs migrations that create:

| Table | Purpose |
|-------|---------|
| `rotator_settings` | Key-value store for config, state, token usage |
| `rotator_virtual_keys` | Virtual key definitions and hashes |
| `rotator_spend_logs` | Per-request audit trail |
| `rotator_daily_spend` | Aggregated daily spend by key and model |

No manual schema setup is needed. If the tables already exist, migrations are idempotent.

## Migrating from File-Based Storage

When you first start the rotator with PostgreSQL after using file-based storage, it automatically migrates existing data (accounts config, state, token usage history) from disk files into the database. The original files are left in place as a backup.

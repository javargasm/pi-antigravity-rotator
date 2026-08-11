// Normalization of account configs into the parent-account credential model.
// Kept in its own module so both config-defaults (load path) and
// account-store (write path) can use it without import cycles.

import type { AccountConfig } from "./types.js";
import { DEFAULT_PROVIDER } from "./providers/credential-helpers.js";

/**
 * Migrate a flat legacy account shape (provider/apiKey/refreshToken at the
 * top level) into the parent-account model where `email` owns a list of
 * per-provider credentials. Accounts that already carry `credentials` are
 * returned untouched. Runs on every config load (applyConfigDefaults), so
 * both the persisted DB config and legacy files normalize transparently.
 */
export function normalizeAccountConfig(account: AccountConfig): AccountConfig {
  if (Array.isArray(account.credentials) && account.credentials.length > 0) {
    return account;
  }
  const provider = account.provider ?? DEFAULT_PROVIDER;
  // Mirror the flat legacy fields onto the parent-account credentials and
  // KEEP the top-level fields: Google reads (forward/quota/index) still
  // consult them, so both shapes coexist until the runtime migrates.
  if (provider === "ollama" && typeof account.apiKey === "string" && account.apiKey.trim() !== "") {
    return {
      ...account,
      credentials: [{
        provider: "ollama",
        apiKey: account.apiKey,
        proxyUrl: account.proxyUrl,
      }],
    };
  }
  if (
    provider === "openai-codex" ||
    typeof account.codexRefreshToken === "string" ||
    typeof account.codexAccountId === "string"
  ) {
    return {
      ...account,
      credentials: [
        {
          provider: "openai-codex",
          refreshToken: account.codexRefreshToken ?? account.refreshToken,
          providerAccountId: account.codexAccountId,
          proxyUrl: account.proxyUrl,
        },
      ],
    };
  }
  if (provider !== "ollama" && (account.refreshToken !== undefined || account.projectId !== undefined)) {
    return {
      ...account,
      credentials: [
        {
          provider: DEFAULT_PROVIDER,
          refreshToken: account.refreshToken,
          projectId: account.projectId,
          projectSource: account.projectSource,
          proxyUrl: account.proxyUrl,
        },
      ],
    };
  }
  return account;
}

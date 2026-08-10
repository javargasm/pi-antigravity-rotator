import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAccountsPath } from "./paths.js";
import type { AccountConfig, ProviderCredential } from "./types.js";
import { writeJsonFileAtomic } from "./storage.js";
import {
  loadConfig,
  loadOrCreateAccountsConfig,
  saveAccountsConfig,
} from "./config-storage.js";
import { applyConfigDefaults, getDefaultConfig } from "./config-defaults.js";
import { hasCredential } from "./providers/credential-helpers.js";
import { normalizeAccountConfig } from "./config-normalize.js";

export {
  loadConfig,
  loadOrCreateAccountsConfig,
  saveAccountsConfig,
  applyConfigDefaults,
  getDefaultConfig,
};

export { normalizeAccountConfig } from "./config-normalize.js";

const ACCOUNTS_FILE = getAccountsPath();
const PI_DIR = join(homedir(), ".pi", "agent");
const PI_MODELS_FILE = join(PI_DIR, "models.json");
const PI_AUTH_FILE = join(PI_DIR, "auth.json");
const TOKEN_USAGE_FILE = join(join(ACCOUNTS_FILE, ".."), "token-usage.json");

export function getTokenUsagePath(): string {
  return TOKEN_USAGE_FILE;
}

// Reasonable upper bounds on per-account fields. These are defensive
// limits to prevent a malicious or buggy caller from growing
// accounts.json without bound, which would slow every subsequent
// saveState. The numbers are well above any realistic real value.
export const MAX_EMAIL_LENGTH = 254; // RFC 5321
export const MAX_LABEL_LENGTH = 100;
export const MAX_PROJECT_ID_LENGTH = 100;
export const MAX_REFRESH_TOKEN_LENGTH = 4096;

function validateAccountConfigLengths(entry: AccountConfig): void {
  const checks: Array<[string, number]> = [
    ["email", MAX_EMAIL_LENGTH],
    ["label", MAX_LABEL_LENGTH],
    ["projectId", MAX_PROJECT_ID_LENGTH],
    ["refreshToken", MAX_REFRESH_TOKEN_LENGTH],
  ];
  for (const [field, max] of checks) {
    const value = entry[field as keyof AccountConfig];
    if (typeof value === "string" && value.length > max) {
      throw new Error(
        `Account ${field} exceeds maximum length ${max} (got ${value.length}). ` +
          `This usually indicates a malformed input — refusing to write to accounts.json.`,
      );
    }
  }
  validateCredentialLengths(entry.credentials);
}

function validateCredentialLengths(
  credentials: AccountConfig["credentials"],
): void {
  if (!Array.isArray(credentials)) return;
  for (const cred of credentials) {
    if (typeof cred.apiKey === "string" && cred.apiKey.length > MAX_REFRESH_TOKEN_LENGTH) {
      throw new Error(`Credential apiKey for ${cred.provider} exceeds maximum length`);
    }
    if (typeof cred.projectId === "string" && cred.projectId.length > MAX_PROJECT_ID_LENGTH) {
      throw new Error(`Credential projectId for ${cred.provider} exceeds maximum length`);
    }
    if (typeof cred.refreshToken === "string" && cred.refreshToken.length > MAX_REFRESH_TOKEN_LENGTH) {
      throw new Error(`Credential refreshToken for ${cred.provider} exceeds maximum length`);
    }
  }
}

export { validateAccountConfigLengths };

function mergeCredentials(
  existing: AccountConfig["credentials"] | undefined,
  incoming: AccountConfig["credentials"] | undefined,
): AccountConfig["credentials"] {
  const out: NonNullable<AccountConfig["credentials"]> = [];
  const seen = new Set<string>();
  for (const cred of [...(existing ?? []), ...(incoming ?? [])]) {
    if (seen.has(cred.provider)) continue;
    seen.add(cred.provider);
    out.push(cred);
  }
  return out;
}

export async function addAccountToConfig(
  entry: AccountConfig,
): Promise<{ isNew: boolean }> {
  validateAccountConfigLengths(entry);
  const entryNorm = normalizeAccountConfig(entry);
  const config = loadOrCreateAccountsConfig();
  const existing = config.accounts.find((a) => a.email === entryNorm.email);
  if (existing) {
    validateCredentialLengths(entryNorm.credentials);
    config.accounts[config.accounts.indexOf(existing)] = {
      ...normalizeAccountConfig(existing),
      ...entryNorm,
      credentials: mergeCredentials(existing.credentials, entryNorm.credentials),
    };
    await saveAccountsConfig(config);
    return { isNew: false };
  }

  config.accounts.push(entryNorm);
  await saveAccountsConfig(config);
  return { isNew: true };
}

export async function removeAccountFromConfig(email: string): Promise<boolean> {
  const config = loadOrCreateAccountsConfig();
  const idx = config.accounts.findIndex((a) => a.email === email);
  if (idx < 0) return false;
  config.accounts.splice(idx, 1);
  await saveAccountsConfig(config);
  return true;
}

function legacyOllamaRotatorAccountsFile(): string {
  const envDir = process.env.OLLAMA_ROTATOR_DIR;
  return join(envDir ?? homedir(), envDir ? "" : ".ollama-rotator", "accounts.json");
}

/**
 * Import Ollama Cloud accounts from a legacy ~/ollama-rotator accounts.json
 * (the predecessor product) into the parent-account model: each entry's
 * API key becomes an `ollama` credential, merged onto the account with the
 * same email (the account itself is created when the email is unknown).
 *
 * Returns the number of credentials imported (0 when no legacy config exists).
 */
export async function importLegacyOllamaRotatorAccounts(
  legacyFile = legacyOllamaRotatorAccountsFile(),
): Promise<number> {
  let raw: string;
  try {
    raw = await readFile(legacyFile, "utf-8");
  } catch {
    // No legacy config — nothing to do.
    return 0;
  }

  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    console.warn(`Skipping legacy ${legacyFile}: not valid JSON`);
    return 0;
  }
  // The predecessor's accounts.json is the full Config object
  // ({proxyPort, routingPolicy, ..., accounts: [...]}); a bare array of
  // accounts is accepted too for simplicity.
  const rawAccounts = Array.isArray(entries)
    ? entries
    : typeof entries === "object" &&
        entries !== null &&
        Array.isArray((entries as { accounts?: unknown }).accounts)
      ? (entries as { accounts: unknown[] }).accounts
      : [];
  if (rawAccounts.length === 0) return 0;

  const config = loadOrCreateAccountsConfig();
  let imported = 0;
  let merged = 0;
  let added = 0;

  for (const entry of rawAccounts) {
    if (typeof entry !== "object" || entry === null) continue;
    const { email, apiKey, label, tier, type } = entry as Record<string, unknown>;
    if (typeof email !== "string" || email.length === 0) continue;
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      console.warn(`  Skipping legacy account ${email}: missing apiKey`);
      continue;
    }

    const credential: ProviderCredential = {
      provider: "ollama",
      apiKey: apiKey.trim(),
    };
    const account: AccountConfig = {
      email,
      credentials: [credential],
    };
    if (typeof label === "string" && label !== "") account.label = label;
    if (typeof tier === "string") account.tier = tier as AccountConfig["tier"];
    if (typeof type === "string") account.type = type as AccountConfig["type"];
    try {
      validateAccountConfigLengths(account);
    } catch {
      console.warn(`  Skipping legacy account ${email}: invalid fields`);
      continue;
    }

    const existing = config.accounts.find((a) => a.email === email);
    if (existing) {
      const normalized = normalizeAccountConfig(existing);
      if (hasCredential(normalized, "ollama")) {
        // Credential already present (e.g. re-import after a previous run).
        continue;
      }
      const idx = config.accounts.indexOf(existing);
      config.accounts[idx] = {
        ...normalized,
        credentials: [...(normalized.credentials ?? []), credential],
      };
      merged += 1;
    } else {
      config.accounts.push(account);
      added += 1;
    }
    imported += 1;
  }

  if (imported > 0) {
    await saveAccountsConfig(config);
    console.log(
      `Imported ${imported} Ollama Cloud credential(s) from legacy ${legacyFile} ` +
        `(${added} new account(s), ${merged} merged into existing account(s))`,
    );
  }
  return imported;
}

export async function ensurePiModelsConfig(): Promise<void> {
  await mkdir(PI_DIR, { recursive: true });

  let models: Record<string, unknown> = {};
  try {
    models = JSON.parse(await readFile(PI_MODELS_FILE, "utf-8"));
  } catch {
    // Missing or corrupted, will overwrite.
  }

  const providers = (models.providers || {}) as Record<
    string,
    Record<string, unknown>
  >;
  const antigravity = providers["google-antigravity"] || {};

  if (antigravity.baseUrl === "http://localhost:51200") {
    return;
  }

  antigravity.baseUrl = "http://localhost:51200";
  providers["google-antigravity"] = antigravity;
  models.providers = providers;

  await writeJsonFileAtomic(PI_MODELS_FILE, models);
  console.log(`  Updated ${PI_MODELS_FILE}`);
}

export async function ensurePiAuthConfig(): Promise<void> {
  await mkdir(PI_DIR, { recursive: true });

  let auth: Record<string, unknown> = {};
  try {
    auth = JSON.parse(await readFile(PI_AUTH_FILE, "utf-8"));
  } catch {
    // Missing or corrupted, will overwrite.
  }

  const existing = auth["google-antigravity"] as
    | Record<string, unknown>
    | undefined;
  if (existing?.type === "oauth" && existing?.refresh === "proxy-managed") {
    return;
  }

  auth["google-antigravity"] = {
    type: "oauth",
    refresh: "proxy-managed",
    access: "proxy-managed",
    expires: 32503680000000,
    projectId: "proxy-managed",
  };

  await writeJsonFileAtomic(PI_AUTH_FILE, auth);
  console.log(`  Updated ${PI_AUTH_FILE}`);
}

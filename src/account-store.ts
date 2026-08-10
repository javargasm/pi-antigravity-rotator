import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAccountsPath } from "./paths.js";
import type { AccountConfig } from "./types.js";
import { writeJsonFileAtomic } from "./storage.js";
import {
  loadConfig,
  loadOrCreateAccountsConfig,
  saveAccountsConfig,
} from "./config-storage.js";
import { applyConfigDefaults, getDefaultConfig } from "./config-defaults.js";

export {
  loadConfig,
  loadOrCreateAccountsConfig,
  saveAccountsConfig,
  applyConfigDefaults,
  getDefaultConfig,
};

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
}

export { validateAccountConfigLengths };

export async function addAccountToConfig(
  entry: AccountConfig,
): Promise<{ isNew: boolean }> {
  validateAccountConfigLengths(entry);
  const config = loadOrCreateAccountsConfig();
  const existing = config.accounts.findIndex((a) => a.email === entry.email);

  if (existing >= 0) {
    config.accounts[existing] = { ...config.accounts[existing], ...entry };
    await saveAccountsConfig(config);
    return { isNew: false };
  }

  config.accounts.push(entry);
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
 * (the predecessor product). Legacy entries hold their API key in `apiKey`
 * and carry no `provider` field, so imported accounts are tagged provider
 * "ollama". Entries whose email already exists in the active config, and
 * entries with a missing apiKey or invalid fields, are skipped.
 *
 * Returns the number of accounts imported (0 when no legacy config exists).
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
  const seen = new Set(config.accounts.map((a) => a.email));
  let imported = 0;

  for (const entry of rawAccounts) {
    if (typeof entry !== "object" || entry === null) continue;
    const { email, apiKey, label, tier, type } = entry as Record<string, unknown>;
    if (typeof email !== "string" || email.length === 0) continue;
    if (typeof apiKey !== "string" || apiKey.trim() === "") {
      console.warn(`  Skipping legacy account ${email}: missing apiKey`);
      continue;
    }

    const account: AccountConfig = {
      email,
      provider: "ollama",
      apiKey: apiKey.trim(),
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
    if (seen.has(account.email)) continue;

    config.accounts.push(account);
    seen.add(account.email);
    imported += 1;
  }

  if (imported > 0) {
    await saveAccountsConfig(config);
    console.log(`Imported ${imported} Ollama Cloud account(s) from legacy ${legacyFile}`);
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

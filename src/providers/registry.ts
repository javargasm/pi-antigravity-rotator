// Provider registry: maps provider ids to their adapters.
//
// To add a new provider:
//   1. Implement ProviderAdapter in src/providers/<id>/index.ts
//   2. Add an entry to PROVIDERS below
//   3. Extend AccountConfig in src/types.ts with your credential fields
//   4. Wire your login flow through `rotator login --provider <id>`

import type { ProviderAdapter } from "./adapter.js";
import { googleAntigravityAdapter } from "./google-antigravity/index.js";
import { ollamaAdapter } from "./ollama/index.js";
import { openaiCodexAdapter } from "./openai-codex/index.js";
import { logger } from "../logger.js";
import {
  DEFAULT_PROVIDER,
  primaryProviderId,
  hasCredential,
  getCredential,
  type CredentialEntry,
  type AccountLike as ProviderCredentialLike,
} from "./credential-helpers.js";

export {
  DEFAULT_PROVIDER,
  primaryProviderId,
  hasCredential,
  getCredential,
  type CredentialEntry,
  type AccountLike as ProviderCredentialLike,
} from "./credential-helpers.js";

const PROVIDERS: Record<string, ProviderAdapter> = {
  "google-antigravity": googleAntigravityAdapter,
  ollama: ollamaAdapter,
  "openai-codex": openaiCodexAdapter,
};

export function getProviderAdapter(providerId: string): ProviderAdapter {
  const adapter = PROVIDERS[providerId];
  if (!adapter) {
    throw new Error(
      `Unknown provider "${providerId}". Available: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return adapter;
}

export function listProviders(): ProviderAdapter[] {
  return Object.values(PROVIDERS);
}

export function isKnownProvider(providerId: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, providerId);
}

export function getProviderForAccount(
  account: { credentials?: Array<{ provider: string }>; provider?: string },
  providerId?: string,
): ProviderAdapter {
  const id = providerId ?? primaryProviderId(account);
  try {
    return getProviderAdapter(id);
  } catch {
    logger
      .child("registry")
      .warn(
        `Account references unknown provider "${id}", falling back to ${DEFAULT_PROVIDER}; check config`,
      );
    return getProviderAdapter(DEFAULT_PROVIDER);
  }
}

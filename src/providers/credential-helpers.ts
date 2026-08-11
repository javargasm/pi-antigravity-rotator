// Credential helpers for the parent-account model: independent of the
// provider adapters so they can be imported from the config layer without
// pulling in the translators/responses-store cycle.

export const DEFAULT_PROVIDER = "google-antigravity";

export interface CredentialEntry {
  provider: string;
  apiKey?: string;
  refreshToken?: string;
  projectId?: string;
  providerAccountId?: string;
  projectSource?: "google" | "manual";
  proxyUrl?: string;
}

export interface AccountLike {
  credentials?: CredentialEntry[];
  provider?: string;
  apiKey?: string;
  refreshToken?: string;
  projectId?: string;
  codexRefreshToken?: string;
  codexAccountId?: string;
  projectSource?: "google" | "manual";
  proxyUrl?: string;
}

export function primaryProviderId(account: AccountLike): string {
  if (account.credentials && account.credentials.length > 0) {
    return account.credentials[0].provider;
  }
  return account.provider ?? DEFAULT_PROVIDER;
}

export function hasCredential(account: AccountLike, providerId: string): boolean {
  if (account.credentials && account.credentials.length > 0) {
    return account.credentials.some((c) => c.provider === providerId);
  }
  return (account.provider ?? DEFAULT_PROVIDER) === providerId;
}

export function getCredential(
  account: AccountLike,
  providerId: string,
): CredentialEntry | undefined {
  if (account.credentials && account.credentials.length > 0) {
    const found = account.credentials.find((c) => c.provider === providerId);
    if (found) return found;
  }
  if ((account.provider ?? DEFAULT_PROVIDER) === providerId) {
    const legacy: CredentialEntry = { provider: providerId };
    if (account.apiKey !== undefined) legacy.apiKey = account.apiKey;
    if (account.refreshToken !== undefined) legacy.refreshToken = account.refreshToken;
    if (account.projectId !== undefined) legacy.projectId = account.projectId;
    if (providerId === "openai-codex") {
      if (account.codexRefreshToken !== undefined) legacy.refreshToken = account.codexRefreshToken;
      if (account.codexAccountId !== undefined) legacy.providerAccountId = account.codexAccountId;
    }
    if (account.projectSource !== undefined) legacy.projectSource = account.projectSource;
    if (account.proxyUrl !== undefined) legacy.proxyUrl = account.proxyUrl;
    return legacy;
  }
  return undefined;
}

/**
 * Resolve the egress proxy configured for one provider credential. Incoming
 * request headers are deliberately not consulted here; proxy selection is
 * always an account/configuration concern.
 */
export function getProviderProxyUrl(
  account: AccountLike,
  providerId: string,
): string | undefined {
  const credential = getCredential(account, providerId);
  if (credential?.proxyUrl !== undefined) return credential.proxyUrl;
  return undefined;
}

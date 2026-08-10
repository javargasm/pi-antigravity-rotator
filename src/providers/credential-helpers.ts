// Credential helpers for the parent-account model: independent of the
// provider adapters so they can be imported from the config layer without
// pulling in the translators/responses-store cycle.

export const DEFAULT_PROVIDER = "google-antigravity";

export interface CredentialEntry {
  provider: string;
  apiKey?: string;
  refreshToken?: string;
  projectId?: string;
  projectSource?: "google" | "manual";
}

export interface AccountLike {
  credentials?: CredentialEntry[];
  provider?: string;
  apiKey?: string;
  refreshToken?: string;
  projectId?: string;
  projectSource?: "google" | "manual";
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
    if (account.projectSource !== undefined) legacy.projectSource = account.projectSource;
    return legacy;
  }
  return undefined;
}

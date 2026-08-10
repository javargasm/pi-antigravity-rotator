// Google Antigravity provider adapter.
//
// Implements the ProviderAdapter contract for Google's Cloud Code Assist
// (Antigravity) endpoints: OAuth2 credential lifecycle, per-model quota
// polling, v1internal SSE forwarding, and the Gemini-native request/response
// translation used by the compat layer.

import type {
  ProviderAdapter,
  QuotaFetchContext,
} from "../adapter.js";
import { fetchProviderQuota } from "./quota.js";
import {
  forwardRequest,
  createGoogleStreamAccumulator,
  getBenchmarkSpec,
} from "./forward.js";
import { runLogin } from "./login.js";
import { validateCredentials } from "./credentials.js";
import {
  getOAuthClientConfig,
  isHostedOAuthConfigured,
} from "./oauth.js";
import {
  TOKEN_URL,
  KICKSTART_MODEL_FOR_QUOTA_POOL,
} from "../../types.js";
import type { AccountRuntime } from "../../types.js";
import { fetchWithRetry } from "../../fetch-with-retry.js";
import { logger } from "../../logger.js";

const providerLog = logger.child("provider/google");

/**
 * Refresh the OAuth access token for a Google account if it is missing or
 * about to expire. Throws on unrecoverable refresh failures.
 */
async function ensureGoogleToken(account: AccountRuntime): Promise<void> {
  const now = Date.now();
  if (account.accessToken && account.tokenExpires > now) {
    return;
  }
  if (!account.config.refreshToken) {
    throw new Error(
      `Account ${account.config.email} has no refreshToken; re-run login`,
    );
  }
  const oauth = getOAuthClientConfig();
  const response = await fetchWithRetry(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: account.config.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${errorText}`);
  }
  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  account.accessToken = data.access_token;
  account.tokenExpires = now + data.expires_in * 1000 - 5 * 60 * 1000;
  account.consecutiveErrors = 0;
}

export const googleAntigravityAdapter: ProviderAdapter = {
  id: "google-antigravity",
  displayName: "Google Antigravity",
  credentialKind: "oauth",
  tierRanking: {
    ultra: 0,
    pro: 1,
    plus: 2,
    free: 3,
    unknown: 4,
  },
  features: {
    circuitBreakers: true,
    concurrencyLimits: true,
    proactiveRotation: false,
  },

  runLogin,
  validateCredentials,

  hasValidCredentials(account: AccountRuntime): boolean {
    if (account.accessToken && account.tokenExpires > Date.now()) {
      return true;
    }
    return typeof account.config.refreshToken === "string" &&
      account.config.refreshToken.length > 0;
  },

  async ensureValidToken(account: AccountRuntime): Promise<void> {
    try {
      await ensureGoogleToken(account);
    } catch (err) {
      providerLog.log(
        "warn",
        `Token refresh failed for ${account.config.email}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  },

  getAuthHeader(account: AccountRuntime): string {
    return `Bearer ${account.accessToken}`;
  },

  async fetchQuota(
    account: AccountRuntime,
    ctx: QuotaFetchContext,
  ): Promise<void> {
    await fetchProviderQuota(account, ctx);
  },

  forwardRequest,
  createStreamAccumulator: createGoogleStreamAccumulator,

  getKickstartModelForPool(quotaModelKey: string): string | undefined {
    return KICKSTART_MODEL_FOR_QUOTA_POOL[quotaModelKey];
  },

  getBenchmark(account: AccountRuntime) {
    return getBenchmarkSpec(account);
  },
};

export type { TokenExchangeResult, OAuthClientConfig } from "./oauth.js";
export { isHostedOAuthConfigured, getOAuthClientConfig };
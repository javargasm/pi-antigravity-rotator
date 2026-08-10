// Ollama Cloud provider adapter.
//
// Implements the ProviderAdapter contract for Ollama Cloud (ollama.com):
// static API keys, NDJSON `/api/chat` forwarding, and session/weekly
// usage-fraction quota pools with exhaustion prediction.
//
// Ported from the ollama-rotator project (same author) into the
// tuxevil-rotator provider layer.

import type { ProviderAdapter, ProviderFeatures } from "../adapter.js";
import { fetchProviderUsage } from "./quota.js";
import {
  forwardRequest,
  OllamaNdjsonAccumulator,
  getBenchmarkSpec,
} from "./forward.js";
import { runLogin } from "./login.js";
import { validateCredentials } from "./credentials.js";
import { UsagePredictor, type ExhaustionPrediction } from "./prediction.js";
import type { AccountRuntime } from "../../types.js";

const OLLAMA_TIER_RANKING = {
  max: 0,
  team: 1,
  pro: 2,
  free: 3,
  unknown: 4,
};

export const ollamaAdapter: ProviderAdapter = {
  id: "ollama",
  displayName: "Ollama Cloud",
  credentialKind: "api-key",
  tierRanking: OLLAMA_TIER_RANKING,

  features: {
    circuitBreakers: true,
    concurrencyLimits: true,
    proactiveRotation: true,
  } satisfies ProviderFeatures,

  runLogin,

  validateCredentials,

  hasValidCredentials(account: AccountRuntime): boolean {
    return typeof account.config.apiKey === "string" &&
      account.config.apiKey.length > 0;
  },

  // Ollama API keys never expire: there is no refresh flow. 401/403
  // responses are handled by the response classifier (marked flagged).
  async ensureValidToken(): Promise<void> {},

  getAuthHeader(account: AccountRuntime): string {
    return `Bearer ${account.config.apiKey}`;
  },

  async fetchQuota(
    account: AccountRuntime,
    ctx,
  ): Promise<void> {
    await fetchProviderUsage(account, ctx);
  },

  forwardRequest,
  createStreamAccumulator: () => new OllamaNdjsonAccumulator(),

  getKickstartModelForPool(quotaModelKey: string): string | undefined {
    // Only the session pool can be kickstarted for Ollama accounts.
    return quotaModelKey === "session" ? "gpt-oss:20b" : undefined;
  },

  getBenchmark() {
    return getBenchmarkSpec();
  },
};

export type { ExhaustionPrediction, UsagePredictor };
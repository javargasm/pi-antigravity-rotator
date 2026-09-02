// Google Antigravity quota polling: fetch per-model quota from the internal
// fetchAvailableModels endpoint and classify timer windows.

import type {
  AccountRuntime,
  GoogleQuotaResponse,
  ModelQuota,
} from "../../types.js";
import {
  QUOTA_API_URL,
  QUOTA_USER_AGENT,
  QUOTA_MODEL_KEYS,
} from "../../types.js";
import { fetchWithRetry } from "../../fetch-with-retry.js";
import type { QuotaFetchContext } from "../adapter.js";
import { DEFAULT_PROVIDER, getProviderProjectId } from "../credential-helpers.js";
import { getAccountProxyDispatcher } from "../proxy-dispatcher.js";
import { sortQuotaPools } from "../registry.js";

import { dynamicCatalog, DynamicModelRegistry } from "./dynamic-catalog.js";

/**
 * Extract per-model quotas from a Google quota response, preserving the
 * previously classified timer type when the reset time is unchanged.
 */
export function extractQuotas(
  data: GoogleQuotaResponse,
  oldQuota: ModelQuota[],
): ModelQuota[] {
  const quotas: ModelQuota[] = [];
  const now = Date.now();

  for (const [, config] of Object.entries(QUOTA_MODEL_KEYS)) {
    let modelInfo = data.models[config.key];

    if (!modelInfo) {
      const dynamicAltKeys = dynamicCatalog.getQuotaAltKeys(config.key);
      const allAltKeys = [...config.altKeys, ...dynamicAltKeys];
      for (const altKey of allAltKeys) {
        modelInfo = data.models[altKey];
        if (modelInfo) break;
      }
    }

    if (!modelInfo) {
      for (const [modelKey, info] of Object.entries(data.models)) {
        if (DynamicModelRegistry.inferFamilyAndPool(modelKey).quotaPool === config.key) {
          modelInfo = info;
          break;
        }
      }
    }

    if (modelInfo?.quotaInfo) {
      const remainingFraction = modelInfo.quotaInfo.remainingFraction ?? 0;
      // Google can publish a nominal reset for an untouched pool; no usage means
      // there is no active quota window yet.
      const resetTime =
        remainingFraction >= 1 ? null : modelInfo.quotaInfo.resetTime ?? null;
      let timerType: ModelQuota["timerType"] = "fresh";

      if (resetTime) {
        const oldQ = oldQuota.find((q) => q.modelKey === config.key);
        // If the resetTime is exactly the same as the previous poll, preserve
        // the old timerType. A timer doesn't change its nature just because it
        // gets closer to zero.
        if (oldQ && oldQ.resetTime === resetTime && oldQ.timerType !== "fresh") {
          timerType = oldQ.timerType;
        } else {
          // Brand new timer (or service restart): measure the distance to
          // determine its type. < 6 hours → 5h timer, otherwise 7d.
          const resetMs = new Date(resetTime).getTime();
          if (resetMs > now) {
            const durationMs = resetMs - now;
            timerType = durationMs < 6 * 60 * 60 * 1000 ? "5h" : "7d";
          }
        }
      }

      quotas.push({
        modelKey: config.key,
        displayName: config.display,
        percentRemaining: Math.round(remainingFraction * 100),
        resetTime,
        timerType,
      });
    }
  }

  return quotas;
}

/**
 * Poll quota for one account and write the result into account.quota.
 * Non-OK responses flag the account via the core-provided callbacks.
 */
export async function fetchProviderQuota(
  account: AccountRuntime,
  ctx: QuotaFetchContext,
): Promise<void> {
  if (!account.accessToken) return;

  try {
    const response = await fetchWithRetry(QUOTA_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account.accessToken}`,
        "User-Agent": QUOTA_USER_AGENT,
      },
      body: JSON.stringify({
        project: getProviderProjectId(account.config, DEFAULT_PROVIDER),
      }),
      timeoutMs: 8000,
      dispatcher: getAccountProxyDispatcher(account, "google-antigravity"),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const errorText = await response.text();
        ctx.log(
          `${account.config.email}: quota API returned ${response.status}, flagging account`,
        );
        ctx.reportQuotaPollFlag(account, response.status, errorText);
        ctx.markFlagged(
          account,
          `Quota API ${response.status}: ${errorText}`,
          { triggerProtectivePause: false },
        );
      }
      return;
    }

    const data = (await response.json()) as GoogleQuotaResponse;
    const oldQuota = account.quota || [];
    const fresh = extractQuotas(data, oldQuota);
    // Drop the previous Antigravity entries so the new ones fully replace
    // them; keep entries from OTHER providers (Ollama) so multi-provider
    // accounts accumulate quotas across credentials without overwriting
    // one another.
    const otherProviders = (oldQuota || []).filter(
      (q) => (q as { providerId?: string }).providerId &&
        (q as { providerId?: string }).providerId !== "google-antigravity",
    );
    fresh.forEach(
      (q) => ((q as { providerId?: string }).providerId = "google-antigravity"),
    );
    account.quota = sortQuotaPools([...otherProviders, ...fresh]);
    account.lastQuotaPoll = Date.now();

    // Stash the provider-local poll log for the rotator to emit as a
    // single consolidated line per cycle.
    account.lastPollByProvider ??= {};
    account.lastPollByProvider["google-antigravity"] = account.quota
      .filter(
        (q) =>
          (q as { providerId?: string }).providerId === "google-antigravity",
      )
      .map((q) => {
        const remain = q.resetTime
          ? Math.round(
              (new Date(q.resetTime).getTime() - Date.now()) / 60000,
            ) + "m"
          : "no_reset";
        return `[${q.modelKey}: ${q.timerType} ${q.percentRemaining}% in ${remain}]`;
      })
      .join(" | ");
  } catch {
    // Network error, skip
  }
}

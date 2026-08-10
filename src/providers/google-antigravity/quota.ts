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
      for (const altKey of config.altKeys) {
        modelInfo = data.models[altKey];
        if (modelInfo) break;
      }
    }

    if (modelInfo?.quotaInfo) {
      const resetTime = modelInfo.quotaInfo.resetTime ?? null;
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
        percentRemaining: Math.round(
          (modelInfo.quotaInfo.remainingFraction ?? 0) * 100,
        ),
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
      body: JSON.stringify({ project: account.config.projectId }),
      timeoutMs: 8000,
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
    account.quota = extractQuotas(data, oldQuota);
    account.lastQuotaPoll = Date.now();

    // --- RAW QUOTA LOGGING FOR DEBUGGING ---
    const rawLog = account.quota
      .map((q) => {
        const remain = q.resetTime
          ? Math.round(
              (new Date(q.resetTime).getTime() - Date.now()) / 60000,
            ) + "m"
          : "no_reset";
        return `[${q.modelKey}: ${q.timerType} ${q.percentRemaining}% in ${remain}]`;
      })
      .join(" | ");
    ctx.log(`RAW POLL ${account.config.email} -> ${rawLog}`);
    // ---------------------------------------
  } catch {
    // Network error, skip
  }
}
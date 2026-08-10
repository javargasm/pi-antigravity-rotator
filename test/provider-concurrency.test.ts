// Concurrency rules differ by pool: Ollama Cloud (modelKey="session")
// has no per-account limit; Antigravity quota pools keep the
// maxConcurrentRequestsPerAccount guard so long streams don't pile up
// on a single account.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.TUXEVIL_ROTATOR_DIR = mkdtempSync(
  join(tmpdir(), "rotator-concurrency-"),
);

import { initDb } from "../src/db-store.js";
import { AccountRotator } from "../src/rotator.js";
import type { AccountRuntime } from "../src/types.js";

before(async () => {
  await initDb();
});

function makeAccount(
  provider: "ollama" | "google-antigravity",
  modelKey: string,
  inFlight: number,
): AccountRuntime {
  const acc: AccountRuntime = {
    config: {
      email: `${provider}@example.com`,
      credentials: [{ provider }],
    },
    accessToken: provider === "google-antigravity" ? "fake" : null,
    tokenExpires: 0,
    requestsSinceRotation: 0,
    totalRequests: 0,
    cooldownsByModel: {},
    quotaExhaustedAt: 0,
    quota: [
      {
        modelKey,
        displayName: modelKey,
        percentRemaining: 100,
        resetTime: null,
        timerType: "fresh",
        providerId: provider,
      } as AccountRuntime["quota"][number],
    ],
    lastQuotaPoll: 0,
    lastUsed: 0,
    lastError: null,
    consecutiveErrors: 0,
    disabled: false,
    flagged: false,
    inFlightRequests: inFlight,
    inFlightByModel: { [modelKey]: inFlight },
    allowFreshWindowStartsOverride: false,
    dailyRequestCount: 0,
    dailyRequestDay: "2026-08-10",
    healthScore: 1,
    tokenBucket: { tokens: 50, lastRefillAt: Date.now() },
  };
  return acc;
}

describe("AccountRotator concurrency rules per provider", () => {
  it("Ollama session pool ignores per-account concurrency limit", () => {
    const acc = makeAccount("ollama", "session", 5);
    const rotator = new AccountRotator([acc], {
      routingPolicy: "timer-first",
      quotaPollIntervalMs: 300000,
      requestsPerRotation: 5,
      maxConcurrentRequestsPerAccount: 1,
      maxConcurrentRequestsPerProjectModel: 1,
    });
    const now = Date.now();
    assert.equal(
      rotator.isAvailableForModel(acc, "session", now),
      true,
      "Ollama session pool must stay available regardless of inFlight count",
    );
    (rotator as unknown as { stopQuotaPolling?: () => void }).stopQuotaPolling?.();
  });

  it("Antigravity claude pool enforces per-account concurrency limit", () => {
    const acc = makeAccount("google-antigravity", "claude", 5);
    const rotator = new AccountRotator([acc], {
      routingPolicy: "timer-first",
      quotaPollIntervalMs: 300000,
      requestsPerRotation: 5,
      maxConcurrentRequestsPerAccount: 1,
      maxConcurrentRequestsPerProjectModel: 1,
    });
    const now = Date.now();
    assert.equal(
      rotator.isAvailableForModel(acc, "claude", now),
      false,
      "Antigravity claude pool must reject when inFlight >= maxConcurrentRequestsPerAccount",
    );
    (rotator as unknown as { stopQuotaPolling?: () => void }).stopQuotaPolling?.();
  });

  it("Antigravity gemini pool enforces per-account concurrency limit", () => {
    const acc = makeAccount("google-antigravity", "gemini", 5);
    const rotator = new AccountRotator([acc], {
      routingPolicy: "timer-first",
      quotaPollIntervalMs: 300000,
      requestsPerRotation: 5,
      maxConcurrentRequestsPerAccount: 1,
      maxConcurrentRequestsPerProjectModel: 1,
    });
    const now = Date.now();
    assert.equal(
      rotator.isAvailableForModel(acc, "gemini", now),
      false,
      "Antigravity gemini pool must reject when inFlight >= maxConcurrentRequestsPerAccount",
    );
    (rotator as unknown as { stopQuotaPolling?: () => void }).stopQuotaPolling?.();
  });
});

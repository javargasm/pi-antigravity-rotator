import { describe, it, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../src/types.js";

// Keep direct execution of this file from persisting its fixture accounts in
// the operator's real config directory. `npm test` already sets this env var,
// but `node --test test/v2-routing.test.ts` does not.
if (!process.env.TUXEVIL_ROTATOR_DIR) {
  process.env.TUXEVIL_ROTATOR_DIR = mkdtempSync(
    join(tmpdir(), "tuxevil-v2-routing-"),
  );
}

// These modules resolve their config paths during import, so load them only
// after the isolated test directory has been selected above.
const { AccountRotator } = await import("../src/rotator.js");
const { initDb } = await import("../src/db-store.js");
const { setPersistedAdminToken } = await import("../src/admin-auth.js");

function makeConfig(): Config {
  return {
    proxyPort: 51200,
    bindHost: "0.0.0.0",
    routingPolicy: "timer-first",
    requestsPerRotation: 5,
    rotateOnQuotaDrop: 20,
    quotaPollIntervalMs: 300000,
    accounts: [
      {
        email: "a@example.com",
        refreshToken: "a",
        projectId: "pa",
        tier: "free",
      },
      {
        email: "b@example.com",
        refreshToken: "b",
        projectId: "pb",
        tier: "ultra",
      },
    ],
    tokenBucketEnabled: false,
    tokenBucketMaxTokens: 5,
    tokenBucketRefillPerMinute: 1,
    tokenBucketInitialTokens: 5,
  };
}

describe("v2 routing and status", () => {
  before(async () => {
    await initDb();
  });

  afterEach(() => {
    setPersistedAdminToken(null);
  });

  it("keeps timer-first routing and uses tier as a tie-breaker", () => {
    const rotator = new AccountRotator(makeConfig()) as any;
    rotator.stopQuotaPolling();
    rotator.accounts[0].quota = [
      {
        modelKey: "gemini-3.1-pro",
        displayName: "G3.1Pro",
        percentRemaining: 50,
        resetTime: null,
        timerType: "7d",
      },
    ];
    rotator.accounts[1].quota = [
      {
        modelKey: "gemini-3.1-pro",
        displayName: "G3.1Pro",
        percentRemaining: 50,
        resetTime: null,
        timerType: "7d",
      },
    ];
    rotator.accounts[0].healthScore = 0.9;
    rotator.accounts[1].healthScore = 0.9;

    const best = rotator.pickBestModelAccount("gemini-3.1-pro", Date.now(), -1);
    assert.equal(best?.config.email, "b@example.com");
  });

  it("kickstarts Gemini 3.6 through the shared Gemini 3 upstream model", async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: { model?: string } | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as { model?: string };
      return new Response("", { status: 200 });
    }) as typeof fetch;

    try {
      const rotator = new AccountRotator(makeConfig()) as any;
      rotator.stopQuotaPolling();
      rotator.accounts[0].accessToken = "test-access-token";
      rotator.accounts[0].tokenExpires = Date.now() + 60_000;

      const result = await rotator.kickstartTimerForAccount(
        "a@example.com",
        "gemini-3.6-flash",
      );
      assert.equal(result.ok, true);
      assert.equal(result.upstreamModel, "gemini-3-flash");
      assert.equal(requestBody?.model, "gemini-3-flash");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces admin exposure warnings in status when token is missing", () => {
    const rotator = new AccountRotator(makeConfig());
    rotator.stopQuotaPolling();
    const status = rotator.getStatus();
    assert.equal(status.security.adminTokenConfigured, false);
    assert.match(status.security.warning || "", /TUXEVIL_ROTATOR_ADMIN_TOKEN/);
  });

  it("surfaces proxy exposure warnings even when admin auth is configured", () => {
    setPersistedAdminToken("secret");
    const rotator = new AccountRotator(makeConfig());
    rotator.stopQuotaPolling();
    const status = rotator.getStatus();
    assert.equal(status.security.adminTokenConfigured, true);
    assert.match(status.security.warning || "", /proxy routes are unauthenticated/);
    assert.doesNotMatch(
      status.security.warning || "",
      /TUXEVIL_ROTATOR_ADMIN_TOKEN is not configured/,
    );
  });

  it("does not warn for loopback binds when admin auth is configured", () => {
    setPersistedAdminToken("secret");
    const config = makeConfig();
    config.bindHost = "127.0.0.1";
    const rotator = new AccountRotator(config);
    rotator.stopQuotaPolling();
    const status = rotator.getStatus();
    assert.equal(status.security.adminTokenConfigured, true);
    assert.equal(status.security.warning, null);
  });

  it("supports quota-first policy when configured", () => {
    const config = makeConfig();
    config.routingPolicy = "quota-first";
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();
    rotator.accounts[0].quota = [
      {
        modelKey: "gemini-3.1-pro",
        displayName: "G3.1Pro",
        percentRemaining: 90,
        resetTime: null,
        timerType: "fresh",
      },
    ];
    rotator.accounts[1].quota = [
      {
        modelKey: "gemini-3.1-pro",
        displayName: "G3.1Pro",
        percentRemaining: 50,
        resetTime: null,
        timerType: "7d",
      },
    ];
    rotator.accounts[0].healthScore = 0.9;
    rotator.accounts[1].healthScore = 0.9;

    const best = rotator.pickBestModelAccount("gemini-3.1-pro", Date.now(), -1);
    assert.equal(best?.config.email, "a@example.com");
  });

  it("supports hybrid policy and excludes empty token buckets", () => {
    const config = makeConfig();
    config.routingPolicy = "hybrid";
    config.tokenBucketEnabled = true;
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();
    rotator.accounts[0].quota = [
      {
        modelKey: "gemini-3.1-pro",
        displayName: "G3.1Pro",
        percentRemaining: 95,
        resetTime: null,
        timerType: "5h",
      },
    ];
    rotator.accounts[1].quota = [
      {
        modelKey: "gemini-3.1-pro",
        displayName: "G3.1Pro",
        percentRemaining: 85,
        resetTime: null,
        timerType: "7d",
      },
    ];
    rotator.accounts[0].healthScore = 0.8;
    rotator.accounts[1].healthScore = 1;
    rotator.accounts[0].tokenBucket.tokens = 0;
    rotator.accounts[1].tokenBucket.tokens = 4;

    const best = rotator.pickBestModelAccount("gemini-3.1-pro", Date.now(), -1);
    assert.equal(best?.config.email, "b@example.com");

    const status = rotator.getStatus();
    assert.equal(
      status.routingDiagnostics["gemini-3.1-pro"].accounts[0].rejectedReason,
      "token-bucket-empty",
    );
  });

  it("keeps sticky-quota on the active account beyond the request threshold", async () => {
    const config = makeConfig();
    config.routingPolicy = "sticky-quota";
    config.requestsPerRotation = 1;
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();
    rotator.ensureValidToken = async () => {};
    const model = "gemini";
    for (const account of rotator.accounts) {
      account.quota = [
        {
          modelKey: model,
          displayName: "G3.1Pro",
          percentRemaining: 80,
          resetTime: null,
          timerType: "7d",
        },
      ];
    }
    rotator.modelState.set(model, {
      activeAccountIndex: 0,
      stickyAccountIndex: 0,
      quotaAtRotationStart: 80,
      requestsOnActiveAccount: 0,
    });

    const account = await rotator.getActiveAccount(model);
    assert.equal(account?.config.email, "a@example.com");
    rotator.finishRequest(account, model);
    assert.equal(rotator.recordRequest(account, model), false);
    assert.equal(rotator.modelState.get(model).activeAccountIndex, 0);
  });

  it("temporarily falls back from sticky-quota and restores the preferred account", async () => {
    const config = makeConfig();
    config.routingPolicy = "sticky-quota";
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();
    rotator.ensureValidToken = async () => {};
    const model = "gemini";
    for (const account of rotator.accounts) {
      account.quota = [
        {
          modelKey: model,
          displayName: "G3.1Pro",
          percentRemaining: 80,
          resetTime: null,
          timerType: "7d",
        },
      ];
    }
    rotator.modelState.delete(model);
    const initial = await rotator.getActiveAccount(model);
    assert.equal(initial?.config.email, "a@example.com");
    rotator.finishRequest(initial, model);
    assert.equal(rotator.modelState.get(model).stickyAccountIndex, 0);
    rotator.accounts[0].cooldownsByModel[model] = Date.now() + 60_000;

    const fallback = await rotator.getActiveAccount(model);
    assert.equal(fallback?.config.email, "b@example.com");
    rotator.finishRequest(fallback, model);
    assert.equal(rotator.modelState.get(model).stickyAccountIndex, 0);

    rotator.accounts[0].cooldownsByModel[model] = Date.now() - 1;
    const restored = await rotator.getActiveAccount(model);
    assert.equal(restored?.config.email, "a@example.com");
    rotator.finishRequest(restored, model);
    assert.equal(rotator.modelState.get(model).activeAccountIndex, 0);
  });

  it("permanently leaves a sticky account after its quota reaches zero", async () => {
    const config = makeConfig();
    config.routingPolicy = "sticky-quota";
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();
    rotator.ensureValidToken = async () => {};
    const model = "gemini";
    rotator.accounts[0].quota = [
      {
        modelKey: model,
        displayName: "G3.1Pro",
        percentRemaining: 0,
        resetTime: null,
        timerType: "7d",
      },
    ];
    rotator.accounts[1].quota = [
      {
        modelKey: model,
        displayName: "G3.1Pro",
        percentRemaining: 80,
        resetTime: null,
        timerType: "7d",
      },
    ];
    rotator.modelState.set(model, {
      activeAccountIndex: 0,
      stickyAccountIndex: 0,
      quotaAtRotationStart: 80,
      requestsOnActiveAccount: 3,
    });

    const replacement = await rotator.getActiveAccount(model);
    assert.equal(replacement?.config.email, "b@example.com");
    rotator.finishRequest(replacement, model);
    assert.equal(rotator.modelState.get(model).stickyAccountIndex, 1);
  });

  it("uses circular account order for sequential-quota", () => {
    const config = makeConfig();
    config.routingPolicy = "sequential-quota";
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();
    const model = "gemini";
    rotator.accounts[0].quota = [
      {
        modelKey: model,
        displayName: "G3.1Pro",
        percentRemaining: 1,
        resetTime: null,
        timerType: "fresh",
      },
    ];
    rotator.accounts[1].quota = [
      {
        modelKey: model,
        displayName: "G3.1Pro",
        percentRemaining: 99,
        resetTime: null,
        timerType: "7d",
      },
    ];

    assert.equal(
      rotator.pickBestModelAccount(model, Date.now(), -1)?.config.email,
      "a@example.com",
    );
    assert.equal(
      rotator.pickBestModelAccount(model, Date.now(), 0)?.config.email,
      "b@example.com",
    );
  });

  it("exposes the health score components in routing diagnostics", () => {
    const rotator = new AccountRotator(makeConfig()) as any;
    rotator.stopQuotaPolling();
    const account = rotator.accounts[0];
    account.quota = [
      {
        modelKey: "gemini-3.1-pro",
        displayName: "G3.1Pro",
        percentRemaining: 50,
        resetTime: null,
        timerType: "7d",
      },
    ];
    account.consecutiveErrors = 2;
    account.cooldownsByModel = { "gemini-3.1-pro": Date.now() + 1000 };
    rotator.refreshHealthScores();

    const diagnostic =
      rotator.getStatus().routingDiagnostics["gemini-3.1-pro"].accounts[0];
    assert.deepEqual(diagnostic.healthBreakdown, {
      quotaComponent: 0.5,
      errorPenalty: 0.2,
      cooldownPenalty: 0.1,
      availabilityPenalty: 0,
      score: 0.2,
    });
    assert.equal(diagnostic.healthScore, 0.2);
  });

  it("accepts plus as a first-class account tier", async () => {
    const rotator = new AccountRotator(makeConfig());
    rotator.stopQuotaPolling();
    const changed = await rotator.setAccountTier("a@example.com", "plus");
    assert.equal(changed, true);
    assert.equal(rotator.getConfig().accounts[0].tier, "plus");
    assert.equal(rotator.getStatus().accounts[0].tier, "plus");
  });

  it("debounces model assignment state writes on the request path", async () => {
    const rotator = new AccountRotator(makeConfig()) as any;
    rotator.stopQuotaPolling();
    rotator.modelState.set("gemini-3.1-pro", {
      activeAccountIndex: 0,
      quotaAtRotationStart: -1,
      requestsOnActiveAccount: 0,
    });
    let saves = 0;
    rotator.saveState = () => {
      saves++;
    };

    rotator.countModelAssignment("gemini-3.1-pro");
    assert.equal(
      rotator.modelState.get("gemini-3.1-pro").requestsOnActiveAccount,
      1,
    );
    assert.equal(saves, 0);

    await rotator.flushPendingStateSave();
    assert.equal(saves, 1);
  });

  it("debounces upstream-attempt state writes on the request path", async () => {
    const rotator = new AccountRotator(makeConfig()) as any;
    rotator.stopQuotaPolling();
    let saves = 0;
    rotator.saveState = () => {
      saves++;
    };

    rotator.recordUpstreamAttempt(rotator.accounts[0]);
    assert.equal(rotator.accounts[0].dailyRequestCount, 1);
    assert.equal(rotator.projectRequests.pa, 1);
    assert.equal(saves, 0);

    await rotator.flushPendingStateSave();
    assert.equal(saves, 1);
  });

  it("marks positive-quota accounts as exhausted once local daily safety budget is spent", () => {
    const rotator = new AccountRotator(makeConfig()) as any;
    rotator.stopQuotaPolling();
    for (const account of rotator.accounts) {
      account.quota = [
        {
          modelKey: "gemini-3.1-pro",
          displayName: "G3.1Pro",
          percentRemaining: 44,
          resetTime: null,
          timerType: "5h",
        },
      ];
      account.dailyRequestCount = 350;
    }

    const best = rotator.pickBestModelAccount("gemini-3.1-pro", Date.now(), -1);
    assert.equal(best, null);

    const status = rotator.getStatus();
    assert.equal(status.accounts[0].status, "exhausted");
    assert.equal(status.accounts[0].dailyRequestCount, 350);
    assert.equal(
      status.routingDiagnostics["gemini-3.1-pro"].accounts[0].rejectedReason,
      "daily-account-stop",
    );
    assert.match(
      status.routingDiagnostics["gemini-3.1-pro"].reason,
      /daily account budget exhausted/,
    );
    const retryAfterMs = rotator.getRetryAfterMs("gemini-3.1-pro");
    assert.ok(retryAfterMs > 0);
    assert.ok(retryAfterMs <= 24 * 60 * 60 * 1000);
  });

  it("prioritizes daily safety stops in diagnostics even when earlier accounts have zero quota", () => {
    const config = makeConfig();
    config.accounts = [
      {
        email: "zero-1@example.com",
        refreshToken: "a",
        projectId: "p1",
        tier: "free",
      },
      {
        email: "zero-2@example.com",
        refreshToken: "b",
        projectId: "p2",
        tier: "free",
      },
      {
        email: "zero-3@example.com",
        refreshToken: "c",
        projectId: "p3",
        tier: "free",
      },
      {
        email: "budget@example.com",
        refreshToken: "d",
        projectId: "p4",
        tier: "free",
      },
    ];
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();
    for (const account of rotator.accounts.slice(0, 3)) {
      account.quota = [
        {
          modelKey: "gemini-3.1-pro",
          displayName: "G3.1Pro",
          percentRemaining: 0,
          resetTime: null,
          timerType: "7d",
        },
      ];
    }
    rotator.accounts[3].quota = [
      {
        modelKey: "gemini-3.1-pro",
        displayName: "G3.1Pro",
        percentRemaining: 44,
        resetTime: null,
        timerType: "5h",
      },
    ];
    rotator.accounts[3].dailyRequestCount = 350;

    const reason =
      rotator.getStatus().routingDiagnostics["gemini-3.1-pro"].reason;
    assert.match(reason, /daily account budget exhausted/);
    assert.match(reason, /quota is exhausted for this model/);
    assert.ok(
      reason.indexOf("daily account budget exhausted") <
        reason.indexOf("quota is exhausted for this model"),
    );
  });

  it("keeps dual accounts (google + ollama) eligible for google pools", () => {
    const config = makeConfig();
    config.accounts = [
      {
        email: "dual@example.com",
        credentials: [
          { provider: "google-antigravity", refreshToken: "g" },
          { provider: "ollama", apiKey: "o" },
        ],
        projectId: "pd",
        tier: "free",
      },
      {
        email: "google-only@example.com",
        provider: "google-antigravity",
        refreshToken: "g2",
        projectId: "pg",
        tier: "free",
      },
      {
        email: "ollama-only@example.com",
        provider: "ollama",
        apiKey: "o2",
        projectId: "po",
        tier: "free",
      },
    ];
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();

    function quota(modelKey: string) {
      return [
        {
          modelKey,
          displayName: modelKey,
          percentRemaining: 100,
          resetTime: null,
          timerType: "7d",
        },
      ];
    }
    for (const account of rotator.accounts) {
      account.quota = [...quota("claude"), ...quota("session")];
      account.healthScore = 1;
    }

    function allowed(modelKey: string): string | null {
      const available = rotator.accounts
        .filter((a: any) => rotator.isProviderEligibleForKey(a, modelKey))
        .map((a: any) => a.config.email);
      return available[0] ?? null;
    }

    const now = Date.now();
    const claudeBest = rotator.pickBestModelAccount("claude", now, -1);
    assert.equal(allowed("claude"), "dual@example.com");
    assert.equal(claudeBest?.config.email, "dual@example.com");

    const sessionBest = rotator.pickBestModelAccount("session", now, -1);
    assert.equal(sessionBest?.config.email, "dual@example.com");
    assert.equal(allowed("session"), "dual@example.com");
  });

  it("arms the model breaker on plain 429s but not on quota exhaustion", () => {
    const config = makeConfig();
    config.accounts.push({
      email: "c@example.com",
      refreshToken: "c",
      projectId: "pc",
      tier: "free",
    });
    const rotator = new AccountRotator(config) as any;
    rotator.stopQuotaPolling();
    const now = Date.now();
    const cooldownMs = 60_000;

    rotator.recordProvider429(rotator.accounts[0], "claude", cooldownMs, true);
    rotator.recordProvider429(rotator.accounts[1], "claude", cooldownMs, true);
    assert.equal(
      rotator.modelBreakers["claude"] ?? 0,
      0,
      "quota exhaustion must not arm the model breaker",
    );

    rotator.recordProvider429(rotator.accounts[0], "claude", cooldownMs, false);
    rotator.recordProvider429(
      rotator.accounts[1],
      "claude",
      cooldownMs * 2,
      false,
    );
    assert.equal(
      rotator.modelBreakers["claude"] ?? 0,
      0,
      "below threshold must not arm the breaker",
    );

    rotator.recordProvider429(rotator.accounts[2], "claude", cooldownMs, false);
    assert.ok(
      rotator.modelBreakers["claude"] > now,
      "3 unique accounts with plain 429 must arm the model breaker",
    );
  });
});

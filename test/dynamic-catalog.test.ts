import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { dynamicCatalog } from "../src/providers/google-antigravity/dynamic-catalog.js";
import { getAntigravityContextWindow } from "../src/providers/google-antigravity/catalog.js";
import {
  isTieredEffortModel,
  openAIToAntigravityBody,
} from "../src/providers/google-antigravity/translators.js";
import { getModelSpec } from "../src/compat/model-specs.js";
import { extractQuotas } from "../src/providers/google-antigravity/quota.js";
import { getModelPricing, applyModelAlias } from "../src/types.js";
import type { GoogleQuotaResponse } from "../src/types.js";

describe("DynamicModelRegistry", () => {
  beforeEach(() => {
    dynamicCatalog.reset();
  });

  it("keeps the static baseline outside the dynamic registry", () => {
    assert.deepEqual(dynamicCatalog.getAllModels(), []);
    assert.equal(dynamicCatalog.getModel("gemini-3.8-flash-high"), undefined);
  });

  it("dynamically ingests new models from fetchAvailableModels response", () => {
    const mockResponse: GoogleQuotaResponse = {
      defaultAgentModelId: "gemini-4.0-flash-tiered",
      models: {
        "gemini-4.0-flash-tiered": {
          displayName: "Gemini 4.0 Flash (Tiered)",
          maxTokens: 2097152,
          maxOutputTokens: 65536,
          supportsThinking: true,
          thinkingBudget: -1,
          supportsImages: true,
          supportsVideo: true,
          quotaInfo: { remainingFraction: 0.95 },
        },
        "gemini-4.0-pro-high": {
          displayName: "Gemini 4.0 Pro (High)",
          maxTokens: 2097152,
          maxOutputTokens: 65536,
          supportsThinking: true,
          thinkingBudget: 16000,
          quotaInfo: { remainingFraction: 0.95 },
        },
        "claude-opus-5-thinking": {
          displayName: "Claude Opus 5 (Thinking)",
          maxTokens: 1048576,
          maxOutputTokens: 64000,
          supportsThinking: true,
          thinkingBudget: 32768,
          quotaInfo: { remainingFraction: 0.8 },
        },
      },
      tieredModelIds: {
        flash: ["gemini-4.0-flash-tiered"],
      },
    };

    const newCount = dynamicCatalog.updateFromEndpointResponse(mockResponse);
    assert.equal(newCount, 3);
    assert.equal(dynamicCatalog.getDefaultAgentModelId(), "gemini-4.0-flash-tiered");

    // 1. Check gemini-4.0-flash-tiered
    const flash4 = dynamicCatalog.getModel("gemini-4.0-flash-tiered");
    assert.ok(flash4);
    assert.equal(flash4.ctx, 2097152);
    assert.equal(flash4.quotaPool, "gemini");
    assert.equal(flash4.isTiered, true);
    assert.equal(flash4.thinkingBudget, -1);
    assert.equal(flash4.isThinking, true);

    // 2. Check gemini-4.0-pro-high
    const pro4 = dynamicCatalog.getModel("gemini-4.0-pro-high");
    assert.ok(pro4);
    assert.equal(pro4.ctx, 2097152);
    assert.equal(pro4.quotaPool, "gemini");
    assert.equal(pro4.isTiered, false);
    assert.equal(pro4.thinkingBudget, 16000);

    // 3. Check claude-opus-5-thinking
    const opus5 = dynamicCatalog.getModel("claude-opus-5-thinking");
    assert.ok(opus5);
    assert.equal(opus5.quotaPool, "claude");
  });

  it("keeps a reconciled union of models advertised by active accounts", () => {
    dynamicCatalog.updateFromEndpointResponse({
      models: { "gemini-account-a": { quotaInfo: { remainingFraction: 1 } } },
    }, "account-a@example.com");
    dynamicCatalog.updateFromEndpointResponse({
      models: { "gemini-account-b": { quotaInfo: { remainingFraction: 1 } } },
    }, "account-b@example.com");

    assert.ok(dynamicCatalog.getModel("gemini-account-a"));
    assert.ok(dynamicCatalog.getModel("gemini-account-b"));

    dynamicCatalog.updateFromEndpointResponse({ models: {} }, "account-a@example.com");
    assert.equal(dynamicCatalog.getModel("gemini-account-a"), undefined);
    assert.ok(dynamicCatalog.getModel("gemini-account-b"));

    dynamicCatalog.retainAccounts(["account-a@example.com"]);
    assert.equal(dynamicCatalog.getModel("gemini-account-b"), undefined);
    assert.deepEqual(dynamicCatalog.getAllModels(), []);
  });

  it("preserves Gemini family defaults for quota-only dynamic metadata", () => {
    dynamicCatalog.updateFromEndpointResponse({
      models: {
        "gemini-5.0-flash": { quotaInfo: { remainingFraction: 0.75 } },
      },
    }, "account@example.com");

    assert.deepEqual(getModelSpec("gemini-5.0-flash"), {
      maxOutputTokens: 65536,
      thinkingBudget: 24576,
      isThinking: true,
      contextWindow: 1_000_000,
    });

    const body = openAIToAntigravityBody({
      model: "gemini-5.0-flash",
      messages: [{ role: "user", content: "ping" }],
    }) as { request: { generationConfig?: Record<string, unknown> } };
    assert.deepEqual(body.request.generationConfig, {
      maxOutputTokens: 32768,
      thinkingConfig: { includeThoughts: true, thinkingBudget: 24576 },
    });
  });

  it("exposes dynamic model specs through getModelSpec", () => {
    dynamicCatalog.updateFromEndpointResponse({
      models: {
        "gemini-5.0-ultra": {
          maxTokens: 5000000,
          maxOutputTokens: 100000,
          supportsThinking: true,
          thinkingBudget: 50000,
        },
      },
    });

    const spec = getModelSpec("gemini-5.0-ultra");
    assert.deepEqual(spec, {
      maxOutputTokens: 100000,
      thinkingBudget: 50000,
      isThinking: true,
      contextWindow: 5000000,
    });
  });

  it("exposes dynamic context windows through getAntigravityContextWindow", () => {
    dynamicCatalog.updateFromEndpointResponse({
      models: {
        "gemini-future-supermodel": {
          maxTokens: 4000000,
        },
      },
    });

    assert.equal(getAntigravityContextWindow("gemini-future-supermodel"), 4000000);
  });

  it("dynamically recognizes tiered models in isTieredEffortModel without code changes", () => {
    assert.equal(isTieredEffortModel("gemini-4.0-flash-tiered"), true);
    assert.equal(isTieredEffortModel("gemini-4.0-flash-tiered-high"), false);
    assert.equal(isTieredEffortModel("gemini-future-tiered"), true);
    assert.equal(isTieredEffortModel("gemini-future-pro"), false);
  });

  it("extracts pool quota via dynamically discovered models", () => {
    dynamicCatalog.updateFromEndpointResponse({
      models: {
        "gemini-future-super-flash": {
          quotaInfo: { remainingFraction: 0.77 },
        },
      },
    });

    const rawData = {
      models: {
        "gemini-future-super-flash": {
          quotaInfo: { remainingFraction: 0.77 },
        },
      },
    };
    const quotas = extractQuotas(rawData, []);
    const gemini = quotas.find((q) => q.modelKey === "gemini");
    assert.ok(gemini, "should resolve newly discovered model to gemini quota pool");
    assert.equal(gemini.percentRemaining, 77);
  });

  it("resolves model pricing dynamically by family for unlisted future models", () => {
    // Unlisted future Flash model falls back to Flash pricing
    const flashPrice = getModelPricing("gemini-4.5-flash-hyper");
    assert.ok(flashPrice);
    assert.equal(flashPrice.inputPer1M, 0.75);
    assert.equal(flashPrice.outputPer1M, 3.75);

    // Unlisted future Pro model falls back to Pro pricing
    const proPrice = getModelPricing("gemini-5.0-pro-ultra");
    assert.ok(proPrice);
    assert.equal(proPrice.inputPer1M, 2.0);
    assert.equal(proPrice.outputPer1M, 12.0);

    // Unlisted future Opus model falls back to Opus pricing
    const opusPrice = getModelPricing("claude-opus-5-super");
    assert.ok(opusPrice);
    assert.equal(opusPrice.inputPer1M, 5.0);
    assert.equal(opusPrice.outputPer1M, 25.0);
  });

  it("routes gemini-3.8-flash variants directly to upstream models", () => {
    assert.equal(applyModelAlias("gemini-3.8-flash-high"), "gemini-3.8-flash-high");
    assert.equal(applyModelAlias("gemini-3.8-flash-medium"), "gemini-3.8-flash-medium");
    assert.equal(applyModelAlias("gemini-3.8-flash-low"), "gemini-3.8-flash-low");
  });

  it("does not alias or fallback unknown models so upstream errors are preserved", () => {
    assert.equal(applyModelAlias("gemini-3.8-flash-tiered"), "gemini-3.8-flash-tiered");
    assert.equal(applyModelAlias("gemini-nonexistent-model"), "gemini-nonexistent-model");
  });
});

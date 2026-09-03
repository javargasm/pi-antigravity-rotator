// Dynamic Google Antigravity model availability discovered during quota polling.

import type { ModelSpec } from "../../compat/model-specs.js";
import type { GoogleQuotaResponse } from "../../types.js";

export interface DynamicModelEntry {
  id: string;
  family: string;
  ctx: number;
  quotaPool: string;
  multimodal: boolean;
  tools: boolean;
  maxOutputTokens: number;
  thinkingBudget: number;
  isThinking: boolean;
  isTiered: boolean;
  displayName?: string;
}

const DEFAULT_ACCOUNT_KEY = "__default__";

function accountKey(value: string): string {
  return value.trim();
}

function familyDefaults(
  family: string,
): Pick<
  DynamicModelEntry,
  "ctx" | "multimodal" | "tools" | "maxOutputTokens" | "thinkingBudget" | "isThinking"
> {
  if (family === "gpt-oss") {
    return {
      ctx: 131_072,
      multimodal: false,
      tools: true,
      maxOutputTokens: 32_768,
      thinkingBudget: 8_192,
      isThinking: true,
    };
  }
  if (family.includes("claude")) {
    return {
      ctx: 1_000_000,
      multimodal: true,
      tools: true,
      maxOutputTokens: 64_000,
      thinkingBudget: 32_768,
      isThinking: true,
    };
  }
  if (family.includes("gemini")) {
    return {
      ctx: 1_000_000,
      multimodal: true,
      tools: true,
      maxOutputTokens: 65_536,
      thinkingBudget: 24_576,
      isThinking: true,
    };
  }
  return {
    ctx: 128_000,
    multimodal: false,
    tools: true,
    maxOutputTokens: 65_536,
    thinkingBudget: 24_576,
    isThinking: false,
  };
}

export class DynamicModelRegistry {
  private static instance: DynamicModelRegistry | null = null;
  private accountModels = new Map<string, Map<string, DynamicModelEntry>>();
  private defaultAgentModelIds = new Map<string, string>();
  private discoveredModelIds = new Set<string>();

  static getInstance(): DynamicModelRegistry {
    DynamicModelRegistry.instance ??= new DynamicModelRegistry();
    return DynamicModelRegistry.instance;
  }

  /** Reset dynamic account state (primarily for tests). */
  reset(): void {
    this.accountModels.clear();
    this.defaultAgentModelIds.clear();
    this.discoveredModelIds.clear();
  }

  /** Derive the model family and quota pool from a model ID string. */
  static inferFamilyAndPool(modelId: string): { family: string; quotaPool: string } {
    const lower = modelId.toLowerCase();
    if (lower.includes("claude") || lower.includes("sonnet") || lower.includes("opus")) {
      const match = lower.match(/(claude-[a-z0-9.-]+)/);
      return { family: match?.[1] ?? "claude", quotaPool: "claude" };
    }
    if (lower.includes("gpt-oss")) {
      return { family: "gpt-oss", quotaPool: "claude" };
    }
    if (lower.includes("gemini")) {
      const match = lower.match(/(gemini-[0-9.]+-?[a-z]*)/);
      return { family: match?.[1] ?? "gemini", quotaPool: "gemini" };
    }
    return { family: lower, quotaPool: "gemini" };
  }

  /** Replace one account's advertised models with its latest successful response. */
  updateFromEndpointResponse(
    data: GoogleQuotaResponse,
    accountId = DEFAULT_ACCOUNT_KEY,
  ): number {
    if (!data || typeof data !== "object" || !data.models) return 0;

    const key = accountKey(accountId);
    const previous = this.accountModels.get(key);
    const knownBefore = new Set(this.getAllModels().map((model) => model.id.toLowerCase()));
    const next = new Map<string, DynamicModelEntry>();
    const tieredIds = new Set(
      Object.values(data.tieredModelIds ?? {}).flat().map((id) => id.trim().toLowerCase()),
    );
    let newModelsCount = 0;

    if (data.defaultAgentModelId) {
      this.defaultAgentModelIds.delete(key);
      this.defaultAgentModelIds.set(key, data.defaultAgentModelId);
    } else {
      this.defaultAgentModelIds.delete(key);
    }

    for (const [rawId, info] of Object.entries(data.models)) {
      const normalizedId = rawId.trim();
      const lowerId = normalizedId.toLowerCase();
      if (
        !lowerId ||
        lowerId.startsWith("chat_") ||
        lowerId.startsWith("tab_") ||
        lowerId.startsWith("gemini-3.5-")
      ) continue;

      this.discoveredModelIds.add(lowerId);
      const { family, quotaPool } = DynamicModelRegistry.inferFamilyAndPool(normalizedId);
      const defaults = previous?.get(lowerId) ?? familyDefaults(family);
      const isTiered = lowerId.includes("-tiered") || tieredIds.has(lowerId);
      const hasThinkingBudget = typeof info.thinkingBudget === "number";
      const thinkingBudget = hasThinkingBudget
        ? info.thinkingBudget!
        : isTiered
          ? -1
          : defaults.thinkingBudget;
      const isThinking = typeof info.supportsThinking === "boolean"
        ? info.supportsThinking
        : hasThinkingBudget
          ? thinkingBudget !== 0
          : defaults.isThinking;
      const hasMultimodalMetadata =
        typeof info.supportsImages === "boolean" || typeof info.supportsVideo === "boolean";

      next.set(lowerId, {
        id: normalizedId,
        family,
        ctx: typeof info.maxTokens === "number" && info.maxTokens > 0
          ? info.maxTokens
          : defaults.ctx,
        quotaPool,
        multimodal: hasMultimodalMetadata
          ? Boolean(info.supportsImages || info.supportsVideo)
          : defaults.multimodal,
        tools: defaults.tools,
        maxOutputTokens:
          typeof info.maxOutputTokens === "number" && info.maxOutputTokens > 0
            ? info.maxOutputTokens
            : defaults.maxOutputTokens,
        thinkingBudget,
        isThinking,
        isTiered,
        displayName: info.displayName ?? previous?.get(lowerId)?.displayName ?? normalizedId,
      });
      if (!knownBefore.has(lowerId)) newModelsCount++;
    }

    this.accountModels.set(key, next);
    return newModelsCount;
  }

  /** Expire catalogs belonging to accounts that are no longer active. */
  retainAccounts(accountIds: Iterable<string>): void {
    const active = new Set(Array.from(accountIds, accountKey));
    for (const key of this.accountModels.keys()) {
      if (!active.has(key)) this.accountModels.delete(key);
    }
    for (const key of this.defaultAgentModelIds.keys()) {
      if (!active.has(key)) this.defaultAgentModelIds.delete(key);
    }
  }

  getAllModels(): DynamicModelEntry[] {
    const models = new Map<string, DynamicModelEntry>();
    for (const accountCatalog of this.accountModels.values()) {
      for (const [id, model] of accountCatalog) models.set(id, model);
    }
    return Array.from(models.values());
  }

  getModel(id: string): DynamicModelEntry | undefined {
    let match: DynamicModelEntry | undefined;
    const lowerId = id.toLowerCase();
    for (const accountCatalog of this.accountModels.values()) {
      match = accountCatalog.get(lowerId) ?? match;
    }
    return match;
  }

  hasModelForAccount(accountId: string, id: string): boolean {
    return this.accountModels
      .get(accountKey(accountId))
      ?.has(id.trim().toLowerCase()) ?? false;
  }

  wasDiscovered(id: string): boolean {
    return this.discoveredModelIds.has(id.trim().toLowerCase());
  }

  getModelSpec(id: string): ModelSpec | undefined {
    const entry = this.getModel(id);
    if (!entry) return undefined;
    return {
      maxOutputTokens: entry.maxOutputTokens,
      thinkingBudget: entry.thinkingBudget,
      isThinking: entry.isThinking,
      contextWindow: entry.ctx,
    };
  }

  getContextWindow(id: string): number | undefined {
    return this.getModel(id)?.ctx;
  }

  isTiered(id: string): boolean {
    const lowerId = id.toLowerCase();
    return lowerId.includes("-tiered") || (this.getModel(lowerId)?.isTiered ?? false);
  }

  resolveQuotaPool(id: string): string | undefined {
    return this.getModel(id)?.quotaPool;
  }

  getDefaultAgentModelId(): string | null {
    return Array.from(this.defaultAgentModelIds.values()).at(-1) ?? null;
  }
}

export const dynamicCatalog = DynamicModelRegistry.getInstance();

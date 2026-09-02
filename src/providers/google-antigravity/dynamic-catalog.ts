// Dynamic model registry for Google Antigravity models.
// Automatically ingests models returned by the Antigravity endpoint
// (v1internal:fetchAvailableModels / Language Server GetAvailableModels)
// on each RAW POLL cycle, eliminating manual edits when new models appear.

import type { GoogleQuotaResponse } from "../../types.js";
import type { ModelSpec } from "../../compat/model-specs.js";

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

// Baseline models bundled with the release to ensure offline / pre-poll readiness
const BASELINE_ANTIGRAVITY_MODELS: DynamicModelEntry[] = [
  {
    id: "claude-sonnet-4-6",
    family: "claude-sonnet-4-6",
    ctx: 1048576,
    quotaPool: "claude",
    multimodal: true,
    tools: true,
    maxOutputTokens: 64000,
    thinkingBudget: 32768,
    isThinking: true,
    isTiered: false,
    displayName: "Claude Sonnet 4.6",
  },
  {
    id: "claude-opus-4-6-thinking",
    family: "claude-opus-4-6",
    ctx: 1048576,
    quotaPool: "claude",
    multimodal: true,
    tools: true,
    maxOutputTokens: 64000,
    thinkingBudget: 32768,
    isThinking: true,
    isTiered: false,
    displayName: "Claude Opus 4.6 (Thinking)",
  },
  {
    id: "gpt-oss-120b-medium",
    family: "gpt-oss",
    ctx: 131072,
    quotaPool: "claude",
    multimodal: false,
    tools: true,
    maxOutputTokens: 32768,
    thinkingBudget: 8192,
    isThinking: true,
    isTiered: false,
    displayName: "GPT-OSS 120B (Medium)",
  },
  {
    id: "gemini-3.7-flash-tiered",
    family: "gemini-3.7-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: -1,
    isThinking: true,
    isTiered: true,
    displayName: "Gemini 3.7 Flash (Tiered)",
  },
  {
    id: "gemini-3.8-flash-high",
    family: "gemini-3.8-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: -1,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.8 Flash (High)",
  },
  {
    id: "gemini-3.8-flash-medium",
    family: "gemini-3.8-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 4000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.8 Flash (Medium)",
  },
  {
    id: "gemini-3.8-flash-low",
    family: "gemini-3.8-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 1000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.8 Flash (Low)",
  },
  {
    id: "gemini-3.6-flash-high",
    family: "gemini-3.6-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 10000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.6 Flash (High)",
  },
  {
    id: "gemini-3.6-flash-medium",
    family: "gemini-3.6-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 4000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.6 Flash (Medium)",
  },
  {
    id: "gemini-3.6-flash-low",
    family: "gemini-3.6-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 1000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.6 Flash (Low)",
  },
  {
    id: "gemini-3.6-flash-tiered",
    family: "gemini-3.6-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: -1,
    isThinking: true,
    isTiered: true,
    displayName: "Gemini 3.6 Flash (Tiered)",
  },
  {
    id: "gemini-3.5-flash-high",
    family: "gemini-3.5-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 10000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.5 Flash (High)",
  },
  {
    id: "gemini-3.5-flash-medium",
    family: "gemini-3.5-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 4000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.5 Flash (Medium)",
  },
  {
    id: "gemini-3.5-flash-low",
    family: "gemini-3.5-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 4000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.5 Flash (Low)",
  },
  {
    id: "gemini-3.1-pro-low",
    family: "gemini-3.1-pro",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 4000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.1 Pro (Low)",
  },
  {
    id: "gemini-3.1-pro-high",
    family: "gemini-3.1-pro",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65536,
    thinkingBudget: 10000,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 3.1 Pro (High)",
  },
  {
    id: "gemini-2.5-flash",
    family: "gemini-2.5-flash",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65535,
    thinkingBudget: 24576,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 2.5 Flash",
  },
  {
    id: "gemini-2.5-pro",
    family: "gemini-2.5-pro",
    ctx: 1048576,
    quotaPool: "gemini",
    multimodal: true,
    tools: true,
    maxOutputTokens: 65535,
    thinkingBudget: 1024,
    isThinking: true,
    isTiered: false,
    displayName: "Gemini 2.5 Pro",
  },
];

export class DynamicModelRegistry {
  private static instance: DynamicModelRegistry | null = null;
  private models: Map<string, DynamicModelEntry> = new Map();
  private lastUpdateTimestamp = 0;
  private latestDefaultAgentModelId: string | null = null;

  private constructor() {
    this.seedBaseline();
  }

  static getInstance(): DynamicModelRegistry {
    if (!DynamicModelRegistry.instance) {
      DynamicModelRegistry.instance = new DynamicModelRegistry();
    }
    return DynamicModelRegistry.instance;
  }

  /** Reset to baseline (primarily for tests). */
  reset(): void {
    this.models.clear();
    this.lastUpdateTimestamp = 0;
    this.latestDefaultAgentModelId = null;
    this.seedBaseline();
  }

  private seedBaseline(): void {
    for (const m of BASELINE_ANTIGRAVITY_MODELS) {
      this.models.set(m.id.toLowerCase(), { ...m });
    }
  }

  /**
   * Derive the model family and quota pool from a model ID string.
   */
  static inferFamilyAndPool(modelId: string): { family: string; quotaPool: string } {
    const l = modelId.toLowerCase();
    if (l.includes("claude") || l.includes("sonnet") || l.includes("opus")) {
      const match = l.match(/(claude-[a-z0-9.-]+)/);
      return { family: match ? match[1] : "claude", quotaPool: "claude" };
    }
    if (l.includes("gpt-oss")) {
      return { family: "gpt-oss", quotaPool: "claude" };
    }
    if (l.includes("gemini")) {
      const match = l.match(/(gemini-[0-9.]+-?[a-z]*)/);
      return { family: match ? match[1] : "gemini", quotaPool: "gemini" };
    }
    return { family: l, quotaPool: "gemini" };
  }

  /**
   * Update the dynamic registry from the response payload of fetchAvailableModels or GetAvailableModels.
   * Returns the count of newly discovered models.
   */
  updateFromEndpointResponse(data: GoogleQuotaResponse): number {
    if (!data || typeof data !== "object" || !data.models) return 0;

    let newModelsCount = 0;
    const tieredSet = new Set<string>();

    // Check tieredModelIds in response
    if (data.tieredModelIds) {
      for (const list of Object.values(data.tieredModelIds)) {
        if (Array.isArray(list)) {
          for (const id of list) tieredSet.add(id.toLowerCase());
        }
      }
    }

    if (typeof data.defaultAgentModelId === "string" && data.defaultAgentModelId) {
      this.latestDefaultAgentModelId = data.defaultAgentModelId;
    }

    for (const [rawId, info] of Object.entries(data.models)) {
      if (!rawId || typeof rawId !== "string") continue;
      // Skip internal test/telemetry placeholders that are not user-facing models
      if (rawId.startsWith("chat_") || rawId.startsWith("tab_")) continue;

      const lowerId = rawId.toLowerCase();
      const { family, quotaPool } = DynamicModelRegistry.inferFamilyAndPool(rawId);

      const ctx = typeof info.maxTokens === "number" && info.maxTokens > 0
        ? info.maxTokens
        : (family === "gpt-oss" ? 131_072 : 1_000_000);

      const maxOutputTokens = typeof info.maxOutputTokens === "number" && info.maxOutputTokens > 0
        ? info.maxOutputTokens
        : (family.includes("claude") ? 64000 : 65536);

      const isTiered = lowerId.includes("-tiered") || tieredSet.has(lowerId);

      let thinkingBudget = typeof info.thinkingBudget === "number"
        ? info.thinkingBudget
        : (isTiered ? -1 : 0);

      const isThinking = Boolean(
        info.supportsThinking ||
        thinkingBudget !== 0 ||
        isTiered ||
        lowerId.includes("thinking")
      );

      // If it supports thinking but thinkingBudget wasn't specified, use adaptive (-1) or family default
      if (isThinking && thinkingBudget === 0) {
        thinkingBudget = isTiered ? -1 : (family.includes("claude") ? 32768 : 4000);
      }

      const existing = this.models.get(lowerId);
      if (!existing) {
        newModelsCount++;
      }

      this.models.set(lowerId, {
        id: rawId,
        family,
        ctx,
        quotaPool,
        multimodal: Boolean((info.supportsImages || info.supportsVideo) ?? true),
        tools: true,
        maxOutputTokens,
        thinkingBudget,
        isThinking,
        isTiered,
        displayName: info.displayName || rawId,
      });
    }

    this.lastUpdateTimestamp = Date.now();
    return newModelsCount;
  }

  getAllModels(): DynamicModelEntry[] {
    return Array.from(this.models.values());
  }

  getModel(id: string): DynamicModelEntry | undefined {
    return this.models.get(id.toLowerCase());
  }

  getModelSpec(id: string): ModelSpec | undefined {
    const entry = this.models.get(id.toLowerCase());
    if (!entry) return undefined;
    return {
      maxOutputTokens: entry.maxOutputTokens,
      thinkingBudget: entry.thinkingBudget,
      isThinking: entry.isThinking,
      contextWindow: entry.ctx,
    };
  }

  getContextWindow(id: string): number | undefined {
    return this.models.get(id.toLowerCase())?.ctx;
  }

  isTiered(id: string): boolean {
    const l = id.toLowerCase();
    if (l.includes("-tiered")) return true;
    return this.models.get(l)?.isTiered ?? false;
  }

  resolveQuotaPool(id: string): string | undefined {
    return this.models.get(id.toLowerCase())?.quotaPool;
  }

  getQuotaAltKeys(pool: string): string[] {
    const keys: string[] = [];
    for (const entry of this.models.values()) {
      if (entry.quotaPool === pool) {
        keys.push(entry.id);
      }
    }
    return keys;
  }

  getDefaultAgentModelId(): string | null {
    return this.latestDefaultAgentModelId;
  }

  getLastUpdateTimestamp(): number {
    return this.lastUpdateTimestamp;
  }
}

export const dynamicCatalog = DynamicModelRegistry.getInstance();

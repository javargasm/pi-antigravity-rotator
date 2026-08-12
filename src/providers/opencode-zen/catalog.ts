// OpenCode Zen provider model catalog and endpoint constants.

export const OPENCODE_ZEN_BASE_URL = "https://opencode.ai/zen/v1";
export const OPENCODE_ZEN_MODELS_URL = "https://opencode.ai/zen/v1/models";
export const OPENCODE_ZEN_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";

export const OPENCODE_ZEN_FREE_MODELS = [
  "deepseek-v4-flash-free",
  "nemotron-3.5-lightning-free",
  "nemotron-3-ultra-free",
  "mimo-v2.5-free",
  "hy3-free",
  "ling-3.0-tiny-free",
  "laguna-s-2.1-free",
] as const;

export type OpenCodeZenModel = (typeof OPENCODE_ZEN_FREE_MODELS)[number];

export interface OpenCodeZenModelSpec {
  id: string;
  contextWindow: number;
  free: boolean;
}

export const OPENCODE_ZEN_CATALOG: OpenCodeZenModelSpec[] = OPENCODE_ZEN_FREE_MODELS.map(
  (id) => ({
    id,
    contextWindow: 128000,
    free: true,
  }),
);

const OPENCODE_ZEN_MODEL_SET = new Set<string>(OPENCODE_ZEN_FREE_MODELS);

export function isOpenCodeZenModel(model: string): boolean {
  if (!model) return false;
  if (OPENCODE_ZEN_MODEL_SET.has(model)) return true;
  return model.endsWith("-free");
}

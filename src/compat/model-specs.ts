import { dynamicCatalog } from "../providers/google-antigravity/dynamic-catalog.js";

export interface ModelSpec {
	maxOutputTokens: number;
	thinkingBudget: number; // -1 = adaptive (model decides), >=0 = fixed
	minThinkingBudget?: number;
	isThinking: boolean;
	/** Upstream-published context window (input tokens). Optional. */
	contextWindow?: number;
}

export const DEFAULT_MODEL_SPECS: Record<string, ModelSpec> = {
	"gemini-pro-agent":          { maxOutputTokens: 65535, thinkingBudget: 10001, isThinking: true, contextWindow: 1_000_000 },
	"gemini-3-flash-agent":      { maxOutputTokens: 65536, thinkingBudget: 10000, isThinking: true, contextWindow: 1_000_000 },
	"gemini-3-pro-high":         { maxOutputTokens: 65535, thinkingBudget: 10001, isThinking: true, contextWindow: 1_000_000 },
	"gemini-3-pro-low":          { maxOutputTokens: 65535, thinkingBudget: 1001,  isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.1-pro":            { maxOutputTokens: 65535, thinkingBudget: 10001, isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.1-pro-high":       { maxOutputTokens: 65535, thinkingBudget: 10001, isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.1-pro-low":        { maxOutputTokens: 65535, thinkingBudget: 1001,  isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.1-pro-preview":    { maxOutputTokens: 65535, thinkingBudget: 10001, isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.6-flash-high":     { maxOutputTokens: 65536, thinkingBudget: 10000, isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.6-flash-medium":   { maxOutputTokens: 65536, thinkingBudget: 4000,  isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.6-flash-low":      { maxOutputTokens: 65536, thinkingBudget: 1000,  isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.6-flash-tiered":   { maxOutputTokens: 65536, thinkingBudget: -1,    isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.7-flash-tiered":   { maxOutputTokens: 65536, thinkingBudget: -1,    isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.8-flash-high":     { maxOutputTokens: 65536, thinkingBudget: -1,    isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.8-flash-medium":   { maxOutputTokens: 65536, thinkingBudget: -1,    isThinking: true, contextWindow: 1_000_000 },
	"gemini-3.8-flash-low":      { maxOutputTokens: 65536, thinkingBudget: -1,    isThinking: true, contextWindow: 1_000_000 },
	"gemini-3-flash":            { maxOutputTokens: 65536, thinkingBudget: 4000,  isThinking: true, contextWindow: 1_000_000 },
	"gemini-2.5-flash":          { maxOutputTokens: 65535, thinkingBudget: 24576, isThinking: true, contextWindow: 1_000_000 },
	"gemini-2.5-pro":            { maxOutputTokens: 65535, thinkingBudget: 1024,  isThinking: true, contextWindow: 1_000_000 },
	"claude-sonnet-4-6":         { maxOutputTokens: 64000, thinkingBudget: 32768, isThinking: true, contextWindow: 1_000_000 },
	"claude-sonnet-4-6-thinking":{ maxOutputTokens: 64000, thinkingBudget: 32768, isThinking: true, contextWindow: 1_000_000 },
	"claude-opus-4-6-thinking":  { maxOutputTokens: 64000, thinkingBudget: 32768, isThinking: true, contextWindow: 1_000_000 },
	"claude-opus-4-6":           { maxOutputTokens: 64000, thinkingBudget: 32768, isThinking: true, contextWindow: 1_000_000 },
	"claude-sonnet-4-5":         { maxOutputTokens: 64000, thinkingBudget: 32768, isThinking: true, contextWindow: 200_000 },
	"claude-sonnet-4-5-thinking":{ maxOutputTokens: 64000, thinkingBudget: 32768, isThinking: true, contextWindow: 200_000 },
	"claude-opus-4-5":           { maxOutputTokens: 64000, thinkingBudget: 32768, isThinking: true, contextWindow: 200_000 },
	"claude-opus-4-5-thinking":  { maxOutputTokens: 64000, thinkingBudget: 32768, isThinking: true, contextWindow: 200_000 },
	"gpt-oss-120b-medium":       { maxOutputTokens: 32768, thinkingBudget: 8192,  isThinking: true, contextWindow: 131_072 },
	"gpt-oss-120b":              { maxOutputTokens: 32768, thinkingBudget: 8192,  isThinking: true, contextWindow: 131_072 },
};

let modelSpecsOverride: Record<string, ModelSpec> | null = null;

/**
 * Replace the bundled model spec table with operator-provided overrides.
 * Pass `null` to restore defaults. Called once at startup from index.ts.
 */
export function setModelSpecsOverride(specs: Record<string, ModelSpec> | null): void {
	modelSpecsOverride = specs && Object.keys(specs).length > 0
		? Object.fromEntries(
			Object.entries(specs).map(([key, spec]) => [key.toLowerCase(), spec]),
		)
		: null;
}

export function getActiveModelSpecs(): Record<string, ModelSpec> {
	return modelSpecsOverride ?? DEFAULT_MODEL_SPECS;
}

const GEMINI_MAX_OUTPUT_TOKENS = 65536;
const CLAUDE_MAX_OUTPUT_TOKENS = 64000;
const FALLBACK_THINKING_BUDGET = 24576;
const CLAUDE_DEFAULT_THINKING_BUDGET = 32768;

export function getModelFamily(model: string): "claude" | "gemini" | "unknown" {
	const l = model.toLowerCase();
	if (l.includes("claude")) return "claude";
	if (l.includes("gemini")) return "gemini";
	return "unknown";
}

/** Resolve bundled static metadata without consulting the dynamic registry. */
export function getStaticModelSpec(model: string): ModelSpec | undefined {
	const lower = model.toLowerCase();
	if (DEFAULT_MODEL_SPECS[lower]) return DEFAULT_MODEL_SPECS[lower];
	let best: { key: string; spec: ModelSpec } | undefined;
	for (const [key, spec] of Object.entries(DEFAULT_MODEL_SPECS)) {
		if (lower.includes(key) && (!best || key.length > best.key.length)) {
			best = { key, spec };
		}
	}
	return best?.spec;
}

export function getModelSpecOverride(model: string): ModelSpec | undefined {
	if (!modelSpecsOverride) return undefined;
	const lower = model.toLowerCase();
	if (modelSpecsOverride[lower]) return modelSpecsOverride[lower];
	for (const [key, spec] of Object.entries(modelSpecsOverride)) {
		if (lower.includes(key)) return spec;
	}
	return undefined;
}

export function getModelSpec(model: string): ModelSpec {
	const lower = model.toLowerCase();
	const override = getModelSpecOverride(lower);
	if (override) return override;
	const dynamicSpec = dynamicCatalog.getModelSpec(lower);
	if (dynamicSpec) return dynamicSpec;
	const staticSpec = getStaticModelSpec(lower);
	if (staticSpec) return staticSpec;
	const family = getModelFamily(model);
	if (family === "claude") return { maxOutputTokens: CLAUDE_MAX_OUTPUT_TOKENS, thinkingBudget: CLAUDE_DEFAULT_THINKING_BUDGET, isThinking: true, contextWindow: 1_000_000 };
	if (family === "gemini") return { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS, thinkingBudget: FALLBACK_THINKING_BUDGET, isThinking: true, contextWindow: 1_000_000 };
	return { maxOutputTokens: 65536, thinkingBudget: FALLBACK_THINKING_BUDGET, isThinking: false, contextWindow: 128_000 };
}

export function isThinkingModel(model: string): boolean {
	return getModelSpec(model).isThinking;
}

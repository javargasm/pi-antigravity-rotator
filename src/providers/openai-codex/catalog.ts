import type { AccountRuntime } from "../../types.js";
import { getAccountProxyDispatcher } from "../proxy-dispatcher.js";
import { getCodexAccountId, getCodexTokenState } from "./credentials.js";
import { codexBaseUrl } from "./forward.js";
import { CODEX_PROVIDER_ID } from "./oauth.js";

export interface CodexModel {
  id: string;
  contextWindow: number;
  reasoning: boolean;
  multimodal: boolean;
  tools: boolean;
  source: "allowlist" | "discovered";
}

// Only models validated by the initial unauthenticated/public spike are in the
// safe base list. Authenticated discovery can add provider-reported IDs.
const CODEX_CONTEXT_WINDOW = 272_000;
export const CODEX_BASE_MODELS: readonly CodexModel[] = [
  { id: "gpt-5.6-sol", contextWindow: CODEX_CONTEXT_WINDOW, reasoning: true, multimodal: true, tools: true, source: "allowlist" },
  { id: "gpt-5.6-terra", contextWindow: CODEX_CONTEXT_WINDOW, reasoning: true, multimodal: true, tools: true, source: "allowlist" },
  { id: "gpt-5.6-luna", contextWindow: CODEX_CONTEXT_WINDOW, reasoning: true, multimodal: true, tools: true, source: "allowlist" },
];

let discoveredModels: CodexModel[] = [];

export function isCodexModel(model: string): boolean {
  return getCodexModel(model) !== undefined;
}

export function getCodexModel(model: string): CodexModel | undefined {
  const normalized = model.trim().toLowerCase();
  return [...discoveredModels, ...CODEX_BASE_MODELS].find(
    (entry) => entry.id.toLowerCase() === normalized,
  );
}

export function getCodexModels(): CodexModel[] {
  const merged = new Map<string, CodexModel>();
  for (const entry of [...CODEX_BASE_MODELS, ...discoveredModels]) merged.set(entry.id, entry);
  return [...merged.values()];
}

export function setDiscoveredCodexModels(models: CodexModel[]): void {
  discoveredModels = models.filter((model) => isSafeModelId(model.id));
}

function isSafeModelId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
}

function parseModel(value: unknown): CodexModel | null {
  if (typeof value === "string") {
    return isSafeModelId(value)
      ? { id: value, contextWindow: CODEX_CONTEXT_WINDOW, reasoning: true, multimodal: true, tools: true, source: "discovered" }
      : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = record.id ?? record.model ?? record.name;
  if (!isSafeModelId(id)) return null;
  const contextWindow = [record.context_window, record.contextWindow, record.context_length]
    .find((candidate) => typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0);
  return {
    id,
    contextWindow: typeof contextWindow === "number" ? Math.min(contextWindow, 2_000_000) : CODEX_CONTEXT_WINDOW,
    reasoning: record.reasoning !== false,
    multimodal: record.multimodal !== false && record.vision !== false,
    tools: record.tools !== false && record.tool_calling !== false,
    source: "discovered",
  };
}

export async function fetchCodexCatalog(
  account: AccountRuntime,
  signal?: AbortSignal,
): Promise<CodexModel[]> {
  const token = getCodexTokenState(account).accessToken;
  if (!token) return getCodexModels();
  const base = codexBaseUrl();
  const endpoint = base.endsWith("/models") ? base : `${base}/models`;
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    const accountId = getCodexAccountId(account.config);
    if (accountId) headers["chatgpt-account-id"] = accountId;
    const response = await fetch(endpoint, {
      headers,
      signal: signal ?? AbortSignal.timeout(8_000),
      dispatcher: getAccountProxyDispatcher(account, CODEX_PROVIDER_ID),
    } as RequestInit & { dispatcher?: unknown });
    if (!response.ok) return getCodexModels();
    const data = await response.json() as Record<string, unknown>;
    const raw = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
    const parsed = raw.map(parseModel).filter((model): model is CodexModel => model !== null);
    if (parsed.length > 0) setDiscoveredCodexModels(parsed);
  } catch {
    // Discovery is optional; the safe allowlist remains available.
  }
  return getCodexModels();
}

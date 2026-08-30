#!/usr/bin/env tsx
// Verifica qué modelos de Ollama Cloud están activos y detecta nuevos modelos.
//
// Uso:
//   DATABASE_URL=<url> tsx scripts/verify_ollama_models.ts
//   # o, si accounts.json está en disco:
//   tsx scripts/verify_ollama_models.ts
//
// Qué hace:
//   1. Carga cuentas Ollama desde PostgreSQL (o accounts.json si no hay DB).
//   2. Llama GET /api/tags para discovery activo del catálogo publicado.
//   3. Para cada modelo (conocido + nuevo), hace una probe mínima con /api/chat:
//      - cuenta free → 200 = free, 403 = subscription-only, 404 = removido
//   4. Imprime un reporte con cambios sugeridos para src/types.ts.

import { initDb, getCachedConfig, closeDb } from "../src/db-store.js";
import {
  OLLAMA_TAGS_URL,
  OLLAMA_CHAT_ENDPOINTS,
  OLLAMA_USER_AGENT,
  MODEL_TIER_ACCESS,
  MODEL_PRICING,
  type ModelTierAccess,
} from "../src/types.js";
import { getOllamaApiKey } from "../src/providers/ollama/credentials.js";
import type { AccountConfig } from "../src/types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

interface TagsResponse {
  models?: Array<{ name: string; model?: string }>;
}

interface OllamaModel {
  id: string;
  tag: string | null; // null para modelos sin ":" (minimax-m3, kimi-k3, etc.)
}

function parseOllamaModelName(name: string): OllamaModel {
  const colon = name.lastIndexOf(":");
  if (colon === -1) return { id: name, tag: null };
  return { id: name, tag: name.slice(colon + 1) };
}

/** Filtra cuentas que tienen credencial Ollama con apiKey. */
function getOllamaAccounts(accounts: AccountConfig[]): AccountConfig[] {
  return accounts.filter((a) => {
    const key = getOllamaApiKey(a);
    return typeof key === "string" && key.trim().length > 0;
  });
}

/** GET /api/tags → lista de nombres de modelos publicados en Ollama Cloud. */
async function fetchPublishedModels(apiKey: string): Promise<string[]> {
  const res = await fetch(OLLAMA_TAGS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": OLLAMA_USER_AGENT,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`/api/tags returned HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as TagsResponse;
  const models = data.models ?? [];
  // Cada entrada puede tener "name" o "model" como campo principal
  return models.map((m) => (m.model ?? m.name ?? "").trim()).filter(Boolean);
}

/** POST /api/chat con prompt mínimo. Devuelve el status HTTP. */
async function probeModel(apiKey: string, model: string): Promise<number> {
  const payload = JSON.stringify({
    model,
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    options: { num_predict: 1 },
  });
  try {
    const res = await fetch(OLLAMA_CHAT_ENDPOINTS[0], {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": OLLAMA_USER_AGENT,
        "Content-Type": "application/json",
      },
      body: payload,
      signal: AbortSignal.timeout(20_000),
    });
    return res.status;
  } catch {
    return 0; // timeout / network error
  }
}

/** Convierte input_cost_per_token (LiteLLM) → USD per 1M para el codebase. */
function perToken2perMillion(v: number): number {
  return Math.round(v * 1_000_000 * 10000) / 10000;
}

/** Busca pricing en el JSON de LiteLLM para un modelo Ollama por heurística. */
async function fetchLiteLLMPricing(
  modelId: string,
): Promise<{ inputPer1M: number; outputPer1M: number } | null> {
  // Los modelos GLM de Ollama Cloud corresponden a la familia "zai/" en LiteLLM.
  // Ej: "glm-5.3" → "zai/glm-5.3", "glm-5.3-flash" → "zai/glm-5.3-flash"
  // Para minimax: "minimax-m3" → "minimax/MiniMax-M3" o "fireworks_ai/minimax-m3"
  // Intentamos varios prefijos en orden de preferencia.
  const baseId = modelId.includes(":") ? modelId.split(":")[0] : modelId;
  const candidates = [
    `zai/${baseId}`,
    `fireworks_ai/${baseId.replace(/\./g, "p")}`, // glm-5.3 → glm-5p3
    `fireworks_ai/accounts/fireworks/models/${baseId.replace(/\./g, "p")}`,
    `minimax/${baseId}`,
    `openrouter/minimax/${baseId}`,
    `novita/zai-org/${baseId}`,
    `novita/minimax/${baseId}`,
  ];

  try {
    const url =
      "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<
      string,
      { input_cost_per_token?: number; output_cost_per_token?: number }
    >;

    for (const candidate of candidates) {
      const entry = data[candidate];
      if (
        entry &&
        typeof entry.input_cost_per_token === "number" &&
        typeof entry.output_cost_per_token === "number"
      ) {
        return {
          inputPer1M: perToken2perMillion(entry.input_cost_per_token),
          outputPer1M: perToken2perMillion(entry.output_cost_per_token),
        };
      }
    }
  } catch {
    // fallo de red o parse → retornar null
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Cargar config
  await initDb();
  const config = getCachedConfig();
  if (!config || !config.accounts || config.accounts.length === 0) {
    console.error("No se pudo cargar la configuración. Verifica DATABASE_URL o accounts.json.");
    process.exit(1);
  }

  const ollamaAccounts = getOllamaAccounts(config.accounts);
  if (ollamaAccounts.length === 0) {
    console.error("No hay cuentas Ollama configuradas.");
    process.exit(1);
  }

  console.log(`Cuentas Ollama encontradas: ${ollamaAccounts.length}`);
  const primaryKey = getOllamaApiKey(ollamaAccounts[0])!;

  // 2. Discovery via /api/tags
  console.log("\nObteniendo catálogo via /api/tags...");
  let publishedModels: string[] = [];
  try {
    publishedModels = await fetchPublishedModels(primaryKey);
    console.log(`  → ${publishedModels.length} modelos publicados en /api/tags`);
  } catch (err) {
    console.error(`  ERROR al llamar /api/tags: ${err}`);
    process.exit(1);
  }

  const publishedSet = new Set(publishedModels);
  const knownModels = Object.keys(MODEL_TIER_ACCESS);

  // Modelos nuevos: en /api/tags pero no en MODEL_TIER_ACCESS
  const newModels = publishedModels.filter((m) => !MODEL_TIER_ACCESS[m]);
  // Modelos removidos: en MODEL_TIER_ACCESS pero no en /api/tags
  const removedModels = knownModels.filter((m) => !publishedSet.has(m));
  // Modelos conocidos que siguen publicados
  const existingModels = knownModels.filter((m) => publishedSet.has(m));

  // 3. Probar tier de modelos (existentes + nuevos), usando la primera cuenta
  const allToProbe = [...existingModels, ...newModels];

  console.log(`\nProbando ${allToProbe.length} modelos via /api/chat (probe mínima)...`);
  console.log("  (esto puede tardar ~20s por modelo)\n");

  const results: Record<string, { status: number; tier: ModelTierAccess | "removed" | "unknown" }> =
    {};

  for (const model of allToProbe) {
    process.stdout.write(`  Probando ${model.padEnd(30)} ...`);
    const status = await probeModel(primaryKey, model);

    let tier: ModelTierAccess | "removed" | "unknown";
    if (status === 200) {
      tier = "free";
    } else if (status === 402 || status === 403) {
      // 402 = Payment Required: modelo existe pero requiere suscripción de pago
      // 403 = Forbidden: variante del mismo caso
      tier = "subscription";
    } else if (status === 404) {
      tier = "removed";
    } else if (status === 401) {
      // 401 = clave inválida — no debería ocurrir si /api/tags funcionó
      tier = "unknown";
    } else {
      tier = "unknown";
    }

    results[model] = { status, tier };
    const label =
      status === 200
        ? "✓ 200 (free)"
        : status === 402 || status === 403
          ? `○ ${status} (subscription)`
          : status === 404
            ? "✗ 404 (removido)"
            : status === 401
              ? `⚠ 401 (clave inválida)`
              : `? ${status} (inconcluso)`;
    console.log(label);
  }

  // 4. Buscar pricing en LiteLLM para modelos nuevos
  const newPricing: Record<string, { inputPer1M: number; outputPer1M: number } | null> = {};
  if (newModels.length > 0) {
    console.log("\nBuscando pricing en LiteLLM para modelos nuevos...");
    for (const model of newModels) {
      process.stdout.write(`  ${model.padEnd(30)} ...`);
      const pricing = await fetchLiteLLMPricing(model);
      newPricing[model] = pricing;
      if (pricing) {
        console.log(`$${pricing.inputPer1M}/$${pricing.outputPer1M} per 1M`);
      } else {
        console.log("NO ENCONTRADO en LiteLLM");
      }
    }
  }

  // 5. Reporte final
  console.log("\n" + "=".repeat(60));
  console.log("REPORTE DE ESTADO — OLLAMA CLOUD MODELS");
  console.log("=".repeat(60));

  // Modelos existentes con cambio de tier
  const tierChanges = existingModels.filter((m) => {
    const currentTier = MODEL_TIER_ACCESS[m];
    const probedTier = results[m]?.tier;
    return probedTier && probedTier !== "unknown" && probedTier !== "removed" && probedTier !== currentTier;
  });

  console.log("\n▸ MODELOS ACTIVOS (sin cambio de tier):");
  for (const model of existingModels) {
    const r = results[model];
    if (!r || r.tier === "unknown" || tierChanges.includes(model)) continue;
    const tag = r.tier === "free" ? "free       " : "subscription";
    console.log(`    ${model.padEnd(28)} ${tag}  HTTP ${r.status}`);
  }

  if (tierChanges.length > 0) {
    console.log("\n▸ CAMBIO DE TIER (requieren actualización):");
    for (const model of tierChanges) {
      const r = results[model];
      const oldTier = MODEL_TIER_ACCESS[model];
      console.log(`    ${model.padEnd(28)} ${oldTier} → ${r?.tier}  HTTP ${r?.status}`);
    }
  }

  if (newModels.length > 0) {
    console.log("\n▸ MODELOS NUEVOS (no están en el código):");
    for (const model of newModels) {
      const r = results[model];
      const p = newPricing[model];
      const tierLabel = r?.tier ?? "unknown";
      const priceLabel = p
        ? `  pricing: $${p.inputPer1M}/$${p.outputPer1M} per 1M`
        : "  pricing: NO ENCONTRADO en LiteLLM";
      console.log(`    ${model.padEnd(28)} ${tierLabel}${priceLabel}`);
    }
  }

  if (removedModels.length > 0) {
    console.log("\n▸ MODELOS REMOVIDOS (en código pero no en /api/tags):");
    for (const model of removedModels) {
      const currentTier = MODEL_TIER_ACCESS[model];
      const hasPricing = !!MODEL_PRICING[model];
      console.log(
        `    ${model.padEnd(28)} (era ${currentTier}, pricing=${hasPricing})`,
      );
    }
  }

  // Resultados inconclusos
  const inconclusive = allToProbe.filter((m) => results[m]?.tier === "unknown");
  if (inconclusive.length > 0) {
    console.log("\n▸ RESULTADOS INCONCLUSOS (timeout/error de red):");
    for (const model of inconclusive) {
      console.log(`    ${model.padEnd(28)} HTTP ${results[model]?.status}`);
    }
  }

  // 6. Sugerencias de cambios en código
  console.log("\n" + "=".repeat(60));
  console.log("CAMBIOS SUGERIDOS PARA src/types.ts");
  console.log("=".repeat(60));

  if (removedModels.length === 0 && newModels.length === 0 && tierChanges.length === 0) {
    console.log("\n  ✓ No se requieren cambios. El catálogo está actualizado.");
  }

  if (removedModels.length > 0) {
    console.log("\n  REMOVER de MODEL_PRICING y MODEL_TIER_ACCESS:");
    for (const model of removedModels) {
      console.log(`    "${model}"`);
    }
  }

  if (tierChanges.length > 0) {
    console.log("\n  ACTUALIZAR tier en MODEL_TIER_ACCESS:");
    for (const model of tierChanges) {
      const oldTier = MODEL_TIER_ACCESS[model];
      const newTier = results[model]?.tier;
      console.log(`    "${model}": "${oldTier}" → "${newTier}"`);
    }
  }

  if (newModels.length > 0) {
    console.log("\n  AGREGAR a MODEL_PRICING:");
    for (const model of newModels) {
      const p = newPricing[model];
      if (p) {
        console.log(
          `    "${model}": { inputPer1M: ${p.inputPer1M}, outputPer1M: ${p.outputPer1M} },`,
        );
      } else {
        console.log(`    "${model}": { inputPer1M: ???, outputPer1M: ??? },  // pricing NO encontrado`);
      }
    }

    console.log("\n  AGREGAR a MODEL_TIER_ACCESS:");
    for (const model of newModels) {
      const tier = results[model]?.tier ?? "unknown";
      if (tier === "free" || tier === "subscription") {
        console.log(`    "${model}": "${tier}",`);
      } else {
        console.log(`    "${model}": "???",  // tier inconcluso`);
      }
    }
  }

  console.log("");
  await closeDb();
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});

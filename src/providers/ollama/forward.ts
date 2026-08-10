// Ollama Cloud request forwarding: `POST /api/chat` (NDJSON streaming).
//
// Ported from the ollama-rotator project (same author) into the
// tuxevil-rotator provider layer.

import {
  applyModelAlias,
  OLLAMA_CHAT_URL,
  OLLAMA_USER_AGENT,
} from "../../types.js";
import type { AccountRuntime } from "../../types.js";
import type { ForwardedResponse, RequestBody } from "../../proxy.js";
import { isRecord } from "../../compat/schema-sanitizer.js";
import type { StreamAccumulator, TokenUsage } from "../adapter.js";

const OLLAMA_BENCHMARK_MODEL = "gpt-oss:20b";

/**
 * Forward a request to Ollama Cloud. The payload shape matches Ollama's
 * native `/api/chat` (messages, stream, tools, options); OpenAI-style
 * bodies are translated by the compat layer before this function.
 */
export function buildOllamaPayload(body: RequestBody): Record<string, unknown> {
  const request = isRecord(body.request) ? body.request : {};
  const payload: Record<string, unknown> = {
    model: applyModelAlias(body.model),
    messages: Array.isArray(request.messages) ? request.messages : [],
    stream: request.stream === false ? false : true,
  };
  if (Array.isArray(request.tools) && request.tools.length > 0) {
    payload.tools = request.tools;
  }
  if (isRecord(request.options)) {
    payload.options = request.options;
  }
  return payload;
}

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
  "forwarded",
  "via",
]);

/** Forward `POST /api/chat` with the account's Ollama API key. */
export async function forwardRequest(
  account: AccountRuntime,
  body: RequestBody,
  originalHeaders: Record<string, string>,
  signal?: AbortSignal,
): Promise<ForwardedResponse> {
  const payload = buildOllamaPayload(body);
  const requestBody = JSON.stringify(payload);

  const forwardHeaders: Record<string, string> = {
    ...originalHeaders,
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
  };
  for (const key of Object.keys(forwardHeaders)) {
    const lowerKey = key.toLowerCase();
    if (HOP_BY_HOP.has(lowerKey) || lowerKey === "authorization") {
      delete forwardHeaders[key];
    }
  }
  forwardHeaders["Authorization"] = `Bearer ${account.config.apiKey}`;
  forwardHeaders["User-Agent"] = OLLAMA_USER_AGENT;
  delete forwardHeaders["host"];
  delete forwardHeaders["connection"];
  delete forwardHeaders["transfer-encoding"];
  delete forwardHeaders["content-length"];

  const response = await fetch(OLLAMA_CHAT_URL, {
    method: "POST",
    headers: forwardHeaders,
    body: requestBody,
    signal,
  });

  return { response, endpoint: OLLAMA_CHAT_URL };
}

/** Max bytes kept in the NDJSON buffer. */
const NDJSON_BUFFER_MAX = 1024 * 1024;

/**
 * Parse one Ollama NDJSON line: accumulate message content and, on the
 * final `done` record, capture token usage.
 */
export function extractOllamaUsageFromLine(
  parsed: Record<string, unknown>,
): TokenUsage | null {
  if (parsed.done !== true) return null;
  const inputTokens =
    typeof parsed.prompt_eval_count === "number" ? parsed.prompt_eval_count : 0;
  const outputTokens =
    typeof parsed.eval_count === "number" ? parsed.eval_count : 0;
  return inputTokens > 0 || outputTokens > 0
    ? { inputTokens, outputTokens }
    : null;
}

/** NDJSON line-split accumulator implementing the StreamAccumulator contract. */
export class OllamaNdjsonAccumulator implements StreamAccumulator {
  private buffer = "";
  private accumulatedText = "";
  private readonly maxBytes: number;

  constructor(maxBytes: number = NDJSON_BUFFER_MAX) {
    this.maxBytes = maxBytes;
  }

  append(chunkText: string): TokenUsage | null {
    this.buffer += chunkText;
    if (this.buffer.length > this.maxBytes) {
      this.buffer = this.buffer.slice(-this.maxBytes);
    }
    let extracted: TokenUsage | null = null;
    let newlineIdx = this.buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!line) {
        newlineIdx = this.buffer.indexOf("\n");
        continue;
      }
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const usage = extractOllamaUsageFromLine(parsed);
        if (usage && !extracted) extracted = usage;
        const message = isRecord(parsed.message) ? parsed.message : null;
        const text =
          message && typeof message.content === "string"
            ? message.content
            : "";
        if (text && this.accumulatedText.length < 100000) {
          this.accumulatedText += text;
        }
      } catch {
        // Ignore malformed NDJSON lines
      }
      newlineIdx = this.buffer.indexOf("\n");
    }
    return extracted;
  }

  getText(): string {
    return this.accumulatedText;
  }

  final(): TokenUsage | null {
    const line = this.buffer.trim();
    this.buffer = "";
    if (!line) return null;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const usage = extractOllamaUsageFromLine(parsed);
      const message = isRecord(parsed.message) ? parsed.message : null;
      const text =
        message && typeof message.content === "string" ? message.content : "";
      if (text && this.accumulatedText.length < 100000) {
        this.accumulatedText += text;
      }
      return usage;
    } catch {
      return null;
    }
  }
}

const BENCHMARK_PROMPT = "Reply with exactly: OK";
const BENCHMARK_MAX_OUTPUT_TOKENS = 16;

function benchmarkUsage(raw: string): { outputTokens: number } | null {
  let outputTokens = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed.done === true && typeof parsed.eval_count === "number") {
        outputTokens = parsed.eval_count;
      }
    } catch {
      // Ignore malformed NDJSON lines
    }
  }
  return { outputTokens };
}

function benchmarkText(raw: string): string {
  let text = "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const message = isRecord(parsed.message) ? parsed.message : null;
      const content =
        message && typeof message.content === "string" ? message.content : "";
      if (content) text += content;
    } catch {
      // Ignore malformed NDJSON lines
    }
  }
  return text;
}

/**
 * Benchmark spec for Ollama accounts: chat with the cheapest calibrated
 * model and read eval_count from the terminal NDJSON record.
 */
export function getBenchmarkSpec(): {
  body: RequestBody;
  parseUsage(raw: string): { outputTokens: number } | null;
  parseText(raw: string): string;
} {
  return {
    body: {
      project: "",
      model: OLLAMA_BENCHMARK_MODEL,
      request: {
        messages: [{ role: "user", content: BENCHMARK_PROMPT }],
        options: { num_predict: BENCHMARK_MAX_OUTPUT_TOKENS },
        stream: false,
      },
    },
    parseUsage: benchmarkUsage,
    parseText: benchmarkText,
  };
}
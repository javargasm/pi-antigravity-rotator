import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { RequestBody } from "../../proxy.js";
import { flattenHeaders, withRotation } from "../../proxy.js";
import type { AccountRotator } from "../../rotator.js";
import type { OpenAIChatCompletionRequest, OpenAIResponsesRequest, CompatCompletion, OpenAIToolCall } from "../google-antigravity/translators.js";
import { buildRotatorResponseHeaders } from "../../response-headers.js";
import { buildCodexPayload, extractCodexUsage } from "./forward.js";
import { sanitizeCodexResponsesRequest } from "./forward.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function writeJson(res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(value));
}

function messageContent(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return value ?? "";
  return value.map((part) => {
    if (!isRecord(part)) return part;
    if (part.type === "text" || part.type === "input_text") return { type: "input_text", text: part.text ?? "" };
    if (part.type === "image_url" && isRecord(part.image_url)) return { type: "input_image", image_url: part.image_url.url };
    return part;
  });
}

/** Convert OpenAI Chat Completions messages into native Responses input items. */
export function chatToCodexResponsesRequest(request: OpenAIChatCompletionRequest): Record<string, unknown> {
  const input: unknown[] = [];
  for (const message of request.messages) {
    const item = message as unknown as Record<string, unknown>;
    const role = typeof item.role === "string" ? item.role : "user";
    if (role === "tool") {
      input.push({ type: "function_call_output", call_id: item.tool_call_id, output: String(item.content ?? "") });
      continue;
    }
    if (Array.isArray(item.tool_calls)) {
      for (const call of item.tool_calls) {
        if (!isRecord(call) || !isRecord(call.function)) continue;
        input.push({
          type: "function_call",
          call_id: call.id,
          name: call.function.name,
          arguments: typeof call.function.arguments === "string" ? call.function.arguments : JSON.stringify(call.function.arguments ?? {}),
        });
      }
      if (!item.content) continue;
    }
    input.push({ role: role === "system" ? "developer" : role, content: messageContent(item.content) });
  }
  const result: Record<string, unknown> = {
    model: request.model,
    input,
    stream: request.stream === true,
    store: false,
  };
  if (Array.isArray(request.tools) && request.tools.length > 0) result.tools = request.tools;
  if (request.tool_choice !== undefined) result.tool_choice = request.tool_choice;
  const raw = request as unknown as Record<string, unknown>;
  const maxTokens = raw.max_completion_tokens ?? raw.max_tokens;
  if (typeof maxTokens === "number") result.max_output_tokens = maxTokens;
  if (isRecord(raw.reasoning)) result.reasoning = raw.reasoning;
  else if (typeof raw.reasoning_effort === "string") result.reasoning = { effort: raw.reasoning_effort };
  return sanitizeCodexResponsesRequest(result, request.model);
}

export function parseCodexResponse(raw: string): CompatCompletion {
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { /* stream-like response */ }
  const output = Array.isArray(parsed.output) ? parsed.output : [];
  let text = "";
  let thinkingText = "";
  const toolCalls: OpenAIToolCall[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (!isRecord(content)) continue;
        if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") text += content.text;
        if (content.type === "refusal" && typeof content.refusal === "string") text += content.refusal;
      }
    }
    if (item.type === "reasoning" && Array.isArray(item.summary)) {
      for (const summary of item.summary) if (isRecord(summary) && typeof summary.text === "string") thinkingText += summary.text;
    }
    if (item.type === "function_call") {
      toolCalls.push({
        id: typeof item.call_id === "string" ? item.call_id : `call_${toolCalls.length}`,
        type: "function",
        function: { name: typeof item.name === "string" ? item.name : "unknown", arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}) },
      });
    }
  }
  if (!text && typeof parsed.output_text === "string") text = parsed.output_text;
  const usage = extractCodexUsage(raw);
  return {
    text,
    thinkingText: thinkingText || undefined,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    rawResponse: parsed,
  };
}

function upstreamHeaders(response: Response, context: { account?: { healthScore: number }; requestStartMs: number; label: string; retries: number }, model: string): Record<string, string> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    if (key !== "connection" && key !== "transfer-encoding" && key !== "content-length") headers[key] = value;
  });
  Object.assign(headers, buildRotatorResponseHeaders({
    accountLabel: context.label,
    model,
    ttfbMs: Date.now() - context.requestStartMs,
    healthScore: context.account?.healthScore,
    retries: context.retries,
    routingPolicy: "timer-first",
  }));
  return headers;
}

async function pipeNativeResponses(
  response: Response,
  req: IncomingMessage,
  res: ServerResponse,
  context: { account?: { healthScore: number }; requestStartMs: number; label: string; retries: number },
  model: string,
): Promise<void> {
  res.writeHead(response.status, upstreamHeaders(response, context, model));
  if (!response.body) { res.end(); return; }
  const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  const close = (): void => { if (!stream.destroyed) stream.destroy(); };
  req.once("close", close);
  try { for await (const chunk of stream) { if (!res.writableEnded) res.write(chunk); } }
  finally { req.off("close", close); if (!res.writableEnded) res.end(); }
}

function emitChatChunk(res: ServerResponse, model: string, id: string, delta: Record<string, unknown>, finishReason: string | null = null, usage?: Record<string, number>): void {
  res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finishReason }], ...(usage ? { usage } : {}) })}\n\n`);
}

async function pipeCodexAsChat(
  response: Response,
  req: IncomingMessage,
  res: ServerResponse,
  model: string,
  context: { account?: { healthScore: number }; requestStartMs: number; label: string; retries: number },
): Promise<void> {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", ...upstreamHeaders(response, context, model) });
  const id = `chatcmpl-${Date.now().toString(36)}`;
  emitChatChunk(res, model, id, { role: "assistant" });
  if (!response.body) { emitChatChunk(res, model, id, {}, "stop"); res.end("data: [DONE]\n\n"); return; }
  const stream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  let buffer = "";
  let eventName = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let toolIndex = 0;
  const close = (): void => { if (!stream.destroyed) stream.destroy(); };
  req.once("close", close);
  const handle = (payload: string, event: string): void => {
    let data: Record<string, unknown>;
    try { data = JSON.parse(payload) as Record<string, unknown>; } catch { return; }
    const delta = typeof data.delta === "string" ? data.delta : "";
    if (event === "response.output_text.delta" && delta) emitChatChunk(res, model, id, { content: delta });
    if (event === "response.reasoning_summary_text.delta" && delta) emitChatChunk(res, model, id, { reasoning_content: delta });
    if (event === "response.output_item.added" && isRecord(data.item) && data.item.type === "function_call") {
      const item = data.item;
      emitChatChunk(res, model, id, { tool_calls: [{ index: toolIndex, id: item.call_id, type: "function", function: { name: item.name, arguments: "" } }] });
      toolIndex++;
    }
    if (event === "response.function_call_arguments.delta" && delta) emitChatChunk(res, model, id, { tool_calls: [{ index: Math.max(0, toolIndex - 1), function: { arguments: delta } }] });
    if (event === "response.completed" && isRecord(data.response)) {
      const usage = extractCodexUsage(JSON.stringify(data.response));
      inputTokens = usage?.inputTokens ?? inputTokens;
      outputTokens = usage?.outputTokens ?? outputTokens;
    }
  };
  try {
    for await (const chunk of stream) {
      buffer += chunk.toString();
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) handle(line.slice(5).trim(), eventName);
        newline = buffer.indexOf("\n");
      }
    }
  } finally { req.off("close", close); }
  emitChatChunk(res, model, id, {}, toolIndex > 0 ? "tool_calls" : "stop");
  if (inputTokens > 0 || outputTokens > 0) emitChatChunk(res, model, id, {}, null, { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens });
  res.end("data: [DONE]\n\n");
}

export async function serveCodexResponses(
  req: IncomingMessage,
  res: ServerResponse,
  rotator: AccountRotator,
  request: OpenAIResponsesRequest,
): Promise<void> {
  const body: RequestBody = { project: "", model: request.model, request: buildCodexPayload({ project: "", model: request.model, request }) };
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  req.once("aborted", abort);
  res.once("close", abort);
  try {
    const outcome = await withRotation(rotator, request.model, flattenHeaders(req.headers), body, async (response, context) => {
      if (request.stream) {
        await pipeNativeResponses(response, req, res, context, request.model);
        return { text: "", inputTokens: 0, outputTokens: 0 } as CompatCompletion;
      }
      const raw = await response.text();
      const headers = upstreamHeaders(response, context, request.model);
      writeJson(res, response.status, JSON.parse(raw) as unknown, headers);
      return parseCodexResponse(raw);
    }, controller.signal);
    if (!outcome.ok && !res.headersSent) writeJson(res, outcome.status, { error: { message: outcome.errorText, type: "upstream_error" } });
  } finally {
    req.off("aborted", abort);
    res.off("close", abort);
  }
}

export async function serveCodexChat(
  req: IncomingMessage,
  res: ServerResponse,
  rotator: AccountRotator,
  request: OpenAIChatCompletionRequest,
): Promise<void> {
  const codexRequest = chatToCodexResponsesRequest(request);
  const body: RequestBody = { project: "", model: request.model, request: codexRequest };
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  req.once("aborted", abort);
  res.once("close", abort);
  try {
    const outcome = await withRotation(rotator, request.model, flattenHeaders(req.headers), body, async (response, context) => {
      if (request.stream) {
        await pipeCodexAsChat(response, req, res, request.model, context);
        return { text: "", inputTokens: 0, outputTokens: 0 } as CompatCompletion;
      }
      const raw = await response.text();
      const completion = parseCodexResponse(raw);
      const hasTools = Boolean(completion.toolCalls?.length);
      writeJson(res, response.status, {
        id: `chatcmpl-${Date.now().toString(36)}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: request.model,
        choices: [{ index: 0, message: { role: "assistant", content: hasTools ? null : completion.text, ...(hasTools ? { tool_calls: completion.toolCalls } : {}), ...(completion.thinkingText ? { reasoning_content: completion.thinkingText } : {}) }, finish_reason: hasTools ? "tool_calls" : "stop" }],
        usage: { prompt_tokens: completion.inputTokens, completion_tokens: completion.outputTokens, total_tokens: completion.inputTokens + completion.outputTokens },
      }, upstreamHeaders(response, context, request.model));
      return completion;
    }, controller.signal);
    if (!outcome.ok && !res.headersSent) writeJson(res, outcome.status, { error: { message: outcome.errorText, type: "upstream_error" } });
  } finally {
    req.off("aborted", abort);
    res.off("close", abort);
  }
}

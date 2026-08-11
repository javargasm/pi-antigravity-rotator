import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildOllamaPayload } from "../src/providers/ollama/forward.js";
import { googleAntigravityAdapter } from "../src/providers/google-antigravity/index.js";
import { ollamaAdapter } from "../src/providers/ollama/index.js";
import type { AccountRuntime } from "../src/types.js";
import type { RequestBody } from "../src/proxy.js";

const quotaTestAccount = {} as AccountRuntime;

function bodyWithMessages(
  messages: Array<Record<string, unknown>>,
): RequestBody {
  return {
    project: "",
    model: "gpt-oss:20b",
    request: { messages },
  };
}

describe("buildOllamaPayload content normalization (port of ollama-rotator ec5fa5a)", () => {
	it("declares account-scoped quota recovery for Google and Ollama", () => {
		assert.equal(
			googleAntigravityAdapter.shouldRetryOnQuotaExhaustion(
				quotaTestAccount,
				"gemini-3-flash",
				"RESOURCE_EXHAUSTED",
			),
			true,
		);
		assert.equal(
			ollamaAdapter.shouldRetryOnQuotaExhaustion(
				quotaTestAccount,
				"gpt-oss:20b",
				"RESOURCE_EXHAUSTED",
			),
			true,
		);
	});

	it("flattens text content arrays to a plain string", () => {
		const payload = buildOllamaPayload(
			bodyWithMessages([{ role: "user", content: [{ type: "text", text: "hello" }] }]),
		);
		const messages = payload.messages as Array<Record<string, unknown>>;
		assert.equal(messages[0].content, "hello");
		assert.equal(messages[0].images, undefined);
	});

	it("moves image_url blocks to the native images field", () => {
		const payload = buildOllamaPayload(
			bodyWithMessages([
				{
					role: "user",
					content: [
						{ type: "text", text: "see this" },
						{
							type: "image_url",
							image_url: { url: "data:image/png;base64,AAAA" },
						},
					],
				},
			]),
		);
		const messages = payload.messages as Array<Record<string, unknown>>;
		assert.equal(messages[0].content, "see this");
		assert.deepEqual(messages[0].images, ["data:image/png;base64,AAAA"]);
	});

	it("joins multiple text blocks with newlines", () => {
		const payload = buildOllamaPayload(
			bodyWithMessages([
				{
					role: "user",
					content: [
						{ type: "text", text: "line one" },
						{ type: "text", text: "line two" },
					],
				},
			]),
		);
		const messages = payload.messages as Array<Record<string, unknown>>;
		assert.equal(messages[0].content, "line one\nline two");
	});

	it("keeps plain string content and preserves existing images", () => {
		const payload = buildOllamaPayload(
			bodyWithMessages([
				{
					role: "assistant",
					content: "plain string stays as-is",
					images: ["pre-existing"],
				},
			]),
		);
		const messages = payload.messages as Array<Record<string, unknown>>;
		assert.equal(messages[0].content, "plain string stays as-is");
		assert.deepEqual(messages[0].images, ["pre-existing"]);
	});

	it("appends image_url blocks to existing images", () => {
		const payload = buildOllamaPayload(
			bodyWithMessages([
				{
					role: "user",
					content: [
						{ type: "text", text: "both" },
						{
							type: "image_url",
							image_url: { url: "data:image/png;base64,BBBB" },
						},
					],
					images: ["data:image/png;base64,AAAA"],
				},
			]),
		);
		const messages = payload.messages as Array<Record<string, unknown>>;
		assert.equal(messages[0].content, "both");
		assert.deepEqual(messages[0].images, [
			"data:image/png;base64,AAAA",
			"data:image/png;base64,BBBB",
		]);
	});

	it("flattens non-array, non-string content to a plain string", () => {
		const payload = buildOllamaPayload(
			bodyWithMessages([{ role: "user", content: { whatever: "shape" } }]),
		);
		const messages = payload.messages as Array<Record<string, unknown>>;
		assert.equal(messages[0].content, "");
	});

	it("normalizes every message and leaves tools/options untouched", () => {
		const body = bodyWithMessages([
			{ role: "user", content: [{ type: "text", text: "hello" }] },
			{ role: "assistant", content: "plain string stays as-is" },
		]);
		const request = body.request as {
			messages: Array<Record<string, unknown>>;
			options?: Record<string, unknown>;
			tools?: Array<Record<string, unknown>>;
			stream?: boolean;
		};
		request.options = { num_predict: 64 };
		request.tools = [{ type: "function", function: { name: "f" } }];
		request.stream = false;

		const payload = buildOllamaPayload(body);
		const messages = payload.messages as Array<Record<string, unknown>>;
		assert.equal(messages[0].content, "hello");
		assert.equal(messages[1].content, "plain string stays as-is");
		assert.equal(messages[1].images, undefined);
		assert.deepEqual(payload.tools, request.tools);
		assert.deepEqual(payload.options, { num_predict: 64 });
		assert.equal(payload.stream, false);
	});
});

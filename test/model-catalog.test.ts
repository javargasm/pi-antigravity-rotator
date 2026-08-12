import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serveGeminiModels, serveOpenAIModels } from "../src/compat.js";

function captureJson(render: (res: never) => void): unknown {
	let raw = "";
	render({
		writeHead() {},
		end(chunk: string) {
			raw += chunk;
		},
	} as never);
	return JSON.parse(raw);
}

describe("model discovery", () => {
	it("hides provider catalogs without active credentials", () => {
		const payload = captureJson((res) =>
			serveOpenAIModels(res, {
				hasActiveProvider: () => false,
				getOllamaModels: () => [],
			} as never),
		) as { data: Array<{ id: string; owned_by: string }> };

		assert.ok(payload.data.some((model) => model.owned_by === "tuxevil-rotator"));
		assert.ok(!payload.data.some((model) => model.owned_by === "openai-codex"));
		assert.ok(!payload.data.some((model) => model.owned_by === "ollama"));
	});

	it("includes only active provider catalogs", () => {
		const payload = captureJson((res) =>
			serveOpenAIModels(res, {
				hasActiveProvider: (providerId: string) =>
					providerId === "openai-codex" || providerId === "ollama",
				getOllamaModels: () => ["gemma4:31b"],
			} as never),
		) as { data: Array<{ id: string; owned_by: string }> };

		assert.ok(payload.data.some((model) => model.owned_by === "openai-codex"));
		assert.ok(payload.data.some((model) => model.id === "gpt-5.6-sol" && model.owned_by === "openai-codex"));
		assert.ok(payload.data.some((model) => model.id === "gemma4:31b" && model.owned_by === "ollama"));
	});

	it("exposes rich metadata in /v1/models", () => {
		const payload = captureJson(serveOpenAIModels) as { data: Array<{ meta: Record<string, unknown> }> };
		assert.ok(payload.data.length > 0);
		assert.equal(payload.data[0].meta.tool_calling, true);
		assert.ok("quota_pool" in payload.data[0].meta);
	});

	it("exposes gemini-compatible model listings", () => {
		const payload = captureJson(serveGeminiModels) as { models: Array<{ supportedGenerationMethods: string[] }> };
		assert.ok(payload.models.length > 0);
		assert.deepEqual(payload.models[0].supportedGenerationMethods, ["generateContent", "streamGenerateContent"]);
	});
});

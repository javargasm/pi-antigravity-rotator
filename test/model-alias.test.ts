import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { applyModelAlias, setModelAliasesOverride } from "../src/types.js";

describe("applyModelAlias", () => {
	afterEach(() => {
		setModelAliasesOverride(null);
	});

	it("returns the input unchanged when no alias is configured for it", () => {
		assert.equal(applyModelAlias("claude-sonnet-4-6"), "claude-sonnet-4-6");
		assert.equal(applyModelAlias("some-unknown-model"), "some-unknown-model");
	});

	it("translates gemini-3.1-pro-high to gemini-pro-agent (default)", () => {
		assert.equal(applyModelAlias("gemini-3.1-pro-high"), "gemini-pro-agent");
	});

	it("translates gpt-oss-120b to gpt-oss-120b-medium (default)", () => {
		assert.equal(applyModelAlias("gpt-oss-120b"), "gpt-oss-120b-medium");
	});

	it("leaves gpt-oss-120b-medium unchanged (no self-aliasing)", () => {
		assert.equal(applyModelAlias("gpt-oss-120b-medium"), "gpt-oss-120b-medium");
	});

	it("operator override replaces the default alias table", () => {
		setModelAliasesOverride({
			"my-model": "upstream-model",
		});
		assert.equal(applyModelAlias("my-model"), "upstream-model");
		// Default Gemini alias is no longer active.
		assert.equal(applyModelAlias("gemini-3.1-pro-high"), "gemini-3.1-pro-high");
	});

	it("passing null restores the default alias table", () => {
		setModelAliasesOverride({ "my-model": "upstream-model" });
		setModelAliasesOverride(null);
		assert.equal(applyModelAlias("gemini-3.1-pro-high"), "gemini-pro-agent");
	});

	it("returns gemini-3.7-flash-tiered unchanged (no alias configured)", () => {
		assert.equal(
			applyModelAlias("gemini-3.7-flash-tiered"),
			"gemini-3.7-flash-tiered",
		);
	});

	it("creates no aliases for virtual gemini-3.7-flash low/medium/high", () => {
		for (const variant of ["low", "medium", "high"]) {
			const id = `gemini-3.7-flash-${variant}`;
			assert.equal(applyModelAlias(id), id);
		}
	});

	it("passes native gemini-3.8-flash model ids through unchanged", () => {
		for (const variant of ["low", "medium", "high"]) {
			const id = `gemini-3.8-flash-${variant}`;
			assert.equal(applyModelAlias(id), id);
		}
	});
});

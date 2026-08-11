import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractPreservedBlocks,
  verifyFidelity,
} from "../src/compression/preservation.js";

describe("Compression Block Preservation System", () => {
  it("preserves fenced code blocks", () => {
    const input = `Here is some text.
\`\`\`ts
const x = 42;
console.log("hello");
\`\`\`
More text after code.`;

    const { text, blocks, restore } = extractPreservedBlocks(input);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(blocks[0].type, "code_block");
    assert.ok(text.includes("\0ROTATOR_PRESERVE_"));
    assert.ok(!text.includes("const x = 42;"));

    const restored = restore(text);
    assert.strictEqual(restored, input);
  });

  it("preserves inline code", () => {
    const input = "Run `npm install` and then `npm run test` to verify.";
    const { text, blocks, restore } = extractPreservedBlocks(input);

    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0].type, "inline_code");
    assert.strictEqual(blocks[1].type, "inline_code");

    const restored = restore(text);
    assert.strictEqual(restored, input);
  });

  it("preserves URLs and file paths", () => {
    const input = "Check https://github.com/tuxevil/tuxevil-rotator and file /var/log/app.log or ./src/index.ts";
    const { text, blocks, restore } = extractPreservedBlocks(input);

    assert.ok(blocks.some((b) => b.type === "url"));
    assert.ok(blocks.some((b) => b.type === "file_path"));

    const restored = restore(text);
    assert.strictEqual(restored, input);
  });

  it("handles adversarial relative paths without catastrophic backtracking", () => {
    const input = "./" + "-../".repeat(28) + "!";
    const startedAt = performance.now();

    extractPreservedBlocks(input);

    assert.ok(
      performance.now() - startedAt < 500,
      "path preservation regex took too long",
    );
  });

  it("preserves environment variables and versions", () => {
    const input = "Use $PI_ROTATOR_DIR with version v2.5.0 and ${NODE_ENV}.";
    const { text, blocks, restore } = extractPreservedBlocks(input);

    assert.ok(blocks.some((b) => b.type === "env_var"));
    assert.ok(blocks.some((b) => b.type === "version"));

    const restored = restore(text);
    assert.strictEqual(restored, input);
  });

  it("verifies fidelity correctly", () => {
    const original = "Error 404 at /api/v1: $SECRET is missing v1.0.0";
    const { text, blocks, restore } = extractPreservedBlocks(original);
    const restored = restore(text);

    const fidelity = verifyFidelity(original, restored, blocks);
    assert.strictEqual(fidelity.ok, true);
    assert.strictEqual(fidelity.missingBlocks.length, 0);
    assert.strictEqual(fidelity.missingNumbers.length, 0);
  });

  it("flags missing blocks in fidelity check", () => {
    const original = "Check https://example.com with 123";
    const { blocks } = extractPreservedBlocks(original);
    const corruptedRestored = "Check missing link without numbers";

    const fidelity = verifyFidelity(original, corruptedRestored, blocks);
    assert.strictEqual(fidelity.ok, false);
    assert.strictEqual(fidelity.missingBlocks.length, 1);
    assert.strictEqual(fidelity.missingNumbers.length, 1);
  });
});

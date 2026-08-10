import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collapseWhitespace,
  compressLite,
} from "../src/compression/lite.js";
import type { ChatMessage } from "../src/providers/google-antigravity/translators.js";

describe("Lite Compression Engine", () => {
  describe("collapseWhitespace", () => {
    it("collapses 3+ newlines to 2 and strips trailing line whitespace", () => {
      const input = "Line 1   \n\n\n\nLine 2\t\t\n\n\nLine 3  ";
      const expected = "Line 1\n\nLine 2\n\nLine 3";
      assert.strictEqual(collapseWhitespace(input), expected);
    });

    it("preserves fenced code blocks while collapsing surrounding whitespace", () => {
      const input = `Header text   \n\n\n\n\`\`\`ts\nconst a = 1;   \n\n\n\nconsole.log(a);\n\`\`\`\n\n\n\nFooter text  `;
      const result = collapseWhitespace(input);

      assert.ok(result.includes("```ts\nconst a = 1;   \n\n\n\nconsole.log(a);\n```"));
      assert.ok(result.startsWith("Header text\n\n```ts"));
      assert.ok(result.endsWith("```\n\nFooter text"));
    });
  });

  describe("compressLite", () => {
    it("deduplicates duplicate system prompts", () => {
      const messages: ChatMessage[] = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
        { role: "system", content: "You are a helpful assistant." },
        { role: "assistant", content: "Hi!" },
      ];

      const res = compressLite(messages);
      assert.strictEqual(res.compressed, true);
      assert.ok(res.techniques.includes("dedup_system_prompt"));
      assert.strictEqual(res.messages.length, 3);
      assert.strictEqual(res.messages[0].content, "You are a helpful assistant.");
      assert.strictEqual(res.messages[1].content, "Hello");
      assert.strictEqual(res.messages[2].content, "Hi!");
    });

    it("truncates large tool output messages exceeding maxToolResultChars", () => {
      const longOutput = "LOG ENTRY DATA ".repeat(200); // ~3000 chars
      const messages: ChatMessage[] = [
        { role: "user", content: "Run test" },
        { role: "tool", content: longOutput, tool_call_id: "call_1" },
      ];

      const res = compressLite(messages, { maxToolResultChars: 100 });
      assert.strictEqual(res.compressed, true);
      assert.ok(res.techniques.includes("compress_tool_results"));
      const toolMsg = res.messages[1];
      assert.ok(typeof toolMsg.content === "string");
      assert.ok((toolMsg.content as string).endsWith("\n...[truncated]"));
      assert.ok((toolMsg.content as string).length < longOutput.length);
    });

    it("removes redundant consecutive messages", () => {
      const messages: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];

      const res = compressLite(messages);
      assert.strictEqual(res.compressed, true);
      assert.ok(res.techniques.includes("remove_redundant_content"));
      assert.strictEqual(res.messages.length, 2);
    });

    it("replaces base64 image URLs when replaceImages is enabled", () => {
      const base64Data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const messages: ChatMessage[] = [
        { role: "user", content: `Look at this image: ${base64Data}` },
      ];

      const res = compressLite(messages, { replaceImages: true });
      assert.strictEqual(res.compressed, true);
      assert.ok(res.techniques.includes("replace_image_urls"));
      assert.strictEqual(res.messages[0].content, "Look at this image: [image: png]");
    });

    it("returns compressed=false when no transformations are applied", () => {
      const messages: ChatMessage[] = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "Normal question" },
        { role: "assistant", content: "Normal answer" },
      ];

      const res = compressLite(messages);
      assert.strictEqual(res.compressed, false);
      assert.strictEqual(res.techniques.length, 0);
      assert.strictEqual(res.messages.length, 3);
    });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPromptCompression,
  parseCompressionMode,
} from "../src/compression/index.js";
import type { ChatMessage } from "../src/providers/google-antigravity/translators.js";

describe("Compression Orchestrator", () => {
  it("parses compression modes from headers and config", () => {
    assert.equal(parseCompressionMode("lite"), "lite");
    assert.equal(parseCompressionMode("rtk"), "rtk");
    assert.equal(parseCompressionMode("rtk+lite"), "rtk+lite");
    assert.equal(parseCompressionMode("lite+rtk"), "rtk+lite");
    assert.equal(parseCompressionMode("off"), "off");
    assert.equal(parseCompressionMode(null, "rtk"), "rtk");
    assert.equal(parseCompressionMode(undefined, "off"), "off");
    assert.equal(parseCompressionMode(["lite"]), "lite");
  });

  it("passes through when mode is off", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "Hello world" },
    ];
    const res = applyPromptCompression(msgs, "off");
    assert.equal(res.stats, null);
    assert.equal(res.messages, msgs);
  });

  it("applies lite compression", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant.\n\n\nBe concise." },
      { role: "user", content: "Hello" },
    ];
    const res = applyPromptCompression(msgs, "lite");
    assert.notEqual(res.stats, null);
    assert.equal(res.stats?.mode, "lite");
    assert.ok(res.stats!.savedChars >= 0);
    assert.equal(
      (res.messages[0].content as string).includes("\n\n\n"),
      false,
    );
  });

  it("applies rtk compression on tool outputs", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "Run git diff" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "bash", arguments: '{"command":"git diff"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: `diff --git a/file.txt b/file.txt
index 1234567..89abcdef 100644
--- a/file.txt
+++ b/file.txt
@@ -1,5 +1,5 @@
-old line 1
+new line 1`,
      },
    ];

    const res = applyPromptCompression(msgs, "rtk");
    assert.notEqual(res.stats, null);
    assert.equal(res.stats?.mode, "rtk");
    assert.ok(res.stats!.savedChars > 0);
    assert.ok(res.stats!.techniques.includes("rtk"));
  });

  it("applies combined rtk+lite compression", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "System prompt\n\n\n\nNext line" },
      { role: "user", content: "Run npm test" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "bash", arguments: '{"command":"npm test"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1",
        content: `> test
PASS test/foo.test.ts (1.2s)
PASS test/bar.test.ts (2.1s)
Test Suites: 2 passed, 2 total
Tests: 15 passed, 15 total
Snapshots: 0 total
Time: 3.5s`,
      },
    ];

    const res = applyPromptCompression(msgs, "rtk+lite");
    assert.notEqual(res.stats, null);
    assert.equal(res.stats?.mode, "rtk+lite");
    assert.ok(res.stats!.savedChars > 0);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectCommandType } from "../src/compression/rtk/command-detector.js";
import { loadBuiltinRtkFilters, matchRtkFilter } from "../src/compression/rtk/filter-loader.js";
import { applyLineFilter } from "../src/compression/rtk/line-filter.js";
import { compressRTK } from "../src/compression/rtk/index.js";
import type { ChatMessage } from "../src/providers/google-antigravity/translators.js";

describe("Compression RTK Engine", () => {
  it("loads builtin filter packs", () => {
    const filters = loadBuiltinRtkFilters();
    assert.ok(filters.length >= 50, `Expected >= 50 filters, got ${filters.length}`);
    const gitStatusFilter = filters.find((f) => f.id === "git-status");
    assert.ok(gitStatusFilter, "git-status filter should exist");
  });

  it("detects command types", () => {
    const res1 = detectCommandType("", "git status");
    assert.equal(res1.type, "git-status");

    const res2 = detectCommandType("On branch main\nChanges to be committed:\n  (use git restore)");
    assert.equal(res2.type, "git-status");

    const res3 = detectCommandType("diff --git a/foo.ts b/foo.ts\nindex 1234..5678");
    assert.equal(res3.type, "git-diff");
  });

  it("matches filters by command or pattern", () => {
    const f1 = matchRtkFilter("git-status", "git status", "");
    assert.ok(f1);
    assert.equal(f1?.id, "git-status");

    const f2 = matchRtkFilter(null, null, "On branch main\nNothing to commit");
    assert.ok(f2);
  });

  it("applies line filtering and drops noise", () => {
    const filter = matchRtkFilter("git-status", "git status", "");
    assert.ok(filter);
    const text = `On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean`;
    const res = applyLineFilter(text, filter!);
    assert.ok(res.text);
  });

  it("compresses tool messages using RTK engine", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Check git status" },
      {
        role: "tool",
        content: `On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
line 1
line 1
line 1
line 1`,
      },
    ];

    const res = compressRTK(messages);
    assert.equal(res.messages.length, 2);
    assert.equal(res.messages[0].content, "Check git status");
  });
});

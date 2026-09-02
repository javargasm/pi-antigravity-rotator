import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IdempotencyManager } from "../src/idempotency.js";

describe("IdempotencyManager", () => {
  it("computes reproducible fingerprints", () => {
    const mgr = new IdempotencyManager();
    const key1 = mgr.computeKey("gemini-3.8-flash-high", { prompt: "hello" });
    const key2 = mgr.computeKey("gemini-3.8-flash-high", { prompt: "hello" });
    const key3 = mgr.computeKey("gemini-3.8-flash-high", { prompt: "world" });

    assert.equal(key1, key2);
    assert.notEqual(key1, key3);
  });

  it("prioritizes explicit client idempotency key", () => {
    const mgr = new IdempotencyManager();
    const key1 = mgr.computeKey("gemini-3.8-flash-high", { prompt: "hello" }, "custom-id-123");
    const key2 = mgr.computeKey("gemini-3.8-flash-high", { prompt: "different prompt" }, "custom-id-123");

    assert.equal(key1, key2);
  });

  it("detects opt-out headers", () => {
    const mgr = new IdempotencyManager();
    assert.equal(mgr.isOptedOut({ headers: {} } as any), false);
    assert.equal(mgr.isOptedOut({ headers: { "x-rotator-no-deduplicate": "true" } } as any), true);
    assert.equal(mgr.isOptedOut({ headers: { "x-no-deduplicate": "1" } } as any), true);
    assert.equal(mgr.isOptedOut({ headers: { "x-no-cache": "true" } } as any), true);
    assert.equal(mgr.isOptedOut({ headers: { "x-rotator-no-deduplicate": "false" } } as any), false);
  });

  it("deduplicates parallel in-flight requests", async () => {
    const mgr = new IdempotencyManager();
    let callCount = 0;

    const slowOperation = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { data: "response-value" };
    };

    const reqKey = mgr.computeKey("model-a", { msg: "test" });

    // Execute two concurrent requests
    const p1 = mgr.execute(reqKey, 1000, slowOperation);
    const p2 = mgr.execute(reqKey, 1000, slowOperation);

    const [r1, r2] = await Promise.all([p1, p2]);

    assert.equal(callCount, 1, "Operation should only execute once");
    assert.equal(r1.isDeduplicated, false);
    assert.equal(r2.isDeduplicated, true);
    assert.deepEqual(r1.result, r2.result);
  });

  it("re-executes after error immediately without caching error", async () => {
    const mgr = new IdempotencyManager();
    let callCount = 0;

    const failingOperation = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Temporary failure");
      }
      return { success: true };
    };

    const reqKey = mgr.computeKey("model-a", { msg: "fail-test" });

    await assert.rejects(async () => {
      await mgr.execute(reqKey, 1000, failingOperation);
    }, /Temporary failure/);

    // Second call should retry and succeed
    const r2 = await mgr.execute(reqKey, 1000, failingOperation);
    assert.equal(callCount, 2);
    assert.equal(r2.isDeduplicated, false);
    assert.equal(r2.result.success, true);
  });
});

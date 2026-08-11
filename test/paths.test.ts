import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { resolveSafeConfigDir } from "../src/paths.js";
import { migrateLegacyConfig } from "../src/paths.js";

describe("resolveSafeConfigDir", () => {
  it("accepts a normal absolute path", () => {
    const out = resolveSafeConfigDir(join(tmpdir(), "rotator-test"), "argv");
    assert.equal(out, join(tmpdir(), "rotator-test"));
  });

  it("accepts a normal relative path", () => {
    const out = resolveSafeConfigDir("./rotator-data", "argv");
    // The function calls resolve() which normalises "./rotator-data" to
    // "<cwd>/rotator-data"; we don't assert the full path, just that
    // it doesn't throw and doesn't contain "..".
    assert.ok(!out.split(sep).includes(".."));
  });

  it("rejects a path with a .. segment pointing outside (argv)", () => {
    assert.throws(
      () => resolveSafeConfigDir("/etc/rotator-data/../../passwd", "argv"),
      /Refusing --config-dir.*contains '\.\.' segment/,
    );
  });

  it("rejects a path with a .. segment pointing outside (env)", () => {
    assert.throws(
      () => resolveSafeConfigDir("/var/lib/rotator/../../../etc", "env"),
      /Refusing --config-dir="\/var\/lib\/rotator\/\.\.\/\.\.\/\.\.\/etc" from env/,
    );
  });

  it("rejects a relative path that uses .. to escape", () => {
    assert.throws(
      () => resolveSafeConfigDir("../etc/passwd", "argv"),
      /contains '\.\.' segment/,
    );
  });

  it("accepts paths that happen to contain '..' as a substring of a segment name", () => {
    // '..foo' is a single directory name, not the parent reference.
    const out = resolveSafeConfigDir("/var/lib/..foo/rotator", "argv");
    assert.ok(out.endsWith(join("var", "lib", "..foo", "rotator")));
  });
});

describe("migrateLegacyConfig", () => {
  it("copies legacy files once, preserves permissions, and reports idempotent reruns", () => {
    const root = mkdtempSync(join(tmpdir(), "tuxevil-migrate-"));
    const legacyDir = join(root, "legacy");
    const targetDir = join(root, "current");
    mkdirSync(legacyDir);
    writeFileSync(join(legacyDir, "accounts.json"), '{"accounts":[]}');
    chmodSync(join(legacyDir, "accounts.json"), 0o600);

    const first = migrateLegacyConfig(targetDir, [legacyDir]);
    assert.deepEqual(first.copied, ["accounts.json"]);
    assert.deepEqual(first.skipped, []);
    assert.deepEqual(first.errors, []);
    assert.equal(readFileSync(join(targetDir, "accounts.json"), "utf8"), '{"accounts":[]}');
    assert.equal(statSync(join(targetDir, "accounts.json")).mode & 0o777, 0o600);

    const second = migrateLegacyConfig(targetDir, [legacyDir]);
    assert.deepEqual(second.copied, []);
    assert.deepEqual(second.skipped, ["accounts.json"]);
    assert.equal(existsSync(join(legacyDir, "accounts.json")), true);
  });

  it("does not overwrite files already present in the new directory", () => {
    const root = mkdtempSync(join(tmpdir(), "tuxevil-migrate-"));
    const legacyDir = join(root, "legacy");
    const targetDir = join(root, "current");
    mkdirSync(legacyDir);
    mkdirSync(targetDir);
    writeFileSync(join(legacyDir, "accounts.json"), "legacy");
    writeFileSync(join(targetDir, "accounts.json"), "current");

    const report = migrateLegacyConfig(targetDir, [legacyDir]);
    assert.deepEqual(report.skipped, ["accounts.json"]);
    assert.equal(readFileSync(join(targetDir, "accounts.json"), "utf8"), "current");
  });
});

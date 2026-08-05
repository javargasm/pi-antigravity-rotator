import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isMirrorableKey,
  tokenizeEnvAssignments,
  stripEnvironmentFilePrefix,
  parseEnvironmentFile,
  parseSystemdUnit,
  findSystemdUnitFiles,
  loadSystemdEnvironment,
} from "../src/systemd-env.js";

function makeFakeUnitDir(): { dir: string; unitDir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "systemd-env-test-"));
  const unitDir = join(dir, "systemd", "system");
  mkdirSync(unitDir, { recursive: true });
  return {
    dir,
    unitDir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const SERVICE = "pi-antigravity-rotator.service";

describe("systemd-env", () => {
  describe("isMirrorableKey", () => {
    it("mirrors PI_ROTATOR_, ANTIGRAVITY_, DATABASE_URL and ENCRYPTION_KEY", () => {
      assert.equal(isMirrorableKey("PI_ROTATOR_DATABASE_URL"), true);
      assert.equal(isMirrorableKey("PI_ROTATOR_DIR"), true);
      assert.equal(isMirrorableKey("ANTIGRAVITY_CLIENT_ID"), true);
      assert.equal(isMirrorableKey("DATABASE_URL"), true);
      assert.equal(isMirrorableKey("ENCRYPTION_KEY"), true);
    });

    it("does not mirror unrelated keys", () => {
      assert.equal(isMirrorableKey("PATH"), false);
      assert.equal(isMirrorableKey("HOME"), false);
      assert.equal(isMirrorableKey("FOO"), false);
    });
  });

  describe("tokenizeEnvAssignments", () => {
    it("splits space-separated assignments", () => {
      assert.deepEqual(tokenizeEnvAssignments("A=1 B=2"), ["A=1", "B=2"]);
    });

    it("keeps quoted values intact", () => {
      assert.deepEqual(tokenizeEnvAssignments('A="hello world" B=2'), [
        "A=hello world",
        "B=2",
      ]);
    });
  });

  describe("stripEnvironmentFilePrefix", () => {
    it("strips - and @ prefixes", () => {
      assert.equal(stripEnvironmentFilePrefix("-/etc/foo.env"), "/etc/foo.env");
      assert.equal(stripEnvironmentFilePrefix("@/etc/foo.env"), "/etc/foo.env");
      assert.equal(stripEnvironmentFilePrefix("/etc/foo.env"), "/etc/foo.env");
    });
  });

  describe("parseEnvironmentFile", () => {
    it("parses KEY=VALUE lines, skipping comments", () => {
      const content = `# comment\nANTIGRAVITY_CLIENT_ID=abc\nANTIGRAVITY_CLIENT_SECRET="s e c"\n\n; other\nEMPTY_LINE=\n`;
      const parsed = parseEnvironmentFile(content);
      assert.equal(parsed.ANTIGRAVITY_CLIENT_ID, "abc");
      assert.equal(parsed.ANTIGRAVITY_CLIENT_SECRET, "s e c");
      assert.equal(parsed.EMPTY_LINE, "");
      assert.equal(Object.keys(parsed).length, 3);
    });

    it("handles export prefix", () => {
      const parsed = parseEnvironmentFile("export PI_ROTATOR_DIR=/tmp/x");
      assert.equal(parsed.PI_ROTATOR_DIR, "/tmp/x");
    });
  });

  describe("parseSystemdUnit", () => {
    it("parses Environment= and EnvironmentFile= lines", () => {
      const unit = [
        "[Service]",
        "Environment=PI_ROTATOR_DIR=/rotator",
        'Environment="PI_ROTATOR_TELEMETRY_URL=https://t.example.com/x"',
        "EnvironmentFile=/etc/rotator/oauth.env",
        "EnvironmentFile=-/etc/rotator/optional.env",
        "ExecStart=/usr/bin/node index.js",
      ].join("\n");
      const { env, envFiles } = parseSystemdUnit(unit);
      assert.equal(env.PI_ROTATOR_DIR, "/rotator");
      assert.equal(env.PI_ROTATOR_TELEMETRY_URL, "https://t.example.com/x");
      assert.deepEqual(envFiles, ["/etc/rotator/oauth.env", "/etc/rotator/optional.env"]);
    });

    it("ignores comments", () => {
      const { env } = parseSystemdUnit("# comment\nEnvironment=PI_ROTATOR_DIR=/x");
      assert.equal(env.PI_ROTATOR_DIR, "/x");
    });
  });

  describe("findSystemdUnitFiles", () => {
    it("finds unit and drop-ins", () => {
      const { unitDir, cleanup } = makeFakeUnitDir();
      try {
        writeFileSync(join(unitDir, SERVICE), "[Service]");
        mkdirSync(join(unitDir, `${SERVICE}.d`));
        writeFileSync(join(unitDir, `${SERVICE}.d`, "zzz.conf"), "");
        writeFileSync(join(unitDir, `${SERVICE}.d`, "aaa.conf"), "");
        writeFileSync(join(unitDir, `${SERVICE}.d`, "not-a-dropin.txt"), "");

        const { baseDir, dropins } = findSystemdUnitFiles([unitDir], SERVICE);
        assert.equal(baseDir, unitDir);
        assert.deepEqual(dropins, [
          join(unitDir, `${SERVICE}.d`, "aaa.conf"),
          join(unitDir, `${SERVICE}.d`, "zzz.conf"),
        ]);
      } finally {
        cleanup();
      }
    });

    it("returns empty when unit is not present", () => {
      const { unitDir, cleanup } = makeFakeUnitDir();
      try {
        const { baseDir, dropins } = findSystemdUnitFiles([unitDir], SERVICE);
        assert.equal(baseDir, null);
        assert.deepEqual(dropins, []);
      } finally {
        cleanup();
      }
    });
  });

  describe("loadSystemdEnvironment", () => {
    it("mirrors service env into the target env object", () => {
      const { unitDir, cleanup } = makeFakeUnitDir();
      const oauthEnv = join(unitDir, "oauth.env");
      try {
        writeFileSync(join(unitDir, SERVICE), "Environment=PI_ROTATOR_DIR=/rotator\n");
        mkdirSync(join(unitDir, `${SERVICE}.d`));
        writeFileSync(
          join(unitDir, `${SERVICE}.d`, "database.conf"),
          "Environment=PI_ROTATOR_DATABASE_URL=postgresql://u:p@localhost/db\n",
        );
        writeFileSync(
          join(unitDir, `${SERVICE}.d`, "oauth.conf"),
          `EnvironmentFile=${oauthEnv}\n`,
        );
        writeFileSync(oauthEnv, "ANTIGRAVITY_CLIENT_ID=abc\nANTIGRAVITY_CLIENT_SECRET=secret\n");

        const env: NodeJS.ProcessEnv = {};
        const applied = loadSystemdEnvironment(env, {
          unitDirs: [unitDir],
          serviceName: SERVICE,
        });
        assert.equal(env.PI_ROTATOR_DIR, "/rotator");
        assert.equal(env.PI_ROTATOR_DATABASE_URL, "postgresql://u:p@localhost/db");
        assert.equal(env.ANTIGRAVITY_CLIENT_ID, "abc");
        assert.equal(env.ANTIGRAVITY_CLIENT_SECRET, "secret");
        assert.deepEqual(applied.sort(), [
          "ANTIGRAVITY_CLIENT_ID",
          "ANTIGRAVITY_CLIENT_SECRET",
          "PI_ROTATOR_DIR",
          "PI_ROTATOR_DATABASE_URL",
        ].sort());
      } finally {
        cleanup();
      }
    });

    it("does not override an already-set variable", () => {
      const { unitDir, cleanup } = makeFakeUnitDir();
      try {
        writeFileSync(
          join(unitDir, SERVICE),
          "Environment=PI_ROTATOR_DATABASE_URL=postgresql://from-unit/db\n",
        );
        const env: NodeJS.ProcessEnv = { PI_ROTATOR_DATABASE_URL: "postgresql://from-shell/db" };
        const applied = loadSystemdEnvironment(env, {
          unitDirs: [unitDir],
          serviceName: SERVICE,
        });
        assert.equal(env.PI_ROTATOR_DATABASE_URL, "postgresql://from-shell/db");
        assert.deepEqual(applied, []);
      } finally {
        cleanup();
      }
    });

    it("is a no-op when no unit is installed", () => {
      const env: NodeJS.ProcessEnv = { FOO: "bar" };
      const applied = loadSystemdEnvironment(env, {
        unitDirs: ["/nonexistent-systemd-dir"],
        serviceName: SERVICE,
      });
      assert.equal(env.FOO, "bar");
      assert.deepEqual(applied, []);
    });
  });
});

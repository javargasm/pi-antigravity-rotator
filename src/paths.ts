// Config directory resolution
// Default: ~/.tuxevil-rotator/
// Override: --config-dir <path> or TUXEVIL_ROTATOR_DIR env var
// Legacy: PI_ROTATOR_DIR env var and ~/.pi-antigravity-rotator/ still work
// (the first run auto-migrates the legacy directory contents).

import { existsSync, copyFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { rotatorEnv } from "./env.js";

const DEFAULT_DIR = join(homedir(), ".tuxevil-rotator");

// Legacy config directories checked (in order) for first-run auto-migration.
const LEGACY_DIRS = [join(homedir(), ".pi-antigravity-rotator")];

let configDir: string | null = null;

/**
 * Validate that a user-supplied config dir doesn't contain obvious path
 * traversal. Refuses to mkdir and returns the default if the input contains
 * `..` segments that escape the intended root. Throws otherwise.
 */
export function resolveSafeConfigDir(
  input: string,
  source: "argv" | "env" = "argv",
): string {
  // Check the ORIGINAL input (before resolve() collapses ".."), since
  // resolve("/a/../../b") silently becomes "/b" and would mask the attack.
  const segments = input.split(/[\\/]+/);
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(
        `Refusing --config-dir="${input}" from ${source}: contains '..' segment which could escape the config root. ` +
          `Use an absolute path or TUXEVIL_ROTATOR_DIR env var set by the container orchestrator.`,
      );
    }
  }
  return resolve(input);
}

/**
 * Copy any config files present in a legacy config dir into the active
 * config dir. Only runs when the active dir holds no file at the target
 * path yet, so it never overwrites newer data.
 */
function migrateLegacyConfig(targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const legacyDir of LEGACY_DIRS) {
    if (!existsSync(legacyDir)) continue;
    let entries: string[];
    try {
      entries = readdirSync(legacyDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const sourcePath = join(legacyDir, entry);
      const targetPath = join(targetDir, entry);
      try {
        if (!statSync(sourcePath).isFile()) continue;
      } catch {
        continue;
      }
      if (existsSync(targetPath)) continue;
      try {
        copyFileSync(sourcePath, targetPath);
      } catch {
        // Non-fatal: keep going with the remaining files.
      }
    }
  }
}

export function getConfigDir(): string {
  if (configDir) return configDir;

  let explicit = false;

  // Check CLI arg
  const idx = process.argv.indexOf("--config-dir");
  if (idx !== -1 && process.argv[idx + 1]) {
    configDir = resolveSafeConfigDir(process.argv[idx + 1], "argv");
    explicit = true;
  } else if (rotatorEnv("DIR")) {
    configDir = resolveSafeConfigDir(rotatorEnv("DIR")!, "env");
    explicit = true;
  } else {
    configDir = DEFAULT_DIR;
  }

  mkdirSync(configDir, { recursive: true });

  // Auto-migrate legacy config files on first run of the new directory.
  if (!explicit) {
    migrateLegacyConfig(configDir);
  }

  return configDir;
}

export function getAccountsPath(): string {
  return join(getConfigDir(), "accounts.json");
}

export function getStatePath(): string {
  return join(getConfigDir(), "state.json");
}

export function getTokenUsagePath(): string {
  return join(getConfigDir(), "token-usage.json");
}
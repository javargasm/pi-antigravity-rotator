import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const piDir = mkdtempSync(join(tmpdir(), "tuxevil-pi-"));
const legacyDir = mkdtempSync(join(tmpdir(), "tuxevil-legacy-"));
const legacyFile = join(legacyDir, "accounts.json");

process.env.TUXEVIL_ROTATOR_DIR = piDir;

import { initDb } from "../src/db-store.js";
import type { AccountConfig } from "../src/types.js";

let importLegacyOllamaRotatorAccounts: (
	legacyFile?: string,
) => Promise<number>;
let loadConfig: () => { accounts: unknown[] };
let addAccountToConfig: (
	entry: AccountConfig,
) => Promise<{ isNew: boolean }>;

before(async () => {
	await initDb();
	({ importLegacyOllamaRotatorAccounts, addAccountToConfig } = await import(
		"../src/account-store.js"
	));
	({ loadConfig } = await import("../src/config-storage.js"));
});

describe("importLegacyOllamaRotatorAccounts (F3 + parent-account model)", () => {
	it("returns 0 and leaves config untouched when no legacy file exists", async () => {
		const n = await importLegacyOllamaRotatorAccounts(
			join(legacyDir, "missing.json"),
		);
		assert.equal(n, 0);
		assert.equal(loadConfig().accounts.length, 0);
	});

	it("imports legacy accounts as ollama credentials", async () => {
		writeFileSync(
			legacyFile,
			JSON.stringify([
				{
					email: "legacy-a@example.com",
					apiKey: "ok-secret-a",
					label: "Legacy A",
				},
				{
					email: "legacy-b@example.com",
					apiKey: " ok-secret-b ",
					tier: "pro",
				},
			]),
		);

		const n = await importLegacyOllamaRotatorAccounts(legacyFile);
		assert.equal(n, 2);

		const accounts = loadConfig().accounts as {
			email: string;
			credentials?: Array<{
				provider: string;
				apiKey?: string;
			}>;
			label?: string;
			tier?: string;
		}[];
		assert.equal(accounts.length, 2);
		const a = accounts.find((c) => c.email === "legacy-a@example.com")!;
		assert.equal(a.credentials?.find((c) => c.provider === "ollama")?.apiKey, "ok-secret-a");
		assert.equal(a.label, "Legacy A");
		const b = accounts.find((c) => c.email === "legacy-b@example.com")!;
		assert.equal(b.credentials?.find((c) => c.provider === "ollama")?.apiKey, "ok-secret-b");
		assert.equal(b.tier, "pro");
	});

	it("imports accounts from a full legacy Config object", async () => {
		writeFileSync(
			legacyFile,
			JSON.stringify({
				proxyPort: 51201,
				routingPolicy: "timer-first",
				requestsPerRotation: 5,
				accounts: [
					{ email: "config-shape@example.com", apiKey: "ok-config-a" },
					{ email: "config-shape-b@example.com", apiKey: "ok-config-b" },
				],
			}),
		);

		const n = await importLegacyOllamaRotatorAccounts(legacyFile);
		assert.equal(n, 2);

		const accounts = loadConfig().accounts as Array<{
			email: string;
			credentials?: Array<{ provider: string; apiKey?: string }>;
		}>;
		const a = accounts.find((c) => c.email === "config-shape@example.com")!;
		assert.equal(a.credentials?.find((c) => c.provider === "ollama")?.apiKey, "ok-config-a");
	});

	it("merges the ollama credential onto an account with the same email (one account per email)", async () => {
		await addAccountToConfig({
			email: "merge-target@example.com",
			provider: "google-antigravity",
			refreshToken: "rt-google",
			projectId: "proj-1",
		});
		writeFileSync(
			legacyFile,
			JSON.stringify([
				{ email: "merge-target@example.com", apiKey: "ok-keep-me" },
			]),
		);

		const n = await importLegacyOllamaRotatorAccounts(legacyFile);
		assert.equal(n, 1, "ollama credential must be merged, not re-added");

		const accounts = loadConfig().accounts as Array<{
			email: string;
			credentials?: Array<{ provider: string; apiKey?: string; refreshToken?: string }>;
		}>;
		const count = accounts.filter(
			(c) => c.email === "merge-target@example.com",
		).length;
		assert.equal(count, 1, "a single account entry per email");
		const a = accounts.find((c) => c.email === "merge-target@example.com")!;
		const providers = (a.credentials ?? []).map((c) => c.provider).sort();
		assert.deepEqual(providers, ["google-antigravity", "ollama"]);
		const oll = a.credentials!.find((c) => c.provider === "ollama")!;
		assert.equal(oll.apiKey, "ok-keep-me");
	});

	it("skips entries missing an apiKey", async () => {
		writeFileSync(
			legacyFile,
			JSON.stringify([
				{ email: "solo-email@example.com" },
				{ email: "", apiKey: "ok-x" },
				{ email: "new-email@example.com", apiKey: "ok-new" },
			]),
		);

		const n = await importLegacyOllamaRotatorAccounts(legacyFile);
		assert.equal(n, 1, "only the valid new entry is imported");
		const accounts = loadConfig().accounts as Array<{ email: string }>;
		assert.ok(accounts.some((c) => c.email === "new-email@example.com"));
		assert.ok(!accounts.some((c) => c.email === "solo-email@example.com"));
	});

	it("treats an invalid JSON legacy file as a no-op", async () => {
		writeFileSync(legacyFile, "{not json");
		const n = await importLegacyOllamaRotatorAccounts(legacyFile);
		assert.equal(n, 0);
		assert.ok(existsSync(join(piDir, "accounts.json")));
	});
});
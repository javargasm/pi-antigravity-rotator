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

describe("importLegacyOllamaRotatorAccounts (F3)", () => {
	it("returns 0 and leaves config untouched when no legacy file exists", async () => {
		const n = await importLegacyOllamaRotatorAccounts(
			join(legacyDir, "missing.json"),
		);
		assert.equal(n, 0);
		assert.equal(loadConfig().accounts.length, 0);
	});

	it("imports legacy accounts tagged provider ollama", async () => {
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
			provider?: string;
			apiKey?: string;
			label?: string;
			tier?: string;
		}[];
		assert.equal(accounts.length, 2);
		const a = accounts.find((c) => c.email === "legacy-a@example.com")!;
		assert.equal(a.provider, "ollama");
		assert.equal(a.apiKey, "ok-secret-a");
		assert.equal(a.label, "Legacy A");
		const b = accounts.find((c) => c.email === "legacy-b@example.com")!;
		assert.equal(b.provider, "ollama");
		assert.equal(b.apiKey, "ok-secret-b");
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
			provider?: string;
			apiKey?: string;
		}>;
		const a = accounts.find((c) => c.email === "config-shape@example.com")!;
		assert.equal(a.provider, "ollama");
		assert.equal(a.apiKey, "ok-config-a");
	});

	it("skips accounts whose email already exists", async () => {
		await addAccountToConfig({
			email: "legacy-a@example.com",
			provider: "ollama",
			apiKey: "ok-keep-me",
		});

		const n = await importLegacyOllamaRotatorAccounts(legacyFile);
		assert.equal(n, 0, "duplicate email must not be re-imported");

		const accounts = loadConfig().accounts as Array<{
			email: string;
			apiKey?: string;
		}>;
		const count = accounts.filter(
			(c) => c.email === "legacy-a@example.com",
		).length;
		assert.equal(count, 1, "duplicate must not create a second entry");
		const a = accounts.find((c) => c.email === "legacy-a@example.com")!;
		assert.equal(a.apiKey, "ok-keep-me", "existing apiKey must not be overwritten");
	});

	it("skips entries missing an apiKey", async () => {
		writeFileSync(
			legacyFile,
			JSON.stringify([
				{ email: "solo-email@example.com" },
				{ email: "", apiKey: "ok-x" },
				{ email: "legacy-b@example.com", apiKey: "ok-dup" },
			]),
		);

		const n = await importLegacyOllamaRotatorAccounts(legacyFile);
		assert.equal(n, 0, "nothing new to import");
	});

	it("treats an invalid JSON legacy file as a no-op", async () => {
		writeFileSync(legacyFile, "{not json");
		const n = await importLegacyOllamaRotatorAccounts(legacyFile);
		assert.equal(n, 0);
		assert.ok(existsSync(join(piDir, "accounts.json")));
	});
});
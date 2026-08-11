import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.TUXEVIL_ROTATOR_DIR = mkdtempSync(join(tmpdir(), "tuxevil-import-"));

let initDb: () => Promise<void>;
let addAccountToConfig: typeof import("../src/account-store.js").addAccountToConfig;
let importAccountsToConfig: typeof import("../src/account-store.js").importAccountsToConfig;
let loadConfig: typeof import("../src/account-store.js").loadConfig;

describe("importAccountsToConfig", () => {
	before(async () => {
		({ initDb } = await import("../src/db-store.js"));
		({ addAccountToConfig, importAccountsToConfig, loadConfig } = await import(
			"../src/account-store.js"
		));
		await initDb();
	});

	it("imports arrays with camelCase and snake_case fields", async () => {
		const result = await importAccountsToConfig([
			{
				email: "camel@example.com",
				refreshToken: "rt-camel",
				projectId: "project-camel",
			},
			{
				email: "snake@example.com",
				refresh_token: "rt-snake",
				project_id: "project-snake",
			},
		]);

		assert.deepEqual(
			{
				added: result.added,
				updated: result.updated,
				unchanged: result.unchanged,
				skipped: result.skipped,
				total: result.total,
			},
			{ added: 2, updated: 0, unchanged: 0, skipped: 0, total: 2 },
		);
		const account = loadConfig().accounts.find((entry) => entry.email === "snake@example.com")!;
		assert.equal(account.refreshToken, "rt-snake");
		assert.equal(account.projectId, "project-snake");
		assert.deepEqual(account.credentials, [
			{
				provider: "google-antigravity",
				refreshToken: "rt-snake",
				projectId: "project-snake",
			},
		]);
	});

	it("accepts an accounts wrapper and nested Google credential", async () => {
		const result = await importAccountsToConfig({
			accounts: [
				{
					email: "nested@example.com",
					credentials: [
						{
							provider: "google-antigravity",
							refreshToken: "rt-nested",
							projectId: "project-nested",
						},
					],
				},
			],
		});

		assert.equal(result.added, 1);
		assert.equal(loadConfig().accounts.find((entry) => entry.email === "nested@example.com")?.projectId, "project-nested");
	});

	it("merges Google before an existing Ollama credential and is idempotent", async () => {
		await addAccountToConfig({
			email: "dual@example.com",
			provider: "ollama",
			credentials: [{ provider: "ollama", apiKey: "ollama-secret" }],
		});

		const first = await importAccountsToConfig([
			{
				email: "dual@example.com",
				refresh_token: "rt-dual",
				project_id: "project-dual",
			},
		]);
		const second = await importAccountsToConfig([
			{
				email: "dual@example.com",
				refresh_token: "rt-dual",
				project_id: "project-dual",
			},
		]);

		assert.equal(first.updated, 1);
		assert.equal(second.unchanged, 1);
		const account = loadConfig().accounts.find((entry) => entry.email === "dual@example.com")!;
		assert.deepEqual(account.credentials?.map((credential) => credential.provider), [
			"google-antigravity",
			"ollama",
		]);
		assert.equal(account.credentials?.find((credential) => credential.provider === "ollama")?.apiKey, "ollama-secret");
		assert.equal(account.refreshToken, "rt-dual");
	});

	it("skips invalid entries and never invents a default project", async () => {
		const result = await importAccountsToConfig([
			{ email: "missing-project@example.com", refresh_token: "rt-missing" },
			{ email: "missing-token@example.com", project_id: "project-missing" },
		]);

		assert.equal(result.added, 0);
		assert.equal(result.skipped, 2);
		assert.equal(result.errors.length, 2);
		assert.match(result.errors.join("\n"), /refusing to invent a shared default project/);
		assert.equal(loadConfig().accounts.some((entry) => entry.projectId === "default-project"), false);
	});

	it("rejects a malformed top-level import shape", async () => {
		await assert.rejects(
			() => importAccountsToConfig({ notAccounts: true }),
			/expected a JSON array or an object with an accounts array/,
		);
	});
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	OAuthCallbackTimeoutError,
	waitForLocalOAuthCallback,
} from "../src/providers/google-antigravity/login.js";

async function waitForPort(getPort: () => number | undefined): Promise<number> {
	for (let attempt = 0; attempt < 50; attempt++) {
		const port = getPort();
		if (port) return port;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error("callback server did not start");
}

describe("local OAuth callback", () => {
	it("accepts a matching state, returns the code, and renders a closeable page", async () => {
		let port: number | undefined;
		const callback = waitForLocalOAuthCallback("state-ok", {
			redirectUri: "http://localhost:0/oauth-callback",
			port: 0,
			timeoutMs: 1_000,
			onListening: (value) => { port = value; },
		});
		const listeningPort = await waitForPort(() => port);
		const response = await fetch(
			`http://127.0.0.1:${listeningPort}/oauth-callback?code=code-only&state=state-ok`,
		);
		assert.equal(response.status, 200);
		assert.match(await response.text(), /window\.close/);
		assert.deepEqual(await callback, { code: "code-only", state: "state-ok" });

		await assert.rejects(
			fetch(`http://127.0.0.1:${listeningPort}/oauth-callback?code=second&state=state-ok`),
		);
	});

	it("escapes provider errors and closes after a matching error callback", async () => {
		let port: number | undefined;
		const callback = waitForLocalOAuthCallback("state-error", {
			redirectUri: "http://localhost:0/oauth-callback",
			port: 0,
			timeoutMs: 1_000,
			onListening: (value) => { port = value; },
		});
		const listeningPort = await waitForPort(() => port);
		const response = await fetch(
			`http://127.0.0.1:${listeningPort}/oauth-callback?error=access_denied&state=state-error&error_description=%3Cscript%3Ealert(1)%3C%2Fscript%3E`,
		);
		const html = await response.text();
		assert.equal(response.status, 400);
		assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
		assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
		assert.deepEqual(await callback, {
			error: "access_denied",
			errorDescription: "<script>alert(1)</script>",
		});
	});

	it("times out and releases the loopback listener", async () => {
		let port: number | undefined;
		const callback = waitForLocalOAuthCallback("state-timeout", {
			redirectUri: "http://localhost:0/oauth-callback",
			port: 0,
			timeoutMs: 10,
			onListening: (value) => { port = value; },
		});
		const listeningPort = await waitForPort(() => port);
		await assert.rejects(callback, OAuthCallbackTimeoutError);
		await assert.rejects(fetch(`http://127.0.0.1:${listeningPort}/oauth-callback`));
	});
});

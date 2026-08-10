// Google Antigravity interactive login flow (OAuth2 + PKCE).
// 1. Opens OAuth URL -> user pastes redirect URL
// 2. Exchanges the code, resolves the user email + Cloud Code project
// Returns a ready-to-persist AccountConfig.

import { createInterface } from "node:readline";
import {
  buildAuthUrl,
  discoverProject,
  exchangeAuthorizationCode,
  generatePkce,
  generateState,
  getUserEmail,
} from "./oauth.js";
import type { AccountConfig } from "../../types.js";

function parseRedirectUrl(input: string): { code?: string; state?: string } {
  const value = input.trim();
  if (!value) return {};
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get("code") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
    };
  } catch {
    return {};
  }
}

function askQuestion(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runLogin(): Promise<AccountConfig> {
  console.log("=== Tuxevil Rotator - Add Google Antigravity Account ===");
  console.log();

  const { verifier, challenge } = generatePkce();
  const state = generateState();
  const authUrl = buildAuthUrl(state, challenge);

  console.log("1. Open this URL in your browser:");
  console.log();
  console.log(authUrl);
  console.log();
  console.log("2. Complete the Google sign-in.");
  console.log("3. Copy the FULL URL from your browser after it redirects to the configured callback.");
  console.log();

  const redirectUrl = await askQuestion("Paste the redirect URL: ");

  if (!redirectUrl) {
    throw new Error("No URL provided.");
  }

  const parsed = parseRedirectUrl(redirectUrl);

  if (!parsed.code) {
    throw new Error("Could not extract authorization code from the URL.");
  }

  if (parsed.state !== state) {
    throw new Error("State mismatch - the URL does not match this login session.");
  }

  console.log();
  console.log("Exchanging code for tokens...");
  const tokenData = await exchangeAuthorizationCode(parsed.code, verifier);

  console.log("Getting user info...");
  const email = await getUserEmail(tokenData.accessToken);

  console.log("Discovering project...");
  const project = await discoverProject(tokenData.accessToken);

  const label = email ? email.split("@")[0] : "Account";
  return {
    provider: "google-antigravity",
    email: email || "unknown@gmail.com",
    refreshToken: tokenData.refreshToken,
    projectId: project.projectId,
    projectSource: project.source,
    label,
  };
}
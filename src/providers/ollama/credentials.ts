// Ollama Cloud credential validation: an API key is valid iff it is a
// non-empty string (keys never expire; network validation happens during
// login via validateApiKey).

import type { AccountConfig } from "../../types.js";
import type { CredentialValidationResult } from "../adapter.js";

export async function validateCredentials(
  config: AccountConfig,
): Promise<CredentialValidationResult> {
  if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
    return {
      ok: false,
      status: 0,
      error: "Ollama account is missing an apiKey",
    };
  }
  return { ok: true };
}
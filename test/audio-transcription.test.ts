import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, it } from "node:test";
import { applyModelAlias } from "../src/types.js";
import { buildOpenAIModelCatalog } from "../src/compat.js";
import { handleOpenAIAudioTranscriptions } from "../src/audio-transcription.js";

async function listenServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<{ server: ReturnType<typeof createServer>; url: string; port: number }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server did not bind to a TCP port");
  }
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
  };
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("models/proactive-observer-v10 audio transcription support", () => {
  it("translates whisper-1 and proactive-observer aliases to models/proactive-observer-v10", () => {
    assert.equal(applyModelAlias("whisper-1"), "models/proactive-observer-v10");
    assert.equal(applyModelAlias("proactive-observer"), "models/proactive-observer-v10");
    assert.equal(applyModelAlias("proactive-observer-v10"), "models/proactive-observer-v10");
    assert.equal(applyModelAlias("models/proactive-observer-v10"), "models/proactive-observer-v10");
  });

  it("includes models/proactive-observer-v10 and whisper-1 in OpenAI model catalog", () => {
    const catalog = buildOpenAIModelCatalog();
    const proactive = catalog.find((m) => m.id === "models/proactive-observer-v10");
    const whisper = catalog.find((m) => m.id === "whisper-1");

    assert.ok(proactive, "models/proactive-observer-v10 should exist in OpenAI catalog");
    assert.equal(proactive.meta.family, "proactive-observer");

    assert.ok(whisper, "whisper-1 should exist in OpenAI catalog");
    assert.equal(whisper.meta.family, "proactive-observer");
  });

  it("rejects non-multipart requests with 400 Bad Request", async () => {
    const { server, url } = await listenServer((req, res) => {
      handleOpenAIAudioTranscriptions(req, res).catch((err) => {
        res.writeHead(500);
        res.end(err.message);
      });
    });

    try {
      const resp = await fetch(`${url}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "whisper-1" }),
      });

      assert.equal(resp.status, 400);
      const data = (await resp.json()) as { error: { message: string } };
      assert.match(data.error.message, /multipart\/form-data/i);
    } finally {
      await closeServer(server);
    }
  });

  it("rejects multipart requests missing the file field with 400 Bad Request", async () => {
    const { server, url } = await listenServer((req, res) => {
      handleOpenAIAudioTranscriptions(req, res).catch((err) => {
        res.writeHead(500);
        res.end(err.message);
      });
    });

    try {
      const formData = new FormData();
      formData.append("model", "whisper-1");

      const resp = await fetch(`${url}/v1/audio/transcriptions`, {
        method: "POST",
        body: formData,
      });

      assert.equal(resp.status, 400);
      const data = (await resp.json()) as { error: { message: string; param: string } };
      assert.match(data.error.message, /Missing required 'file'/i);
      assert.equal(data.error.param, "file");
    } finally {
      await closeServer(server);
    }
  });

  it("successfully transcribes audio file via POST /v1/audio/transcriptions (default json format)", async () => {
    const fs = await import("node:fs");
    if (!fs.existsSync("/tmp/test_hello.wav")) return;

    const { server, url } = await listenServer((req, res) => {
      handleOpenAIAudioTranscriptions(req, res).catch((err) => {
        res.writeHead(500);
        res.end(err.message);
      });
    });

    try {
      const fileBytes = fs.readFileSync("/tmp/test_hello.wav");
      const file = new File([fileBytes], "test_hello.wav", { type: "audio/wav" });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", "whisper-1");

      const resp = await fetch(`${url}/v1/audio/transcriptions`, {
        method: "POST",
        body: formData,
      });

      assert.equal(resp.status, 200);
      const data = (await resp.json()) as { text: string };
      assert.equal(typeof data.text, "string");
    } finally {
      await closeServer(server);
    }
  });

  it("successfully transcribes audio with response_format: 'text'", async () => {
    const fs = await import("node:fs");
    if (!fs.existsSync("/tmp/test_hello.wav")) return;

    const { server, url } = await listenServer((req, res) => {
      handleOpenAIAudioTranscriptions(req, res).catch((err) => {
        res.writeHead(500);
        res.end(err.message);
      });
    });

    try {
      const fileBytes = fs.readFileSync("/tmp/test_hello.wav");
      const file = new File([fileBytes], "test_hello.wav", { type: "audio/wav" });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", "models/proactive-observer-v10");
      formData.append("response_format", "text");

      const resp = await fetch(`${url}/v1/audio/transcriptions`, {
        method: "POST",
        body: formData,
      });

      assert.equal(resp.status, 200);
      const text = await resp.text();
      assert.equal(typeof text, "string");
    } finally {
      await closeServer(server);
    }
  });

  it("upgrades WebSocket connection and sends system_status frame", async () => {
    const { handleAudioWebSocket } = await import("../src/audio-transcription.js");
    const { server, port } = await listenServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });
    server.on("upgrade", (req, socket) => {
      handleAudioWebSocket(req, socket);
    });

    try {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const msg = await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timeout waiting for WS message")), 3000);
        ws.onmessage = (event) => {
          clearTimeout(timer);
          try {
            resolve(JSON.parse(event.data.toString()));
          } catch (e) {
            reject(e);
          }
        };
        ws.onerror = (err) => {
          clearTimeout(timer);
          reject(err);
        };
      });

      assert.equal(msg.type, "system_status");
      assert.ok(msg.antigravity);
      ws.close();
    } finally {
      await closeServer(server);
    }
  });

  it("resolves audio mime types by extension and handles fallbacks", async () => {
    const { resolveMimeType } = await import("../src/audio-transcription.js");
    assert.equal(resolveMimeType("sample.wav"), "audio/wav");
    assert.equal(resolveMimeType("sample.WAV"), "audio/wav");
    assert.equal(resolveMimeType("recording.mp3"), "audio/mp3");
    assert.equal(resolveMimeType("clip.m4a"), "audio/m4a");
    assert.equal(resolveMimeType("stream.webm"), "audio/webm;codecs=opus");
    assert.equal(resolveMimeType("voice.ogg"), "audio/ogg");
    assert.equal(resolveMimeType("track.flac"), "audio/flac");
    assert.equal(resolveMimeType("raw.pcm"), "audio/pcm;rate=16000");
    assert.equal(resolveMimeType("unknown.xyz"), "audio/wav");
    // Explicit mimeType parameter takes priority if starting with audio/
    assert.equal(resolveMimeType("sample.bin", "audio/opus"), "audio/opus");
    assert.equal(resolveMimeType("sample.wav", "application/octet-stream"), "audio/wav");
  });

  it("getAntigravityCredentials returns valid port and csrf token", async () => {
    const { getAntigravityCredentials } = await import("../src/audio-transcription.js");
    const creds1 = getAntigravityCredentials();
    assert.ok(creds1);
    assert.equal(typeof creds1.port, "number");
    assert.ok(creds1.port > 0);
    assert.equal(typeof creds1.csrf, "string");
    assert.ok(creds1.csrf.length > 0);

    // Caching check
    const creds2 = getAntigravityCredentials();
    assert.deepEqual(creds1, creds2);
  });
});


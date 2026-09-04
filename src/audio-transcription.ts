import type { IncomingMessage, ServerResponse, ClientRequest } from "node:http";
import type { Duplex } from "node:stream";
import https from "node:https";
import cp from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { readLimitedBody } from "./body-limit.js";
import { logger } from "./logger.js";
import { applyModelAlias } from "./types.js";

const audioLogger = logger.child("audio-transcription");

export interface AntigravityCredentials {
  port: number;
  csrf: string;
}

let cachedCreds: AntigravityCredentials | null = null;
let lastCredsCheck = 0;

/**
 * Auto-detect the running Antigravity Language Server credentials.
 * Checks for running language_server instances with their HTTPS listening ports.
 */
export function getAntigravityCredentials(): AntigravityCredentials {
  const now = Date.now();
  if (cachedCreds && now - lastCredsCheck < 30_000) {
    return cachedCreds;
  }

  try {
    const ps = cp.execSync("ps aux | grep language_server | grep -v grep").toString();
    const lines = ps.split("\n");
    // Sort so Hub instance comes first
    lines.sort((a, b) => (b.includes("hub") ? 1 : 0) - (a.includes("hub") ? 1 : 0));
    for (const line of lines) {
      const matchCsrf = line.match(/--csrf_token\s+([a-f0-9-]+)/);
      const matchPid = line.trim().match(/^\S+\s+(\d+)/);
      if (matchCsrf && matchPid) {
        const pid = matchPid[1];
        const csrf = matchCsrf[1];
        const lsof = cp.execSync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${pid}`).toString();
        const ports = [...lsof.matchAll(/:(\d+)\s+\(LISTEN\)/g)].map((m) => parseInt(m[1], 10));
        if (ports.length > 0) {
          cachedCreds = { port: ports[0], csrf };
          lastCredsCheck = now;
          return cachedCreds;
        }
      }
    }
  } catch (e: unknown) {
    const err = e as Error;
    audioLogger.warn(`Failed to auto-detect language_server: ${err.message}`);
  }

  return cachedCreds ?? { port: 52176, csrf: "ab6faa2f-e834-47f1-994b-cb39112ae062" };
}

export function resolveMimeType(fileName: string, mimeType?: string): string {
  if (mimeType && mimeType.startsWith("audio/")) return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mp3";
  if (lower.endsWith(".m4a")) return "audio/m4a";
  if (lower.endsWith(".webm")) return "audio/webm;codecs=opus";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".pcm")) return "audio/pcm;rate=16000";
  return "audio/wav";
}

export interface TranscribeOptions {
  mimeType?: string;
  model?: string;
  prompt?: string;
}

/**
 * Transcribes an audio buffer using Antigravity models/proactive-observer-v10.
 */
export async function transcribeAudioWithAntigravity(
  audioBuffer: Buffer,
  options: TranscribeOptions = {},
): Promise<string> {
  const creds = getAntigravityCredentials();
  const rawModel = options.model || "models/proactive-observer-v10";
  const model = applyModelAlias(rawModel);
  const mimeType = options.mimeType || "audio/wav";
  const prompt = options.prompt || "";

  return new Promise((resolve, reject) => {
    let sessionId: string | null = null;
    let finalText = "";
    let lastInterim = "";
    let isResolved = false;

    const payload = JSON.stringify({
      mimeType,
      model,
      cascadeId: `transcribe-${Date.now()}`,
      preCursorText: prompt,
      continuous: false,
    });
    const payloadBuf = Buffer.from(payload, "utf8");
    const frame = Buffer.alloc(5 + payloadBuf.length);
    frame.writeUInt8(0, 0);
    frame.writeUInt32BE(payloadBuf.length, 1);
    payloadBuf.copy(frame, 5);

    const streamReq = https.request(
      {
        hostname: "127.0.0.1",
        port: creds.port,
        path: "/exa.language_server_pb.LanguageServerService/StreamAudioTranscription",
        method: "POST",
        rejectUnauthorized: false,
        headers: {
          "Content-Type": "application/connect+json",
          "Connect-Protocol-Version": "1",
          "X-Codeium-Csrf-Token": creds.csrf,
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          cleanup();
          return reject(new Error(`Antigravity StreamAudioTranscription error: HTTP ${res.statusCode}`));
        }

        let buf = Buffer.alloc(0);
        res.on("data", (chunk: Buffer) => {
          buf = Buffer.concat([buf, chunk]);
          while (buf.length >= 5) {
            const flag = buf.readUInt8(0);
            const len = buf.readUInt32BE(1);
            if (buf.length < 5 + len) break;
            const msgBuf = buf.subarray(5, 5 + len);
            buf = buf.subarray(5 + len);

            if (flag === 0) {
              try {
                const msg = JSON.parse(msgBuf.toString("utf8"));
                if (msg.ready?.sessionId) {
                  sessionId = msg.ready.sessionId;
                  sendChunksAndEnd();
                } else if (msg.transcription) {
                  const text = msg.transcription.text || "";
                  if (msg.transcription.isFinal) {
                    finalText += (finalText ? " " : "") + text;
                  } else {
                    lastInterim = text;
                  }
                } else if (msg.complete) {
                  finish();
                }
              } catch (err: unknown) {
                audioLogger.warn(`Failed to parse transcription message: ${err}`);
              }
            } else if (flag === 2) {
              finish();
            }
          }
        });

        res.on("end", () => {
          finish();
        });
      },
    );

    streamReq.on("error", (err) => {
      cleanup();
      reject(err);
    });

    streamReq.write(frame);
    streamReq.end();

    const timeout = setTimeout(() => {
      cleanup();
      if (!isResolved) {
        resolve(finalText || lastInterim);
      }
    }, 30_000);

    function cleanup() {
      clearTimeout(timeout);
      try {
        streamReq.destroy();
      } catch {
        // ignore cleanup error
      }
    }

    function finish() {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve((finalText || lastInterim).trim());
    }

    async function sendChunksAndEnd() {
      if (!sessionId) return;
      const chunkSize = 3200; // 100ms at 16kHz
      let seq = 0;

      for (let i = 0; i < audioBuffer.length; i += chunkSize) {
        const chunk = audioBuffer.subarray(i, Math.min(i + chunkSize, audioBuffer.length));
        const data = JSON.stringify({
          sessionId,
          data: chunk.toString("base64"),
          sequenceNumber: String(seq++),
        });

        await new Promise<void>((r) => {
          const req = https.request(
            {
              hostname: "127.0.0.1",
              port: creds.port,
              path: "/exa.language_server_pb.LanguageServerService/SendAudioChunk",
              method: "POST",
              rejectUnauthorized: false,
              headers: {
                "Content-Type": "application/json",
                "X-Codeium-Csrf-Token": creds.csrf,
                "Content-Length": Buffer.byteLength(data),
              },
            },
            (resp) => {
              resp.resume();
              resp.on("end", () => r());
            },
          );
          req.on("error", () => r());
          req.write(data);
          req.end();
        });
      }

      // End session
      const endData = JSON.stringify({ sessionId });
      https
        .request(
          {
            hostname: "127.0.0.1",
            port: creds.port,
            path: "/exa.language_server_pb.LanguageServerService/EndAudioSession",
            method: "POST",
            rejectUnauthorized: false,
            headers: {
              "Content-Type": "application/json",
              "X-Codeium-Csrf-Token": creds.csrf,
              "Content-Length": Buffer.byteLength(endData),
            },
          },
          (resp) => {
            resp.resume();
          },
        )
        .end(endData);
    }
  });
}

/**
 * Handles standard OpenAI-compatible POST /v1/audio/transcriptions
 */
export async function handleOpenAIAudioTranscriptions(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: "Content-Type must be multipart/form-data for audio transcriptions",
          type: "invalid_request_error",
          param: null,
          code: null,
        },
      }),
    );
    return;
  }

  let rawBody: Buffer;
  try {
    rawBody = await readLimitedBody(req);
  } catch (err: unknown) {
    const error = err as Error;
    res.writeHead(413, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: error.message || "Payload too large",
          type: "invalid_request_error",
        },
      }),
    );
    return;
  }

  let formData: FormData;
  try {
    const responseWrapper = new Response(new Uint8Array(rawBody), {
      headers: { "content-type": contentType },
    });
    formData = await responseWrapper.formData();
  } catch (err: unknown) {
    const error = err as Error;
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: `Failed to parse multipart/form-data: ${error.message}`,
          type: "invalid_request_error",
        },
      }),
    );
    return;
  }

  const fileEntry = formData.get("file");
  if (!fileEntry || typeof fileEntry === "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: "Missing required 'file' parameter",
          type: "invalid_request_error",
          param: "file",
        },
      }),
    );
    return;
  }

  const model = String(formData.get("model") || "models/proactive-observer-v10");
  const prompt = formData.get("prompt") ? String(formData.get("prompt")) : undefined;
  const language = formData.get("language") ? String(formData.get("language")) : undefined;
  const responseFormat = String(formData.get("response_format") || "json").toLowerCase();

  const fileName = (fileEntry as File).name || "audio.wav";
  const mimeType = resolveMimeType(fileName, fileEntry.type);
  const arrayBuf = await fileEntry.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuf);

  try {
    const transcribedText = await transcribeAudioWithAntigravity(audioBuffer, {
      mimeType,
      model,
      prompt,
    });

    if (responseFormat === "text") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(transcribedText);
      return;
    }

    if (responseFormat === "verbose_json") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          task: "transcribe",
          language: language || "es",
          duration: audioBuffer.length / 32000,
          text: transcribedText,
          segments: [],
        }),
      );
      return;
    }

    // Default: json
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ text: transcribedText }));
  } catch (err: unknown) {
    const error = err as Error;
    audioLogger.error(`Transcription failed: ${error.message}`);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: `Transcription error: ${error.message}`,
          type: "api_error",
        },
      }),
    );
  }
}

/**
 * Antigravity real-time streaming audio transcription session.
 */
export class AntigravityAudioSession {
  private port: number;
  private csrf: string;
  public model: string;
  public cascadeId: string;
  public preCursorText: string;
  public postCursorText: string;
  public continuous: boolean;
  public sessionId: string | null = null;
  private seq = 0;
  private streamReq: ClientRequest | null = null;
  private queue: Buffer[] = [];
  private isProcessingQueue = false;
  private pendingEnd = false;
  private onEvent: (event: any) => void;
  private onError: (err: Error) => void;

  constructor(
    creds: AntigravityCredentials,
    options: {
      model?: string;
      cascadeId?: string;
      preCursorText?: string;
      postCursorText?: string;
      continuous?: boolean;
      onEvent?: (event: any) => void;
      onError?: (err: Error) => void;
    } = {},
  ) {
    this.port = creds.port;
    this.csrf = creds.csrf;
    this.model = applyModelAlias(options.model || "models/proactive-observer-v10");
    this.cascadeId = options.cascadeId || `stream-${Date.now()}`;
    this.preCursorText = options.preCursorText || "";
    this.postCursorText = options.postCursorText || "";
    this.continuous = options.continuous ?? false;
    this.onEvent = options.onEvent || (() => {});
    this.onError = options.onError || (() => {});
  }

  public start(): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        mimeType: "audio/pcm;rate=16000",
        model: this.model,
        cascadeId: this.cascadeId,
        preCursorText: this.preCursorText,
        postCursorText: this.postCursorText,
        continuous: this.continuous,
      });
      const payloadBuf = Buffer.from(payload, "utf8");
      const frame = Buffer.alloc(5 + payloadBuf.length);
      frame.writeUInt8(0, 0);
      frame.writeUInt32BE(payloadBuf.length, 1);
      payloadBuf.copy(frame, 5);

      this.streamReq = https.request(
        {
          hostname: "127.0.0.1",
          port: this.port,
          path: "/exa.language_server_pb.LanguageServerService/StreamAudioTranscription",
          method: "POST",
          rejectUnauthorized: false,
          headers: {
            "Content-Type": "application/connect+json",
            "Connect-Protocol-Version": "1",
            "X-Codeium-Csrf-Token": this.csrf,
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            const err = new Error(`Antigravity stream error status: ${res.statusCode}`);
            this.onError(err);
            return reject(err);
          }
          let buf = Buffer.alloc(0);
          res.on("data", (chunk: Buffer) => {
            buf = Buffer.concat([buf, chunk]);
            while (buf.length >= 5) {
              const flag = buf.readUInt8(0);
              const len = buf.readUInt32BE(1);
              if (buf.length < 5 + len) break;
              const msgBuf = buf.subarray(5, 5 + len);
              buf = buf.subarray(5 + len);

              if (flag === 0) {
                try {
                  const msg = JSON.parse(msgBuf.toString("utf8"));
                  if (msg.ready?.sessionId) {
                    this.sessionId = msg.ready.sessionId;
                    resolve(this.sessionId!);
                    this.processQueue();
                  }
                  this.onEvent(msg);
                } catch (e) {
                  audioLogger.error(`Antigravity JSON parse error: ${e}`);
                }
              } else if (flag === 2) {
                this.onEvent({ complete: true });
              }
            }
          });

          res.on("end", () => {
            this.onEvent({ streamEnded: true });
          });
        },
      );

      this.streamReq.on("error", (err) => {
        this.onError(err);
        reject(err);
      });

      this.streamReq.write(frame);
      this.streamReq.end();
    });
  }

  public sendChunk(pcmBuffer: Buffer): void {
    this.queue.push(pcmBuffer);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      if (!this.sessionId) {
        await new Promise((r) => setTimeout(r, 20));
        continue;
      }
      const chunk = this.queue.shift();
      if (chunk) {
        await this.sendChunkUnary(chunk);
      }
    }

    this.isProcessingQueue = false;

    if (this.pendingEnd) {
      this.pendingEnd = false;
      await this.executeEndSession();
    }
  }

  private sendChunkUnary(pcmBuffer: Buffer): Promise<void> {
    if (!this.sessionId) return Promise.resolve();
    const data = JSON.stringify({
      sessionId: this.sessionId,
      data: pcmBuffer.toString("base64"),
      sequenceNumber: String(this.seq++),
    });

    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: "127.0.0.1",
          port: this.port,
          path: "/exa.language_server_pb.LanguageServerService/SendAudioChunk",
          method: "POST",
          rejectUnauthorized: false,
          headers: {
            "Content-Type": "application/json",
            "X-Codeium-Csrf-Token": this.csrf,
            "Content-Length": Buffer.byteLength(data),
          },
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
        },
      );
      req.on("error", (e) => {
        audioLogger.warn(`SendAudioChunk error: ${e.message}`);
        resolve();
      });
      req.write(data);
      req.end();
    });
  }

  public endSession(): Promise<void> {
    if (this.isProcessingQueue || this.queue.length > 0 || !this.sessionId) {
      this.pendingEnd = true;
      return Promise.resolve();
    }
    return this.executeEndSession();
  }

  private executeEndSession(): Promise<void> {
    if (!this.sessionId) return Promise.resolve();
    const data = JSON.stringify({ sessionId: this.sessionId });
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: "127.0.0.1",
          port: this.port,
          path: "/exa.language_server_pb.LanguageServerService/EndAudioSession",
          method: "POST",
          rejectUnauthorized: false,
          headers: {
            "Content-Type": "application/json",
            "X-Codeium-Csrf-Token": this.csrf,
            "Content-Length": Buffer.byteLength(data),
          },
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
        },
      );
      req.on("error", () => resolve());
      req.write(data);
      req.end();
    });
  }

  public destroy(): void {
    if (this.streamReq) {
      try {
        this.streamReq.destroy();
      } catch {
        // ignore destroy error
      }
    }
  }
}

interface AudioWsClient {
  socket: Duplex;
  antigravity: AntigravityAudioSession | null;
  tStartTime: number | null;
  tFirstAntigravity: number | null;
  tStopTime: number | null;
  send: (obj: unknown) => void;
}

function cleanupClient(client: AudioWsClient): void {
  if (client.antigravity) {
    client.antigravity.destroy();
    client.antigravity = null;
  }
}

async function handleClientCommand(client: AudioWsClient, cmd: any): Promise<void> {
  if (cmd.type === "start") {
    cleanupClient(client);

    const creds = getAntigravityCredentials();
    client.tStartTime = Date.now();
    client.tFirstAntigravity = null;
    client.tStopTime = null;

    client.send({
      type: "session_starting",
      event: "session_starting",
      timestamp: client.tStartTime,
    });

    // Initialize Antigravity Session
    client.antigravity = new AntigravityAudioSession(creds, {
      model: cmd.antigravityModel || cmd.model || "models/proactive-observer-v10",
      preCursorText: cmd.preCursorText || "",
      postCursorText: cmd.postCursorText || "",
      continuous: cmd.continuous ?? false,
      onEvent: (event) => {
        const now = Date.now();
        if (event.ready) {
          client.send({
            type: "antigravity_ready",
            event: "ready",
            sessionId: event.ready.sessionId,
          });
        } else if (event.transcription) {
          if (!client.tFirstAntigravity) {
            client.tFirstAntigravity = now;
          }
          const ttft = client.tStartTime ? now - client.tStartTime : 0;
          const latencyFromStop = client.tStopTime ? now - client.tStopTime : null;

          client.send({
            type: "antigravity_transcript",
            event: "transcript",
            text: event.transcription.text || "",
            isFinal: !!event.transcription.isFinal,
            is_final: !!event.transcription.isFinal,
            ttftMs: ttft,
            latencyFromStopMs: latencyFromStop,
            timestamp: now,
          });
        } else if (event.complete) {
          client.send({
            type: "antigravity_complete",
            event: "complete",
            totalDurationMs: client.tStartTime ? now - client.tStartTime : 0,
            timestamp: now,
          });
        }
      },
      onError: (err) => {
        client.send({
          type: "antigravity_error",
          event: "error",
          message: err.message,
        });
      },
    });

    try {
      await client.antigravity.start();
    } catch (e: any) {
      client.send({
        type: "antigravity_error",
        event: "error",
        message: e.message || String(e),
      });
    }

    client.send({
      type: "ready_to_receive_audio",
      event: "ready_to_receive_audio",
    });
  } else if (cmd.type === "stop") {
    client.tStopTime = Date.now();
    client.send({
      type: "audio_stopped",
      event: "audio_stopped",
      timestamp: client.tStopTime,
    });

    if (client.antigravity) {
      await client.antigravity.endSession();
    }
  } else if (cmd.type === "test_sample") {
    await runTestSample(client, cmd.sample || "es");
  }
}

function handleAudioChunk(client: AudioWsClient, pcmBuffer: Buffer): void {
  // If Antigravity session was not explicitly started via JSON command, start it automatically
  if (!client.antigravity) {
    const creds = getAntigravityCredentials();
    client.tStartTime = Date.now();
    client.antigravity = new AntigravityAudioSession(creds, {
      model: "models/proactive-observer-v10",
      continuous: true,
      onEvent: (event) => {
        if (event.ready) {
          client.send({
            type: "antigravity_ready",
            event: "ready",
            sessionId: event.ready.sessionId,
          });
        } else if (event.transcription) {
          client.send({
            type: "antigravity_transcript",
            event: "transcript",
            text: event.transcription.text || "",
            isFinal: !!event.transcription.isFinal,
            is_final: !!event.transcription.isFinal,
          });
        } else if (event.complete) {
          client.send({ type: "antigravity_complete", event: "complete" });
        }
      },
      onError: (err) => {
        client.send({
          type: "antigravity_error",
          event: "error",
          message: err.message,
        });
      },
    });
    client.antigravity.start().catch((err) => {
      audioLogger.error(`Auto-start Antigravity session failed: ${err}`);
    });
  }

  client.antigravity.sendChunk(pcmBuffer);
}

async function runTestSample(client: AudioWsClient, _lang: string): Promise<void> {
  const samplePath = "/tmp/test_hello.wav";
  if (!fs.existsSync(samplePath)) {
    try {
      cp.execSync(
        'say -o /tmp/test_hello.aiff "Hello Antigravity, testing audio transcription" && afconvert -f WAVE -d LEI16@16000 /tmp/test_hello.aiff /tmp/test_hello.wav',
      );
    } catch {
      client.send({
        type: "antigravity_error",
        message: "No test sample found and afconvert not available.",
      });
      return;
    }
  }

  const wav = fs.readFileSync(samplePath);
  const rawPcm = wav.subarray(44);

  await handleClientCommand(client, {
    type: "start",
    language: "en",
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  });

  let attempts = 0;
  while ((!client.antigravity || !client.antigravity.sessionId) && attempts++ < 60) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const chunkSize = 3200; // 100ms
  for (let i = 0; i < rawPcm.length; i += chunkSize) {
    const chunk = rawPcm.subarray(i, Math.min(i + chunkSize, rawPcm.length));
    handleAudioChunk(client, chunk);
    await new Promise((r) => setTimeout(r, 40));
  }

  await handleClientCommand(client, { type: "stop" });
}

/**
 * Handles WebSocket streaming on /ws, /ws/audio, /v1/audio/transcriptions/stream, or /v1/listen
 */
export function handleAudioWebSocket(req: IncomingMessage, socket: Duplex): void {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: " +
      accept +
      "\r\n\r\n",
  );

  const client: AudioWsClient = {
    socket,
    antigravity: null,
    tStartTime: null,
    tFirstAntigravity: null,
    tStopTime: null,
    send(obj: unknown) {
      try {
        const str = JSON.stringify(obj);
        const buf = Buffer.from(str, "utf8");
        let header: Buffer;
        if (buf.length < 126) {
          header = Buffer.alloc(2);
          header[0] = 0x81;
          header[1] = buf.length;
        } else if (buf.length < 65536) {
          header = Buffer.alloc(4);
          header[0] = 0x81;
          header[1] = 126;
          header.writeUInt16BE(buf.length, 2);
        } else {
          header = Buffer.alloc(10);
          header[0] = 0x81;
          header[1] = 127;
          header.writeBigUInt64BE(BigInt(buf.length), 2);
        }
        socket.write(Buffer.concat([header, buf]));
      } catch {
        // socket write error or closed
      }
    },
  };

  // Send initial system info
  const creds = getAntigravityCredentials();
  client.send({
    type: "system_status",
    event: "system_status",
    antigravity: { detected: true, port: creds.port },
  });

  let incomingBuffer = Buffer.alloc(0);

  socket.on("data", async (chunk: Buffer) => {
    incomingBuffer = Buffer.concat([incomingBuffer, chunk]);
    while (incomingBuffer.length >= 2) {
      const firstByte = incomingBuffer[0];
      const secondByte = incomingBuffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;

      let offset = 2;
      if (payloadLength === 126) {
        if (incomingBuffer.length < 4) break;
        payloadLength = incomingBuffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (incomingBuffer.length < 10) break;
        payloadLength = Number(incomingBuffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskLength = isMasked ? 4 : 0;
      if (incomingBuffer.length < offset + maskLength + payloadLength) break;

      let mask: Buffer | null = null;
      if (isMasked) {
        mask = incomingBuffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const rawPayload = incomingBuffer.subarray(offset, offset + payloadLength);
      incomingBuffer = incomingBuffer.subarray(offset + payloadLength);

      const payload = Buffer.alloc(payloadLength);
      if (isMasked && mask) {
        for (let i = 0; i < payloadLength; i++) {
          payload[i] = rawPayload[i] ^ mask[i % 4];
        }
      } else {
        rawPayload.copy(payload);
      }

      // Handle frame
      if (opcode === 8) {
        // Close
        cleanupClient(client);
        socket.end();
        break;
      } else if (opcode === 9) {
        // Ping -> Pong
        const pong = Buffer.alloc(2);
        pong[0] = 0x8a;
        pong[1] = 0;
        socket.write(pong);
      } else if (opcode === 1) {
        // Text frame (JSON command)
        try {
          const cmd = JSON.parse(payload.toString("utf8"));
          await handleClientCommand(client, cmd);
        } catch (e) {
          audioLogger.error(`Error processing text frame: ${e}`);
        }
      } else if (opcode === 2) {
        // Binary frame (Audio PCM 16kHz Chunk)
        handleAudioChunk(client, payload);
      }
    }
  });

  socket.on("close", () => {
    cleanupClient(client);
  });

  socket.on("error", () => {
    cleanupClient(client);
  });
}

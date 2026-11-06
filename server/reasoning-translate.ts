import { spawnProcess, terminateProcess } from "@getpaseo/plugin/server";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { ReasoningTranslation, ReasoningView, TranslatorState } from "../shared/reasoning";
import { onJsonLines, withTimeout, type JsonObject } from "./json-lines";
import { renderReasoning, segmentReasoning, sentencesOf } from "./reasoning-text";
import type { AccountStore } from "./store";

const THREADS = 4;
const READY_MS = 30_000;
const REQUEST_MS = 120_000;
// 번역기 프로세스가 수백 MB를 쓴다. 다시 띄우는 비용은 1초 안쪽이라 쉬면 끄는 쪽이 싸다.
const IDLE_MS = 5 * 60_000;
const QUIT_MS = 2_000;
const RETRY_MS = 60_000;
// 생각이 많은 턴은 한 번에 수십 줄이 온다(실측 p90 54줄, 최대 293줄).
const BATCH = 24;
const CACHE_MAX = 20_000;
const STDERR_KEEP = 400;
const ERROR_LIMIT = 200;

type Answer = { ok: true; translations: string[] } | { ok: false; error: string; dead: boolean };

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > ERROR_LIMIT ? `${text.slice(0, ERROR_LIMIT)}…` : text;
}

/**
 * 번역기와의 약속(실행 파일은 아직 없다): 실행 `opus-mt-ko.exe --model <폴더> --threads 4`, 뜨면 `{"ready":true,"model":"..."}`,
 * 요청 `{"id":"..","segments":[..]}` → 응답 `{"id":"..","translations":[..]}` 또는 `{"id":"..","error":".."}`, 끝낼 때 `{"type":"quit"}`.
 *
 * 캐시가 글 전체가 아니라 문장 단위인 이유: 생각 글에는 "Let me check the file." 같은 같은 문장이 하루에 수백 번 나온다.
 */
export class ReasoningTranslator {
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private state: TranslatorState = "ready";
  private error: string | null = null;
  private failedAt = 0;
  private quitting = false;
  private stderr = "";
  private nextId = 0;
  private pumping = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** 캐시 열쇠 → 자리표시자가 그대로 든 한국어 문장. 번역하지 못한 문장은 가린 원문을 넣어 다시 보내지 않는다. */
  private readonly cache = new Map<string, string>();
  // Map이라 같은 문장이 여러 줄에 나와도 한 번만 보낸다.
  private readonly queue = new Map<string, string>();
  private readonly pending = new Map<string, (message: JsonObject) => void>();

  constructor(private readonly store: AccountStore) {}

  status(): ReasoningView {
    if (this.state !== "loading" && this.state !== "failed") this.state = this.paths() ? "ready" : "missing";
    return { enabled: this.store.reasoningTranslate, translator: this.state, error: this.error };
  }

  translate(text: string): ReasoningTranslation {
    if (!this.store.reasoningTranslate) return { status: "off" };
    const segments = segmentReasoning(text);
    const missing = sentencesOf(segments).filter((segment) => !this.cache.has(this.key(segment.hash)));
    if (missing.length === 0) return { status: "ready", markdown: renderReasoning(segments, (hash) => this.cache.get(this.key(hash))) };
    if (this.unusable()) return { status: "unavailable", translator: this.state, error: this.error };
    for (const segment of missing) this.queue.set(this.key(segment.hash), segment.masked);
    void this.pump();
    return { status: "pending" };
  }

  async stop(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.queue.clear();
    const child = this.child;
    if (!child) return;
    this.quitting = true;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.stdin.write(`${JSON.stringify({ type: "quit" })}\n`);
    const kill = setTimeout(() => void terminateProcess(child), QUIT_MS);
    await exited;
    clearTimeout(kill);
    this.quitting = false;
  }

  // 실패는 바로 다시 띄워 보지 않는다. 띄울 수 없는 번역기에 수십 줄이 줄줄이 재시도를 걸면 턴마다 되풀이된다.
  private unusable(): boolean {
    if (this.state === "failed") return Date.now() - this.failedAt < RETRY_MS;
    if (this.state === "loading") return false;
    this.state = this.paths() ? "ready" : "missing";
    return this.state === "missing";
  }

  private paths(): { exe: string; model: string } | null {
    const { exe, model } = this.store.translator;
    return existsSync(exe) && existsSync(model) ? { exe, model } : null;
  }

  // 번역 결과는 모델과 실행 옵션에 딸려 있다. 띄우기 전에도 캐시를 찾아야 해서 ready 줄의 모델 이름 대신 모델 폴더 이름을 쓴다.
  private key(hash: string): string {
    return `${basename(this.store.translator.model)}|${THREADS}|${hash}`;
  }

  private remember(key: string, korean: string): void {
    this.cache.set(key, korean);
    while (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.size > 0) {
        const batch = [...this.queue].slice(0, BATCH);
        for (const [key] of batch) this.queue.delete(key);
        const answer = await this.request(batch.map(([, masked]) => masked));
        if (answer.ok) {
          batch.forEach(([key], index) => this.remember(key, answer.translations[index]));
          continue;
        }
        this.fail(answer.error);
        if (answer.dead) {
          // 응답이 없는 번역기를 그냥 두면 수백 MB를 쥐고 남는다. 줄도 쌓아 두지 않는다 — 화면이 다시 물으면 그때 다시 넣는다.
          await this.stop();
          return;
        }
        // 번역기가 살아 있는데 이 묶음을 거절했다. 같은 문장을 다시 보내지 않도록 원문으로 못 박는다.
        for (const [key, masked] of batch) this.remember(key, masked);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async request(segments: string[]): Promise<Answer> {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = await this.ensureChild();
    } catch (error) {
      return { ok: false, error: errorText(error), dead: true };
    }
    const id = String(++this.nextId);
    const response = new Promise<Answer>((resolve) => {
      this.pending.set(id, (message) => {
        if (typeof message.error === "string") resolve({ ok: false, error: message.error.slice(0, ERROR_LIMIT), dead: this.child === null });
        else if (!Array.isArray(message.translations) || message.translations.length !== segments.length || message.translations.some((item) => typeof item !== "string")) {
          resolve({ ok: false, error: "번역기 응답이 요청과 맞지 않습니다.", dead: false });
        } else resolve({ ok: true, translations: message.translations as string[] });
      });
    });
    child.stdin.write(`${JSON.stringify({ id, segments })}\n`);
    this.touch();
    return withTimeout(response, REQUEST_MS, "번역기")
      .catch((error: unknown) => ({ ok: false as const, error: errorText(error), dead: true }))
      .finally(() => this.pending.delete(id));
  }

  private async ensureChild(): Promise<ChildProcessWithoutNullStreams> {
    if (this.child) return this.child;
    this.starting ??= this.start().finally(() => {
      this.starting = null;
    });
    await this.starting;
    if (!this.child) throw new Error(this.error ?? "번역기를 띄우지 못했습니다.");
    return this.child;
  }

  private async start(): Promise<void> {
    const paths = this.paths();
    if (!paths) {
      this.state = "missing";
      this.error = null;
      throw new Error("번역기 실행 파일이나 모델이 없습니다.");
    }
    this.state = "loading";
    this.stderr = "";
    const child = spawnProcess(paths.exe, ["--model", paths.model, "--threads", String(THREADS)], {
      stdio: "pipe",
      env: process.env,
      windowsHide: true,
    });
    // 표준오류를 읽지 않으면 파이프가 차서 자식이 멈춘다.
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_KEEP);
    });
    const ready = new Promise<void>((resolve, reject) => {
      onJsonLines(child, (message) => {
        if (message.ready === true) return resolve();
        const id = typeof message.id === "string" ? message.id : null;
        if (id) this.pending.get(id)?.(message);
      });
      child.once("error", reject);
      child.once("exit", (code, signal) => reject(new Error(`번역기가 ${String(code ?? signal)}로 끝났습니다. ${this.stderr.trim()}`.trim())));
    });
    try {
      await withTimeout(ready, READY_MS, "번역기 준비");
    } catch (error) {
      await terminateProcess(child).catch(() => undefined);
      this.fail(errorText(error));
      throw error;
    }
    child.once("exit", (code, signal) => this.onExit(code, signal));
    this.child = child;
    this.state = "ready";
    this.error = null;
    this.touch();
  }

  private onExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.child = null;
    const failure = `번역기가 멈췄습니다 (${String(code ?? signal)}). ${this.stderr.trim()}`.trim();
    for (const answer of [...this.pending.values()]) answer({ error: failure });
    this.pending.clear();
    // 실패를 적어 둔 뒤 끄는 길도 있어서(pump), 끄는 중이라고 실패 표시를 지우지 않는다.
    if (!this.quitting) this.fail(failure);
    else if (this.state !== "failed") this.state = this.paths() ? "ready" : "missing";
  }

  private fail(message: string): void {
    this.state = "failed";
    this.error = message;
    this.failedAt = Date.now();
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.stop(), IDLE_MS);
  }
}

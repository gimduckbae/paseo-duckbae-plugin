import { execCommand } from "@getpaseo/plugin/server";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { withTimeout } from "./json-lines";
import type { AccountStore } from "./store";

const RELEASE = "https://github.com/gimduckbae/paseo-duckbae-plugin/releases/download/translator-v1";
const SUMS = "SHA256SUMS.txt";
// 윈도에 들어 있는 bsdtar가 zip을 푼다. 이 플러그인은 git 설치라 npm 패키지를 받을 수 없어 압축 라이브러리를 쓸 수 없다.
const TAR = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
const SMALL_MS = 30_000;
const TAR_MS = 10 * 60_000;
const ATTEMPTS = 3;
const ERROR_LIMIT = 200;

interface Archive {
  zip: string;
  /** zip 안에는 폴더가 한 겹 더 있다. */
  inner: string;
  place: "exe" | "model";
}

const ARCHIVES: Archive[] = [
  { zip: "opus-mt-ko-win-x64.zip", inner: "opus-mt-ko-win-x64", place: "exe" },
  { zip: "opus-mt-tc-big-en-ko-ct2-int8.zip", inner: "opus-mt-tc-big-en-ko-ct2-int8", place: "model" },
];

export type InstallPhase = "idle" | "downloading" | "extracting" | "failed";

export interface InstallStatus {
  phase: InstallPhase;
  supported: boolean;
  needed: boolean;
  received: number;
  total: number;
  error: string | null;
}

// 이 저장소 타입 설정에서는 signal.throwIfAborted()가 안 보인다(tsc --noEmit로 확인, 2026-11-06).
function stopIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("받기를 멈췄습니다.");
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > ERROR_LIMIT ? `${text.slice(0, ERROR_LIMIT)}…` : text;
}

/** SHA256SUMS.txt 줄 모양은 `<sha256> *dist/<파일이름>`이다. */
export function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(\S.*)$/.exec(line.trim());
    if (match) sums.set(basename(match[2].trim()), match[1].toLowerCase());
  }
  return sums;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/**
 * 받기는 사용자가 추론 훔쳐보기를 켤 때만 시작한다 — 플러그인이 뜰 때 몰래 받으면 안 된다.
 * 받기가 플러그인을 멈추게 해서는 안 되므로 실패를 던지지 않고 status()로만 드러낸다.
 */
export class TranslatorDownload {
  private phase: InstallPhase = "idle";
  private received = 0;
  private total = 0;
  private error: string | null = null;
  private running: Promise<void> | null = null;
  private aborter: AbortController | null = null;

  constructor(
    private readonly store: AccountStore,
    private readonly release: string = RELEASE,
  ) {}

  /** 번역기는 PyInstaller로 묶은 윈도 x64 빌드 하나뿐이다. */
  get supported(): boolean {
    return process.platform === "win32" && process.arch === "x64";
  }

  status(): InstallStatus {
    return {
      phase: this.phase,
      supported: this.supported,
      needed: this.supported && this.wanted().length > 0,
      received: this.received,
      total: this.total,
      error: this.error,
    };
  }

  start(): void {
    if (this.running || !this.supported || this.wanted().length === 0) return;
    this.phase = "downloading";
    this.received = 0;
    this.total = 0;
    this.error = null;
    const aborter = new AbortController();
    this.aborter = aborter;
    this.running = this.run(aborter.signal)
      .then(() => {
        this.phase = "idle";
      })
      .catch((error: unknown) => {
        if (aborter.signal.aborted) {
          this.phase = "idle";
          return;
        }
        this.phase = "failed";
        this.error = errorText(error);
      })
      .finally(() => {
        this.running = null;
        this.aborter = null;
      });
  }

  /** 받던 zip은 남겨 둔다 — 다시 켜면 그 자리에서 이어받는다. */
  async abort(): Promise<void> {
    this.aborter?.abort();
    await this.running;
  }

  /** 끈 사람 디스크에 받다 만 zip을 남기지 않는다. */
  async discard(): Promise<void> {
    await this.abort();
    await rm(this.work, { recursive: true, force: true }).catch(() => undefined);
    this.phase = "idle";
    this.received = 0;
    this.total = 0;
    this.error = null;
  }

  private get work(): string {
    return join(this.store.root, "translate-download");
  }

  private wanted(): Archive[] {
    const places = this.store.translator;
    return ARCHIVES.filter((archive) => !existsSync(archive.place === "exe" ? places.exe : places.model));
  }

  private async run(signal: AbortSignal): Promise<void> {
    const archives = this.wanted();
    if (archives.length === 0) return;
    await mkdir(this.work, { recursive: true });
    const sums = parseSums(await this.text(SUMS, signal));
    const sizes = await Promise.all(archives.map((archive) => this.size(archive.zip, signal)));
    this.total = sizes.reduce((sum, size) => sum + size, 0);
    let done = 0;
    for (const [index, archive] of archives.entries()) {
      const expected = sums.get(archive.zip);
      if (!expected) throw new Error(`${SUMS}에 ${archive.zip}이 없습니다.`);
      const base = done;
      await this.pull(archive.zip, expected, sizes[index], (received) => {
        this.received = base + received;
      }, signal);
      done += sizes[index];
    }
    this.phase = "extracting";
    for (const archive of archives) {
      stopIfAborted(signal);
      await this.place(archive);
    }
    const places = this.store.translator;
    if (!existsSync(places.exe)) throw new Error("압축을 풀었지만 번역기 실행 파일이 없습니다.");
    if (!existsSync(places.model)) throw new Error("압축을 풀었지만 모델 폴더가 없습니다.");
    await rm(this.work, { recursive: true, force: true });
  }

  private async text(name: string, signal: AbortSignal): Promise<string> {
    const read = async (): Promise<string> => {
      const response = await fetch(`${this.release}/${name}`, { signal });
      if (!response.ok) throw new Error(`${name}을 받지 못했습니다. HTTP ${String(response.status)}`);
      return await response.text();
    };
    return withTimeout(read(), SMALL_MS, name);
  }

  // 전체 크기를 먼저 물어야 퍼센트가 뒤로 가지 않는다. 받기 시작하고 세면 파일마다 0%부터 다시 오른다.
  private async size(name: string, signal: AbortSignal): Promise<number> {
    const ask = async (): Promise<number> => {
      const response = await fetch(`${this.release}/${name}`, { method: "HEAD", signal });
      if (!response.ok) throw new Error(`${name} 크기를 묻지 못했습니다. HTTP ${String(response.status)}`);
      return Number(response.headers.get("content-length") ?? 0);
    };
    return withTimeout(ask(), SMALL_MS, `${name} 크기`);
  }

  private async pull(zip: string, expected: string, size: number, onProgress: (received: number) => void, signal: AbortSignal): Promise<void> {
    // 해시까지 맞은 것만 .part에서 옮겨 온다. 다시 받을 때 어디까지 믿을 수 있는지 이 이름이 가른다.
    const kept = join(this.work, zip);
    const part = `${kept}.part`;
    if (!existsSync(kept)) {
      let last = "";
      let got = false;
      for (let attempt = 1; attempt <= ATTEMPTS && !got; attempt += 1) {
        try {
          await this.body(zip, part, onProgress, signal);
          got = true;
        } catch (error) {
          stopIfAborted(signal);
          last = errorText(error);
        }
      }
      if (!got) throw new Error(`${zip}을 내려받지 못했습니다. ${last}`);
      if ((await sha256File(part)) !== expected) {
        // 해시가 다른 파일은 이어받아도 고쳐지지 않는다.
        await rm(part, { force: true });
        throw new Error(`${zip}의 sha256이 ${SUMS}과 다릅니다.`);
      }
      await rename(part, kept);
    }
    onProgress(size);
  }

  private async body(zip: string, part: string, onProgress: (received: number) => void, signal: AbortSignal): Promise<void> {
    const offset = (await stat(part).catch(() => null))?.size ?? 0;
    const response = await fetch(`${this.release}/${zip}`, { signal, headers: offset > 0 ? { Range: `bytes=${String(offset)}-` } : {} });
    if (!response.ok || !response.body) throw new Error(`HTTP ${String(response.status)}`);
    // 206이 아니면 Range를 무시하고 처음부터 보낸 것이다. 그걸 이어 쓰면 파일이 깨진다.
    const append = response.status === 206;
    let received = append ? offset : 0;
    onProgress(received);
    await pipeline(
      Readable.fromWeb(response.body),
      async function* (source: AsyncIterable<Uint8Array>) {
        for await (const chunk of source) {
          received += chunk.byteLength;
          onProgress(received);
          yield chunk;
        }
      },
      createWriteStream(part, { flags: append ? "a" : "w" }),
      { signal },
    );
  }

  private async place(archive: Archive): Promise<void> {
    const stage = join(this.work, `stage-${archive.place}`);
    await rm(stage, { recursive: true, force: true });
    await mkdir(stage, { recursive: true });
    await execCommand(TAR, ["-xf", join(this.work, archive.zip), "-C", stage], { env: process.env, timeout: TAR_MS });
    const inner = join(stage, archive.inner);
    const places = this.store.translator;
    if (archive.place === "model") {
      await mkdir(dirname(places.model), { recursive: true });
      await rename(inner, places.model);
      return;
    }
    const folder = dirname(places.exe);
    await mkdir(folder, { recursive: true });
    for (const entry of await readdir(inner)) {
      const target = join(folder, entry);
      // 실행 파일만 없고 _internal이 남아 있을 수 있다(앞선 풀기가 중간에 멈춘 자리). 덮어쓰기로는 rename이 안 된다.
      await rm(target, { recursive: true, force: true });
      await rename(join(inner, entry), target);
    }
  }
}

import type { PaseoApi } from "./paseo-types";
import { execCommand, spawnProcess, type PluginHookAgent } from "@getpaseo/plugin/server";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PLUGIN_ID, UPDATE_CARD_ITEM_KIND, type UpdateCardItem, type UpdateMode, type UpdateStatus } from "../shared/update";
import { isObject, withTimeout, type JsonObject } from "./json-lines";
import type { AccountStore, PendingUpdate } from "./store";

const FIRST_CHECK_DELAY_MS = 20_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// 업데이트하면 플러그인이 다시 떠서 이어가기·로그인처럼 진행 중인 일이 끊긴다. 자동 업데이트는 그런 일이 끝난 뒤로 미룬다.
const BUSY_RETRY_MS = 5 * 60 * 1000;
// 업데이트로 다시 뜬 직후에는 데몬이 아직 그 업데이트 요청을 마무리하는 중이다.
const PENDING_CHECK_DELAY_MS = 15_000;
const CLI_TIMEOUT_MS = 120_000;
const CHANGES_LIMIT = 20;
const ERROR_LIMIT = 300;

type Source = UpdateStatus["source"];
type OfferItem = Extract<UpdateCardItem, { kind: "offer" }>;

// 데스크톱 앱은 CLI를 PATH에 넣지 않는다. 플러그인 프로세스는 앱 실행 파일로 돌므로 그 옆 resources/bin에서 찾는다(0.13 desktop cli-install/path.ts).
// CLI로 띄운 데몬이면 paseo.cmd가 PASEO_CLI를 넣어 둔다.
function paseoCli(): string {
  const name = process.platform === "win32" ? "paseo.cmd" : "paseo";
  const appDir = dirname(process.execPath);
  const bundled = process.platform === "darwin" ? join(appDir, "..", "Resources", "bin", name) : join(appDir, "resources", "bin", name);
  return [process.env.PASEO_CLI, bundled].find((path): path is string => Boolean(path && existsSync(path))) ?? "paseo";
}

// Windows에서 분리 실행(detached)한 Node는 출력을 파일로 돌려도 아무것도 쓰지 않는다(2026-10-28 실측, echo는 됨).
// 분리하지 않으면 libuv가 부모와 같은 작업 묶음(job)에 넣어 플러그인이 내려갈 때 같이 꺼진다.
// 그래서 분리 실행한 이 중계 스크립트가 CLI를 파이프로 띄워 결과를 파일에 쓴다.
const RUNNER = `
const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const [cli, log, ...args] = process.argv.slice(1);
const child = process.platform === "win32" && /\\.(cmd|bat)$/i.test(cli)
  ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", '""' + cli + '" ' + args.join(" ") + '"'], { windowsHide: true, windowsVerbatimArguments: true })
  : spawn(cli, args);
let out = "";
child.stdout.on("data", (chunk) => (out += chunk));
child.stderr.on("data", (chunk) => (out += chunk));
child.on("error", (error) => writeFileSync(log, String(error)));
child.on("close", (code) => writeFileSync(log, out || "exit " + code));
`;

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > ERROR_LIMIT ? `${trimmed.slice(0, ERROR_LIMIT)}…` : trimmed;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// --json 출력은 플러그인마다 결과 하나씩인 배열이다. 오류면 종료 코드가 1이어도 같은 배열을 낸다(0.13 CLI 실측).
function pluginEntry(stdout: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return Array.isArray(parsed) ? (parsed.find((item): item is JsonObject => isObject(item) && item.id === PLUGIN_ID) ?? null) : null;
  } catch {
    return null;
  }
}

async function runCheck(): Promise<JsonObject> {
  let stdout: string;
  try {
    ({ stdout } = await execCommand(paseoCli(), ["plugin", "update", PLUGIN_ID, "--check", "--json"], { env: process.env, timeout: CLI_TIMEOUT_MS }));
  } catch (error) {
    stdout = isObject(error) && typeof error.stdout === "string" ? error.stdout : "";
    if (!pluginEntry(stdout)) throw error;
  }
  const entry = pluginEntry(stdout);
  if (!entry) throw new Error("Paseo CLI 응답을 읽지 못했습니다.");
  return entry;
}

function githubRepo(remote: string): string | null {
  return /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote)?.[1] ?? null;
}

async function commitTitles(remote: string, from: string, to: string): Promise<string[]> {
  const repo = githubRepo(remote);
  if (!repo) return [];
  try {
    const response = await withTimeout(
      fetch(`https://api.github.com/repos/${repo}/compare/${from}...${to}`, { headers: { Accept: "application/vnd.github+json", "User-Agent": PLUGIN_ID } }),
      10_000,
      "GitHub",
    );
    if (!response.ok) return [];
    const body: unknown = await response.json();
    const commits = isObject(body) && Array.isArray(body.commits) ? body.commits : [];
    return commits
      .map((item) => (isObject(item) && isObject(item.commit) && typeof item.commit.message === "string" ? item.commit.message.split("\n")[0].trim() : ""))
      .filter(Boolean)
      .reverse()
      .slice(0, CHANGES_LIMIT);
  } catch {
    return [];
  }
}

function card(item: UpdateCardItem) {
  return { type: "plugin" as const, id: `plugin-update-${item.cardId}`, kind: UPDATE_CARD_ITEM_KIND, version: 1, data: item };
}

/**
 * Paseo CLI(`paseo plugin update`)로 이 플러그인의 새 버전을 확인하고 적용한다. 플러그인 API에는 업데이트 수단이 없다(0.13).
 * 적용하면 데몬이 이 프로세스를 내리고 새 버전을 띄우므로, 명령은 따로 떨어진 프로세스로 띄우고 결과는 새 플러그인이 확인한다.
 */
export class PluginUpdater {
  private source: Source = "unknown";
  private current: string | null = null;
  private latest: string | null = null;
  private remote: string | null = null;
  private changes: string[] = [];
  private checkedAt: string | null = null;
  private error: string | null = null;
  private running: Promise<void> | null = null;
  private applying = false;
  private timers: NodeJS.Timeout[] = [];
  private retry: NodeJS.Timeout | null = null;
  // 이 플러그인은 데몬 쪽 API를 훅·RPC 안에서만 받는다. 그 밖에서 정한 카드 결과는 다음 훅·RPC 때 붙인다.
  private cardResults: { agentId: string; item: UpdateCardItem }[] = [];

  constructor(
    private readonly store: AccountStore,
    private readonly isBusy: () => boolean,
  ) {}

  get logPath(): string {
    return join(this.store.root, "update-run.log");
  }

  start(): void {
    const pending = this.store.pendingUpdate !== null;
    if (pending || this.store.updateMode !== "off") {
      this.timers.push(setTimeout(() => void this.check().catch(() => undefined), pending ? PENDING_CHECK_DELAY_MS : FIRST_CHECK_DELAY_MS));
    }
    const every = setInterval(() => {
      if (this.store.updateMode !== "off") void this.check().catch(() => undefined);
    }, CHECK_INTERVAL_MS);
    this.timers.push(every);
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer);
    if (this.retry) clearTimeout(this.retry);
    this.timers = [];
  }

  status(): UpdateStatus {
    const last = this.store.lastUpdate;
    return {
      mode: this.store.updateMode,
      source: this.source,
      current: this.current,
      latest: this.latest,
      available: this.available,
      changes: this.available ? this.changes : [],
      checkedAt: this.checkedAt,
      checking: this.running !== null,
      applying: this.applying,
      error: this.error,
      lastUpdate: last,
    };
  }

  private get available(): boolean {
    return this.latest !== null && this.latest !== this.current && (this.source === "git" || this.source === "npm");
  }

  check(): Promise<void> {
    this.running ??= this.runCheck().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runCheck(): Promise<void> {
    let entry: JsonObject;
    try {
      entry = await runCheck();
    } catch (error) {
      this.error = `업데이트를 확인하지 못했습니다. ${clip(errorText(error))}`;
      return;
    }
    const current = isObject(entry.current) ? entry.current : {};
    const identity = isObject(current.identity) ? current.identity : {};
    const target = isObject(entry.target) ? entry.target : {};
    const outcome = entry.outcome;
    this.checkedAt = new Date().toISOString();
    this.source = outcome === "local" || identity.kind === "directory" ? "local" : identity.kind === "git" ? "git" : identity.kind === "npm" ? "npm" : "unknown";
    this.remote = typeof identity.remote === "string" ? identity.remote : null;
    this.current = typeof current.currentRevision === "string" ? current.currentRevision : null;
    this.error = outcome === "error" ? `업데이트를 확인하지 못했습니다. ${clip(typeof entry.error === "string" ? entry.error : "")}` : null;
    const latest = typeof target.commit === "string" ? target.commit : typeof target.version === "string" ? target.version : null;
    if (outcome === "update" && latest) {
      if (latest !== this.latest) this.changes = this.remote && this.current ? await commitTitles(this.remote, this.current, latest) : [];
      this.latest = latest;
    } else {
      this.latest = outcome === "current" || outcome === "installed-newer" ? this.current : null;
      this.changes = [];
    }
    await this.settlePending();
    if (this.available && this.store.updateMode === "auto") this.autoApply();
  }

  /** 업데이트 명령을 띄운 뒤 다시 확인했을 때 설치된 버전이 목표와 같으면 끝난 것이다. */
  private async settlePending(): Promise<void> {
    const pending = this.store.pendingUpdate;
    if (!pending || this.applying || !this.current) return;
    if (this.current === pending.to) {
      await this.store.setUpdate({ pendingUpdate: undefined, lastUpdate: { from: pending.from, to: pending.to, at: new Date().toISOString() } });
      this.queueCard(pending, "updated", null);
      return;
    }
    const reason = await this.failureReason();
    this.error = `업데이트하지 못했습니다. ${reason}`;
    await this.store.setUpdate({ pendingUpdate: undefined });
    this.queueCard(pending, "failed", reason);
  }

  private async failureReason(): Promise<string> {
    const log = await readFile(this.logPath, "utf8").catch(() => "");
    const entry = pluginEntry(log);
    if (entry && typeof entry.error === "string") return clip(entry.error);
    const lines = log.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.length ? clip(lines[lines.length - 1]) : "설치된 버전이 바뀌지 않았습니다.";
  }

  private queueCard(pending: PendingUpdate, answer: OfferItem["answer"], error: string | null): void {
    if (!pending.card) return;
    const { agentId, cardId, latest, changes } = pending.card;
    this.cardResults.push({ agentId, item: { kind: "offer", cardId, latest, changes, answer, error } });
  }

  async flushCards(paseo: PaseoApi): Promise<void> {
    const results = this.cardResults.splice(0);
    await Promise.all(results.map(({ agentId, item }) => paseo.agents.ref(agentId).timeline.append(card(item)).catch(() => undefined)));
  }

  private autoApply(): void {
    if (this.retry) return;
    if (this.isBusy()) {
      this.retry = setTimeout(() => {
        this.retry = null;
        if (this.available && this.store.updateMode === "auto") this.autoApply();
      }, BUSY_RETRY_MS);
      return;
    }
    void this.apply(null).catch(() => undefined);
  }

  async apply(from: { agentId: string; item: OfferItem } | null): Promise<void> {
    if (this.applying) return;
    if (this.source === "local") throw new Error("폴더에서 설치한 플러그인은 업데이트할 수 없습니다.");
    if (!this.available || !this.current || !this.latest) throw new Error("새 버전이 없습니다.");
    this.applying = true;
    this.error = null;
    const pending: PendingUpdate = {
      from: this.current,
      to: this.latest,
      at: new Date().toISOString(),
      ...(from ? { card: { agentId: from.agentId, cardId: from.item.cardId, latest: from.item.latest, changes: from.item.changes } } : {}),
    };
    await this.store.setUpdate({ pendingUpdate: pending });
    await rm(this.logPath, { force: true });
    try {
      // 데스크톱 앱에서는 process.execPath가 앱 실행 파일이라 Node로 돌게 한다.
      const child = spawnProcess(process.execPath, ["-e", RUNNER, paseoCli(), this.logPath, "plugin", "update", PLUGIN_ID, "--yes", "--json"], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
      // 업데이트되면 이 프로세스가 먼저 내려가 이 알림을 받지 못한다. 받으면 업데이트되지 않은 것이다.
      child.once("exit", () => void this.afterApplyExit());
      child.once("error", () => void this.afterApplyExit());
      child.unref();
    } catch (error) {
      this.applying = false;
      await this.store.setUpdate({ pendingUpdate: undefined });
      this.error = `업데이트를 시작하지 못했습니다. ${clip(errorText(error))}`;
      throw error;
    }
  }

  private async afterApplyExit(): Promise<void> {
    if (!this.applying) return;
    this.applying = false;
    await this.check();
  }

  async setMode(mode: UpdateMode): Promise<void> {
    await this.store.setUpdate({ updateMode: mode });
    if (mode !== "off" && !this.checkedAt) await this.check();
    if (mode === "auto" && this.available) this.autoApply();
    if (mode !== "auto" && this.retry) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }

  async answerAsk(paseo: PaseoApi, mode: UpdateMode, target: { agentId: string; cardId: string }): Promise<void> {
    await this.setMode(mode);
    await paseo.agents.ref(target.agentId).timeline.append(card({ kind: "ask", cardId: target.cardId, mode }));
  }

  async answerOffer(paseo: PaseoApi, agentId: string, item: OfferItem, choice: "update" | "later"): Promise<void> {
    const handle = paseo.agents.ref(agentId);
    if (choice === "later") {
      await handle.timeline.append(card({ ...item, answer: "later" }));
      return;
    }
    if (this.latest !== item.latest) await this.check();
    // 적용하면 곧 이 프로세스가 내려가므로 '업데이트 중'은 명령을 띄우기 전에 붙인다.
    await handle.timeline.append(card({ ...item, answer: "updating" }));
    try {
      await this.apply({ agentId, item });
    } catch (error) {
      await handle.timeline.append(card({ ...item, answer: "failed", error: clip(errorText(error)) }));
    }
  }

  /** 끝난 대화에 업데이트 방식을 묻거나 새 버전을 알리는 카드를 붙인다. 대화마다가 아니라 한 번씩만 붙인다. */
  async afterTurn(paseo: PaseoApi, agent: PluginHookAgent): Promise<void> {
    await this.flushCards(paseo);
    if (agent.parentAgentId) return;
    const mode = this.store.updateMode;
    if (mode === null && !this.store.updateAsked) {
      // 설치를 맡긴 대화가 끝나는 때가 첫 확인보다 먼저다. 그 대화에서 묻도록 여기서 확인한다(확인은 1초 안쪽).
      if (this.source === "unknown") await this.check();
      if (this.source !== "git" && this.source !== "npm") return;
      await this.store.setUpdate({ updateAsked: true });
      await paseo.agents.ref(agent.id).timeline.append(card({ kind: "ask", cardId: randomUUID(), mode: null }));
      return;
    }
    if (mode === "confirm" && this.available && this.latest && this.store.updateOffered !== this.latest && !this.applying) {
      await this.store.setUpdate({ updateOffered: this.latest });
      const item: OfferItem = { kind: "offer", cardId: randomUUID(), latest: this.latest, changes: this.changes, answer: null, error: null };
      await paseo.agents.ref(agent.id).timeline.append(card(item));
    }
  }
}

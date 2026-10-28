import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DeviceLoginProvider, Provider } from "../shared/accounts";
import { DEFAULT_COMPACT_THRESHOLD } from "../shared/compact";
import type { QuestionAutoMode } from "../shared/question";
import type { UpdateMode } from "../shared/update";
import { CLAUDE_RULES, CODEX_RULES, detachShadowHome, GROK_RULES, syncShadowHome, type ShadowRules } from "./shadow-home";

export type StoredCredential =
  | { kind: "claude_login"; tokenIssuedAt: string | null }
  | { kind: "oauth_token"; issuedAt: string }
  | { kind: "api_key" }
  | { kind: "codex_home" }
  | { kind: "grok_home" };

export interface ApiSpend {
  month: string;
  usd: number;
}

export interface StoredAccount {
  id: string;
  provider: Provider;
  label: string;
  createdAt: string;
  credential: StoredCredential;
  monthlyCredit?: number;
  spend?: ApiSpend;
  /** API 키 계정에 사용액 조회용 Admin 키(secrets/<id>.admin)가 있다. */
  adminKey?: boolean;
}

export interface PendingUpdate {
  from: string;
  to: string;
  at: string;
  card?: { agentId: string; cardId: string; latest: string; changes: string[] };
}

interface StoredState {
  version: 1;
  accounts: StoredAccount[];
  active: Record<Provider, string | null>;
  swapOffer: boolean;
  /** 이 필드가 생기기 전 state.json에는 없다(꺼짐). */
  compactAuto?: boolean;
  /** 정리 제안 기준(%). 이 필드가 생기기 전 state.json에는 없다. */
  compactThreshold?: number;
  /** 에이전트 질문 자동 답변. 이 필드가 생기기 전 state.json에는 없다(사용자 대기). */
  questionAuto?: QuestionAutoMode;
  /** 플러그인 업데이트 방식. 없으면 아직 고르지 않았다. */
  updateMode?: UpdateMode;
  /** 업데이트 방식을 묻는 카드를 붙였다. */
  updateAsked?: boolean;
  /** 새 버전 알림 카드를 붙인 버전. 같은 버전은 한 번만 알린다. */
  updateOffered?: string;
  /** 업데이트 명령을 띄운 뒤 결과를 아직 확인하지 않았다. 업데이트되면 플러그인이 다시 떠서 새 플러그인이 확인한다. */
  pendingUpdate?: PendingUpdate;
  lastUpdate?: { from: string; to: string; at: string };
  /** 자동 전환을 쓰던 버전의 설정. 읽을 때 swapOffer로 옮긴다. */
  autoSwitch?: boolean;
  /** 에이전트 ID → 계정 ID. 이 필드가 생기기 전 state.json에는 없다. */
  agentAccounts?: Record<string, string>;
}

const EMPTY_STATE: StoredState = {
  version: 1,
  accounts: [],
  active: { claude: null, codex: null, grok: null },
  swapOffer: true,
};

const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// 계정마다 다를 수 있는 .claude.json 항목. 나머지(MCP 목록·프로젝트 신뢰 등)는 원래 파일 것을 쓴다.
const CLAUDE_ACCOUNT_KEYS = /oauth|account|org|subscription|overage|extraUsage|^userID$/i;

function claudeMainDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

function claudeMainConfigFile(): string {
  return process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, ".claude.json") : join(homedir(), ".claude.json");
}

const CLI_HOMES: Record<DeviceLoginProvider, { folder: string; main: () => string; rules: ShadowRules }> = {
  codex: { folder: "codex", main: () => process.env.CODEX_HOME ?? join(homedir(), ".codex"), rules: CODEX_RULES },
  grok: { folder: "grok", main: () => process.env.GROK_HOME ?? join(homedir(), ".grok"), rules: GROK_RULES },
};

export class AccountStore {
  readonly root: string;
  private state: StoredState = EMPTY_STATE;

  constructor() {
    this.root = join(process.env.PASEO_HOME ?? join(homedir(), ".paseo"), "paseo-duckbae-plugin");
  }

  async load(): Promise<void> {
    await mkdir(join(this.root, "secrets"), { recursive: true });
    try {
      const { autoSwitch, ...loaded } = JSON.parse(await readFile(this.statePath(), "utf8")) as StoredState;
      this.state = { ...loaded, swapOffer: loaded.swapOffer ?? autoSwitch ?? true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.state = structuredClone(EMPTY_STATE);
    }
    await this.archiveAbandonedDrafts();
  }

  /** 원래 CLI 폴더(~/.codex, ~/.grok). 계정 폴더는 로그인 파일 말고는 이곳을 가리킨다. */
  mainHome(provider: DeviceLoginProvider): string {
    return CLI_HOMES[provider].main();
  }

  get accounts(): readonly StoredAccount[] {
    return this.state.accounts;
  }

  get swapOffer(): boolean {
    return this.state.swapOffer;
  }

  get compactAuto(): boolean {
    return this.state.compactAuto ?? false;
  }

  get compactThreshold(): number {
    return this.state.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD;
  }

  get questionAuto(): QuestionAutoMode {
    return this.state.questionAuto ?? "wait";
  }

  get updateMode(): UpdateMode | null {
    return this.state.updateMode ?? null;
  }

  get updateAsked(): boolean {
    return this.state.updateAsked ?? false;
  }

  get updateOffered(): string | null {
    return this.state.updateOffered ?? null;
  }

  get pendingUpdate(): PendingUpdate | null {
    return this.state.pendingUpdate ?? null;
  }

  get lastUpdate(): { from: string; to: string; at: string } | null {
    return this.state.lastUpdate ?? null;
  }

  activeId(provider: Provider): string | null {
    return this.state.active[provider] ?? null;
  }

  get agentAccounts(): Readonly<Record<string, string>> {
    return this.state.agentAccounts ?? {};
  }

  pinnedAccount(agentId: string): StoredAccount | null {
    const accountId = this.state.agentAccounts?.[agentId];
    return accountId ? (this.state.accounts.find((item) => item.id === accountId) ?? null) : null;
  }

  async pinAgent(agentId: string, accountId: string): Promise<void> {
    this.state.agentAccounts = { ...this.state.agentAccounts, [agentId]: accountId };
    await this.save();
  }

  async unpinAgent(agentId: string): Promise<void> {
    if (!this.state.agentAccounts?.[agentId]) return;
    delete this.state.agentAccounts[agentId];
    await this.save();
  }

  /** 인계 문서를 남겨 둔다. 새 에이전트 첫 프롬프트에 경로를 함께 적는다. */
  async saveHandoff(agentId: string, text: string): Promise<string> {
    const folder = join(this.root, "handoffs");
    await mkdir(folder, { recursive: true });
    const file = join(folder, `${new Date().toISOString().replace(/[:.]/g, "-")}-${agentId}.md`);
    await writeFile(file, text, "utf8");
    return file;
  }

  find(accountId: string): StoredAccount {
    const account = this.state.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error("계정을 찾을 수 없습니다.");
    return account;
  }

  claudeConfigDir(accountId: string): string {
    return join(this.root, "claude", accountId);
  }

  cliHome(provider: DeviceLoginProvider, accountId: string): string {
    return join(this.root, CLI_HOMES[provider].folder, accountId);
  }

  /** 계정 폴더의 링크를 원래 폴더 기준으로 다시 맞춘다. 실행·조회 직전마다 부른다. */
  async syncCliHome(provider: DeviceLoginProvider, accountId: string): Promise<string> {
    const home = this.cliHome(provider, accountId);
    await syncShadowHome(this.mainHome(provider), home, CLI_HOMES[provider].rules);
    return home;
  }

  async readSecret(accountId: string): Promise<string> {
    return (await readFile(join(this.root, "secrets", accountId), "utf8")).trim();
  }

  /**
   * Claude 계정 폴더(CLAUDE_CONFIG_DIR)를 원래 ~/.claude에 잇고, .claude.json은 계정 정보만 남긴 채
   * 원래 파일의 나머지(MCP 목록 등)로 맞춘다. 로그인으로 실행·조회하기 직전마다 부른다.
   */
  async syncClaudeHome(accountId: string): Promise<string> {
    const home = this.claudeConfigDir(accountId);
    await syncShadowHome(claudeMainDir(), home, CLAUDE_RULES);
    const accountFile = join(home, ".claude.json");
    const [main, own] = await Promise.all([readJson(claudeMainConfigFile()), readJson(accountFile)]);
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(main)) if (!CLAUDE_ACCOUNT_KEYS.test(key)) merged[key] = value;
    for (const [key, value] of Object.entries(own)) if (CLAUDE_ACCOUNT_KEYS.test(key)) merged[key] = value;
    const next = JSON.stringify(merged, null, 2);
    if (next !== JSON.stringify(own, null, 2)) {
      const temporary = `${accountFile}.account-swap.tmp`;
      await writeFile(temporary, next);
      await rename(temporary, accountFile);
    }
    return home;
  }

  /** 계정 추가 창에서 브라우저 로그인을 먼저 하면, 저장 전까지 이 폴더에 로그인이 담긴다. */
  async prepareClaudeDraft(): Promise<string> {
    const id = randomUUID();
    await mkdir(this.claudeConfigDir(id), { recursive: true });
    return id;
  }

  async addClaudeLogin(input: { label: string; draftId: string; token: string | null }): Promise<StoredAccount> {
    await stat(join(this.claudeConfigDir(input.draftId), ".credentials.json")).catch(() => {
      throw new Error("브라우저 로그인을 먼저 마쳐 주세요.");
    });
    if (input.token) await this.writeSecret(input.draftId, input.token);
    return this.insert({
      id: input.draftId,
      provider: "claude",
      label: input.label,
      createdAt: new Date().toISOString(),
      credential: { kind: "claude_login", tokenIssuedAt: input.token ? new Date().toISOString() : null },
    });
  }

  async addClaudeApiKey(input: { label: string; apiKey: string; monthlyCredit: number | null }): Promise<StoredAccount> {
    const id = randomUUID();
    await this.writeSecret(id, input.apiKey);
    return this.insert({
      id,
      provider: "claude",
      label: input.label,
      createdAt: new Date().toISOString(),
      credential: { kind: "api_key" },
      ...(input.monthlyCredit ? { monthlyCredit: input.monthlyCredit } : {}),
    });
  }

  async setClaudeToken(accountId: string, token: string | null): Promise<void> {
    const account = this.find(accountId);
    if (account.credential.kind !== "claude_login") throw new Error("구독 계정에만 1년 토큰을 넣을 수 있습니다.");
    if (token) await this.writeSecret(accountId, token);
    else await unlink(join(this.root, "secrets", accountId)).catch(() => undefined);
    account.credential = { kind: "claude_login", tokenIssuedAt: token ? new Date().toISOString() : null };
    await this.save();
  }

  /** 1년 토큰만 있던 예전 계정에 브라우저 로그인을 붙이면 로그인 계정으로 바꾼다. */
  async markClaudeLoggedIn(accountId: string): Promise<void> {
    const account = this.find(accountId);
    if (account.credential.kind !== "oauth_token") return;
    account.credential = { kind: "claude_login", tokenIssuedAt: account.credential.issuedAt };
    await this.save();
  }

  async setAdminKey(accountId: string, adminKey: string | null): Promise<void> {
    const account = this.find(accountId);
    if (account.credential.kind !== "api_key") throw new Error("API 키 계정에만 Admin 키를 넣을 수 있습니다.");
    if (adminKey) {
      await this.writeSecret(`${accountId}.admin`, adminKey);
      account.adminKey = true;
    } else {
      await unlink(join(this.root, "secrets", `${accountId}.admin`)).catch(() => undefined);
      delete account.adminKey;
    }
    await this.save();
  }

  readAdminKey(accountId: string): Promise<string> {
    return this.readSecret(`${accountId}.admin`);
  }

  private async writeSecret(accountId: string, secret: string): Promise<void> {
    await writeFile(join(this.root, "secrets", accountId), secret.trim(), { mode: 0o600 });
  }

  async setMonthlyCredit(accountId: string, monthlyCredit: number | null): Promise<void> {
    const account = this.find(accountId);
    if (monthlyCredit) account.monthlyCredit = monthlyCredit;
    else delete account.monthlyCredit;
    await this.save();
  }

  /** 달이 바뀌면 새로 센다. 실제 크레딧 지급 주기(결제일)와는 다를 수 있다. */
  async addSpend(accountId: string, usd: number): Promise<void> {
    const account = this.find(accountId);
    const month = new Date().toISOString().slice(0, 7);
    const base = account.spend?.month === month ? account.spend.usd : 0;
    account.spend = { month, usd: base + usd };
    await this.save();
  }

  async prepareCliHome(provider: DeviceLoginProvider): Promise<{ id: string; home: string }> {
    const id = randomUUID();
    return { id, home: await this.syncCliHome(provider, id) };
  }

  async addCliAccount(provider: DeviceLoginProvider, id: string, label: string): Promise<StoredAccount> {
    const credential: StoredCredential = provider === "codex" ? { kind: "codex_home" } : { kind: "grok_home" };
    return this.insert({ id, provider, label, createdAt: new Date().toISOString(), credential });
  }

  // 2026-10-28 정전 때 Codex 계정 auth.json 두 개가 널 바이트로 채워졌다. 로그인 코드 받기는 깨진 파일이 있어도 됐지만
  // (같은 날 시험), 로그인을 마칠 때 CLI가 그 파일을 어떻게 다룰지는 확인하지 못해 지우지 않고 옆으로 옮겨 둔다.
  async setAsideBrokenLogin(provider: DeviceLoginProvider, id: string): Promise<void> {
    const file = join(this.cliHome(provider, id), "auth.json");
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      return;
    }
    try {
      JSON.parse(text);
    } catch {
      await rename(file, `${file}.broken-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    }
  }

  async discardCliHome(provider: DeviceLoginProvider, id: string): Promise<void> {
    await this.archiveFolder(join(this.root, CLI_HOMES[provider].folder), id, `failed-${provider}-${id}`);
  }

  async activate(accountId: string): Promise<void> {
    const account = this.find(accountId);
    this.state.active[account.provider] = account.id;
    await this.save();
  }

  async rename(accountId: string, label: string): Promise<void> {
    this.find(accountId).label = label;
    await this.save();
  }

  async setSwapOffer(enabled: boolean): Promise<void> {
    this.state.swapOffer = enabled;
    await this.save();
  }

  async setCompactAuto(enabled: boolean): Promise<void> {
    this.state.compactAuto = enabled;
    await this.save();
  }

  async setCompactThreshold(percent: number): Promise<void> {
    this.state.compactThreshold = percent;
    await this.save();
  }

  async setQuestionAuto(mode: QuestionAutoMode): Promise<void> {
    this.state.questionAuto = mode;
    await this.save();
  }

  async setUpdate(patch: Partial<Pick<StoredState, "updateMode" | "updateAsked" | "updateOffered" | "pendingUpdate" | "lastUpdate">>): Promise<void> {
    this.state = { ...this.state, ...patch };
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) if (patch[key] === undefined) delete this.state[key];
    await this.save();
  }

  async remove(accountId: string): Promise<void> {
    const account = this.find(accountId);
    this.state.accounts = this.state.accounts.filter((item) => item.id !== accountId);
    for (const [agentId, pinned] of Object.entries(this.state.agentAccounts ?? {})) {
      if (pinned === accountId) delete this.state.agentAccounts?.[agentId];
    }
    if (this.state.active[account.provider] === accountId) {
      this.state.active[account.provider] =
        this.state.accounts.find((item) => item.provider === account.provider)?.id ?? null;
    }
    await this.save();
    // 로그인 캐시는 지우지 않고 보관 폴더로 옮긴다. 실수로 제거해도 되살릴 수 있게.
    const archive = join(this.root, "removed", `${accountId}-${Date.now()}`);
    await mkdir(archive, { recursive: true });
    const folder = account.provider === "claude" ? this.claudeConfigDir(accountId) : this.cliHome(account.provider, accountId);
    await detachShadowHome(folder);
    await rename(folder, join(archive, "home")).catch(() => undefined);
    await rename(join(this.root, "secrets", accountId), join(archive, "secret")).catch(() => undefined);
    await rename(join(this.root, "secrets", `${accountId}.admin`), join(archive, "admin-secret")).catch(() => undefined);
  }

  // 저장하지 않고 닫은 로그인 초안·실패한 로그인 폴더. 지우지 않고 보관 폴더로 옮긴다.
  private async archiveAbandonedDrafts(): Promise<void> {
    const known = new Set(this.state.accounts.map((account) => account.id));
    for (const folder of ["claude", "codex", "grok"]) {
      const parent = join(this.root, folder);
      const ids = await readdir(parent).catch(() => [] as string[]);
      for (const id of ids) {
        if (known.has(id)) continue;
        // 방금 로그인하고 아직 저장하지 않은 초안은 플러그인을 다시 불러와도 남겨 둔다.
        const age = Date.now() - ((await stat(join(parent, id)).catch(() => null))?.mtimeMs ?? 0);
        if (age > DRAFT_MAX_AGE_MS) await this.archiveFolder(parent, id, `draft-${folder}-${id}`);
      }
    }
  }

  private async archiveFolder(parent: string, id: string, archiveName: string): Promise<void> {
    const folder = join(parent, id);
    await detachShadowHome(folder);
    await mkdir(join(this.root, "removed"), { recursive: true });
    await rename(folder, join(this.root, "removed", archiveName)).catch(() => undefined);
  }

  private async insert(account: StoredAccount): Promise<StoredAccount> {
    this.state.accounts.push(account);
    this.state.active[account.provider] ??= account.id;
    await this.save();
    return account;
  }

  private statePath(): string {
    return join(this.root, "state.json");
  }

  private async save(): Promise<void> {
    const temporary = `${this.statePath()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.state, null, 2));
    await rename(temporary, this.statePath());
  }
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

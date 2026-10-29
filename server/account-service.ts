import type { PaseoApi } from "./paseo-types";
import type {
  AccountState,
  AccountView,
  DeviceLoginProvider,
  ExtraCredits,
  ExtraOutcome,
  HandoffView,
  LimitEvent,
  Overview,
  Provider,
  UsageWindow,
} from "../shared/accounts";
import { monthCostUsd, organizationId } from "./claude-api-cost";
import { ClaudeLoginSession } from "./claude-login";
import { enableOverage, probeClaude, type Overage } from "./claude-usage";
import { CodexAppServer, probeCodex } from "./codex-app-server";
import { GrokDeviceLogin, probeGrok } from "./grok-cli";
import { isObject, settleWithin } from "./json-lines";
import type { AccountStore, StoredAccount } from "./store";
import { randomUUID } from "node:crypto";

const TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const DEVICE_LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
// 재설정 쿠폰 주소는 자주 부르면 수십 분 막히고 쿠폰·잔액은 드물게 바뀐다. 사용량(5분)보다 뜸하게 묻는다.
const EXTRAS_CHECK_MS = 30 * 60 * 1000;
const FIRST_PROBE_WAIT_MS = 5_000;
// 권한 없는 키도 나중에 권한을 받을 수 있어 가끔 다시 묻는다.
const CONSOLE_RECHECK_MS = 60 * 60 * 1000;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

interface UsageEntry {
  email: string | null;
  tier: string | null;
  state: AccountState;
  stateDetail: string | null;
  windows: UsageWindow[];
  resetCredits: number | null;
  resetExpiresAt?: string | null;
  extraCredits?: ExtraCredits | null;
  prepaidBalance?: number | null;
  overage?: Overage | null;
  cliVersion?: string;
  loginExpiresAt?: string | null;
  checkedAt: string;
}

type DeviceLogin =
  | {
      status: "pending";
      provider: DeviceLoginProvider;
      close(): Promise<void>;
      accountId: string;
      label: string;
      timer: NodeJS.Timeout;
      /** 이미 있는 계정에 다시 로그인한다. 실패해도 계정 폴더를 치우지 않는다. */
      relogin: boolean;
    }
  | { status: "completed"; accountId: string }
  | { status: "failed"; error: string };

export class AccountService {
  private readonly usage = new Map<string, UsageEntry>();
  private readonly agentAccounts = new Map<string, string>();
  private readonly deviceLogins = new Map<string, DeviceLogin>();
  private readonly claudeLogins = new Map<string, { session: ClaudeLoginSession; accountId: string | null }>();
  // 에이전트별 마지막으로 본 누적 비용. 런타임이 닫혔다 다시 열려도 남겨 둔다(0.14부터 1시간 쉬면 닫힘).
  // undefined면 기준값을 모른다(플러그인을 다시 불러온 뒤 재개된 세션은 이전 비용부터 센다).
  private readonly agentCost = new Map<string, number | undefined>();
  private readonly extrasCheckedAt = new Map<string, number>();
  // API 키 계정의 Admin API 이번 달 사용액. 조회할 수 없던 키는 unsupportedAt부터 한동안 다시 묻지 않는다.
  private readonly consoleSpend = new Map<string, { month: string; usd: number } | { unsupportedAt: number }>();
  private lastLimit: LimitEvent | null = null;
  // 계정별 에이전트 수는 보관하지 않은 에이전트 목록으로 센다. 메모리의 agentAccounts는 이번 플러그인 실행에서
  // 세션이 열린 에이전트만 알아서, 다시 불러오면 돌고 있는 에이전트도 0으로 보였다.
  private openAgents: ReadonlySet<string> | null = null;
  // 같은 계정을 동시에 조회하면 로그인 토큰 갱신이 겹친다. 한도 확인과 정기 조회가 겹칠 때 하나로 묶는다.
  private readonly probing = new Map<string, Promise<void>>();
  // 같은 계정의 에이전트 여럿이 함께 한도에 걸리면 처음 설정(setup_overage_billing)을 두 번 보내게 된다.
  private readonly enabling = new Map<string, Promise<ExtraOutcome | null>>();
  /** 이어가기 작업 목록. 이어가기(handoff.ts)가 이 서비스를 쓰므로 만든 뒤 연결한다. */
  handoffList: () => HandoffView[] = () => [];
  private refreshing: Promise<void> | null = null;

  constructor(private readonly store: AccountStore) {}

  // 에이전트는 처음 연 계정에 계속 묶인다. 다른 계정으로 옮길 때는 인계 문서로 새 에이전트를 만든다(handoff.ts).
  // 묶인 계정이 없으면(새 에이전트, 이 기능 전에 만든 에이전트) 지금 사용 중인 계정으로 열고 묶는다.
  async launchEnv(provider: Provider, agentId: string, freshSession: boolean): Promise<Record<string, string>> {
    const pinned = this.store.pinnedAccount(agentId);
    const accountId = pinned?.provider === provider ? pinned.id : this.store.activeId(provider);
    if (!accountId) return {};
    const account = this.store.find(accountId);
    if (pinned?.id !== account.id) await this.store.pinAgent(agentId, account.id);
    this.agentAccounts.set(agentId, account.id);
    this.agentCost.set(agentId, freshSession ? 0 : this.agentCost.get(agentId));
    switch (account.credential.kind) {
      case "claude_login":
        // 1년 토큰이 있으면 그걸로, 없으면 브라우저 로그인 폴더(원래 ~/.claude에 이어 둔)로 실행한다.
        return account.credential.tokenIssuedAt
          ? { CLAUDE_CODE_OAUTH_TOKEN: await this.store.readSecret(account.id) }
          : { CLAUDE_CONFIG_DIR: await this.store.syncClaudeHome(account.id) };
      case "oauth_token":
        return { CLAUDE_CODE_OAUTH_TOKEN: await this.store.readSecret(account.id) };
      case "api_key":
        return { [account.provider === "grok" ? "XAI_API_KEY" : "ANTHROPIC_API_KEY"]: await this.store.readSecret(account.id) };
      case "codex_home":
        return this.codexEnv(await this.store.syncCliHome("codex", account.id));
      case "grok_home":
        return { GROK_HOME: await this.store.syncCliHome("grok", account.id) };
    }
  }

  // 대화 기록 색인(sqlite)은 원래 폴더 것을 같이 써야 계정을 바꿔도 같은 대화를 찾는다.
  private codexEnv(home: string): Record<string, string> {
    return { CODEX_HOME: home, CODEX_SQLITE_HOME: this.store.mainHome("codex") };
  }

  /** 런타임이 닫혔다. 다음 메시지에 같은 세션으로 다시 열리므로 비용 기준값은 남긴다. */
  forgetAgent(agentId: string): void {
    this.agentAccounts.delete(agentId);
  }

  /** 보관한 에이전트는 비용 기준값까지 지운다. */
  dropAgent(agentId: string): void {
    this.agentAccounts.delete(agentId);
    this.agentCost.delete(agentId);
  }

  /** Claude Code가 계산한 누적 비용(total_cost_usd)의 증가분을 API 키 계정의 이번 달 사용액에 더한다. */
  async recordCost(account: StoredAccount, agentId: string, totalCostUsd: number): Promise<void> {
    if (account.credential.kind !== "api_key") return;
    const last = this.agentCost.get(agentId);
    this.agentCost.set(agentId, totalCostUsd);
    if (last === undefined) return;
    // /clear 등으로 누적값이 처음부터 다시 시작하면 지금 값 전체가 새 사용분이다.
    const delta = totalCostUsd >= last ? totalCostUsd - last : totalCostUsd;
    if (delta > 0) await this.store.addSpend(account.id, delta);
  }

  async startClaudeLogin(accountId: string | null): Promise<{ loginId: string; url: string; draftId: string | null }> {
    const draftId = accountId ? null : await this.store.prepareClaudeDraft();
    const session = new ClaudeLoginSession(this.store.claudeConfigDir(accountId ?? draftId ?? ""));
    try {
      const url = await session.authorizeUrl();
      const loginId = randomUUID();
      this.claudeLogins.set(loginId, { session, accountId });
      return { loginId, url, draftId };
    } catch (error) {
      await session.close();
      throw error;
    }
  }

  async finishClaudeLogin(loginId: string, code: string): Promise<{ ok: true; email: string | null; tier: string | null } | { ok: false; error: string }> {
    const login = this.claudeLogins.get(loginId);
    if (!login) return { ok: false, error: "로그인을 다시 시작해 주세요." };
    try {
      await login.session.submitCode(code);
    } catch (error) {
      await login.session.close();
      this.claudeLogins.delete(loginId);
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    this.claudeLogins.delete(loginId);
    if (login.accountId) await this.store.markClaudeLoggedIn(login.accountId);
    const { resets, prepaidBalance, ...probe } = await probeClaude(login.session.configDir, true);
    if (login.accountId) {
      this.extrasCheckedAt.set(login.accountId, Date.now());
      this.usage.set(login.accountId, {
        ...probe,
        resetCredits: resets?.count ?? null,
        resetExpiresAt: resets?.expiresAt ?? null,
        prepaidBalance: prepaidBalance ?? null,
        checkedAt: new Date().toISOString(),
      });
    }
    return { ok: true, email: probe.email, tier: probe.tier };
  }

  stateOf(accountId: string): AccountState {
    return this.usage.get(accountId)?.state ?? "unknown";
  }

  accountOfAgent(agentId: string): StoredAccount | null {
    const accountId = this.agentAccounts.get(agentId);
    return accountId ? (this.store.accounts.find((item) => item.id === accountId) ?? null) : null;
  }

  get swapOffer(): boolean {
    return this.store.swapOffer;
  }

  /**
   * 한도에 걸리거나 로그인이 만료된 계정을 표시한다. 스왑 제안이 켜져 있으면 Claude 구독 계정은 추가 크레딧도 켠다.
   * 답변에 한도 문구가 우연히 섞인 것이면(다시 조회한 사용량이 100% 미만) 아무것도 바꾸지 않고 null을 돌려준다.
   */
  async handleLimit(account: StoredAccount, reason: string, state: "limited" | "needs_login"): Promise<LimitEvent | null> {
    let extra: ExtraOutcome | null = null;
    // 추가 크레딧은 돈이 나가므로 답변 문구만 믿고 켜지 않는다. 사용량 확인은 브라우저 로그인 계정만 된다.
    if (state === "limited" && account.provider === "claude" && account.credential.kind === "claude_login") {
      await this.refreshOne(account);
      const checked = this.usage.get(account.id);
      if (checked?.state === "ok") return null;
      if (this.store.swapOffer) {
        extra =
          checked?.state === "limited"
            ? await this.enableExtra(account, checked)
            : { status: "failed", error: `사용량을 확인하지 못했습니다(${checked?.stateDetail ?? "알 수 없음"}).` };
      }
    }
    const entry = this.usage.get(account.id);
    this.usage.set(account.id, {
      ...(entry ?? { email: null, tier: null, windows: [], resetCredits: null }),
      state,
      stateDetail: reason,
      checkedAt: new Date().toISOString(),
    });
    this.lastLimit = { provider: account.provider, fromLabel: account.label, state, reason, extra, at: new Date().toISOString() };
    return this.lastLimit;
  }

  /** 한도에 걸렸어도 추가 크레딧으로 턴을 돌릴 수 있는지. */
  overageActive(accountId: string): boolean {
    const overage = this.usage.get(accountId)?.overage;
    return overage?.enabled === true && (overage.monthlyLimitCents === null || overage.usedCents < overage.monthlyLimitCents);
  }

  private enableExtra(account: StoredAccount, entry: UsageEntry): Promise<ExtraOutcome | null> {
    const running = this.enabling.get(account.id);
    if (running) return running;
    const job = this.turnOnExtra(account, entry).finally(() => this.enabling.delete(account.id));
    this.enabling.set(account.id, job);
    return job;
  }

  // 월 상한은 이번 달 사용분 + 추가 크레딧 잔액이다. 잔액을 넘어 카드로 결제되지 않게 하려는 상한이다(사용자 결정, 2026-10-23).
  // 사용량 응답의 달러 크레딧(limit_dollars, $250)은 클라우드 VM용이라 추가 크레딧에 쓰이지 않는다(사용자 확인, 2026-10-23).
  private async turnOnExtra(account: StoredAccount, entry: UsageEntry): Promise<ExtraOutcome | null> {
    const credit = entry.extraCredits?.balance ?? entry.prepaidBalance ?? 0;
    if (credit <= 0) return null;
    const overage = entry.overage ?? null;
    const currency = overage?.currency ?? "USD";
    const usedCents = overage?.usedCents ?? 0;
    const limitCents = overage?.monthlyLimitCents ?? null;
    if (overage?.enabled && limitCents !== null && usedCents < limitCents) return { status: "enabled", capUsd: limitCents / 100 };
    // 우리가 잡은 상한이면 다 썼을 때 잔액도 0이다. 잔액이 남았는데 상한에 닿았으면 사용자가 claude.ai에서 정한 상한이라 올리지 않는다.
    if (limitCents !== null && usedCents >= limitCents) {
      return { status: "failed", error: `이번 달 최대 금액($${(limitCents / 100).toFixed(2)})을 다 썼습니다.` };
    }
    const capCents = usedCents + Math.floor(credit * 100);
    if (!entry.cliVersion) return { status: "failed", error: "Claude Code 버전을 알 수 없습니다." };
    try {
      await enableOverage(await this.store.syncClaudeHome(account.id), entry.cliVersion, capCents, currency, overage?.monthlyLimitCents != null);
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    this.usage.set(account.id, {
      ...entry,
      overage: { enabled: true, monthlyLimitCents: capCents, usedCents, currency },
      extraCredits: { balance: null, ...entry.extraCredits, enabled: true, currency, used: usedCents / 100, limit: capCents / 100 },
    });
    return { status: "enabled", capUsd: capCents / 100 };
  }

  async refreshOpenAgents(paseo: PaseoApi): Promise<void> {
    const { entries } = await paseo.agents.list();
    this.openAgents = new Set(entries.filter((entry) => !entry.agent.archivedAt).map((entry) => entry.agent.id));
  }

  private agentCount(accountId: string): number {
    const open = this.openAgents;
    if (!open) return [...this.agentAccounts.values()].filter((id) => id === accountId).length;
    return Object.entries(this.store.agentAccounts).filter(([agentId, pinned]) => pinned === accountId && open.has(agentId)).length;
  }

  async overview(refresh: boolean): Promise<Overview> {
    if (refresh) await this.refreshUsage();
    // 플러그인을 막 띄워 사용량이 비어 있으면 첫 조회(계정마다 CLI 실행)가 길어 데몬의 플러그인 RPC 시간 제한에 걸릴 수 있다
    // (2026-10-26 daemon.log "Plugin RPC timed out"). 잠깐만 기다리고 나머지는 다음 조회 때 보여 준다.
    else if (this.usage.size === 0) await settleWithin(this.refreshUsage(), FIRST_PROBE_WAIT_MS);
    return {
      accounts: this.store.accounts.map((account) => this.view(account)),
      swapOffer: this.store.swapOffer,
      compactAuto: this.store.compactAuto,
      compactThreshold: this.store.compactThreshold,
      questionAuto: this.store.questionAuto,
      lastLimit: this.lastLimit,
      agentAccounts: { ...this.store.agentAccounts },
      handoffs: this.handoffList(),
    };
  }

  refreshUsage(): Promise<void> {
    this.refreshing ??= Promise.all(this.store.accounts.map((account) => this.refreshOne(account)))
      .then(() => undefined)
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  async startDeviceLogin(
    provider: DeviceLoginProvider,
    label: string,
    existingId?: string,
  ): Promise<{ loginId: string; userCode: string; verificationUrl: string }> {
    const relogin = existingId !== undefined;
    const { id, home } = relogin ? await this.prepareRelogin(provider, existingId) : await this.store.prepareCliHome(provider);
    const loginId = randomUUID();
    try {
      const { code, close } = provider === "codex" ? await this.startCodexDevice(loginId, home) : await this.startGrokDevice(loginId, home);
      const timer = setTimeout(() => void this.finishDeviceLogin(loginId, false, "로그인 대기 시간이 지났습니다. 다시 시도해 주세요."), DEVICE_LOGIN_TIMEOUT_MS);
      this.deviceLogins.set(loginId, { status: "pending", provider, close, accountId: id, label, timer, relogin });
      return { loginId, ...code };
    } catch (error) {
      if (!relogin) await this.store.discardCliHome(provider, id);
      throw error;
    }
  }

  private async prepareRelogin(provider: DeviceLoginProvider, accountId: string): Promise<{ id: string; home: string }> {
    const account = this.store.find(accountId);
    const kind = provider === "codex" ? "codex_home" : "grok_home";
    if (account.provider !== provider || account.credential.kind !== kind) throw new Error("이 계정은 여기서 다시 로그인할 수 없습니다.");
    await this.store.setAsideBrokenLogin(provider, accountId);
    return { id: accountId, home: await this.store.syncCliHome(provider, accountId) };
  }

  get loginPending(): boolean {
    return this.claudeLogins.size > 0 || [...this.deviceLogins.values()].some((login) => login.status === "pending");
  }

  deviceLoginStatus(loginId: string): { status: "pending" } | { status: "completed"; accountId: string } | { status: "failed"; error: string } {
    const login = this.deviceLogins.get(loginId);
    if (!login) return { status: "failed", error: "로그인 정보를 찾지 못했습니다. 다시 시도해 주세요." };
    if (login.status === "pending") return { status: "pending" };
    return login;
  }

  async dispose(): Promise<void> {
    for (const login of this.claudeLogins.values()) await login.session.close();
    for (const login of this.deviceLogins.values()) {
      if (login.status !== "pending") continue;
      clearTimeout(login.timer);
      await login.close();
    }
  }

  private async startCodexDevice(loginId: string, home: string) {
    const server = await CodexAppServer.open(this.codexEnv(home));
    const started = await server.request("account/login/start", { type: "chatgptDeviceCode" });
    if (!isObject(started) || typeof started.loginId !== "string") {
      await server.close();
      throw new Error("Codex 로그인 코드를 받지 못했습니다.");
    }
    const codexLoginId = started.loginId;
    server.onNotification((method, params) => {
      if (method !== "account/login/completed" || !isObject(params) || params.loginId !== codexLoginId) return;
      const error = typeof params.error === "string" ? params.error : "로그인에 실패했습니다.";
      void this.finishDeviceLogin(loginId, params.success === true, error);
    });
    return {
      code: { userCode: String(started.userCode), verificationUrl: String(started.verificationUrl) },
      close: () => server.close(),
    };
  }

  private async startGrokDevice(loginId: string, home: string) {
    const login = new GrokDeviceLogin(home);
    try {
      const code = await login.deviceCode(30_000);
      void login.exited.then((exitCode) => this.finishDeviceLogin(loginId, exitCode === 0, "Grok 로그인에 실패했습니다."));
      return { code, close: () => login.close() };
    } catch (error) {
      await login.close();
      throw error;
    }
  }

  private async finishDeviceLogin(loginId: string, success: boolean, error: string): Promise<void> {
    const login = this.deviceLogins.get(loginId);
    if (!login || login.status !== "pending") return;
    clearTimeout(login.timer);
    await login.close();
    if (!success) {
      if (!login.relogin) await this.store.discardCliHome(login.provider, login.accountId);
      this.deviceLogins.set(loginId, { status: "failed", error });
      return;
    }
    const account = login.relogin ? this.store.find(login.accountId) : await this.store.addCliAccount(login.provider, login.accountId, login.label);
    this.deviceLogins.set(loginId, { status: "completed", accountId: account.id });
    await this.refreshOne(account);
  }

  private refreshOne(account: StoredAccount): Promise<void> {
    const running = this.probing.get(account.id);
    if (running) return running;
    const probe = this.probeOne(account).finally(() => this.probing.delete(account.id));
    this.probing.set(account.id, probe);
    return probe;
  }

  private async probeOne(account: StoredAccount): Promise<void> {
    const checkedAt = new Date().toISOString();
    try {
      if (account.credential.kind === "api_key") {
        await this.refreshConsoleSpend(account);
        this.usage.set(account.id, { email: null, tier: "API", state: "ok", stateDetail: null, windows: [], resetCredits: null, checkedAt });
        return;
      }
      const probe =
        account.provider === "claude"
          ? await this.probeClaudeAccount(account)
          : account.provider === "codex"
            ? await probeCodex(this.codexEnv(await this.store.syncCliHome("codex", account.id)))
            : await probeGrok(await this.store.syncCliHome("grok", account.id));
      this.usage.set(account.id, { ...probe, checkedAt });
    } catch (error) {
      this.usage.set(account.id, {
        email: this.usage.get(account.id)?.email ?? null,
        tier: this.usage.get(account.id)?.tier ?? null,
        state: "error",
        stateDetail: error instanceof Error ? error.message : String(error),
        windows: [],
        resetCredits: null,
        checkedAt,
      });
    }
  }

  private async probeClaudeAccount(account: StoredAccount): Promise<Omit<UsageEntry, "checkedAt">> {
    const configDir =
      account.credential.kind === "claude_login" ? await this.store.syncClaudeHome(account.id) : this.store.claudeConfigDir(account.id);
    // 실패해도 시도한 시각으로 남겨 429를 받은 뒤 5분마다 다시 두드리지 않게 한다.
    const checkExtras = Date.now() - (this.extrasCheckedAt.get(account.id) ?? 0) >= EXTRAS_CHECK_MS;
    if (checkExtras) this.extrasCheckedAt.set(account.id, Date.now());
    const { resets, prepaidBalance, ...probe } = await probeClaude(configDir, checkExtras);
    const previous = this.usage.get(account.id);
    return {
      ...probe,
      resetCredits: resets ? resets.count : (previous?.resetCredits ?? null),
      resetExpiresAt: resets ? resets.expiresAt : (previous?.resetExpiresAt ?? null),
      prepaidBalance: prepaidBalance ?? previous?.prepaidBalance ?? null,
    };
  }

  /** Admin 키는 사용액을 조회할 수 있고 API 키와 같은 조직일 때만 저장한다. */
  async setAdminKey(accountId: string, adminKey: string | null): Promise<void> {
    if (!adminKey) {
      await this.store.setAdminKey(accountId, null);
      this.consoleSpend.delete(accountId);
      return;
    }
    const usd = await monthCostUsd(adminKey);
    if (usd === null) throw new Error("이 키로는 사용액을 볼 수 없습니다. Admin 키가 맞는지 확인하세요.");
    const [apiOrg, adminOrg] = await Promise.all([organizationId(await this.store.readSecret(accountId)), organizationId(adminKey)]);
    if (apiOrg && adminOrg && apiOrg !== adminOrg) throw new Error("API 키와 다른 조직의 Admin 키입니다.");
    await this.store.setAdminKey(accountId, adminKey);
    this.consoleSpend.set(accountId, { month: currentMonth(), usd });
  }

  private async refreshConsoleSpend(account: StoredAccount): Promise<void> {
    const known = this.consoleSpend.get(account.id);
    if (known && "unsupportedAt" in known && Date.now() - known.unsupportedAt < CONSOLE_RECHECK_MS) return;
    try {
      const key = account.adminKey ? await this.store.readAdminKey(account.id) : await this.store.readSecret(account.id);
      const usd = await monthCostUsd(key);
      this.consoleSpend.set(account.id, usd === null ? { unsupportedAt: Date.now() } : { month: currentMonth(), usd });
    } catch {
      // 일시적인 실패면 지난 값을 그대로 보여 준다.
    }
  }

  private spendView(account: StoredAccount): AccountView["spend"] {
    const month = currentMonth();
    const official = this.consoleSpend.get(account.id);
    if (official && "usd" in official && official.month === month) return { ...official, source: "console" };
    return account.spend?.month === month ? { ...account.spend, source: "estimate" } : null;
  }

  private credentialExpiry(credential: StoredAccount["credential"], entry: UsageEntry | undefined): string | null {
    const tokenIssuedAt =
      credential.kind === "oauth_token" ? credential.issuedAt : credential.kind === "claude_login" ? credential.tokenIssuedAt : null;
    if (tokenIssuedAt) return new Date(Date.parse(tokenIssuedAt) + TOKEN_LIFETIME_MS).toISOString();
    return credential.kind === "claude_login" ? (entry?.loginExpiresAt ?? null) : null;
  }

  private view(account: StoredAccount): AccountView {
    const entry = this.usage.get(account.id);
    const credential = account.credential;
    return {
      id: account.id,
      provider: account.provider,
      label: account.label,
      email: entry?.email ?? null,
      tier: entry?.tier ?? null,
      state: entry?.state ?? "unknown",
      stateDetail: entry?.stateDetail ?? null,
      windows: entry?.windows ?? [],
      resetCredits: entry?.resetCredits ?? null,
      resetExpiresAt: entry?.resetExpiresAt ?? null,
      extraCredits: entry?.extraCredits ? { ...entry.extraCredits, balance: entry.extraCredits.balance ?? entry.prepaidBalance ?? null } : null,
      credentialKind: credential.kind,
      credentialExpiresAt: this.credentialExpiry(credential, entry),
      hasToken: credential.kind === "oauth_token" || (credential.kind === "claude_login" && credential.tokenIssuedAt !== null),
      hasAdminKey: account.adminKey === true,
      monthlyCredit: account.monthlyCredit ?? null,
      spend: this.spendView(account),
      active: this.store.activeId(account.provider) === account.id,
      agentCount: this.agentCount(account.id),
      checkedAt: entry?.checkedAt ?? null,
    };
  }
}

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnProcess, terminateProcess } from "@getpaseo/plugin/server";
import type { AccountState, ExtraCredits, UsageWindow } from "../shared/accounts";
import { isObject, onJsonLines, withTimeout, type JsonObject } from "./json-lines";

const PROBE_TIMEOUT_MS = 30_000;

// 사용량(get_usage)은 profile 권한이 있는 /login 자격으로만 나온다. setup-token·API 키가
// 이 프로세스에 섞이면 그쪽이 우선이라 사용량이 비므로 반드시 지운다.
const STRIPPED_ENV = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDECODE"];

export interface ClaudeProbe {
  email: string | null;
  tier: string | null;
  loginExpiresAt: string | null;
  state: AccountState;
  stateDetail: string | null;
  windows: UsageWindow[];
  extraCredits: ExtraCredits | null;
  overage?: Overage | null;
  /** 추가 크레딧을 켜는 요청의 User-Agent에 쓴다. */
  cliVersion?: string;
  /** 아래 둘은 이번에 묻지 않았거나 실패하면 없다. */
  resets?: ResetCoupons;
  prepaidBalance?: number;
}

/** 추가 크레딧(overage) 설정. 금액은 통화 최소 단위(USD면 센트)다. */
export interface Overage {
  enabled: boolean;
  monthlyLimitCents: number | null;
  usedCents: number;
  currency: string;
}

export interface ResetCoupons {
  count: number;
  expiresAt: string | null;
}

const CLAUDE_TIERS: Record<string, string> = { pro: "Pro", max: "Max", team: "Team", enterprise: "Enterprise" };

interface StoredLogin {
  rateLimitTier: string;
  refreshTokenExpiresAt: number | null;
  accessToken: string | null;
}

// get_usage는 "max"까지만 준다. 5x·20x 구분과 로그인 만료 시각은 그 계정 로그인 파일에만 있다
// (예: rateLimitTier default_claude_max_20x). macOS는 키체인에 있어 이 값들 없이 둔다.
async function storedLogin(configDir: string | null): Promise<StoredLogin> {
  const file = join(configDir ?? join(homedir(), ".claude"), ".credentials.json");
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    const oauth = isObject(parsed) && isObject(parsed.claudeAiOauth) ? parsed.claudeAiOauth : {};
    return {
      rateLimitTier: typeof oauth.rateLimitTier === "string" ? oauth.rateLimitTier : "",
      refreshTokenExpiresAt: typeof oauth.refreshTokenExpiresAt === "number" ? oauth.refreshTokenExpiresAt : null,
      accessToken: typeof oauth.accessToken === "string" ? oauth.accessToken : null,
    };
  } catch {
    return { rateLimitTier: "", refreshTokenExpiresAt: null, accessToken: null };
  }
}

function claudeTier(subscription: unknown, login: StoredLogin): string | null {
  if (typeof subscription !== "string") return null;
  const name = CLAUDE_TIERS[subscription] ?? subscription;
  if (subscription !== "max") return name;
  const multiplier = /max_(\d+x)/.exec(login.rateLimitTier)?.[1];
  return multiplier ? `${name} ${multiplier}` : name;
}

function windowLabel(limit: JsonObject): string {
  if (limit.kind === "session") return "5시간";
  const scope = isObject(limit.scope) && isObject(limit.scope.model) ? limit.scope.model : null;
  if (scope && typeof scope.display_name === "string") return `주간 · ${scope.display_name}`;
  return "주간";
}

function toWindows(rateLimits: unknown): UsageWindow[] {
  if (!isObject(rateLimits) || !Array.isArray(rateLimits.limits)) return [];
  return rateLimits.limits.filter(isObject).flatMap((limit, index) =>
    typeof limit.percent === "number"
      ? [
          {
            key: `${String(limit.kind)}-${index}`,
            label: windowLabel(limit),
            usedPercent: limit.percent,
            resetsAt: typeof limit.resets_at === "string" ? limit.resets_at : null,
          },
        ]
      : [],
  );
}

function money(value: unknown): number | null {
  if (!isObject(value) || typeof value.amount_minor !== "number" || typeof value.exponent !== "number") return null;
  return value.amount_minor / 10 ** value.exponent;
}

// get_usage의 rate_limits.extra_usage. is_enabled는 추가 크레딧으로 보낼 수 없는 동안(상한 도달 등) false다
// (2.1.307 스키마 설명). 금액은 센트다.
function toOverage(rateLimits: unknown): Overage | null {
  const extra = isObject(rateLimits) && isObject(rateLimits.extra_usage) ? rateLimits.extra_usage : null;
  if (!extra) return null;
  return {
    enabled: extra.is_enabled === true,
    monthlyLimitCents: typeof extra.monthly_limit === "number" ? extra.monthly_limit : null,
    usedCents: typeof extra.used_credits === "number" ? extra.used_credits : 0,
    currency: typeof extra.currency === "string" ? extra.currency : "USD",
  };
}

// 추가 크레딧은 get_usage의 rate_limits.spend에 있다(2.1.306 실측). 켜 둔 계정의 limit·balance는
// 아직 보지 못해 used와 같은 {amount_minor, currency, exponent} 모양으로 가정했다.
// spend에는 켜짐 여부가 없어(2.1.306 실측 필드: used·limit·balance·auto_reload·can_purchase_credits) extra_usage에서 읽는다.
function toExtraCredits(rateLimits: unknown, overage: Overage | null): ExtraCredits | null {
  const spend = isObject(rateLimits) && isObject(rateLimits.spend) ? rateLimits.spend : null;
  if (!spend && !overage) return null;
  const used = spend && isObject(spend.used) ? spend.used : {};
  return {
    enabled: spend?.enabled === true || overage?.enabled === true,
    currency: typeof used.currency === "string" ? used.currency : (overage?.currency ?? "USD"),
    used: money(spend?.used) ?? (overage ? overage.usedCents / 100 : null),
    limit: money(spend?.limit) ?? (overage?.monthlyLimitCents != null ? overage.monthlyLimitCents / 100 : null),
    balance: money(spend?.balance),
  };
}

function oauthHeaders(token: string, version: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "anthropic-beta": "oauth-2025-04-20",
    "User-Agent": `claude-cli/${version} (external, cli)`,
  };
}

// 재설정 쿠폰(코드명 cedar_ember)은 get_usage에 없고 Claude Code가 이 주소에 따로 묻는다(2.1.306 실측).
// Claude Code의 User-Agent와 starry_waterfall가 없으면 eligible:false, ineligible_reason "surface"로만 온다.
// 이 주소는 자주 부르면 429와 수십 분짜리 Retry-After를 준다(Paseo 0.11.4 claude-usage-source).
const RESETS_URL = "https://api.anthropic.com/api/oauth/usage?at_wall=1&starry_waterfall=cli_menu&skip_spend=1";

async function fetchResets(token: string, version: string): Promise<ResetCoupons> {
  const res = await withTimeout(fetch(RESETS_URL, { headers: oauthHeaders(token, version) }), 15_000, "Claude 재설정 쿠폰");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: unknown = await res.json();
  const program = isObject(body) && isObject(body.cedar_ember) ? body.cedar_ember : {};
  let count = 0;
  let expiresAt: string | null = null;
  for (const grant of Array.isArray(program.grants) ? program.grants.filter(isObject) : []) {
    const left = typeof grant.resets_left === "number" ? grant.resets_left : 0;
    const endsAt = typeof grant.ends_at === "string" ? new Date(grant.ends_at).toISOString() : null;
    if (left <= 0 || grant.paused === true || (endsAt !== null && Date.parse(endsAt) <= Date.now())) continue;
    count += left;
    if (endsAt !== null && (expiresAt === null || endsAt < expiresAt)) expiresAt = endsAt;
  }
  return { count, expiresAt };
}

// 추가 크레딧 잔액은 꺼 둔 계정도 이 주소로 나온다(get_usage의 spend.balance는 null, 2026-10-21 실측).
// amount는 센트 단위다(Claude Code가 balanceCents를 그대로 넣는다).
async function fetchPrepaidBalance(token: string, version: string, organizationUuid: string): Promise<number> {
  const res = await withTimeout(
    fetch(`https://api.anthropic.com/api/oauth/organizations/${organizationUuid}/prepaid/credits`, {
      headers: { ...oauthHeaders(token, version), "x-organization-uuid": organizationUuid },
    }),
    15_000,
    "Claude 추가 크레딧 잔액",
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!isObject(body) || typeof body.amount !== "number") throw new Error("잔액 없음");
  return body.amount / 100;
}

async function httpError(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const detail = isObject(body) && isObject(body.error) && typeof body.error.message === "string" ? ` ${body.error.message.slice(0, 200)}` : "";
  return `HTTP ${res.status}${detail}`;
}

// Claude Code 한도 화면의 "usage credits 켜기"와 같은 요청이다(2.1.307 바이너리 실측, 2026-10-23). 공개 문서에 없는 주소라 바뀔 수 있다.
// 설정해 둔 조직은 overage_spend_limit 하나로 켜고 상한을 바꾸고, 처음이면 setup_overage_billing으로 상한부터 만든 뒤 켠다.
// 상한(capCents)은 통화 최소 단위다.
export async function enableOverage(configDir: string, version: string, capCents: number, currency: string, configured: boolean): Promise<void> {
  const login = await storedLogin(configDir);
  const organization = await organizationUuid(configDir);
  if (!login.accessToken || !organization) throw new Error("로그인 정보를 읽지 못했습니다.");
  const headers = { ...oauthHeaders(login.accessToken, version), "Content-Type": "application/json", "x-organization-uuid": organization };
  const call = (method: "POST" | "PUT", path: string, body: JsonObject) =>
    withTimeout(
      fetch(`https://api.anthropic.com/api/oauth/organizations/${organization}/${path}`, { method, headers, body: JSON.stringify(body) }),
      30_000,
      "Claude 추가 크레딧 켜기",
    );
  if (!configured) {
    const setup = await call("POST", "setup_overage_billing", { org_monthly_spend_limit: capCents });
    if (!setup.ok) throw new Error(`결제 설정이 거절됐습니다(${await httpError(setup)}).`);
  }
  const res = await call("PUT", "overage_spend_limit", configured ? { is_enabled: true, monthly_credit_limit: capCents, currency } : { is_enabled: true });
  if (!res.ok) throw new Error(`요청이 거절됐습니다(${await httpError(res)}).`);
}

async function organizationUuid(configDir: string | null): Promise<string | null> {
  const file = configDir ? join(configDir, ".claude.json") : join(homedir(), ".claude.json");
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    const account = isObject(parsed) && isObject(parsed.oauthAccount) ? parsed.oauthAccount : {};
    return typeof account.organizationUuid === "string" ? account.organizationUuid : null;
  } catch {
    return null;
  }
}

/** checkExtras면 자주 부르면 안 되는 재설정 쿠폰·추가 크레딧 잔액도 묻는다. */
export async function probeClaude(configDir: string | null, checkExtras: boolean): Promise<ClaudeProbe> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of STRIPPED_ENV) delete env[key];
  if (configDir) env.CLAUDE_CONFIG_DIR = configDir;
  const child = spawnProcess(
    "claude",
    [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
      "--strict-mcp-config",
      "--settings",
      JSON.stringify({ disableAllHooks: true }),
    ],
    { stdio: "pipe", env, windowsHide: true },
  );
  const pending = new Map<string, (response: JsonObject) => void>();
  onJsonLines(child, (message) => {
    if (message.type !== "control_response" || !isObject(message.response)) return;
    const requestId = message.response.request_id;
    if (typeof requestId === "string") pending.get(requestId)?.(message.response);
  });
  function request(requestId: string, body: JsonObject): Promise<JsonObject> {
    const response = new Promise<JsonObject>((resolve) => pending.set(requestId, resolve));
    child.stdin.write(`${JSON.stringify({ type: "control_request", request_id: requestId, request: body })}\n`);
    return response;
  }
  try {
    return await withTimeout(
      (async () => {
        const init = await request("init", { subtype: "initialize" });
        const initBody = isObject(init.response) ? init.response : {};
        const account = isObject(initBody.account) ? initBody.account : {};
        const usage = await request("usage", { subtype: "get_usage", skip_behaviors: true });
        const usageBody = isObject(usage.response) ? usage.response : {};
        const email = typeof account.email === "string" ? account.email : null;
        const login = await storedLogin(configDir);
        const tier = claudeTier(usageBody.subscription_type, login);
        const loginExpiresAt = login.refreshTokenExpiresAt ? new Date(login.refreshTokenExpiresAt).toISOString() : null;
        if (!email) {
          return { email, tier, loginExpiresAt, state: "needs_login", stateDetail: "로그인 필요", windows: [], extraCredits: null };
        }
        if (usageBody.rate_limits_available !== true) {
          return {
            email,
            tier,
            loginExpiresAt,
            state: "needs_login",
            stateDetail: "사용량을 볼 권한이 없습니다.",
            windows: [],
            extraCredits: null,
          };
        }
        const windows = toWindows(usageBody.rate_limits);
        const limited = windows.some((window) => window.usedPercent >= 100);
        const overage = toOverage(usageBody.rate_limits);
        const version = initBody.claude_code_version;
        // get_usage가 방금 토큰을 갱신해 두었으니 저장된 토큰을 바로 쓴다. 실패해도 사용량 표시는 막지 않는다.
        const token = checkExtras && typeof version === "string" ? login.accessToken : null;
        const organization = token ? await organizationUuid(configDir) : null;
        const [resets, prepaidBalance] = token
          ? await Promise.all([
              fetchResets(token, String(version)).catch(() => undefined),
              organization ? fetchPrepaidBalance(token, String(version), organization).catch(() => undefined) : undefined,
            ])
          : [undefined, undefined];
        return {
          email,
          tier,
          loginExpiresAt,
          state: limited ? "limited" : "ok",
          stateDetail: null,
          windows,
          extraCredits: toExtraCredits(usageBody.rate_limits, overage),
          overage,
          cliVersion: typeof version === "string" ? version : undefined,
          resets,
          prepaidBalance,
        };
      })(),
      PROBE_TIMEOUT_MS,
      "Claude 사용량 확인",
    );
  } finally {
    await terminateProcess(child);
  }
}

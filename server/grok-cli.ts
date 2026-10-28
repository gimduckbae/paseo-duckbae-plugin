import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { execCommand, spawnProcess, terminateProcess } from "@getpaseo/plugin/server";
import type { AccountState, UsageWindow } from "../shared/accounts";
import { isObject, withTimeout } from "./json-lines";

const URL_PATTERN = /https:\/\/accounts\.x\.ai\/oauth2\/device\S*/;
const CODE_PATTERN = /user_code=([A-Z0-9-]+)/;

function grokEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GROK_HOME: home };
  // XAI_API_KEY가 있으면 Grok은 브라우저 로그인보다 그 키를 먼저 쓴다(Grok 1.0.62 README).
  delete env.XAI_API_KEY;
  return env;
}

/** `grok login --device-auth`는 터미널이 아니어도 주소와 코드를 출력하고 승인을 기다린다(1.0.62 실측). */
export class GrokDeviceLogin {
  private readonly child: ChildProcessWithoutNullStreams;
  private output = "";
  readonly exited: Promise<number | null>;

  constructor(home: string) {
    this.child = spawnProcess("grok", ["login", "--device-auth"], { stdio: "pipe", env: grokEnv(home), windowsHide: true });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => (this.output += chunk));
    this.child.stderr.on("data", (chunk: string) => (this.output += chunk));
    this.exited = new Promise((resolve) => this.child.on("exit", (code) => resolve(code)));
  }

  async deviceCode(timeoutMs: number): Promise<{ userCode: string; verificationUrl: string }> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const url = URL_PATTERN.exec(this.output)?.[0];
      const code = url ? CODE_PATTERN.exec(url)?.[1] : undefined;
      if (url && code) return { userCode: code, verificationUrl: url };
      if (this.child.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(this.output.trim().slice(-300) || "Grok 로그인 코드를 받지 못했습니다.");
  }

  async close(): Promise<void> {
    if (this.child.exitCode === null) await terminateProcess(this.child);
  }
}

export interface GrokProbe {
  email: string | null;
  tier: string | null;
  state: AccountState;
  stateDetail: string | null;
  windows: UsageWindow[];
  resetCredits: number | null;
}

// Grok CLI의 사용량은 대화 화면 안 /usage로만 볼 수 있고 실행 명령은 없다(1.0.62). 그래서 Paseo 내장
// grok-usage-source(0.11.4)처럼 /usage가 부르는 주소를 로그인 토큰으로 직접 부른다. 공개 문서에 없는
// 주소라 바뀔 수 있다. format=credits가 없으면 통합 결제 계정은 0으로 채운 옛 월간 형식이 온다.
const BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";

const PERIOD_LABEL: Record<string, string> = { USAGE_PERIOD_TYPE_WEEKLY: "주간", USAGE_PERIOD_TYPE_MONTHLY: "월간" };

function billingWindow(body: unknown): UsageWindow | null {
  const config = isObject(body) && isObject(body.config) ? body.config : null;
  const period = config && isObject(config.currentPeriod) ? config.currentPeriod : null;
  if (!config || !period) return null;
  // 0인 값은 응답에서 빠진다. 그 주에 쓰지 않은 계정은 creditUsagePercent 없이 온다(2026-10-21 실측).
  const usedPercent = typeof config.creditUsagePercent === "number" ? config.creditUsagePercent : 0;
  const type = typeof period.type === "string" ? period.type : "";
  const resetsAt = typeof period.end === "string" ? new Date(period.end).toISOString() : null;
  return { key: type || "period", label: PERIOD_LABEL[type] ?? "이번 기간", usedPercent, resetsAt };
}

// `grok models`는 사용량을 쓰지 않고 로그인을 확인하며, 만료된 토큰이 있으면 갱신도 같이 일어난다.
// 그래서 사용량 주소를 부르기 전에 먼저 실행한다.
export async function probeGrok(home: string): Promise<GrokProbe> {
  const { stdout } = await execCommand("grok", ["models"], { env: grokEnv(home), timeout: 30_000 });
  const base = { tier: null, windows: [], resetCredits: null };
  if (/not authenticated/i.test(stdout)) {
    return { ...base, email: null, state: "needs_login", stateDetail: "로그인 필요" };
  }
  const auth: unknown = JSON.parse(await readFile(join(home, "auth.json"), "utf8").catch(() => "{}"));
  const entry = isObject(auth) ? Object.values(auth).find(isObject) : undefined;
  const email = entry && typeof entry.email === "string" ? entry.email : null;
  const token = entry && typeof entry.key === "string" ? entry.key : null;
  if (!token) return { ...base, email, state: "needs_login", stateDetail: "로그인 필요" };
  try {
    const res = await withTimeout(
      fetch(BILLING_URL, { headers: { Authorization: `Bearer ${token}`, "X-XAI-Token-Auth": "xai-grok-cli", Accept: "application/json" } }),
      15_000,
      "Grok 사용량",
    );
    if (res.status === 401 || res.status === 403) return { ...base, email, state: "needs_login", stateDetail: "로그인 필요" };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const window = billingWindow(await res.json());
    const windows = window ? [window] : [];
    return { ...base, email, windows, state: windows.some((w) => w.usedPercent >= 100) ? "limited" : "ok", stateDetail: null };
  } catch (error) {
    // 로그인은 살아 있으니 실행할 계정 후보에서 빼지 않는다.
    return { ...base, email, state: "ok", stateDetail: `사용량을 확인하지 못했습니다. ${error instanceof Error ? error.message : String(error)}` };
  }
}

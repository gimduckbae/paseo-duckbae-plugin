import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawnProcess, terminateProcess } from "@getpaseo/plugin/server";
import type { AccountState, UsageWindow } from "../shared/accounts";
import { isObject, onJsonLines, withTimeout, type JsonObject } from "./json-lines";

const REQUEST_TIMEOUT_MS = 20_000;

export class CodexAppServer {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, (message: JsonObject) => void>();
  private readonly notificationHandlers = new Set<(method: string, params: unknown) => void>();
  private nextId = 0;

  private constructor(env: Record<string, string>) {
    this.child = spawnProcess("codex", ["app-server"], { stdio: "pipe", env: { ...process.env, ...env }, windowsHide: true });
    onJsonLines(this.child, (message) => {
      if (typeof message.id === "number" && this.pending.has(message.id)) {
        this.pending.get(message.id)?.(message);
        this.pending.delete(message.id);
        return;
      }
      if (typeof message.method === "string") {
        for (const handler of this.notificationHandlers) handler(message.method, message.params);
      }
    });
  }

  static async open(env: Record<string, string>): Promise<CodexAppServer> {
    const server = new CodexAppServer(env);
    await server.request("initialize", { clientInfo: { name: "paseo-duckbae-plugin", version: "0.1.0" } });
    server.child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
    return server;
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = ++this.nextId;
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, (message) => {
        if (isObject(message.error)) reject(new Error(String(message.error.message ?? method)));
        else resolve(message.result);
      });
    });
    this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return withTimeout(response, REQUEST_TIMEOUT_MS, method);
  }

  onNotification(handler: (method: string, params: unknown) => void): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  async close(): Promise<void> {
    await terminateProcess(this.child);
  }
}

export interface CodexProbe {
  email: string | null;
  tier: string | null;
  state: AccountState;
  stateDetail: string | null;
  windows: UsageWindow[];
  resetCredits: number | null;
}

const CODEX_TIERS: Record<string, string> = {
  free: "Free",
  go: "Go",
  plus: "Plus",
  pro: "Pro",
  prolite: "Pro Lite",
  promax: "Pro Max",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
  edu: "Edu",
  edu_plus: "Edu Plus",
  edu_pro: "Edu Pro",
};

function codexTier(planType: unknown): string | null {
  if (typeof planType !== "string" || planType === "unknown") return null;
  if (CODEX_TIERS[planType]) return CODEX_TIERS[planType];
  if (planType.startsWith("self_serve_business")) return "Business";
  if (planType.startsWith("ent")) return "Enterprise";
  return planType;
}

function windowLabel(minutes: number): string {
  if (minutes === 300) return "5시간";
  if (minutes === 10080) return "주간";
  return `${Math.round(minutes / 60)}시간`;
}

function toWindow(key: string, value: unknown): UsageWindow | null {
  if (!isObject(value) || typeof value.usedPercent !== "number") return null;
  const minutes = typeof value.windowDurationMins === "number" ? value.windowDurationMins : 0;
  const resetsAt = typeof value.resetsAt === "number" ? new Date(value.resetsAt * 1000).toISOString() : null;
  return { key, label: windowLabel(minutes), usedPercent: value.usedPercent, resetsAt };
}

export async function probeCodex(env: Record<string, string>): Promise<CodexProbe> {
  const server = await CodexAppServer.open(env);
  try {
    // 보관 계정은 아무도 쓰지 않으면 갱신 토큰이 만료된다. 주기 조회 때 공식 갱신을 같이 태워 살려 둔다.
    const account = await server.request("account/read", { refreshToken: true });
    const info = isObject(account) && isObject(account.account) ? account.account : null;
    if (!info) {
      return { email: null, tier: null, state: "needs_login", stateDetail: "로그인 필요", windows: [], resetCredits: null };
    }
    const limits = await server.request("account/rateLimits/read", null);
    const snapshot = isObject(limits) && isObject(limits.rateLimits) ? limits.rateLimits : {};
    const windows = [toWindow("primary", snapshot.primary), toWindow("secondary", snapshot.secondary)].filter(
      (window): window is UsageWindow => window !== null,
    );
    const credits = isObject(limits) && isObject(limits.rateLimitResetCredits) ? limits.rateLimitResetCredits : null;
    const reached = typeof snapshot.rateLimitReachedType === "string" || windows.some((w) => w.usedPercent >= 100);
    return {
      email: typeof info.email === "string" ? info.email : null,
      tier: codexTier(info.planType),
      state: reached ? "limited" : "ok",
      stateDetail: null,
      windows,
      resetCredits: credits && typeof credits.availableCount === "number" ? credits.availableCount : null,
    };
  } finally {
    await server.close();
  }
}

import type { AccountView, Overview } from "../../shared/accounts";
import { PROGRESS_BY_RUN, WAITING } from "./workflow-samples";
import { TRANSLATOR_BYTES, type ReasoningTranslation } from "../../shared/reasoning";
import { REASONING_KOREAN, REASONING_SOURCE } from "./reasoning-samples";

const now = Date.now();
const after = (minutes: number) => new Date(now + minutes * 60_000).toISOString();

function account(partial: Partial<AccountView> & Pick<AccountView, "id" | "provider" | "label">): AccountView {
  return {
    email: null,
    tier: null,
    state: "ok",
    stateDetail: null,
    windows: [],
    resetCredits: null,
    resetExpiresAt: null,
    extraCredits: null,
    credentialKind: partial.provider === "codex" ? "codex_home" : "claude_login",
    hasToken: false,
    hasAdminKey: false,
    credentialExpiresAt: partial.provider === "codex" ? null : "2027-10-21T05:00:00.000Z",
    active: false,
    agentCount: 0,
    monthlyCredit: null,
    spend: null,
    checkedAt: after(-2),
    ...partial,
  };
}

const DOWNLOAD_DONE = { supported: true, needed: false, receivedBytes: 0, totalBytes: 0 };
const DOWNLOAD_HALF = { supported: true, needed: true, receivedBytes: 84_301_312, totalBytes: TRANSLATOR_BYTES };

// 표본이 없는 모습은 #desktop-rz-nospeed로 본다.
// gpt-7-nova는 모델 목록에 없는 이름이다 — 이름을 못 찾으면 아이디를 그대로 보여 주는 모습.
const SPEEDS = [
  { model: "claude/claude-sonnet-5-5", samples: 36, tokensPerSecond: 142.8 },
  { model: "claude/claude-opus-5-5", samples: 128, tokensPerSecond: 97.4 },
  { model: "codex/gpt-6-astra", samples: 41, tokensPerSecond: 62.1 },
  { model: "codex/gpt-7-nova", samples: 3, tokensPerSecond: 44.2 },
];

// 추론 훔쳐보기 설정 줄의 상태별 모습. #desktop-rz-<상태>로 고른다.
function reasoningView(): Overview["reasoning"] {
  const variant = /-rz-([a-z]+)/.exec(location.hash)?.[1] ?? "ready";
  const speeds = variant === "nospeed" ? [] : SPEEDS;
  if (variant === "off") return { enabled: false, translator: "ready", error: null, download: DOWNLOAD_DONE, speeds };
  if (variant === "missing") return { enabled: true, translator: "missing", error: null, download: { ...DOWNLOAD_DONE, needed: true }, speeds };
  if (variant === "nowin") return { enabled: false, translator: "missing", error: null, download: { supported: false, needed: false, receivedBytes: 0, totalBytes: 0 }, speeds };
  if (variant === "downloading") return { enabled: true, translator: "downloading", error: null, download: DOWNLOAD_HALF, speeds };
  if (variant === "extracting") return { enabled: true, translator: "extracting", error: null, download: { ...DOWNLOAD_HALF, receivedBytes: TRANSLATOR_BYTES }, speeds };
  if (variant === "dlfail") {
    return {
      enabled: true,
      translator: "failed",
      error: "opus-mt-tc-big-en-ko-ct2-int8.zip을 내려받지 못했습니다. fetch failed",
      download: DOWNLOAD_HALF,
      speeds,
    };
  }
  if (variant === "failed") return { enabled: true, translator: "failed", error: "번역기가 멈췄습니다 (3). failed to load model: out of memory", download: DOWNLOAD_DONE, speeds };
  return { enabled: true, translator: "ready", error: null, download: DOWNLOAD_DONE, speeds };
}

export const overview: Overview = {
  swapOffer: true,
  compactAuto: true,
  compactThreshold: 20,
  questionAuto: "delay",
  reasoning: reasoningView(),
  agentAccounts: { a1: "c1" },
  handoffs: [
    {
      jobId: "j2", agentId: "a2", fromTitle: "상품 페이지 개선", toLabel: "개인 Pro", toProvider: "codex", modelLabel: "GPT-6-Astra",
      startedAt: after(-1), status: "pending", phase: "writing", newAgentId: null, title: null, error: null, cascadeChildCount: null, seen: false,
    },
    {
      jobId: "j1", agentId: "a1", fromTitle: "결제 리팩토링", toLabel: "개인 Pro", toProvider: "codex", modelLabel: "GPT-6-Astra",
      startedAt: after(-12), status: "completed", phase: null, newAgentId: "a9", title: "결제 리팩토링 · 개인 Pro", error: null, cascadeChildCount: 3, seen: true,
    },
  ],
  // 켠 뒤 월 상한 = 이번 달 사용분 + 잔액(server/account-service.ts turnOnExtra). 개인 Max: $0 + $20.
  lastLimit: { provider: "claude", fromLabel: "개인 Max", state: "limited", reason: "usage limit", extra: { status: "enabled", capUsd: 20 }, at: after(-25) },
  accounts: [
    account({
      id: "c1",
      provider: "claude",
      label: "업무 Max",
      email: "work@example.com",
      hasToken: true,
      tier: "Max 20x",
      active: true,
      agentCount: 3,
      resetCredits: 1,
      resetExpiresAt: after(60 * 30),
      extraCredits: { enabled: true, currency: "USD", used: 3.2, limit: 100, balance: 46.8 },
      windows: [
        { key: "s", label: "5시간", usedPercent: 42, resetsAt: after(130) },
        { key: "w", label: "주간", usedPercent: 56, resetsAt: after(60 * 24 * 4) },
        { key: "f", label: "주간 · Fable", usedPercent: 12, resetsAt: after(60 * 24 * 4) },
      ],
    }),
    account({
      id: "c2",
      provider: "claude",
      label: "개인 Max",
      email: "me@example.com",
      credentialExpiresAt: "2026-11-20T05:00:00.000Z",
      tier: "Max 5x",
      agentCount: 2,
      state: "limited",
      extraCredits: { enabled: true, currency: "USD", used: 0, limit: 20, balance: 20 },
      windows: [
        { key: "s", label: "5시간", usedPercent: 100, resetsAt: after(72) },
        { key: "w", label: "주간", usedPercent: 83, resetsAt: after(60 * 24 * 2) },
      ],
    }),
    account({
      id: "c3",
      provider: "claude",
      label: "팀 Pro",
      credentialKind: "oauth_token",
      hasToken: true,
      tier: null,
      state: "needs_login",
      stateDetail: "사용량 조회 권한이 없습니다 (1년 토큰만 등록됨).",
    }),
    account({
      id: "c4",
      provider: "claude",
      label: "업무 Max API",
      tier: "API",
      monthlyCredit: 200,
      spend: { month: "2026-10", usd: 47.82, source: "estimate" },
      credentialKind: "api_key",
      credentialExpiresAt: null,
    }),
    account({
      id: "c5",
      provider: "claude",
      label: "회사 API",
      tier: "API",
      monthlyCredit: 500,
      spend: { month: "2026-10", usd: 312.4, source: "console" },
      hasAdminKey: true,
      credentialKind: "api_key",
      credentialExpiresAt: null,
    }),
    account({
      id: "x1",
      provider: "codex",
      label: "개인 Pro",
      email: "me@example.com",
      tier: "Pro Lite",
      active: true,
      agentCount: 1,
      resetCredits: 2,
      windows: [
        { key: "p", label: "5시간", usedPercent: 18, resetsAt: after(200) },
        { key: "q", label: "주간", usedPercent: 58, resetsAt: after(60 * 24 * 3) },
      ],
    }),
    account({
      id: "x2",
      provider: "codex",
      label: "회사 Plus",
      state: "needs_login",
      stateDetail: "로그인 필요",
    }),
    account({
      id: "g1",
      provider: "grok",
      label: "개인 SuperGrok",
      email: "me@example.com",
      windows: [{ key: "USAGE_PERIOD_TYPE_WEEKLY", label: "주간", usedPercent: 12, resetsAt: after(60 * 24 + 380) }],
      credentialKind: "grok_home",
      credentialExpiresAt: null,
      active: true,
    }),
  ],
};

const REV_OLD = "3f9c2e1a7b6d5c4e3f2a1b0c9d8e7f6a5b4c3d2e";
const REV_NEW = "8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b";

// 계정 화면 업데이트 줄의 상태별 모습. #desktop 뒤에 -upd-<상태>를 붙여 고른다.
function updateStatus() {
  const variant = /-upd-([a-z]+)/.exec(location.hash)?.[1] ?? "available";
  const base = {
    mode: "confirm" as const,
    source: "git" as const,
    current: REV_OLD,
    latest: REV_OLD,
    available: false,
    changes: [] as string[],
    checkedAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    checking: false,
    applying: false,
    error: null as string | null,
    lastUpdate: null as { from: string; to: string; at: string } | null,
  };
  if (variant === "local") return { ...base, mode: null, source: "local" as const, current: null, latest: null, checkedAt: base.checkedAt };
  if (variant === "current") return { ...base, mode: "auto" as const, lastUpdate: { from: REV_NEW, to: REV_OLD, at: new Date(Date.now() - 26 * 3_600_000).toISOString() } };
  if (variant === "applying") return { ...base, mode: "auto" as const, latest: REV_NEW, available: true, applying: true };
  if (variant === "error") return { ...base, error: "업데이트하지 못했습니다. clone failed: Authentication failed for 'https://github.com/…'" };
  return {
    ...base,
    latest: REV_NEW,
    available: true,
    changes: ["업데이트 방식을 고르고 새 버전을 알리기", "계정 화면 글을 쉬운 말로", "다시 로그인 버튼"],
  };
}

const SPLIT = /(?<=[.!?])\s+/;
// 서버는 문장 단위로 번역해 캐시한다. 흘러오는 중간에 오는 머리도 끝난 문장만큼 한국어로 돌려줘야 실제 모습이 나온다.
function koreanFor(text: string): string {
  const english = REASONING_SOURCE.split(SPLIT);
  const korean = REASONING_KOREAN.split(SPLIT);
  let out = text;
  english.forEach((sentence, index) => {
    out = out.split(sentence).join(korean[index] ?? sentence);
  });
  return out;
}

function reasoningTranslation(input: { text: string }): ReasoningTranslation {
  const view = location.hash.slice(1);
  if (view === "rz-wait") return { status: "pending" };
  if (view === "rz-dl") return { status: "unavailable", translator: "downloading", error: null, download: DOWNLOAD_HALF };
  if (view === "rz-fail" || view === "rz-live-fail" || view === "rz-speedfail") {
    return { status: "unavailable", translator: "failed", error: "번역기가 멈췄습니다 (3). failed to load model: out of memory", download: DOWNLOAD_DONE };
  }
  if (view === "rz-off") return { status: "off" };
  return { status: "ready", markdown: koreanFor(input.text) };
}

export async function mockRpc(name: string, _input: unknown): Promise<unknown> {
  switch (name) {
    case "workflow.progress":
      return PROGRESS_BY_RUN[(_input as { runId: string }).runId] ?? WAITING;
    case "reasoning.translate":
      return reasoningTranslation(_input as { text: string });
    case "reasoning.speed.add":
      return { ok: true };
    case "reasoning.enabled.set":
      return overview;
    case "update.status":
      return updateStatus();
    case "update.check":
    case "update.apply":
    case "update.mode.set":
    case "update.offer.answer":
      return new Promise(() => {});
    case "accounts.device-login.start":
      return { loginId: "l1", userCode: "K7QF-29XD", verificationUrl: "https://auth.openai.com/codex/device" };
    case "accounts.device-login.status":
      return { status: "pending" };
    case "accounts.handoff.start":
      return { jobId: "j1" };
    case "questions.answers":
      return { answers: {}, auto: [], pending: {} };
    case "questions.answer":
      return new Promise(() => {});
    case "accounts.limit-offer.answer":
      return new Promise(() => {});
    case "compact.offer.answer":
      return new Promise(() => {});

    default:
      return overview;
  }
}

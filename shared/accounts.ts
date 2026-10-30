import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { questionAutoModeSchema } from "./question";

export const providerSchema = z.enum(["claude", "codex", "grok"]);
export type Provider = z.infer<typeof providerSchema>;

export const PROVIDER_LABEL: Record<Provider, string> = { claude: "Claude", codex: "Codex", grok: "Grok" };

/** Paseo 프로바이더 ID(claude, claude-xxx 같은 사용자 정의 포함)를 계정 종류로 묶는다. */
export function providerFamily(provider: string): Provider | null {
  if (provider === "claude" || provider.startsWith("claude-")) return "claude";
  if (provider === "codex" || provider.startsWith("codex-")) return "codex";
  if (provider === "grok" || provider.startsWith("grok-")) return "grok";
  return null;
}

export const accountStateSchema = z.enum(["ok", "limited", "needs_login", "error", "unknown"]);
export type AccountState = z.infer<typeof accountStateSchema>;

export const usageWindowSchema = z.object({
  key: z.string(),
  label: z.string(),
  usedPercent: z.number(),
  resetsAt: z.string().nullable(),
});
export type UsageWindow = z.infer<typeof usageWindowSchema>;

export const credentialKindSchema = z.enum(["claude_login", "oauth_token", "api_key", "codex_home", "grok_home"]);

/** Claude 구독의 추가 크레딧(Usage credits). 금액은 currency 단위. */
export const extraCreditsSchema = z.object({
  enabled: z.boolean(),
  currency: z.string(),
  used: z.number().nullable(),
  limit: z.number().nullable(),
  balance: z.number().nullable(),
});
export type ExtraCredits = z.infer<typeof extraCreditsSchema>;

export const accountViewSchema = z.object({
  id: z.string(),
  provider: providerSchema,
  label: z.string(),
  email: z.string().nullable(),
  tier: z.string().nullable(),
  state: accountStateSchema,
  stateDetail: z.string().nullable(),
  windows: z.array(usageWindowSchema),
  resetCredits: z.number().nullable(),
  resetExpiresAt: z.string().nullable(),
  extraCredits: extraCreditsSchema.nullable(),
  credentialKind: credentialKindSchema,
  credentialExpiresAt: z.string().nullable(),
  hasToken: z.boolean(),
  hasAdminKey: z.boolean(),
  monthlyCredit: z.number().nullable(),
  /** console: Admin API cost_report의 조직 전체 금액, estimate: Paseo에서 실행한 비용 누적. */
  spend: z.object({ month: z.string(), usd: z.number(), source: z.enum(["console", "estimate"]) }).nullable(),
  active: z.boolean(),
  agentCount: z.number(),
  checkedAt: z.string().nullable(),
});
export type AccountView = z.infer<typeof accountViewSchema>;

/** 한도에 걸린 Claude 구독 계정의 추가 크레딧을 켠 결과. 크레딧이 없거나 켤 수 없는 계정이면 null로 둔다. */
export const extraOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("enabled"), capUsd: z.number() }),
  z.object({ status: z.literal("failed"), error: z.string() }),
]);
export type ExtraOutcome = z.infer<typeof extraOutcomeSchema>;

export const limitEventSchema = z.object({
  provider: providerSchema,
  fromLabel: z.string(),
  state: z.enum(["limited", "needs_login"]),
  reason: z.string(),
  extra: extraOutcomeSchema.nullable(),
  at: z.string(),
});
export type LimitEvent = z.infer<typeof limitEventSchema>;

/** 사용자가 다른 곳에 가 있어도 끝난 것을 알 수 있게 목록에 남긴다. */
export const handoffViewSchema = z.object({
  jobId: z.string(),
  agentId: z.string(),
  fromTitle: z.string().nullable(),
  toLabel: z.string(),
  toProvider: providerSchema,
  modelLabel: z.string(),
  startedAt: z.string(),
  status: z.enum(["pending", "completed", "failed"]),
  phase: z.enum(["writing", "creating"]).nullable(),
  newAgentId: z.string().nullable(),
  title: z.string().nullable(),
  error: z.string().nullable(),
  cascadeChildCount: z.number().nullable(),
  seen: z.boolean(),
});
export type HandoffView = z.infer<typeof handoffViewSchema>;

export const overviewSchema = z.object({
  accounts: z.array(accountViewSchema),
  /** 한도에 걸리면 그 대화에 계정을 바꿀지 묻는 카드를 붙인다. */
  swapOffer: z.boolean(),
  /** 컨텍스트 정리 제안을 10초 뒤 자동으로 받아들인다. */
  compactAuto: z.boolean(),
  /** 정리를 제안하는 컨텍스트 사용률(창 크기 대비 %). */
  compactThreshold: z.number(),
  /** 에이전트 질문 자동 답변 방식. */
  questionAuto: questionAutoModeSchema,
  lastLimit: limitEventSchema.nullable(),
  /** 에이전트 ID → 그 에이전트가 묶인 계정 ID. */
  agentAccounts: z.record(z.string(), z.string()),
  handoffs: z.array(handoffViewSchema),
});
export type Overview = z.infer<typeof overviewSchema>;

export const overviewRpc = defineRpc({
  name: "accounts.overview",
  input: z.object({ refresh: z.boolean() }),
  output: overviewSchema,
});

export const activateRpc = defineRpc({
  name: "accounts.activate",
  input: z.object({ accountId: z.string() }),
  output: overviewSchema,
});

export const setSwapOfferRpc = defineRpc({
  name: "accounts.swap-offer.set",
  input: z.object({ enabled: z.boolean() }),
  output: overviewSchema,
});

export const setQuestionAutoRpc = defineRpc({
  name: "questions.auto.set",
  input: z.object({ mode: questionAutoModeSchema }),
  output: overviewSchema,
});

export const renameAccountRpc = defineRpc({
  name: "accounts.rename",
  input: z.object({ accountId: z.string(), label: z.string().trim().min(1).max(40) }),
  output: overviewSchema,
});

export const removeAccountRpc = defineRpc({
  name: "accounts.remove",
  input: z.object({ accountId: z.string() }),
  output: overviewSchema,
});

/** Claude 구독: 브라우저 로그인(draftId)이 필수, 1년 토큰은 선택. */
export const addClaudeLoginRpc = defineRpc({
  name: "accounts.claude.add-login",
  input: z.object({ label: z.string().min(1), draftId: z.string(), token: z.string().nullable() }),
  output: overviewSchema,
});

export const addClaudeApiKeyRpc = defineRpc({
  name: "accounts.claude.add-api-key",
  input: z.object({ label: z.string().min(1), apiKey: z.string().min(1), monthlyCredit: z.number().positive().nullable() }),
  output: overviewSchema,
});

/** 구독 계정의 1년 토큰을 넣거나(null이면) 뺀다. */
export const setClaudeTokenRpc = defineRpc({
  name: "accounts.claude.token.set",
  input: z.object({ accountId: z.string(), token: z.string().min(1).nullable() }),
  output: overviewSchema,
});

/** API 키 계정의 사용액 조회용 Admin 키를 넣거나(null이면) 뺀다. */
export const setAdminKeyRpc = defineRpc({
  name: "accounts.admin-key.set",
  input: z.object({ accountId: z.string(), adminKey: z.string().min(1).nullable() }),
  output: overviewSchema,
});

export const setMonthlyCreditRpc = defineRpc({
  name: "accounts.monthly-credit.set",
  input: z.object({ accountId: z.string(), monthlyCredit: z.number().positive().nullable() }),
  output: overviewSchema,
});

/** accountId가 없으면 새 계정용 초안 폴더에 로그인하고 draftId를 돌려준다. */
export const claudeLoginStartRpc = defineRpc({
  name: "accounts.claude-login.start",
  input: z.object({ accountId: z.string().nullable() }),
  output: z.object({ loginId: z.string(), url: z.string(), draftId: z.string().nullable() }),
});

export const claudeLoginFinishRpc = defineRpc({
  name: "accounts.claude-login.finish",
  input: z.object({ loginId: z.string(), code: z.string().min(1) }),
  output: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), email: z.string().nullable(), tier: z.string().nullable() }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]),
});

export const deviceLoginProviderSchema = z.enum(["codex", "grok"]);
export type DeviceLoginProvider = z.infer<typeof deviceLoginProviderSchema>;

/** Codex·Grok 기기 코드 로그인. 승인되면 계정이 추가된다. */
export const deviceLoginStartRpc = defineRpc({
  name: "accounts.device-login.start",
  /** accountId가 있으면 새로 만들지 않고 그 계정 폴더에 다시 로그인한다. */
  input: z.object({ provider: deviceLoginProviderSchema, label: z.string().min(1), accountId: z.string().optional() }),
  output: z.object({ loginId: z.string(), userCode: z.string(), verificationUrl: z.string() }),
});

export const deviceLoginStatusRpc = defineRpc({
  name: "accounts.device-login.status",
  input: z.object({ loginId: z.string() }),
  output: z.discriminatedUnion("status", [
    z.object({ status: z.literal("pending") }),
    z.object({ status: z.literal("completed"), accountId: z.string() }),
    z.object({ status: z.literal("failed"), error: z.string() }),
  ]),
});

/**
 * 지금 에이전트가 인계 문서를 쓰고, 고른 모델·계정으로 새 에이전트를 만들어 그 문서를 첫 프롬프트로 보낸다.
 * model은 "provider/model" 형식이다.
 */
export const handoffStartRpc = defineRpc({
  name: "accounts.handoff.start",
  input: z.object({ agentId: z.string(), accountId: z.string(), model: z.string(), modelLabel: z.string() }),
  output: z.object({ jobId: z.string() }),
});

/** 새 에이전트를 열었다. 사이드바 알림만 끄고 목록에는 남긴다. */
export const handoffSeenRpc = defineRpc({
  name: "accounts.handoff.seen",
  input: z.object({ jobId: z.string() }),
  output: overviewSchema,
});

/** 끝난 이어가기를 목록에서 지운다. jobId가 null이면 끝난 것을 모두 지운다. 진행 중인 것은 지우지 않는다. */
export const handoffRemoveRpc = defineRpc({
  name: "accounts.handoff.remove",
  input: z.object({ jobId: z.string().nullable() }),
  output: overviewSchema,
});

export const ACCOUNT_HANDOFF_ITEM_KIND = "account-handoff";

export const accountHandoffItemSchema = z.object({
  toLabel: z.string(),
  toProvider: providerSchema,
  title: z.string().nullable(),
  handoffPath: z.string().nullable(),
  error: z.string().nullable(),
  /** 지난 대화에 남은, 이 필드가 생기기 전 행에는 없다. */
  cascadeChildCount: z.number().nullable().optional(),
});
export type AccountHandoffItem = z.infer<typeof accountHandoffItemSchema>;

// 자동 전환을 쓰던 버전이 남긴 행. 지난 대화에 그대로 남아 있어 렌더러를 지우지 않는다.
export const ACCOUNT_SWITCH_ITEM_KIND = "account-switch";

export const accountSwitchItemSchema = z.object({
  provider: providerSchema,
  fromLabel: z.string(),
  toLabel: z.string().nullable(),
  reason: z.string(),
});
export type AccountSwitchItem = z.infer<typeof accountSwitchItemSchema>;

export const LIMIT_OFFER_ITEM_KIND = "limit-offer";

export const limitOfferAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stay") }),
  z.object({ kind: z.literal("swap"), accountId: z.string(), label: z.string() }),
]);

/** 한도에 걸린 대화에 붙는 질문 카드. 답하면 같은 id로 answer를 채워 다시 붙인다. */
export const limitOfferItemSchema = z.object({
  offerId: z.string(),
  provider: providerSchema,
  accountId: z.string(),
  fromLabel: z.string(),
  state: z.enum(["limited", "needs_login"]),
  extra: extraOutcomeSchema.nullable(),
  answer: limitOfferAnswerSchema.nullable(),
});
export type LimitOfferItem = z.infer<typeof limitOfferItemSchema>;

/**
 * stay: 이 계정으로 계속한다. 추가 크레딧을 켰으면 멈춘 에이전트에 계속하라는 메시지를 보낸다.
 * swap: 고른 계정을 '사용 중'으로 바꾸고 같은 모델로 이어가기를 시작한다.
 */
export const limitOfferAnswerRpc = defineRpc({
  name: "accounts.limit-offer.answer",
  input: z.object({
    agentId: z.string(),
    offer: limitOfferItemSchema,
    choice: z.discriminatedUnion("kind", [z.object({ kind: z.literal("stay") }), z.object({ kind: z.literal("swap"), accountId: z.string() })]),
  }),
  output: z.object({ ok: z.literal(true) }),
});

import { defineRpc, type PluginTimelineItem } from "@getpaseo/plugin";
import { z } from "zod";

export const REASONING_ITEM_KIND = "reasoning-peek";

/** 생각 글 한 덩이. phase는 호스트가 준 것으로, streaming이면 아직 자라는 중이다. */
export const reasoningItemSchema = z.object({
  text: z.string(),
  phase: z.enum(["streaming", "complete"]),
});
export type ReasoningItem = z.infer<typeof reasoningItemSchema>;

/** ready는 쉬는 동안 꺼 둔 것도 쓸 수 있는 것으로 친다. */
export const translatorStateSchema = z.enum(["missing", "downloading", "extracting", "loading", "ready", "failed"]);
export type TranslatorState = z.infer<typeof translatorStateSchema>;

/** translator-v1 릴리스 두 파일을 합친 크기. 켜기 전에도 얼마나 받는지 보여 줘야 해서 적어 둔다. */
export const TRANSLATOR_BYTES = 227_766_709;

export const translatorDownloadSchema = z.object({
  /** 번역기 빌드는 윈도 x64만 있다. */
  supported: z.boolean(),
  /** 손으로 깔아 둔 것이 있으면 false다. */
  needed: z.boolean(),
  receivedBytes: z.number(),
  totalBytes: z.number(),
});
export type TranslatorDownloadView = z.infer<typeof translatorDownloadSchema>;

/** model은 "<제공자>/<모델 id>"다(에이전트 정보의 provider·model, 2026-11-06 실측 "claude/claude-opus-5-5"). */
export const modelSpeedSchema = z.object({
  model: z.string(),
  samples: z.number(),
  tokensPerSecond: z.number(),
});
export type ModelSpeedView = z.infer<typeof modelSpeedSchema>;

export const reasoningViewSchema = z.object({
  enabled: z.boolean(),
  translator: translatorStateSchema,
  error: z.string().nullable(),
  download: translatorDownloadSchema,
  speeds: z.array(modelSpeedSchema),
});
export type ReasoningView = z.infer<typeof reasoningViewSchema>;

export type TranslatorStatus = Omit<ReasoningView, "speeds">;

/**
 * 흘러오는 동안 번역에 넘길 머리. 꼬리까지 넘기면 문장이 완성될 때마다 다른 번역이 나와 이미 읽던 글자가 바뀐다.
 *
 * server/reasoning-text.ts의 TERMINATOR는 숫자가 뒤따르는 마침표를 종결로 보지 않는다. 종결 뒤 공백을 보고 자르지 않으면
 * "0." 뒤에 "13"이 흘러온 순간 번역해 둔 문장이 다른 문장이 되고 화면의 글자가 뒤로 밀린다.
 */
const SENTENCE_END = /[.!?]+(?=\s)/g;
export function liveHead(text: string): string {
  let cut = 0;
  for (const match of text.matchAll(SENTENCE_END)) cut = (match.index ?? 0) + match[0].length;
  return text.slice(0, cut);
}

/** 번역이 원문과 같거나(번역할 것이 없었다) 다른 글의 번역이면 null이다. 그때 화면은 원문을 그린다. */
export function withLiveTail(translated: { head: string; korean: string } | null, text: string): string | null {
  if (!translated || translated.korean === translated.head || !text.startsWith(translated.head)) return null;
  return translated.korean + text.slice(translated.head.length);
}

/** pending이면 화면이 다시 물어야 한다. off·unavailable이면 원문을 그린다. */
export const reasoningTranslationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("off") }),
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("ready"), markdown: z.string() }),
  z.object({ status: z.literal("unavailable"), translator: translatorStateSchema, error: z.string().nullable(), download: translatorDownloadSchema }),
]);
export type ReasoningTranslation = z.infer<typeof reasoningTranslationSchema>;

/** 설정 줄과 생각 줄이 같은 값을 보이도록 여기서 센다. */
export function translatorPercent(download: TranslatorDownloadView): number | null {
  if (download.totalBytes <= 0) return null;
  return Math.min(100, Math.floor((download.receivedBytes / download.totalBytes) * 100));
}

/** 받는 동안에는 번역이 오지 않는다. 화면은 끝날 때까지 상태를 다시 물어야 한다. */
export function isInstalling(state: TranslatorState): boolean {
  return state === "downloading" || state === "extracting";
}

/** 절대 번역을 기다리지 않는다. 생각이 많은 턴은 한 번에 수십 줄이 이 RPC를 부른다. */
export const reasoningTranslateRpc = defineRpc({
  name: "reasoning.translate",
  input: z.object({ text: z.string() }),
  output: reasoningTranslationSchema,
});

/** 서버는 생각 증분을 받지 못해 속도를 스스로 잴 수 없다. */
export const reasoningSpeedRpc = defineRpc({
  name: "reasoning.speed.add",
  input: z.object({ model: z.string().min(1).max(120), tokensPerSecond: z.number().positive().finite() }),
  output: z.object({ ok: z.literal(true) }),
});

/**
 * 실제 생각 글 3,683자(문장 34개)를 tiktoken cl100k_base와 맞춰 고른 식이다(2026-11-06 실측).
 * 합계 오차 −4%·문장별 평균 오차 6.7%로, 공백 단어만(−32%/27.3%), 단어+기호(−13%/9.3%), 글자÷4.24(±0%/10.4%)보다 낫다.
 * 바꾸려면 다시 재야 한다.
 */
const TOKEN = /[A-Z]?[a-z]+|[A-Z]{2,}|\d+|[^\w\s]/g;
export function countTokens(text: string): number {
  return text.match(TOKEN)?.length ?? 0;
}

export interface ArrivalMark {
  length: number;
  atMs: number;
}

/**
 * 첫 증분과 마지막 증분 사이로만 잰다. 줄이 언제 시작했는지는 알 수 없어, 처음 본 시각을 시작으로 삼으면
 * 이미 도착해 있던 글자가 0초에 온 것이 되어 값이 부풀려진다.
 */
export function charsPerSecond(from: ArrivalMark | null, to: ArrivalMark | null): number | null {
  if (!from || !to) return null;
  const seconds = (to.atMs - from.atMs) / 1000;
  const grown = to.length - from.length;
  return seconds > 0 && grown > 0 ? grown / seconds : null;
}

/** 증분마다 토큰을 다시 세지 않으려고 줄 전체의 토큰 밀도로 환산한다. */
export function tokensPerSecond(text: string, from: ArrivalMark | null, to: ArrivalMark | null): number | null {
  const chars = charsPerSecond(from, to);
  if (chars === null || text.length === 0) return null;
  return (chars * countTokens(text)) / text.length;
}

/**
 * 항목에 id를 주지 않는다. Paseo는 준 id를 원래 항목 id 없이 그대로 목록 열쇠로 써서(0.15 plugins/timeline/model.ts:90)
 * 키가 겹치면 엉뚱한 자리에 그려지고 무한 갱신(React #185)으로 멈췄다(2026-10-23 질문 카드 실사용). 빼면 "<원래 항목 id>/<순서>"가 된다.
 * 같은 이유로 글이 자라는 동안에도 항목은 늘 하나여야 한다 — 개수가 바뀌면 순서 열쇠가 밀려 행이 다시 그려지고 화면이 튄다.
 */
export function reasoningItems(text: string, phase: ReasoningItem["phase"]): PluginTimelineItem[] {
  const data: ReasoningItem = { text, phase };
  return [{ type: "plugin", kind: REASONING_ITEM_KIND, version: 1, data }];
}

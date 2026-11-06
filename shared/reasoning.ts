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
export const translatorStateSchema = z.enum(["missing", "loading", "ready", "failed"]);
export type TranslatorState = z.infer<typeof translatorStateSchema>;

export const reasoningViewSchema = z.object({
  enabled: z.boolean(),
  translator: translatorStateSchema,
  error: z.string().nullable(),
});
export type ReasoningView = z.infer<typeof reasoningViewSchema>;

/** pending이면 화면이 다시 물어야 한다. off·unavailable이면 원문을 그린다. */
export const reasoningTranslationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("off") }),
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("ready"), markdown: z.string() }),
  z.object({ status: z.literal("unavailable"), translator: translatorStateSchema, error: z.string().nullable() }),
]);
export type ReasoningTranslation = z.infer<typeof reasoningTranslationSchema>;

/** 절대 번역을 기다리지 않는다. 생각이 많은 턴은 한 번에 수십 줄이 이 RPC를 부른다. */
export const reasoningTranslateRpc = defineRpc({
  name: "reasoning.translate",
  input: z.object({ text: z.string() }),
  output: reasoningTranslationSchema,
});

/**
 * 항목에 id를 주지 않는다. Paseo는 준 id를 원래 항목 id 없이 그대로 목록 열쇠로 써서(0.15 plugins/timeline/model.ts:90)
 * 키가 겹치면 엉뚱한 자리에 그려지고 무한 갱신(React #185)으로 멈췄다(2026-10-23 질문 카드 실사용). 빼면 "<원래 항목 id>/<순서>"가 된다.
 * 같은 이유로 글이 자라는 동안에도 항목은 늘 하나여야 한다 — 개수가 바뀌면 순서 열쇠가 밀려 행이 다시 그려지고 화면이 튄다.
 */
export function reasoningItems(text: string, phase: ReasoningItem["phase"]): PluginTimelineItem[] {
  const data: ReasoningItem = { text, phase };
  return [{ type: "plugin", kind: REASONING_ITEM_KIND, version: 1, data }];
}

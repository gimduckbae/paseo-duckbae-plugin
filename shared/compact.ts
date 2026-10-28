import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { overviewSchema } from "./accounts";

export const COMPACT_OFFER_ITEM_KIND = "compact-offer";

const compactBySchema = z.enum(["user", "auto"]);

/**
 * started: 정리 명령을 보냈다. queued: 에이전트가 작업 중이라 그 턴이 끝나면 보낸다.
 * 작업 중에 메시지를 보내면 Paseo가 그 턴을 끊어서(0.13 activeTurnBehavior 기본값 interrupt) 기다린다.
 * resumed: 정리가 끝나 하던 작업을 이어서 하라고 보냈다. compacted: 정리는 끝났고 그사이 사용자가 말을 보냈거나 에이전트가 이미 움직여 따로 보내지 않았다.
 */
export const compactAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("started"), by: compactBySchema }),
  z.object({ kind: z.literal("queued"), by: compactBySchema }),
  z.object({ kind: z.literal("resumed"), by: compactBySchema }),
  z.object({ kind: z.literal("compacted"), by: compactBySchema }),
  z.object({ kind: z.literal("skipped") }),
  z.object({ kind: z.literal("failed"), error: z.string() }),
]);
export type CompactAnswer = z.infer<typeof compactAnswerSchema>;

/** 컨텍스트가 많이 찬 대화에 붙는 정리 제안 카드. 답하면 같은 id로 answer를 채워 다시 붙인다. */
export const compactOfferItemSchema = z.object({
  offerId: z.string(),
  usedTokens: z.number(),
  maxTokens: z.number(),
  /** 자동 수락 시각. 카드를 붙일 때 자동 수락이 꺼져 있었으면 null. */
  autoAt: z.string().nullable(),
  answer: compactAnswerSchema.nullable(),
});
export type CompactOfferItem = z.infer<typeof compactOfferItemSchema>;

export const compactOfferAnswerRpc = defineRpc({
  name: "compact.offer.answer",
  input: z.object({ agentId: z.string(), offer: compactOfferItemSchema, choice: z.enum(["compact", "skip"]) }),
  output: z.object({ ok: z.literal(true) }),
});

/** 정리 제안 기준: 컨텍스트 창 크기 대비 %. 계정과 상관없이 모든 에이전트에 같이 쓴다. */
// 공식 문서에 미리 정리할 % 기준은 없다(2026-10-28 확인). 기본값은 1M 창(Opus 5.5)에서 200K로, Claude Code 유휴 정리의 하한과 같다.
export const DEFAULT_COMPACT_THRESHOLD = 20;
export const COMPACT_THRESHOLD_PRESETS = [20, 30, 50, 70];
export const compactThresholdSchema = z.number().int().min(5).max(95);

export const setCompactThresholdRpc = defineRpc({
  name: "compact.threshold.set",
  input: z.object({ percent: compactThresholdSchema }),
  output: overviewSchema,
});

export const setCompactAutoRpc = defineRpc({
  name: "compact.auto.set",
  input: z.object({ enabled: z.boolean() }),
  output: overviewSchema,
});

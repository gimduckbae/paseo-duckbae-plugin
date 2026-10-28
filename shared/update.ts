import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const PLUGIN_ID = "paseo-duckbae-plugin";

/** auto: 새 버전이 나오면 알아서 적용. confirm: 알리고 사용자가 누르면 적용. off: 확인하지 않음. */
export const updateModeSchema = z.enum(["auto", "confirm", "off"]);
export type UpdateMode = z.infer<typeof updateModeSchema>;

/**
 * source가 local이면 폴더에서 설치한 개발용이라 업데이트를 쓸 수 없다. unknown은 아직 확인하지 못했다.
 * mode가 null이면 아직 고르지 않았다(설치 직후).
 */
export const updateStatusSchema = z.object({
  mode: updateModeSchema.nullable(),
  source: z.enum(["git", "npm", "local", "unknown"]),
  current: z.string().nullable(),
  latest: z.string().nullable(),
  available: z.boolean(),
  /** 새 버전의 변경 내용(커밋 제목). 가져오지 못하면 빈 목록. */
  changes: z.array(z.string()),
  checkedAt: z.string().nullable(),
  checking: z.boolean(),
  applying: z.boolean(),
  error: z.string().nullable(),
  lastUpdate: z.object({ from: z.string(), to: z.string(), at: z.string() }).nullable(),
});
export type UpdateStatus = z.infer<typeof updateStatusSchema>;

export const UPDATE_CARD_ITEM_KIND = "plugin-update";

/**
 * ask: 설치 뒤 처음 끝난 대화에 붙여 업데이트 방식을 묻는다. 답하면 같은 id로 mode를 채워 다시 붙인다.
 * offer: '확인 후 업데이트'일 때 새 버전을 알린다. 업데이트하면 플러그인이 다시 떠서, 새 플러그인이 결과를 같은 id로 붙인다.
 */
export const updateCardItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ask"), cardId: z.string(), mode: updateModeSchema.nullable() }),
  z.object({
    kind: z.literal("offer"),
    cardId: z.string(),
    latest: z.string(),
    changes: z.array(z.string()),
    answer: z.enum(["updating", "updated", "failed", "later"]).nullable(),
    error: z.string().nullable(),
  }),
]);
export type UpdateCardItem = z.infer<typeof updateCardItemSchema>;

export const updateStatusRpc = defineRpc({
  name: "update.status",
  input: z.object({}),
  output: updateStatusSchema,
});

export const updateCheckRpc = defineRpc({
  name: "update.check",
  input: z.object({}),
  output: updateStatusSchema,
});

export const updateApplyRpc = defineRpc({
  name: "update.apply",
  input: z.object({}),
  output: updateStatusSchema,
});

export const updateModeSetRpc = defineRpc({
  name: "update.mode.set",
  input: z.object({ mode: updateModeSchema, card: z.object({ agentId: z.string(), cardId: z.string() }).optional() }),
  output: updateStatusSchema,
});

export const updateOfferAnswerRpc = defineRpc({
  name: "update.offer.answer",
  input: z.object({ agentId: z.string(), item: updateCardItemSchema, choice: z.enum(["update", "later"]) }),
  output: updateStatusSchema,
});

export function shortRevision(revision: string): string {
  return /^[0-9a-f]{40,64}$/.test(revision) ? revision.slice(0, 7) : revision;
}

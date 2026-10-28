import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** 에이전트 답변 속 질문 블록의 시작 줄. 안내문(server/question-guide.ts)과 같아야 한다. */
export const QUESTION_FENCE = "```paseo-question";

export const questionOptionSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  recommended: z.boolean().optional(),
});

// 안내문은 질문 4개·선택지 2~4개·header 12자로 쓰게 하지만, 조금 벗어났다고 카드 대신 날 JSON을 보여 주지 않도록 넉넉히 받는다.
export const questionSchema = z.object({
  header: z.string().min(1),
  question: z.string(),
  multiSelect: z.boolean().optional(),
  options: z.array(questionOptionSchema).min(1).max(8),
});
export type Question = z.infer<typeof questionSchema>;

/**
 * 에이전트가 답변 끝에 쓰는 질문 블록. 기본 질문 창은 앞 글이 가려져서(2026-10-23 확인)
 * 고르는 데 필요한 사실(대상·바뀌는 것·위험)을 모두 블록 안에 담게 한다.
 */
export const questionBlockSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  items: z.array(z.object({ name: z.string(), details: z.array(z.string()).optional() })).optional(),
  notes: z.array(z.object({ tone: z.enum(["info", "warn"]), text: z.string() })).optional(),
  /** 되돌리기 어려운 결정(배포·DB 쓰기·push 등). 자동 답변 설정과 상관없이 사용자를 기다린다. */
  confirm: z.boolean().optional(),
  questions: z.array(questionSchema).min(1).max(6),
});
export type QuestionBlock = z.infer<typeof questionBlockSchema>;

/** header → 고른 답. 여러 개 고르기는 쉼표로 잇고, 직접 입력은 그 글을 그대로 쓴다. */
export const questionAnswersSchema = z.record(z.string(), z.string());
export type QuestionAnswers = z.infer<typeof questionAnswersSchema>;

export const QUESTION_CARD_ITEM_KIND = "question-card";
export const AGENT_TEXT_ITEM_KIND = "agent-text";

/** key는 블록 JSON에서 만든다. 답한 기록을 찾는 열쇠라 스트리밍 중과 끝난 뒤가 같아야 한다. */
export const questionCardItemSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("writing") }),
  z.object({ status: z.literal("ready"), key: z.string(), block: questionBlockSchema }),
  z.object({ status: z.literal("invalid"), raw: z.string(), error: z.string() }),
]);
export type QuestionCardItem = z.infer<typeof questionCardItemSchema>;

export const agentTextItemSchema = z.object({ text: z.string() });
export type AgentTextItem = z.infer<typeof agentTextItemSchema>;

/**
 * wait: 사용자를 기다린다. delay: 10초 뒤 권장안으로 답한다. instant: 바로 권장안으로 답한다.
 * 권장안이 없는 질문은 에이전트에게 판단을 맡긴다(2026-10-28 사용자 결정).
 */
export const questionAutoModeSchema = z.enum(["wait", "delay", "instant"]);
export type QuestionAutoMode = z.infer<typeof questionAutoModeSchema>;

/** 에이전트별 질문 블록 상태. answers: key → 답, auto: 자동으로 답한 key, pending: 자동 답변을 기다리는 key → 보낼 시각. */
export const questionStateSchema = z.object({
  answers: z.record(z.string(), questionAnswersSchema),
  auto: z.array(z.string()),
  pending: z.record(z.string(), z.string()),
});
export type QuestionState = z.infer<typeof questionStateSchema>;

export const questionAnswersListRpc = defineRpc({
  name: "questions.answers",
  input: z.object({ agentId: z.string() }),
  output: questionStateSchema,
});

/** 답을 에이전트에게 메시지로 보내고 답한 기록을 남긴다. */
export const questionAnswerRpc = defineRpc({
  name: "questions.answer",
  input: z.object({ agentId: z.string(), key: z.string(), title: z.string(), answers: questionAnswersSchema }),
  output: questionStateSchema,
});

/** 자동 답변 카운트다운을 멈춘다. key는 질문 블록 key 또는 기본 질문 창의 요청 ID. */
export const questionAutoStopRpc = defineRpc({
  name: "questions.auto.stop",
  input: z.object({ agentId: z.string(), key: z.string() }),
  output: questionStateSchema,
});

/** 기본 질문 창(AskUserQuestion·Codex 질문)에 자동으로 답할 때 대화에 남기는 기록. 화면이 Paseo 것이라 카운트다운은 여기 보인다. */
export const QUESTION_AUTO_NOTE_ITEM_KIND = "question-auto-note";

export const questionAutoNoteItemSchema = z.object({
  requestId: z.string(),
  answers: z.array(z.object({ header: z.string(), answer: z.string() })),
  autoAt: z.string().nullable(),
  /** auto: 자동으로 답함, stopped: 카운트다운을 멈춤, user: 사용자가 기본 창에서 직접 답함. */
  status: z.enum(["pending", "auto", "stopped", "user", "failed"]),
  error: z.string().nullable(),
});
export type QuestionAutoNoteItem = z.infer<typeof questionAutoNoteItemSchema>;

import { QUESTION_FENCE, questionBlockSchema, type QuestionCardItem } from "./question";

export interface QuestionSplit {
  before: string;
  /** 닫는 줄이 아직 안 왔으면 null. */
  raw: string | null;
  after: string;
}

export function splitQuestionBlock(text: string): QuestionSplit | null {
  const start = text.indexOf(QUESTION_FENCE);
  if (start < 0) return null;
  const bodyStart = text.indexOf("\n", start);
  if (bodyStart < 0) return { before: text.slice(0, start), raw: null, after: "" };
  // 목록 안에 들여 쓴 블록도 받는다.
  const close = /\n[ \t]*```/.exec(text.slice(bodyStart));
  if (!close) return { before: text.slice(0, start), raw: null, after: "" };
  const end = bodyStart + close.index;
  return { before: text.slice(0, start), raw: text.slice(bodyStart + 1, end), after: text.slice(end + close[0].length) };
}

// FNV-1a. 같은 블록이면 화면과 서버 어디서 읽어도 같은 값이 나와야 답한 기록을 찾는다.
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16);
}

export function parseQuestionBlock(raw: string | null): QuestionCardItem {
  if (raw === null) return { status: "writing" };
  try {
    const parsed = questionBlockSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { status: "ready", key: hash(raw.trim()), block: parsed.data };
    return { status: "invalid", raw, error: parsed.error.issues[0]?.message ?? "형식이 맞지 않습니다." };
  } catch (error) {
    return { status: "invalid", raw, error: error instanceof Error ? error.message : String(error) };
  }
}

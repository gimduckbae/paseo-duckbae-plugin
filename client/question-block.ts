import type { PluginTimelineItem } from "@getpaseo/plugin";
import { AGENT_TEXT_ITEM_KIND, QUESTION_CARD_ITEM_KIND, type AgentTextItem } from "../shared/question";
import { parseQuestionBlock, splitQuestionBlock } from "../shared/question-parse";

function textItem(text: string): PluginTimelineItem[] {
  const trimmed = text.trim();
  const data: AgentTextItem = { text: trimmed };
  return trimmed ? [{ type: "plugin", kind: AGENT_TEXT_ITEM_KIND, version: 1, data }] : [];
}

/**
 * 질문 블록이 든 에이전트 답변을 글·카드·글 항목으로 바꾼다. 블록이 없으면 undefined(원래대로 그림).
 * 변환 결과는 플러그인 항목만 될 수 있어 블록 앞뒤 글도 플러그인 항목으로 바꿔 Paseo 마크다운 렌더러로 그린다.
 * 항목에 id를 주지 않는다. Paseo는 준 id를 원래 메시지 id 없이 그대로 목록 키로 써서(0.11.4 plugins/timeline/model.ts)
 * 질문 블록이 둘 이상이면 키가 겹쳐 엉뚱한 자리에 그려지고 무한 갱신(React #185)으로 멈췄다(2026-10-23).
 * 빼면 "<메시지 id>/<순서>"가 된다. 블록 앞 글은 블록이 시작된 뒤 바뀌지 않아 순서도 그대로다.
 */
export function transformQuestionMessage(text: string): { items: PluginTimelineItem[] } | undefined {
  const parts = splitQuestionBlock(text);
  if (!parts) return undefined;
  return {
    items: [
      ...textItem(parts.before),
      { type: "plugin", kind: QUESTION_CARD_ITEM_KIND, version: 1, data: parseQuestionBlock(parts.raw) },
      ...textItem(parts.after),
    ],
  };
}

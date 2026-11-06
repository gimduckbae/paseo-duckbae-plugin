import type { PluginTimelineItem } from "@getpaseo/plugin";
import type { PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import { parseWorkflowLaunch, WORKFLOW_CARD_ITEM_KIND, WORKFLOW_TOOL_NAME } from "../shared/workflow";

// 타임라인 항목 타입은 SDK에서 꺼낸다. git 설치는 npm 설치를 안 해서 @getpaseo/protocol을 직접 import 할 수 없다.
type ToolCall = Parameters<PluginTimelineTransformerContribution<"tool_call">["transform"]>[0]["item"];

/**
 * 항목에 id를 주면 안 된다. Paseo는 준 id를 원래 항목 id 없이 그대로 목록 키로 써서(0.15.0 `plugins/timeline/model.ts`)
 * 키가 겹치면 무한 갱신(React #185)으로 멈춘다(2026-10-23 질문 카드 사고). 빼면 "<항목 id>/0"이 된다.
 * 도구 호출 하나당 항목도 하나여야 한다 — 개수가 바뀌면 인덱스 키가 밀려 화면이 튄다.
 */
export function transformWorkflowToolCall(item: ToolCall): { items: PluginTimelineItem[] } | undefined {
  if (item.name !== WORKFLOW_TOOL_NAME) return undefined;
  // Paseo가 나중에 Workflow 전용 카드를 만들면 detail 모양이 바뀐다. 그때는 Paseo 것을 그대로 보여 준다.
  if (item.detail.type !== "unknown") return undefined;
  const data = parseWorkflowLaunch(item.detail.input, item.detail.output);
  if (!data) return undefined;
  return { items: [{ type: "plugin", kind: WORKFLOW_CARD_ITEM_KIND, version: 1, data }] };
}

import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { workflowProgressRpc, type WorkflowAgent, type WorkflowCardItem, type WorkflowPhase, type WorkflowProgress } from "../shared/workflow";
import { Hint } from "./form-parts";
import { Paragraph } from "./paragraph";

// 알갱이가 에이전트 1명당 시작·끝이라 더 자주 물어도 보이는 게 달라지지 않는다.
const POLL_MS = 4_000;

const STATUS_LABEL: Record<string, string> = {
  completed: "끝남",
  killed: "멈춤",
  failed: "실패",
};

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
  if (minutes >= 1) return `${minutes}분 ${total % 60}초`;
  return `${total}초`;
}

function manCount(value: number): string {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}만` : value.toLocaleString();
}

function headRight(progress: WorkflowProgress | undefined): string {
  if (!progress) return "진행 확인 중";
  if (progress.state === "waiting") return "시작하는 중";
  const total = progress.agentCount ?? progress.startedCount;
  const counted = `${total}명 중 ${progress.doneCount}명 끝남`;
  if (progress.state === "running") return counted;
  return `${STATUS_LABEL[progress.status ?? ""] ?? progress.status ?? "끝남"} · ${counted}`;
}

function AgentRow({ theme, agent, workflowFinished }: { theme: PluginTheme; agent: WorkflowAgent; workflowFinished: boolean }) {
  const icon = agent.done ? "CircleCheck" : workflowFinished ? "CircleSlash" : "CircleDot";
  const color = agent.done ? theme.colors.statusSuccess : workflowFinished ? theme.colors.foregroundMuted : theme.colors.accent;
  const right = agent.done ? (agent.toolCount === null ? "끝남" : `도구 ${agent.toolCount}개`) : workflowFinished ? "안 끝남" : "도는 중";
  return (
    <View style={{ gap: 2, paddingLeft: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <Icon name={icon} size={13} color={color} />
        <Text style={{ flex: 1, fontSize: 13, color: theme.colors.foreground }} numberOfLines={1}>
          {agent.label}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{right}</Text>
      </View>
      {agent.resultPreview ? (
        <Paragraph style={{ paddingLeft: 20, fontSize: 12, lineHeight: 17, color: theme.colors.foregroundMuted }} numberOfLines={2}>
          {agent.resultPreview}
        </Paragraph>
      ) : null}
    </View>
  );
}

function PhaseBlock({ theme, phase, workflowFinished }: { theme: PluginTheme; phase: WorkflowPhase; workflowFinished: boolean }) {
  return (
    <View style={{ gap: 5 }}>
      {phase.title ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.foreground }}>{phase.title}</Text>
          {phase.detail ? (
            <Text style={{ flex: 1, fontSize: 12, color: theme.colors.foregroundMuted }} numberOfLines={1}>
              {phase.detail}
            </Text>
          ) : null}
        </View>
      ) : null}
      {phase.agents.map((agent) => (
        <AgentRow key={agent.agentId} theme={theme} agent={agent} workflowFinished={workflowFinished} />
      ))}
    </View>
  );
}

function Totals({ theme, progress }: { theme: PluginTheme; progress: WorkflowProgress }) {
  const parts = [
    progress.durationMs === null ? null : duration(progress.durationMs),
    progress.totalTokens === null ? null : `토큰 ${manCount(progress.totalTokens)}`,
    progress.totalToolCalls === null ? null : `도구 ${progress.totalToolCalls.toLocaleString()}번`,
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return null;
  return <Hint theme={theme}>{parts.join(" · ")}</Hint>;
}

/** 스크립트 원문은 워크플로를 디버깅할 때 필요하다. 지우지 말고 접어 둔다. */
function ScriptFold({ theme, card }: { theme: PluginTheme; card: WorkflowCardItem }) {
  const [open, setOpen] = useState(false);
  if (!card.script && !card.scriptPath) return null;
  return (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={13} color={theme.colors.foregroundMuted} />
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>스크립트</Text>
        {card.script ? <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{card.script.length.toLocaleString()}자</Text> : null}
      </Pressable>
      {open ? (
        <View style={{ gap: 6, padding: 10, borderRadius: 8, backgroundColor: theme.colors.surface2 }}>
          {card.scriptPath ? (
            <Text selectable style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 16, color: theme.colors.foregroundMuted }}>
              {card.scriptPath}
            </Text>
          ) : null}
          {card.script ? (
            <Text selectable style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 16, color: theme.colors.foreground }}>
              {card.script}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Paseo에 Workflow 매핑이 없어 이 자리에는 진행 표시 없이 스크립트 원문 JSON 덤프만 보였다(2026-11-06 실측).
export function WorkflowCard({ theme, item }: PluginTimelineItemProps<WorkflowCardItem>) {
  const data = item.data;
  const read = useRpc(workflowProgressRpc);
  const query = useQuery({
    queryKey: ["paseo-duckbae-plugin", "workflow-progress", data.runId],
    queryFn: () => read({ runId: data.runId, transcriptDir: data.transcriptDir }),
    staleTime: POLL_MS,
    refetchInterval: (current) => (current.state.data?.state === "finished" ? false : POLL_MS),
  });
  const progress = query.data;
  const running = progress?.state !== "finished";
  const error = progress?.error ?? (query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null);
  return (
    <View
      style={{
        maxWidth: 640,
        gap: 10,
        marginVertical: 6,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: running ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="Workflow" size={15} color={running ? theme.colors.accent : theme.colors.foregroundMuted} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: theme.colors.foreground }} numberOfLines={1}>
          {data.name ?? "워크플로"}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{headRight(progress)}</Text>
      </View>
      {data.summary ? (
        <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }} numberOfLines={3}>
          {data.summary}
        </Paragraph>
      ) : null}
      {progress?.phases.length ? (
        <View style={{ gap: 10 }}>
          {progress.phases.map((phase, index) => (
            <PhaseBlock key={phase.title ?? `phase-${index}`} theme={theme} phase={phase} workflowFinished={!running} />
          ))}
        </View>
      ) : null}
      {progress?.state === "finished" ? <Totals theme={theme} progress={progress} /> : null}
      {error ? (
        <Hint theme={theme} tone="danger">
          {error}
        </Hint>
      ) : null}
      <ScriptFold theme={theme} card={data} />
    </View>
  );
}

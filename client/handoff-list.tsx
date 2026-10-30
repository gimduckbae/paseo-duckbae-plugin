import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import { handoffRemoveRpc, handoffSeenRpc, type HandoffView, type Overview } from "../shared/accounts";
import { PROVIDER_LABEL } from "./format";
import { Paragraph } from "./paragraph";
import { OVERVIEW_KEY } from "./use-accounts";

export function handoffTarget(job: HandoffView): string {
  return `${PROVIDER_LABEL[job.toProvider]} ${job.modelLabel} · ${job.toLabel}`;
}

export function handoffStatusText(job: HandoffView): string {
  switch (job.status) {
    case "pending":
      return job.phase === "creating" ? "새 에이전트를 만드는 중…" : "지금 에이전트가 인계 문서를 쓰는 중…";
    case "completed":
      return `'${job.title ?? ""}' 에이전트를 새로 만들었습니다.`;
    case "failed":
      return `이어가지 못했습니다. ${job.error ?? ""}`;
  }
}

export function ChildrenWarning({ theme, count, tabOwner }: { theme: PluginTheme; count: number | null | undefined; tabOwner: "이 에이전트" | "이전 에이전트" }) {
  if (count === undefined || count === 0) return null;
  const who = count === null ? "그 밑의 하위 에이전트도" : `그 밑의 하위 에이전트 ${count}개도`;
  return (
    <Paragraph style={{ fontSize: 12, lineHeight: 17, color: theme.colors.statusWarning }}>
      {tabOwner} 탭을 닫거나 보관하면 {who} 같이 보관돼 하던 일이 끊깁니다. 하위 일이 끝날 때까지 그대로 두세요.
    </Paragraph>
  );
}

function statusColor(theme: PluginTheme, job: HandoffView): string {
  if (job.status === "failed") return theme.colors.statusDanger;
  if (job.status === "completed") return theme.colors.statusSuccess;
  return theme.colors.foregroundMuted;
}

/** 끝난 이어가기를 모두 지운다. 목록 제목 옆에 둔다. */
export function ClearFinishedHandoffs({ theme, jobs }: { theme: PluginTheme; jobs: readonly HandoffView[] }) {
  const remove = useRpc(handoffRemoveRpc);
  const queryClient = useQueryClient();
  const clear = useMutation({ mutationFn: () => remove({ jobId: null }), onSuccess: (data) => queryClient.setQueryData(OVERVIEW_KEY, data) });
  if (!jobs.some((job) => job.status !== "pending")) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => clear.mutate()} disabled={clear.isPending} hitSlop={6}>
      <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted, textDecorationLine: "underline" }}>끝난 항목 지우기</Text>
    </Pressable>
  );
}

/** 인계 문서를 쓰는 동안 사용자는 다른 워크스페이스에 가 있으므로 결과를 여기서 확인한다. */
export function HandoffList({ theme, jobs, onOpen }: { theme: PluginTheme; jobs: readonly HandoffView[]; onOpen?: (job: HandoffView) => void }) {
  const seen = useRpc(handoffSeenRpc);
  const remove = useRpc(handoffRemoveRpc);
  const queryClient = useQueryClient();
  const onSuccess = (data: Overview) => queryClient.setQueryData(OVERVIEW_KEY, data);
  const markSeen = useMutation({ mutationFn: (jobId: string) => seen({ jobId }), onSuccess });
  const removeJob = useMutation({ mutationFn: (jobId: string) => remove({ jobId }), onSuccess });
  return (
    <View style={{ gap: 8 }}>
      {jobs.map((job) => (
        <View
          key={job.jobId}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, opacity: job.seen ? 0.6 : 1 }}
        >
          <Icon name={job.status === "pending" ? "Loader" : job.status === "completed" ? "Check" : "X"} size={14} color={statusColor(theme, job)} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 13, color: theme.colors.foreground }} numberOfLines={1}>
              {job.fromTitle ?? "에이전트"} → {handoffTarget(job)}
            </Text>
            <Paragraph style={{ fontSize: 12, color: statusColor(theme, job) }}>{handoffStatusText(job)}</Paragraph>
            {job.status === "completed" ? <ChildrenWarning theme={theme} count={job.cascadeChildCount} tabOwner="이전 에이전트" /> : null}
          </View>
          {job.status === "completed" && job.newAgentId && onOpen ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onOpen(job);
                markSeen.mutate(job.jobId);
              }}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: theme.colors.accent }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.accentForeground }}>새 에이전트 열기</Text>
            </Pressable>
          ) : null}
          {job.status !== "pending" ? (
            <Pressable accessibilityRole="button" accessibilityLabel="목록에서 지우기" onPress={() => removeJob.mutate(job.jobId)} hitSlop={8}>
              <Icon name="X" size={14} color={theme.colors.foregroundMuted} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

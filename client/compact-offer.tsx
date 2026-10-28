import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { Switch, Text, View } from "react-native";
import { compactOfferAnswerRpc, type CompactOfferItem } from "../shared/compact";
import { Hint } from "./form-parts";
import { Choice } from "./limit-offer";
import { Paragraph } from "./paragraph";
import { useAccountActions, useOverview } from "./use-accounts";
import { useSecondsLeft } from "./use-seconds-left";

function answerText(offer: CompactOfferItem): { text: string; tone: "done" | "wait" | "muted" | "danger" } | null {
  const { answer } = offer;
  if (!answer) return null;
  if (answer.kind === "started") {
    return { text: answer.by === "auto" ? "10초 동안 답이 없어 자동으로 정리를 시작했습니다." : "정리를 시작했습니다. 끝나면 대화에 표시됩니다.", tone: "done" };
  }
  if (answer.kind === "queued") return { text: "에이전트가 작업 중이라 이번 작업이 끝나면 정리합니다.", tone: "wait" };
  if (answer.kind === "skipped") return { text: "정리하지 않았습니다. 컨텍스트가 더 차면 다시 묻습니다.", tone: "muted" };
  return { text: `정리하지 못했습니다. ${answer.error}`, tone: "danger" };
}

function AutoToggle({ theme }: { theme: PluginTheme }) {
  const enabled = useOverview().data?.compactAuto ?? false;
  const { setCompactAuto } = useAccountActions();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>10초 뒤 자동 정리</Text>
      <Switch
        accessibilityLabel="컨텍스트 정리 제안에 답이 없으면 10초 뒤 정리"
        value={enabled}
        disabled={setCompactAuto.isPending}
        onValueChange={(value) => setCompactAuto.mutate(value)}
        trackColor={{ true: theme.colors.accent, false: theme.colors.surface2 }}
      />
    </View>
  );
}

/** 컨텍스트가 많이 찬 대화 끝에 붙는 정리(/compact) 제안. 자동 수락이 켜져 있으면 남은 초를 보여 준다. */
export function CompactOfferCard({ theme, item, agentId }: PluginTimelineItemProps<CompactOfferItem>) {
  const offer = item.data;
  const answer = useRpc(compactOfferAnswerRpc);
  const send = useMutation({ mutationFn: (choice: "compact" | "skip") => answer({ agentId, offer, choice }) });
  const error = send.error ? (send.error instanceof Error ? send.error.message : String(send.error)) : null;
  const busy = send.isPending || send.isSuccess;
  const secondsLeft = useSecondsLeft(offer.answer ? null : offer.autoAt);
  const answered = answerText(offer);
  const percent = Math.round((offer.usedTokens / offer.maxTokens) * 100);
  const pending = !offer.answer;
  const toneColor = {
    done: theme.colors.statusSuccess,
    wait: theme.colors.statusWarning,
    muted: theme.colors.foregroundMuted,
    danger: theme.colors.statusDanger,
  };

  return (
    <View
      style={{
        maxWidth: 520,
        gap: 10,
        marginVertical: 6,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: pending || offer.answer?.kind === "queued" ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={answered?.tone === "done" ? "Check" : "Shrink"} size={15} color={answered ? toneColor[answered.tone] : theme.colors.accent} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: theme.colors.foreground }} numberOfLines={1}>
          컨텍스트 {percent}% 사용
        </Text>
      </View>

      {answered ? (
        <Paragraph style={{ fontSize: 13, lineHeight: 19, color: answered.tone === "danger" ? theme.colors.statusDanger : theme.colors.foreground }}>{answered.text}</Paragraph>
      ) : (
        <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>
          대화를 요약해서 컨텍스트를 비울까요? 목표, 정한 내용, 다음 할 일은 남고 자잘한 기록은 줄어듭니다.
        </Paragraph>
      )}

      {secondsLeft !== null ? (
        <View style={{ gap: 5 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.surface2, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, secondsLeft * 10)}%`, height: 3, backgroundColor: theme.colors.accent }} />
          </View>
          <Paragraph style={{ fontSize: 12, lineHeight: 17, fontVariant: ["tabular-nums"], color: theme.colors.foregroundMuted }}>
            {secondsLeft}초 뒤 자동으로 정리합니다. 메시지를 보내거나 '안 함'을 누르면 멈춥니다.
          </Paragraph>
        </View>
      ) : null}

      {pending ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <Choice theme={theme} primary label="지금 정리" disabled={busy} onPress={() => send.mutate("compact")} />
          <Choice theme={theme} label="안 함" disabled={busy} onPress={() => send.mutate("skip")} />
          <View style={{ flex: 1 }} />
          <AutoToggle theme={theme} />
        </View>
      ) : offer.answer?.kind === "queued" ? (
        <View style={{ flexDirection: "row" }}>
          <Choice theme={theme} label="정리 안 함" disabled={busy} onPress={() => send.mutate("skip")} />
        </View>
      ) : null}

      {error ? (
        <Hint theme={theme} tone="danger">
          {error}
        </Hint>
      ) : null}
    </View>
  );
}

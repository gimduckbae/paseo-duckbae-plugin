import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { Pressable, Text, View } from "react-native";
import { questionAutoStopRpc, type QuestionAutoNoteItem } from "../shared/question";
import { Hint } from "./form-parts";
import { Paragraph } from "./paragraph";
import { useSecondsLeft } from "./use-seconds-left";

const TITLE: Record<QuestionAutoNoteItem["status"], string> = {
  pending: "질문 창에 권장안으로 곧 자동 답합니다.",
  auto: "질문 창에 권장안으로 자동 답했습니다.",
  stopped: "자동 답변을 멈췄습니다. 질문 창에서 직접 답해 주세요.",
  user: "질문 창에서 직접 답했습니다.",
  failed: "자동 답변을 보내지 못했습니다. 질문 창에서 직접 답해 주세요.",
};

/** 기본 질문 창(AskUserQuestion·Codex 질문)은 Paseo가 그려서, 자동 답변의 남은 초와 보낸 답은 이 기록에 보인다. */
export function QuestionAutoNoteRow({ theme, item, agentId }: PluginTimelineItemProps<QuestionAutoNoteItem>) {
  const note = item.data;
  const stopRpc = useRpc(questionAutoStopRpc);
  const stop = useMutation({ mutationFn: () => stopRpc({ agentId, key: note.requestId }) });
  const secondsLeft = useSecondsLeft(note.status === "pending" ? note.autoAt : null);
  const done = note.status === "auto";
  const showAnswers = note.status === "pending" || done;
  const color = note.status === "failed" ? theme.colors.statusDanger : done ? theme.colors.statusSuccess : theme.colors.foregroundMuted;

  return (
    <View style={{ maxWidth: 520, gap: 8, marginVertical: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: note.status === "pending" ? theme.colors.accent : theme.colors.border, backgroundColor: theme.colors.surface1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={done ? "CircleCheck" : "MessageCircleQuestionMark"} size={15} color={note.status === "pending" ? theme.colors.accent : color} />
        <Paragraph style={{ flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 19, color: theme.colors.foreground }}>{TITLE[note.status]}</Paragraph>
      </View>
      {showAnswers ? (
        <View style={{ gap: 4 }}>
          {note.answers.map((entry) => (
            <View key={entry.header} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: theme.colors.surface2 }}>
                <Text style={{ fontSize: 11, lineHeight: 16, color: theme.colors.foregroundMuted }}>{entry.header}</Text>
              </View>
              <Paragraph style={{ flex: 1, fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>{entry.answer}</Paragraph>
            </View>
          ))}
        </View>
      ) : null}
      {secondsLeft !== null ? (
        <View style={{ gap: 5 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.surface2, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, secondsLeft * 10)}%`, height: 3, backgroundColor: theme.colors.accent }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Paragraph style={{ flex: 1, fontSize: 12, lineHeight: 17, fontVariant: ["tabular-nums"], color: theme.colors.foregroundMuted }}>
              {secondsLeft}초 뒤 위 답을 보냅니다. 질문 창에서 직접 답하면 멈춥니다.
            </Paragraph>
            <Pressable accessibilityRole="button" disabled={stop.isPending} onPress={() => stop.mutate()} hitSlop={8}>
              <Text style={{ fontSize: 12, color: theme.colors.accent }}>멈춤</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {note.error ? (
        <Hint theme={theme} tone="danger">
          {note.error}
        </Hint>
      ) : null}
    </View>
  );
}

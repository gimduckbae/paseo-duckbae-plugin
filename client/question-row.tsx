import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Markdown } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text, View } from "react-native";
import {
  questionAnswerRpc,
  questionAnswersListRpc,
  questionAutoStopRpc,
  type AgentTextItem,
  type QuestionAnswers,
  type QuestionCardItem,
  type QuestionState,
} from "../shared/question";
import { Paragraph } from "./paragraph";
import { QuestionCard } from "./question-card";
import { useOverview } from "./use-accounts";

function answersKey(agentId: string) {
  return ["paseo-duckbae-plugin", "question-answers", agentId] as const;
}

// 블록 앞뒤 글은 Paseo 마크다운 렌더러(0.13.0 Markdown)로 그려 표·목록·코드가 원래 답변과 같게 보인다.
export function AgentTextRow({ item }: PluginTimelineItemProps<AgentTextItem>) {
  return (
    <View style={{ marginVertical: 4 }}>
      <Markdown>{item.data.text}</Markdown>
    </View>
  );
}

// 자동 답변은 턴이 끝난 뒤 서버가 정해서, 막 붙은 카드는 그동안 답한 기록을 다시 묻는다. 지난 카드까지 계속 묻지 않게 1분으로 자른다.
const AUTO_WATCH_MS = 60_000;

export function QuestionCardRow({ theme, item, agentId, timestamp }: PluginTimelineItemProps<QuestionCardItem>) {
  const data = item.data;
  const queryClient = useQueryClient();
  const list = useRpc(questionAnswersListRpc);
  const answer = useRpc(questionAnswerRpc);
  const stopAuto = useRpc(questionAutoStopRpc);
  const mode = useOverview().data?.questionAuto ?? "wait";
  const key = data.status === "ready" ? data.key : null;
  const watch = data.status === "ready" && !data.block.confirm && mode !== "wait" && Date.now() - timestamp.getTime() < AUTO_WATCH_MS;
  const state = useQuery({
    queryKey: answersKey(agentId),
    queryFn: () => list({ agentId }),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const current = query.state.data;
      if (!key || current?.answers[key]) return false;
      return current?.pending[key] || watch ? 1_500 : false;
    },
  });
  const onSuccess = (result: QuestionState) => queryClient.setQueryData(answersKey(agentId), result);
  const send = useMutation({
    mutationFn: (answers: QuestionAnswers) =>
      data.status === "ready" ? answer({ agentId, key: data.key, title: data.block.title, answers }) : Promise.reject(new Error("질문이 아직 준비되지 않았습니다.")),
    onSuccess,
  });
  const stop = useMutation({ mutationFn: (stopKey: string) => stopAuto({ agentId, key: stopKey }), onSuccess });

  if (data.status === "writing") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 6 }}>
        <Icon name="MessageCircleQuestionMark" size={15} color={theme.colors.foregroundMuted} />
        <Text style={{ fontSize: 13, color: theme.colors.foregroundMuted }}>질문을 쓰는 중…</Text>
      </View>
    );
  }
  if (data.status === "invalid") {
    return (
      <View style={{ gap: 6, marginVertical: 6, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.statusWarning, backgroundColor: theme.colors.surface1 }}>
        <Paragraph style={{ fontSize: 12, lineHeight: 18, color: theme.colors.statusWarning }}>질문 형식이 맞지 않아 원문을 그대로 보여 줍니다. 읽어 보고 글로 답해 주세요.</Paragraph>
        <Text selectable style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 18, color: theme.colors.foregroundMuted }}>
          {data.raw}
        </Text>
      </View>
    );
  }
  // 답한 기록을 받기 전에 펼친 카드를 그리면, 지난 대화의 답한 카드가 펼쳤다 접히며 위쪽 높이가 바뀌어 화면이 튄다.
  // 지난 카드는 대부분 답한 것이라 답한 카드처럼 제목 한 줄로 기다린다.
  if (state.data === undefined && !state.isError) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 6, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface1 }}>
        <Icon name="MessageCircleQuestionMark" size={16} color={theme.colors.foregroundMuted} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.foreground }} numberOfLines={1}>
          {data.block.title}
        </Text>
      </View>
    );
  }
  const error = send.error ? (send.error instanceof Error ? send.error.message : String(send.error)) : null;
  return (
    <View style={{ marginVertical: 6 }}>
      <QuestionCard
        theme={theme}
        block={data.block}
        answered={state.data?.answers[data.key] ?? null}
        auto={state.data?.auto.includes(data.key) ?? false}
        autoAt={state.data?.pending[data.key] ?? null}
        busy={send.isPending}
        error={error}
        onSubmit={(answers) => send.mutate(answers)}
        onStopAuto={() => stop.mutate(data.key)}
      />
    </View>
  );
}

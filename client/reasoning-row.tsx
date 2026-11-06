import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Markdown, StreamedText } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { hashText } from "../shared/hash";
import { reasoningTranslateRpc, type ReasoningItem, type ReasoningTranslation, type TranslatorState } from "../shared/reasoning";
import { Paragraph } from "./paragraph";

const POLL_MS = 1_500;

const TRANSLATOR_NOTE: Record<TranslatorState, string> = {
  missing: "번역기 없음",
  loading: "번역기 준비 중",
  ready: "번역기 대기",
  failed: "번역 실패",
};

function headerNote(phase: ReasoningItem["phase"], answer: ReasoningTranslation | undefined, failed: boolean, korean: string | null): string {
  if (phase === "streaming") return "생각 중";
  if (failed) return "번역을 묻지 못했습니다";
  if (answer === undefined) return "번역 기다림";
  if (answer.status === "pending") return "번역 중";
  if (answer.status === "unavailable") return TRANSLATOR_NOTE[answer.translator];
  return korean ? "번역됨" : "원문";
}

export function ReasoningRow({ theme, item }: PluginTimelineItemProps<ReasoningItem>) {
  const { text, phase } = item.data;
  const translate = useRpc(reasoningTranslateRpc);
  const key = useMemo(() => hashText(text), [text]);
  // 흘러오는 것을 보고 있던 줄은 접지 않는다. 다 쓴 뒤 접으면 읽던 자리가 위로 밀린다.
  // 지난 대화에서 불러온 줄은 접은 채로 시작한다 — 번역이 오자마자 수십 줄이 함께 펼쳐지면 화면이 튄다.
  const live = useRef(phase === "streaming");
  const [open, setOpen] = useState(live.current);
  const [source, setSource] = useState(false);
  const translation = useQuery({
    queryKey: ["paseo-duckbae-plugin", "reasoning", key],
    queryFn: () => translate({ text }),
    enabled: phase === "complete",
    staleTime: Infinity,
    refetchInterval: (query) => (query.state.data?.status === "pending" ? POLL_MS : false),
  });

  const data = translation.data;
  const korean = data?.status === "ready" && data.markdown !== text ? data.markdown : null;
  const note = headerNote(phase, data, translation.isError, korean);
  const reason = data?.status === "unavailable" ? data.error : null;

  return (
    <View style={{ marginVertical: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
      >
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={14} color={theme.colors.foregroundMuted} />
        <Icon name="Brain" size={14} color={theme.colors.foregroundMuted} />
        <Text style={{ fontSize: 13, color: theme.colors.foregroundMuted }}>생각 · {text.length.toLocaleString("ko-KR")}자</Text>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>· {note}</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 6, paddingLeft: 20, paddingTop: 2 }}>
          {reason ? (
            <Paragraph style={{ fontSize: 12, lineHeight: 17, color: theme.colors.statusWarning }}>{reason}</Paragraph>
          ) : null}
          {phase === "streaming" ? (
            <StreamedText text={text} phase="streaming" style={{ fontSize: 13, lineHeight: 20, color: theme.colors.foregroundMuted }} />
          ) : korean && !source ? (
            <Markdown>{korean}</Markdown>
          ) : (
            <Paragraph selectable style={{ fontSize: 13, lineHeight: 20, color: theme.colors.foregroundMuted }}>
              {text}
            </Paragraph>
          )}
          {korean && phase === "complete" ? (
            <Pressable accessibilityRole="button" onPress={() => setSource(!source)} style={{ alignSelf: "flex-start", paddingVertical: 2 }}>
              <Text style={{ fontSize: 12, color: theme.colors.accent }}>{source ? "번역 보기" : "원문 보기"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

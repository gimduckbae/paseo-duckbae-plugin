import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Markdown, StreamedText } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { hashText } from "../shared/hash";
import { isInstalling, liveHead, reasoningTranslateRpc, translatorPercent, withLiveTail, type ReasoningItem, type ReasoningTranslation, type TranslatorState } from "../shared/reasoning";
import { Paragraph } from "./paragraph";

const POLL_MS = 1_500;
// 흘러오는 동안 1.5초는 너무 길다. 문장 하나는 100ms 안쪽에 끝나는데 그만큼 기다리면 번역이 눈에 띄게 뒤처진다.
// 자주 되물어도 싸다 — pending인 짧은 동안만 돌고, 서버는 캐시를 찾아 바로 답한다(8,248자 쪼개기 0.27ms, 2026-11-06 실측).
const LIVE_POLL_MS = 300;
// 생각 증분은 60ms마다 온다. 증분마다 물으면 번역기를 따라가지 못하고 코어만 오래 잡는다.
// 이만큼 기다려도 문장이 끝나고 번역이 붙기까지 가운데 649ms다(2026-11-06 실측, 8,248자를 24자/60ms로 흘려 보냄).
const ASK_MS = 400;

const TRANSLATOR_NOTE: Record<TranslatorState, string> = {
  missing: "번역기 없음",
  downloading: "번역기 받는 중",
  extracting: "번역기 압축 푸는 중",
  loading: "번역기 준비 중",
  ready: "번역기 대기",
  failed: "번역 실패",
};

/** 받는 중에는 번역이 오지 않는다. 얼마나 남았는지 여기서 보여 주지 않으면 멈춘 것처럼 보인다. */
function unavailableNote(answer: Extract<ReasoningTranslation, { status: "unavailable" }>): string {
  const percent = translatorPercent(answer.download);
  if (answer.translator === "downloading" && percent !== null) return `${TRANSLATOR_NOTE.downloading} ${String(percent)}%`;
  return TRANSLATOR_NOTE[answer.translator];
}

function headerNote(phase: ReasoningItem["phase"], answer: ReasoningTranslation | undefined, failed: boolean, korean: string | null): string {
  if (failed) return "번역을 묻지 못했습니다";
  // 번역기가 없거나 멈춘 것은 흘러오는 동안에도 알린다. 안 그러면 영어가 그대로 흐르는 이유를 알 수 없다.
  if (answer?.status === "unavailable") return unavailableNote(answer);
  if (phase === "streaming") return "생각 중";
  if (answer === undefined) return "번역 기다림";
  if (answer.status === "pending") return "번역 중";
  return korean ? "번역됨" : "원문";
}

function useDebouncedAsk(text: string, phase: ReasoningItem["phase"]): string {
  const head = useMemo(() => (phase === "complete" ? text : liveHead(text)), [text, phase]);
  const [asked, setAsked] = useState(head);
  // text를 의존성에 넣으면 증분마다 타이머가 되풀이 초기화돼 영원히 묻지 않는다.
  useEffect(() => {
    if (head === asked) return undefined;
    if (phase === "complete") {
      setAsked(head);
      return undefined;
    }
    const timer = setTimeout(() => setAsked(head), ASK_MS);
    return () => clearTimeout(timer);
  }, [head, asked, phase]);
  return asked;
}

export function ReasoningRow({ theme, item }: PluginTimelineItemProps<ReasoningItem>) {
  const { text, phase } = item.data;
  const translate = useRpc(reasoningTranslateRpc);
  const asked = useDebouncedAsk(text, phase);
  const key = useMemo(() => hashText(asked), [asked]);
  // 흘러오는 것을 보고 있던 줄은 접지 않는다. 다 쓴 뒤 접으면 읽던 자리가 위로 밀린다.
  // 지난 대화에서 불러온 줄은 접은 채로 시작한다 — 번역이 오자마자 수십 줄이 함께 펼쳐지면 화면이 튄다.
  const live = useRef(phase === "streaming");
  const [open, setOpen] = useState(live.current);
  const [source, setSource] = useState(false);
  // 다음 머리의 답을 기다리는 동안 읽던 글이 영어로 되돌아가지 않게 쥐고 있는다.
  const [done, setDone] = useState<{ head: string; korean: string } | null>(null);
  const translation = useQuery({
    queryKey: ["paseo-duckbae-plugin", "reasoning", key],
    queryFn: () => translate({ text: asked }),
    // 보이지 않는 글까지 번역하면 번역기가 코어를 잡는 시간만 길어진다.
    enabled: asked !== "" && (phase === "complete" || open),
    staleTime: Infinity,
    refetchInterval: (query) => {
      const answer = query.state.data;
      const again = answer?.status === "pending" || (answer?.status === "unavailable" && isInstalling(answer.translator));
      if (!again) return false;
      return answer.status === "pending" && phase === "streaming" ? LIVE_POLL_MS : POLL_MS;
    },
  });

  const data = translation.data;
  useEffect(() => {
    if (data?.status !== "ready") return;
    setDone({ head: asked, korean: data.markdown });
  }, [data, asked]);

  const korean = withLiveTail(done, text);
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
            // 글을 바꿔 넣어도 호스트는 이미 드러낸 글자 수를 지킨다(0.15 번들 retargetTextReveal). 처음부터 다시 흘리지 않는다.
            <StreamedText text={korean ?? text} phase="streaming" style={{ fontSize: 13, lineHeight: 20, color: theme.colors.foregroundMuted }} />
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

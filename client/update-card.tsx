import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { shortRevision, updateModeSetRpc, updateOfferAnswerRpc, type UpdateCardItem, type UpdateMode } from "../shared/update";
import { Hint } from "./form-parts";
import { Choice } from "./limit-offer";
import { Paragraph } from "./paragraph";
import { UPDATE_KEY } from "./use-update";

export const UPDATE_MODE_LABEL: Record<UpdateMode, string> = {
  auto: "자동으로",
  confirm: "알려 주면 직접",
  off: "안 함",
};

const CHANGES_SHOWN = 5;

const ASK_DONE: Record<UpdateMode, string> = {
  auto: "새 버전이 나오면 자동으로 업데이트합니다.",
  confirm: "새 버전이 나오면 대화에 알려 드립니다. 그때 업데이트할지 고르시면 됩니다.",
  off: "업데이트를 확인하지 않습니다.",
};

function errorMessage(error: unknown): string | null {
  return error ? (error instanceof Error ? error.message : String(error)) : null;
}

function Frame({ theme, active, icon, iconColor, title, children }: { theme: PluginTheme; active: boolean; icon: string; iconColor: string; title: string; children: ReactNode }) {
  return (
    <View
      style={{
        maxWidth: 520,
        gap: 10,
        marginVertical: 6,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={icon} size={15} color={iconColor} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: theme.colors.foreground }} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function ChangeList({ theme, changes }: { theme: PluginTheme; changes: string[] }) {
  if (!changes.length) return null;
  const rest = changes.length - CHANGES_SHOWN;
  return (
    <View style={{ gap: 3 }}>
      {changes.slice(0, CHANGES_SHOWN).map((change, index) => (
        <Paragraph key={index} style={{ fontSize: 12, lineHeight: 17, color: theme.colors.foreground }}>
          · {change}
        </Paragraph>
      ))}
      {rest > 0 ? <Hint theme={theme}>외 {rest}개</Hint> : null}
    </View>
  );
}

function AskCard({ theme, agentId, item }: { theme: PluginTheme; agentId: string; item: Extract<UpdateCardItem, { kind: "ask" }> }) {
  const queryClient = useQueryClient();
  const setMode = useRpc(updateModeSetRpc);
  const send = useMutation({
    mutationFn: (mode: UpdateMode) => setMode({ mode, card: { agentId, cardId: item.cardId } }),
    onSuccess: (data) => queryClient.setQueryData(UPDATE_KEY, data),
  });
  const busy = send.isPending || send.isSuccess;
  const error = errorMessage(send.error);
  return (
    <Frame
      theme={theme}
      active={!item.mode}
      icon={item.mode ? "Check" : "Download"}
      iconColor={item.mode ? theme.colors.statusSuccess : theme.colors.accent}
      title="다중 계정관리 업데이트 방식"
    >
      {item.mode ? (
        <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>{ASK_DONE[item.mode]}</Paragraph>
      ) : (
        <>
          <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>
            새 버전이 나오면 어떻게 할까요? 업데이트하면 플러그인이 잠깐 다시 시작됩니다.
          </Paragraph>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Choice theme={theme} primary label="자동으로 업데이트" disabled={busy} onPress={() => send.mutate("auto")} />
            <Choice theme={theme} label="알려 주면 직접" disabled={busy} onPress={() => send.mutate("confirm")} />
            <Choice theme={theme} label="업데이트 안 함" disabled={busy} onPress={() => send.mutate("off")} />
          </View>
        </>
      )}
      <Hint theme={theme}>다중 계정관리 화면에서 언제든 바꿀 수 있습니다.</Hint>
      {error ? (
        <Hint theme={theme} tone="danger">
          {error}
        </Hint>
      ) : null}
    </Frame>
  );
}

function offerText(item: Extract<UpdateCardItem, { kind: "offer" }>): { text: string; tone: "done" | "wait" | "muted" | "danger" } | null {
  if (item.answer === "updating") return { text: "업데이트하는 중입니다. 끝나면 여기에 표시됩니다.", tone: "wait" };
  if (item.answer === "updated") return { text: "업데이트했습니다.", tone: "done" };
  if (item.answer === "failed") return { text: `업데이트하지 못했습니다. ${item.error ?? ""}`.trim(), tone: "danger" };
  if (item.answer === "later") return { text: "업데이트하지 않았습니다. 다중 계정관리 화면에서 언제든 업데이트할 수 있습니다.", tone: "muted" };
  return null;
}

function OfferCard({ theme, agentId, item }: { theme: PluginTheme; agentId: string; item: Extract<UpdateCardItem, { kind: "offer" }> }) {
  const queryClient = useQueryClient();
  const answer = useRpc(updateOfferAnswerRpc);
  const send = useMutation({
    mutationFn: (choice: "update" | "later") => answer({ agentId, item, choice }),
    onSuccess: (data) => queryClient.setQueryData(UPDATE_KEY, data),
  });
  const busy = send.isPending || send.isSuccess;
  const answered = offerText(item);
  const error = errorMessage(send.error);
  const toneColor = {
    done: theme.colors.statusSuccess,
    wait: theme.colors.statusWarning,
    muted: theme.colors.foregroundMuted,
    danger: theme.colors.statusDanger,
  };
  return (
    <Frame
      theme={theme}
      active={!item.answer || item.answer === "updating"}
      icon={answered?.tone === "done" ? "Check" : "Download"}
      iconColor={answered ? toneColor[answered.tone] : theme.colors.accent}
      title={`다중 계정관리 새 버전 ${shortRevision(item.latest)}`}
    >
      {answered ? (
        <Paragraph style={{ fontSize: 13, lineHeight: 19, color: answered.tone === "danger" ? theme.colors.statusDanger : theme.colors.foreground }}>{answered.text}</Paragraph>
      ) : (
        <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>
          새 버전이 나왔습니다. 지금 업데이트할까요? 플러그인이 잠깐 다시 시작됩니다.
        </Paragraph>
      )}
      {!item.answer || item.answer === "updating" ? <ChangeList theme={theme} changes={item.changes} /> : null}
      {!item.answer ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Choice theme={theme} primary label="지금 업데이트" disabled={busy} onPress={() => send.mutate("update")} />
          <Choice theme={theme} label="나중에" disabled={busy} onPress={() => send.mutate("later")} />
        </View>
      ) : null}
      {error ? (
        <Hint theme={theme} tone="danger">
          {error}
        </Hint>
      ) : null}
    </Frame>
  );
}

/** 대화 끝에 붙는 플러그인 업데이트 카드. 설치 직후 방식을 묻거나, '알려 주면 직접'일 때 새 버전을 알린다. */
export function UpdateCard({ theme, item, agentId }: PluginTimelineItemProps<UpdateCardItem>) {
  return item.data.kind === "ask" ? <AskCard theme={theme} agentId={agentId} item={item.data} /> : <OfferCard theme={theme} agentId={agentId} item={item.data} />;
}

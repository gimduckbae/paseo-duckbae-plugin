import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { limitOfferAnswerRpc, type AccountView, type LimitOfferItem } from "../shared/accounts";
import { Hint } from "./form-parts";
import { formatMoney, peakPercent, PROVIDER_LABEL, usageColor } from "./format";
import { Paragraph } from "./paragraph";
import { useOverview } from "./use-accounts";

// API 키 계정은 사용률이 없으므로 구독 계정을 다 쓴 다음에 고르도록 뒤로 보낸다.
function rank(account: AccountView): number {
  return account.credentialKind === "api_key" ? 1000 : (peakPercent(account) ?? 0);
}

function candidates(accounts: readonly AccountView[], offer: LimitOfferItem): AccountView[] {
  return accounts
    .filter((account) => account.provider === offer.provider && account.id !== offer.accountId)
    .filter((account) => account.state !== "limited" && account.state !== "needs_login" && account.state !== "error")
    .sort((a, b) => rank(a) - rank(b));
}

function extraText(offer: LimitOfferItem): { text: string; danger: boolean } | null {
  if (!offer.extra) return null;
  if (offer.extra.status === "failed") return { text: `추가 크레딧을 켜지 못했습니다. ${offer.extra.error}`, danger: true };
  return { text: `추가 크레딧을 켰습니다(월 최대 ${formatMoney(offer.extra.capUsd, "USD")}).`, danger: false };
}

function answerText(offer: LimitOfferItem): string | null {
  const { answer } = offer;
  if (!answer) return null;
  if (answer.kind === "swap") return `${answer.label} 계정의 새 에이전트에서 이어갑니다. 인계 문서를 쓰느라 잠시 걸립니다.`;
  if (offer.extra?.status === "enabled") return "이 계정에서 추가 크레딧으로 계속합니다.";
  return offer.state === "needs_login" ? "이 계정을 그대로 씁니다. '다중 계정관리'에서 다시 로그인한 뒤 메시지를 보내세요." : "이 계정을 그대로 씁니다. 한도가 풀리면 메시지를 다시 보내세요.";
}

// form-parts의 Button은 주 버튼만 위아래 여백이 커서 나란히 두면 높이가 어긋난다.
export function Choice({ theme, label, primary, disabled, onPress }: { theme: PluginTheme; label: string; primary?: boolean; disabled: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        minWidth: 64,
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: primary ? theme.colors.accent : theme.colors.border,
        backgroundColor: primary ? theme.colors.accent : "transparent",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: primary ? "600" : "400", color: primary ? theme.colors.accentForeground : theme.colors.foreground }}>{label}</Text>
    </Pressable>
  );
}

function CandidateRow({ theme, account, disabled, onPress }: { theme: PluginTheme; account: AccountView; disabled: boolean; onPress(): void }) {
  const peak = peakPercent(account);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ flex: 1, fontSize: 13, color: theme.colors.foreground }} numberOfLines={1}>
        {account.label}
        <Text style={{ color: theme.colors.foregroundMuted }}>
          {account.tier ? ` · ${account.tier}` : ""}
          {account.active ? " · 새 대화용" : ""}
        </Text>
      </Text>
      {peak !== null ? (
        <Text style={{ fontSize: 12, fontVariant: ["tabular-nums"], color: usageColor(theme, peak) }}>{Math.round(peak)}%</Text>
      ) : null}
      <Icon name="ChevronRight" size={14} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

export function LimitOfferCard({ theme, item, agentId }: PluginTimelineItemProps<LimitOfferItem>) {
  const offer = item.data;
  const [picking, setPicking] = useState(false);
  const accounts = useOverview().data?.accounts ?? [];
  const answer = useRpc(limitOfferAnswerRpc);
  const send = useMutation({
    mutationFn: (choice: { kind: "stay" } | { kind: "swap"; accountId: string }) => answer({ agentId, offer, choice }),
  });
  const error = send.error ? (send.error instanceof Error ? send.error.message : String(send.error)) : null;
  const busy = send.isPending || send.isSuccess;
  const extra = extraText(offer);
  const answered = answerText(offer);
  const options = candidates(accounts, offer);
  const title = `${offer.fromLabel} ${offer.state === "needs_login" ? "로그인 만료" : "한도 도달"}`;

  return (
    <View
      style={{
        maxWidth: 520,
        gap: 10,
        marginVertical: 6,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: answered ? theme.colors.border : theme.colors.statusWarning,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={answered ? "Check" : "TriangleAlert"} size={15} color={answered ? theme.colors.statusSuccess : theme.colors.statusWarning} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: theme.colors.foreground }} numberOfLines={1}>
          {PROVIDER_LABEL[offer.provider]} · {title}
        </Text>
      </View>
      {extra ? <Hint theme={theme} tone={extra.danger ? "danger" : "muted"}>{extra.text}</Hint> : null}

      {answered ? (
        <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>{answered}</Paragraph>
      ) : picking ? (
        <View style={{ gap: 8 }}>
          <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>
            어느 계정에서 이어갈까요? 같은 모델로 새 에이전트를 만들어 이어갑니다.
          </Paragraph>
          {options.length === 0 ? <Hint theme={theme}>바꿀 수 있는 {PROVIDER_LABEL[offer.provider]} 계정이 없습니다.</Hint> : null}
          {options.map((account) => (
            <CandidateRow key={account.id} theme={theme} account={account} disabled={busy} onPress={() => send.mutate({ kind: "swap", accountId: account.id })} />
          ))}
          <View style={{ flexDirection: "row" }}>
            <Choice theme={theme} label="뒤로" disabled={busy} onPress={() => setPicking(false)} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <View style={{ gap: 2 }}>
            <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>다른 계정으로 바꿀까요?</Paragraph>
            {offer.extra?.status === "enabled" ? <Hint theme={theme}>'아니오'를 누르면 이 계정에서 추가 크레딧으로 계속합니다.</Hint> : null}
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Choice theme={theme} primary label="예" disabled={busy} onPress={() => setPicking(true)} />
            <Choice theme={theme} label="아니오" disabled={busy} onPress={() => send.mutate({ kind: "stay" })} />
          </View>
        </View>
      )}
      {error ? (
        <Hint theme={theme} tone="danger">
          {error}
        </Hint>
      ) : null}
    </View>
  );
}

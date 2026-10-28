import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import type { AccountView, LimitEvent } from "../shared/accounts";
import { AccountCard } from "./account-card";
import { AddAccountModal } from "./add-account-modal";
import { CompactThresholdPicker } from "./compact-threshold";
import { QuestionAutoPicker } from "./question-auto-picker";
import { UpdateSection } from "./update-section";
import { ClearFinishedHandoffs, HandoffList } from "./handoff-list";
import { formatMoney, PROVIDER_LABEL, PROVIDERS } from "./format";
import { Paragraph } from "./paragraph";
import { useAccountActions, useOverview } from "./use-accounts";
import { canCloseInPage, closeScreen } from "./web";

const CARD_MIN_WIDTH = 340;
const GAP = 12;

function cardWidth(available: number, compact: boolean): number | "100%" {
  if (compact || available === 0) return "100%";
  const columns = Math.max(1, Math.floor((available + GAP) / (CARD_MIN_WIDTH + GAP)));
  return Math.floor((available - GAP * (columns - 1)) / columns);
}

export function AccountsScreen({ theme, layout, navigation }: PluginScreenProps) {
  const overview = useOverview();
  const actions = useAccountActions();
  const [adding, setAdding] = useState(false);
  const [available, setAvailable] = useState(0);
  const width = cardWidth(available, layout.compact);
  const accounts = overview.data?.accounts ?? [];
  const padding = layout.compact ? 16 : 24;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <ScrollView contentContainerStyle={{ padding }}>
        <View style={{ gap: 20 }} onLayout={(event) => setAvailable(event.nativeEvent.layout.width)}>
        <View style={{ flexDirection: layout.compact ? "column" : "row", gap: 12, alignItems: layout.compact ? "stretch" : "center" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
            {canCloseInPage ? <ToolbarButton theme={theme} icon="ArrowLeft" label="닫기" onPress={closeScreen} /> : null}
            <ActiveSummary theme={theme} accounts={accounts} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ToolbarButton theme={theme} icon="RefreshCw" label="새로고침" grow={layout.compact} busy={actions.refresh.isPending} onPress={() => actions.refresh.mutate()} />
            <ToolbarButton theme={theme} icon="Plus" label="계정 추가" grow={layout.compact} primary onPress={() => setAdding(true)} />
          </View>
        </View>

        {/* 스위치를 도구 줄에 두면 390px 폭에서 '계정 추가'가 잘리고(2026-10-27), 둘이 되자 넓은 화면에서도 요약 칩이 두 줄로 밀려 따로 둔다. */}
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: layout.compact ? "column" : "row", flexWrap: layout.compact ? "nowrap" : "wrap", columnGap: 24, rowGap: 8 }}>
            <SettingSwitch
              theme={theme}
              compact={layout.compact}
              label="한도에 걸리면 다른 계정으로 바꿀지 묻기"
              value={overview.data?.swapOffer ?? true}
              onChange={(value) => actions.setSwapOffer.mutate(value)}
            />
            <SettingSwitch
              theme={theme}
              compact={layout.compact}
              label="컨텍스트 정리 제안에 답이 없으면 10초 뒤 정리"
              value={overview.data?.compactAuto ?? false}
              onChange={(value) => actions.setCompactAuto.mutate(value)}
            />
          </View>
          {overview.data ? (
            <CompactThresholdPicker
              theme={theme}
              value={overview.data.compactThreshold}
              busy={actions.setCompactThreshold.isPending}
              onChange={(percent) => actions.setCompactThreshold.mutate(percent)}
            />
          ) : null}
          {overview.data ? (
            <QuestionAutoPicker
              theme={theme}
              value={overview.data.questionAuto}
              busy={actions.setQuestionAuto.isPending}
              onChange={(mode) => actions.setQuestionAuto.mutate(mode)}
            />
          ) : null}
          <UpdateSection theme={theme} />
        </View>

        {overview.data?.lastLimit ? <LimitBanner theme={theme} event={overview.data.lastLimit} offered={overview.data.swapOffer} /> : null}

        {overview.data?.handoffs.length ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: theme.colors.foregroundMuted }}>이어가기</Text>
              <ClearFinishedHandoffs theme={theme} jobs={overview.data.handoffs} />
            </View>
            <HandoffList
              theme={theme}
              jobs={overview.data.handoffs}
              onOpen={navigation ? (job) => job.newAgentId && navigation.openAgent({ agentId: job.newAgentId }) : undefined}
            />
          </View>
        ) : null}

        {PROVIDERS.map((provider) => {
          const items = accounts.filter((account) => account.provider === provider);
          return (
            <View key={provider} style={{ gap: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foregroundMuted }}>
                {PROVIDER_LABEL[provider]} · {items.length}개
              </Text>
              {items.length === 0 ? (
                <Text style={{ fontSize: 13, color: theme.colors.foregroundMuted }}>연결된 계정이 없습니다.</Text>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
                  {items.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      theme={theme}
                      compact={layout.compact}
                      width={width}
                      onActivate={() => actions.activate.mutate(account.id)}
                      onRemove={() => actions.remove.mutate(account.id)}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
        </View>
      </ScrollView>
      <AddAccountModal theme={theme} open={adding} onOpenChange={setAdding} />
    </View>
  );
}

// 카드에 '사용 중' 배지 대신 테두리 강조를 쓰므로, 같은 강조를 한 요약 칩이 그 뜻을 알려 준다.
function ActiveSummary({ theme, accounts }: { theme: PluginTheme; accounts: AccountView[] }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>새 대화에 쓰는 계정</Text>
      {PROVIDERS.map((provider) => {
        const active = accounts.find((account) => account.provider === provider && account.active);
        return (
          <View
            key={provider}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: active ? theme.colors.accent : "transparent",
              backgroundColor: active ? `${theme.colors.accent}1F` : theme.colors.surface1,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{PROVIDER_LABEL[provider]}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foreground }}>{active?.label ?? "없음"}</Text>
          </View>
        );
      })}
    </View>
  );
}

function SettingSwitch(props: { theme: PluginTheme; compact: boolean; label: string; value: boolean; onChange(value: boolean): void }) {
  const { theme } = props;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ flex: props.compact ? 1 : undefined, fontSize: 12, color: theme.colors.foregroundMuted }}>{props.label}</Text>
      <Switch value={props.value} onValueChange={props.onChange} trackColor={{ true: theme.colors.accent, false: theme.colors.surface2 }} />
    </View>
  );
}

function ToolbarButton(props: { theme: PluginTheme; icon: string; label: string; primary?: boolean; grow?: boolean; busy?: boolean; onPress(): void }) {
  const { theme, primary } = props;
  const color = primary ? theme.colors.accentForeground : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.busy}
      onPress={props.onPress}
      style={{
        flex: props.grow ? 1 : undefined,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
        borderWidth: primary ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor: primary ? theme.colors.accent : "transparent",
        opacity: props.busy ? 0.6 : 1,
      }}
    >
      <Icon name={props.icon} size={14} color={color} />
      <Text style={{ fontSize: 13, color }}>{props.label}</Text>
    </Pressable>
  );
}

function LimitBanner({ theme, event, offered }: { theme: PluginTheme; event: LimitEvent; offered: boolean }) {
  const time = new Date(event.at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  const extra =
    event.extra?.status === "enabled"
      ? ` · 추가 크레딧 켬(월 최대 ${formatMoney(event.extra.capUsd, "USD")})`
      : event.extra?.status === "failed"
        ? " · 추가 크레딧 켜기 실패"
        : "";
  const message = `${time} ${PROVIDER_LABEL[event.provider]} ${event.fromLabel} ${event.state === "needs_login" ? "로그인 만료" : "한도 도달"}${extra}.${offered ? " 그 대화에서 다른 계정으로 바꿀 수 있습니다." : ""}`;
  return (
    <View style={{ flexDirection: "row", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.statusWarning, backgroundColor: theme.colors.surface1 }}>
      <Icon name="TriangleAlert" size={16} color={theme.colors.statusWarning} />
      <Paragraph style={{ flex: 1, fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>{message}</Paragraph>
    </View>
  );
}

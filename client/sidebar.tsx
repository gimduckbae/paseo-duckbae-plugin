import type { PluginPopoverProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { AccountView, HandoffView } from "../shared/accounts";
import { countdown, PROVIDER_LABEL, PROVIDERS, peakPercent, stateColor, stateLabel, usageColor } from "./format";
import { HandoffList } from "./handoff-list";
import { TierBadge } from "./tier-badge";
import { useOverview } from "./use-accounts";

/** 사용자는 이어가기를 걸어 두고 다른 워크스페이스에 가 있으므로 진행·완료를 사이드바에서 알린다. */
function handoffBadge(theme: PluginTheme, jobs: readonly HandoffView[]): { text: string; color: string } | null {
  if (jobs.some((job) => job.status === "pending")) return { text: "이어가는 중…", color: theme.colors.foregroundMuted };
  if (jobs.some((job) => job.status === "failed" && !job.seen)) return { text: "이어가기 실패", color: theme.colors.statusDanger };
  if (jobs.some((job) => job.status === "completed" && !job.seen)) return { text: "새 에이전트 준비됨", color: theme.colors.statusSuccess };
  return null;
}

export function AccountsSidebarItem({ theme, currentScreen, openPopover }: PluginSidebarItemProps) {
  const data = useOverview().data;
  const accounts = data?.accounts ?? [];
  const badge = handoffBadge(theme, data?.handoffs ?? []);
  return (
    <SidebarRow
      icon="Gauge"
      label="다중 계정관리"
      active={currentScreen?.screenId === "accounts"}
      onPress={() => openPopover(AccountsPopover)}
      trailing={
        badge ? (
          <Text style={{ fontSize: 11, color: badge.color }} numberOfLines={1}>
            {badge.text}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 3 }}>
            {accounts.map((account) => (
              <View key={account.id} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stateColor(theme, account.state) }} />
            ))}
          </View>
        )
      }
    />
  );
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function AccountsPopover({ theme, close, openScreen }: PluginPopoverProps) {
  const data = useOverview().data;
  const now = useNow(1_000);
  const accounts = data?.accounts ?? [];
  const jobs = (data?.handoffs ?? []).filter((job) => job.status === "pending" || !job.seen);
  return (
    <View style={{ width: 340, padding: 12, gap: 12, backgroundColor: theme.colors.surface1 }}>
      {jobs.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.foregroundMuted }}>이어가기 · 새 에이전트는 '전체 보기'에서 엽니다</Text>
          <HandoffList theme={theme} jobs={jobs} />
        </View>
      ) : null}
      {accounts.length === 0 ? (
        <Text style={{ fontSize: 13, color: theme.colors.foregroundMuted }}>연결된 계정이 없습니다.</Text>
      ) : null}
      {PROVIDERS.map((provider) => {
        const items = accounts.filter((account) => account.provider === provider);
        if (items.length === 0) return null;
        return (
          <View key={provider} style={{ gap: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.foregroundMuted }}>{PROVIDER_LABEL[provider]}</Text>
            {items.map((account) => (
              <AccountRow key={account.id} theme={theme} account={account} now={now} />
            ))}
          </View>
        );
      })}
      {accounts.length > 0 ? <Legend theme={theme} /> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          close();
          openScreen({ screenId: "accounts" });
        }}
        style={{ alignItems: "center", paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}
      >
        <Text style={{ fontSize: 12, color: theme.colors.foreground }}>전체 보기</Text>
      </Pressable>
    </View>
  );
}

// '사용 중' 배지 대신 테두리로 새 대화에 쓰는 계정을, 숫자 배지로 그 계정을 쓰는 에이전트 수를 보여 주므로 뜻을 한 줄로 알려 준다.
function Legend({ theme }: { theme: PluginTheme }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <View style={{ width: 12, height: 10, borderRadius: 3, borderWidth: 1, borderColor: theme.colors.accent, backgroundColor: `${theme.colors.accent}1F` }} />
        <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>새 대화에 쓰는 계정</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Icon name="Bot" size={11} color={theme.colors.foregroundMuted} />
        <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>이 계정을 쓰는 에이전트 수</Text>
      </View>
    </View>
  );
}

function AgentCountBadge({ theme, count, active }: { theme: PluginTheme; count: number; active: boolean }) {
  const color = active ? theme.colors.accentForeground : theme.colors.foregroundMuted;
  return (
    <View
      accessibilityLabel={`이 계정을 쓰는 에이전트 ${count}개`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface2,
      }}
    >
      <Icon name="Bot" size={11} color={color} />
      <Text style={{ fontSize: 11, fontVariant: ["tabular-nums"], color }}>{count}</Text>
    </View>
  );
}

// 5시간 사용률은 주간 막대 위 세로선과 그 아래 '5h' 라벨로 같이 보여 준다(막대를 둘로 늘리지 않으려고, 사용자 제안).
function FiveHourMark({ theme, percent, reset }: { theme: PluginTheme; percent: number; reset: string | null }) {
  return (
    <View
      accessibilityLabel={`5시간 ${Math.round(percent)}% 사용${reset ? `, 초기화까지 ${reset}` : ""}`}
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: `${Math.min(100, Math.max(0, percent))}%`, width: 80, marginLeft: -40, alignItems: "center" }}
    >
      <View style={{ width: 2, height: 10, borderRadius: 1, backgroundColor: theme.colors.foreground }} />
      <Text style={{ fontSize: 9, lineHeight: 10, fontVariant: ["tabular-nums"], color: theme.colors.foregroundMuted }} numberOfLines={1}>
        5h{" "}
        {/* 막대처럼 색을 바꾸되 여유 구간(50% 이하)의 초록은 작은 글자에서 괜히 눈에 띄어 회색으로 둔다. */}
        <Text style={{ color: percent > 50 ? usageColor(theme, percent) : theme.colors.foregroundMuted }}>{Math.round(percent)}%</Text>
        {reset ? ` · ${reset}` : ""}
      </Text>
    </View>
  );
}

function AccountRow({ theme, account, now }: { theme: PluginTheme; account: AccountView; now: number }) {
  const spend = account.credentialKind === "api_key" ? (account.spend?.usd ?? 0) : null;
  const weekly = account.windows.find((window) => window.label === "주간");
  const fiveHour = account.windows.find((window) => window.label === "5시간");
  const reset = weekly?.resetsAt ? countdown(weekly.resetsAt, now) : null;
  const percent = spend !== null && account.monthlyCredit ? (spend / account.monthlyCredit) * 100 : (weekly?.usedPercent ?? peakPercent(account));
  const value = spend !== null ? `$${spend.toFixed(2)}` : percent === null ? stateLabel(account.state, account.credentialKind) : `${Math.round(percent)}%`;
  return (
    <View
      accessibilityLabel={account.active ? `${account.label}, 새 대화에 쓰는 계정` : undefined}
      style={{
        gap: 5,
        marginHorizontal: -8,
        paddingHorizontal: 7,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: account.active ? theme.colors.accent : "transparent",
        backgroundColor: account.active ? `${theme.colors.accent}1F` : "transparent",
      }}
    >
      {/* 이름 길이와 에이전트 수 배지 유무에 따라 뒤 칸이 밀리지 않게 이름 뒤 칸은 모두 고정 폭이다. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stateColor(theme, account.state) }} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: account.active ? "600" : "400", color: theme.colors.foreground }} numberOfLines={1}>
          {account.label}
        </Text>
        <View style={{ width: 70, alignItems: "flex-start" }}>
          {/* 강조 배경 위에서는 기본 테두리 색이 묻혀서 조금 진하게 한다. */}
          {account.tier ? <TierBadge theme={theme} tier={account.tier} borderColor={account.active ? `${theme.colors.foregroundMuted}66` : undefined} /> : null}
        </View>
        <View style={{ width: 48, alignItems: "flex-start" }}>
          {account.agentCount > 0 ? <AgentCountBadge theme={theme} count={account.agentCount} active={account.active} /> : null}
        </View>
        <Text style={{ width: 64, textAlign: "right", fontSize: 12, color: percent === null && spend === null ? theme.colors.foregroundMuted : theme.colors.foreground }}>
          {value}
        </Text>
      </View>
      {percent !== null || reset ? (
        <View style={{ marginLeft: 14, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, height: fiveHour ? 20 : 4 }}>
            <View
              style={{
                marginTop: fiveHour ? 3 : 0,
                height: 4,
                borderRadius: 2,
                backgroundColor: percent === null ? "transparent" : theme.colors.surface2,
                overflow: "hidden",
              }}
            >
              {percent !== null ? <View style={{ width: `${Math.min(100, percent)}%`, height: 4, backgroundColor: usageColor(theme, percent) }} /> : null}
            </View>
            {fiveHour ? (
              <FiveHourMark theme={theme} percent={fiveHour.usedPercent} reset={fiveHour.resetsAt ? countdown(fiveHour.resetsAt, now) : null} />
            ) : null}
          </View>
          {reset ? (
            <Text
              accessibilityLabel={`주간 초기화까지 ${reset}`}
              style={{ width: 32, marginTop: fiveHour ? 0 : -3, textAlign: "right", fontSize: 11, lineHeight: 10, fontVariant: ["tabular-nums"], color: theme.colors.foregroundMuted }}
              numberOfLines={1}
            >
              {reset}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

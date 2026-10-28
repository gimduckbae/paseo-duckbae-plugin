import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { AccountView, ExtraCredits } from "../shared/accounts";
import { AccountName } from "./account-name";
import { ApiSpend } from "./api-spend";
import { ClaudeLoginModal } from "./claude-login";
import { DeviceReloginModal } from "./add-account-modal";
import { ClaudeTokenControl } from "./claude-token";
import { credentialText, formatMoney, monthDay, stateColor, stateLabel } from "./format";
import { Paragraph } from "./paragraph";
import { TierBadge } from "./tier-badge";
import { UsageBar } from "./usage-bar";

// 막대·퍼센트·재설정 시각을 한 줄에 두면 3열 카드(약 370px)에서 막대가 80px 남짓으로 짧아진다.
const STACKED_BELOW = 440;

interface AccountCardProps {
  account: AccountView;
  theme: PluginTheme;
  compact: boolean;
  width: number | "100%";
  onActivate(): void;
  onRemove(): void;
}

export function AccountCard({ account, theme, compact, width, onActivate, onRemove }: AccountCardProps) {
  const color = stateColor(theme, account.state);
  const stacked = compact || (typeof width === "number" && width < STACKED_BELOW);
  return (
    <View
      accessibilityLabel={account.active ? `${account.label}, 새 대화에 쓰는 계정` : undefined}
      style={{
        width,
        padding: 14,
        gap: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: account.active ? theme.colors.accent : theme.colors.border,
        backgroundColor: account.active ? `${theme.colors.accent}1F` : theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View style={{ width: 8, height: 8, marginTop: 6, borderRadius: 4, backgroundColor: color }} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <AccountName account={account} theme={theme} />
            {/* 강조 배경 위에서는 기본 테두리 색이 묻혀서 조금 진하게 한다. */}
            {account.tier ? <TierBadge theme={theme} tier={account.tier} borderColor={account.active ? `${theme.colors.foregroundMuted}66` : undefined} /> : null}
            {account.state === "ok" ? null : <Text style={{ fontSize: 12, color }}>{stateLabel(account.state, account.credentialKind)}</Text>}
          </View>
          {account.email ? (
            <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }} numberOfLines={1}>
              {account.email}
            </Text>
          ) : null}
        </View>
        {account.active ? null : (
          <SmallButton theme={theme} label="새 대화에 쓰기" accessibilityLabel={`${account.label} 계정을 새 대화에 쓰기`} onPress={onActivate} />
        )}
      </View>

      {account.windows.length > 0 ? (
        <View style={{ gap: stacked ? 10 : 8 }}>
          {account.windows.map((usage) => (
            <UsageBar key={usage.key} usage={usage} theme={theme} compact={stacked} />
          ))}
        </View>
      ) : (
        <EmptyUsage account={account} theme={theme} />
      )}
      <ExtraLines account={account} theme={theme} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 11, color: theme.colors.foregroundMuted }} numberOfLines={1}>
          {credentialText(account)}
          {account.agentCount > 0 ? ` · 에이전트 ${account.agentCount}개` : ""}
        </Text>
        {account.credentialKind === "claude_login" ? <ClaudeTokenControl account={account} theme={theme} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`${account.label} 제거`} onPress={onRemove} hitSlop={8}>
          <Icon name="Trash2" size={14} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    </View>
  );
}

function SmallButton(props: { theme: PluginTheme; label: string; accessibilityLabel: string; icon?: string; onPress(): void }) {
  const { theme } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      onPress={props.onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}
    >
      {props.icon ? <Icon name={props.icon} size={13} color={theme.colors.foreground} /> : null}
      <Text style={{ fontSize: 12, color: theme.colors.foreground }}>{props.label}</Text>
    </Pressable>
  );
}

function extraCreditsText(credits: ExtraCredits | null): string | null {
  // 꺼져 있고 잔액도 없는 계정이 대부분이라 그때는 줄을 그리지 않는다.
  if (!credits || (!credits.enabled && !credits.balance)) return null;
  const parts = [credits.enabled ? "추가 크레딧" : "추가 크레딧 꺼짐"];
  if (credits.enabled && credits.used !== null) parts.push(`${formatMoney(credits.used, credits.currency)} 사용`);
  if (credits.balance !== null) parts.push(`잔액 ${formatMoney(credits.balance, credits.currency)}`);
  if (credits.enabled && credits.limit !== null) parts.push(`월 최대 ${formatMoney(credits.limit, credits.currency)}`);
  return parts.join(" · ");
}

function ExtraLines({ account, theme }: { account: AccountView; theme: PluginTheme }) {
  const lines = [
    account.resetCredits
      ? `한도 초기화 쿠폰 ${account.resetCredits}개${account.resetExpiresAt ? ` · ${monthDay(account.resetExpiresAt)}까지` : ""}`
      : null,
    extraCreditsText(account.extraCredits),
  ].filter((line): line is string => line !== null);
  if (lines.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      {lines.map((line) => (
        <Text key={line} style={{ fontSize: 12, color: theme.colors.foregroundMuted }} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function EmptyUsage({ account, theme }: { account: AccountView; theme: PluginTheme }) {
  const [loggingIn, setLoggingIn] = useState(false);
  if (account.credentialKind === "api_key") return <ApiSpend account={account} theme={theme} />;
  const relogin = account.provider !== "claude" && (account.state === "needs_login" || account.state === "error");
  return (
    <View style={{ gap: 8, padding: 10, borderRadius: 8, backgroundColor: theme.colors.surface2 }}>
      {/* 다시 로그인 안내가 '로그인 필요'를 다시 말하므로 그때는 상태 글을 뺀다. */}
      {relogin ? null : (
        <Paragraph style={{ fontSize: 12, color: theme.colors.foreground }}>
          {account.stateDetail ?? "사용량을 아직 확인하지 못했습니다."}
        </Paragraph>
      )}
      {account.provider === "claude" ? (
        <>
          <Paragraph style={{ fontSize: 12, lineHeight: 17, color: theme.colors.foregroundMuted }}>
            {account.credentialKind === "claude_login"
              ? "로그인이 만료됐습니다. 다시 로그인해 주세요."
              : "한 번 로그인하면 사용량과 구독 등급이 보입니다. 작업은 1년 토큰으로 계속됩니다."}
          </Paragraph>
          <SmallButton theme={theme} icon="LogIn" label="브라우저로 로그인" accessibilityLabel={`${account.label} 계정 로그인`} onPress={() => setLoggingIn(true)} />
          <ClaudeLoginModal theme={theme} accountId={account.id} label={account.label} open={loggingIn} onOpenChange={setLoggingIn} />
        </>
      ) : null}
      {relogin && account.provider !== "claude" ? (
        <>
          <Paragraph style={{ fontSize: 12, lineHeight: 17, color: theme.colors.foregroundMuted }}>로그인이 풀렸습니다. 다시 로그인해 주세요.</Paragraph>
          <SmallButton theme={theme} icon="LogIn" label="다시 로그인" accessibilityLabel={`${account.label} 계정 다시 로그인`} onPress={() => setLoggingIn(true)} />
          <DeviceReloginModal
            theme={theme}
            provider={account.provider}
            accountId={account.id}
            label={account.label}
            open={loggingIn}
            onOpenChange={setLoggingIn}
          />
        </>
      ) : null}
    </View>
  );
}

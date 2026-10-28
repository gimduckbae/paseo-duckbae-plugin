import type { PluginTheme } from "@getpaseo/plugin";
import { useAgent, usePaseo, useRpc, type PluginButtonContentProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { handoffStartRpc, providerFamily, type AccountView, type Provider } from "../shared/accounts";
import { Button, Hint } from "./form-parts";
import { peakPercent, PROVIDER_LABEL, PROVIDERS, stateLabel, usageColor } from "./format";
import { handoffStatusText } from "./handoff-list";
import { groupModels, type ModelOption } from "./model-groups";
import { useOverview } from "./use-accounts";

// Paseo 플러그인 팝오버는 최대 420×440, 안쪽 여백 12이고 넘치면 통째로 스크롤된다(packages/app/src/plugins/popover.tsx).
// 그러면 [이어가기]가 아래로 밀려 안 보이므로 내용 높이를 그 안으로 묶고 고르는 부분만 안에서 스크롤한다.
const POPOVER_INNER_WIDTH = 372;
const POPOVER_INNER_HEIGHT = 412;
const LABEL_WIDTH = 50;

function useModels(provider: Provider) {
  const paseo = usePaseo();
  return useQuery({
    queryKey: ["paseo-duckbae-plugin", "models", provider],
    queryFn: async (): Promise<ModelOption[]> => {
      const { models } = await paseo.providers.listModels(provider);
      return (models ?? []).filter((model) => model.isSelectable !== false).map((model) => ({ value: `${model.provider}/${model.id}`, label: model.label }));
    },
    staleTime: 10 * 60 * 1000,
  });
}

// Paseo 모델 목록에는 기본값 표시가 없어 다른 제공자를 고르면 사용자가 그 제공자로 가장 최근에 쓴 모델을 먼저 고른다.
function useRecentModels() {
  const paseo = usePaseo();
  return useQuery({
    queryKey: ["paseo-duckbae-plugin", "recent-models"],
    queryFn: async () => {
      const { entries } = await paseo.agents.list();
      const recent: Partial<Record<Provider, string>> = {};
      const agents = entries
        .map((entry) => entry.agent)
        .sort((a, b) => (b.lastUserMessageAt ?? b.updatedAt).localeCompare(a.lastUserMessageAt ?? a.updatedAt));
      for (const agent of agents) {
        const family = providerFamily(agent.provider);
        if (family && agent.model && !recent[family]) recent[family] = `${agent.provider}/${agent.model}`;
      }
      return recent;
    },
    staleTime: 60 * 1000,
  });
}

function blocked(account: AccountView): boolean {
  return account.state === "limited" || account.state === "needs_login";
}

function Row({ theme, label, children }: { theme: PluginTheme; label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <Text style={{ width: LABEL_WIDTH, paddingTop: 4, fontSize: 12, color: theme.colors.foregroundMuted }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5 }}>{children}</View>
    </View>
  );
}

function Chip({ theme, label, selected, onPress }: { theme: PluginTheme; label: string; selected: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accent : "transparent",
      }}
    >
      <Text style={{ fontSize: 12, color: selected ? theme.colors.accentForeground : theme.colors.foreground }}>{label}</Text>
    </Pressable>
  );
}

export function AccountRow({ theme, account, selected, current, onPress }: { theme: PluginTheme; account: AccountView; selected: boolean; current: boolean; onPress(): void }) {
  const peak = peakPercent(account);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={{
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
      }}
    >
      <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.foregroundMuted, alignItems: "center", justifyContent: "center" }}>
        {selected ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.accent }} /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 12, color: theme.colors.foreground }} numberOfLines={1}>
        {account.label}
        <Text style={{ color: theme.colors.foregroundMuted }}>
          {account.tier ? ` · ${account.tier}` : ""}
          {current ? " · 지금 계정" : ""}
        </Text>
      </Text>
      {blocked(account) ? (
        <Text style={{ fontSize: 11, color: theme.colors.statusDanger }}>{stateLabel(account.state, account.credentialKind)}</Text>
      ) : peak !== null ? (
        <Text style={{ fontSize: 11, fontVariant: ["tabular-nums"], color: usageColor(theme, peak) }}>{Math.round(peak)}%</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * 계정 알약을 누르면 열리는 팝오버. 제공자 → 모델 → 계정을 한 화면에서 고른다.
 * 펼침 메뉴는 화면 끝까지 늘어졌고, 에이전트 패널은 플러그인이 닫을 방법이 없어 닫기 버튼을 둘 수 없었다(2026-10-21).
 */
export function HandoffPanel(props: PluginButtonContentProps) {
  const { theme, layout, close } = props;
  const agentId = props.context === "agent" ? props.agentId : "";
  const overview = useOverview().data;
  const agent = useAgent(agentId, (snapshot) => ({
    running: snapshot.status === "running" || snapshot.status === "initializing",
    provider: providerFamily(snapshot.provider),
    model: snapshot.model ? `${snapshot.provider}/${snapshot.model}` : null,
  }));
  const recent = useRecentModels().data;
  const [providerChoice, setProviderChoice] = useState<Provider | null>(null);
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const start = useRpc(handoffStartRpc);

  const providers = PROVIDERS.filter((provider) => overview?.accounts.some((account) => account.provider === provider));
  const provider = providerChoice ?? agent?.provider ?? providers[0] ?? "claude";
  const models = useModels(provider);
  const options = models.data ?? [];
  const groups = groupModels(provider, options);
  const currentAccountId = overview?.agentAccounts[agentId];
  const sameProvider = provider === agent?.provider;
  const accounts = overview?.accounts.filter((account) => account.provider === provider) ?? [];
  const model =
    options.find((option) => option.value === modelChoice) ??
    options.find((option) => option.value === (sameProvider ? agent?.model : recent?.[provider])) ??
    groups[0]?.models[0]?.option;
  // 같은 제공자면 바꿔 갈 다른 계정을, 다른 제공자면 그 제공자의 '사용 중' 계정을 먼저 고른다.
  const account =
    accounts.find((item) => item.id === accountChoice) ??
    (sameProvider ? accounts.find((item) => item.id !== currentAccountId && !blocked(item)) : accounts.find((item) => item.active)) ??
    accounts[0];
  const from = overview?.accounts.find((item) => item.id === currentAccountId);
  const job = overview?.handoffs.find((item) => item.agentId === agentId && (item.status === "pending" || !item.seen));
  const pending = job?.status === "pending";

  const begin = useMutation({
    mutationFn: () => start({ agentId, accountId: account?.id ?? "", model: model?.value ?? "", modelLabel: model?.label ?? "" }),
  });
  const error = begin.error ? (begin.error instanceof Error ? begin.error.message : String(begin.error)) : null;

  return (
    <View style={{ width: layout.compact ? "100%" : POPOVER_INNER_WIDTH, maxHeight: layout.compact ? undefined : POPOVER_INNER_HEIGHT, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.foreground }}>다른 모델·계정에서 이어가기</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} hitSlop={8}>
          <Icon name="X" size={16} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>

      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10 }}>
        <Row theme={theme} label="서비스">
          {providers.map((item) => (
            <Chip
              key={item}
              theme={theme}
              label={PROVIDER_LABEL[item]}
              selected={item === provider}
              onPress={() => {
                setProviderChoice(item);
                setModelChoice(null);
                setAccountChoice(null);
              }}
            />
          ))}
        </Row>

        <View style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border }}>
          {models.isLoading ? <Hint theme={theme}>모델 목록을 불러오는 중입니다.</Hint> : null}
          {!models.isLoading && options.length === 0 ? (
            <Hint theme={theme} tone="danger">
              {PROVIDER_LABEL[provider]}에서 쓸 수 있는 모델이 없습니다. Paseo 설정에서 켜져 있는지 확인하세요.
            </Hint>
          ) : null}
          {groups.map((group) => (
            <Row key={group.family} theme={theme} label={group.family}>
              {group.models.map(({ option, short }) => (
                <Chip key={option.value} theme={theme} label={short} selected={option.value === model?.value} onPress={() => setModelChoice(option.value)} />
              ))}
            </Row>
          ))}
        </View>

        <Row theme={theme} label="계정">
          {accounts.map((item) => (
            <AccountRow
              key={item.id}
              theme={theme}
              account={item}
              selected={item.id === account?.id}
              current={item.id === currentAccountId}
              onPress={() => setAccountChoice(item.id)}
            />
          ))}
        </Row>
      </ScrollView>

      <View style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: theme.colors.border }}>
        {from && blocked(from) && !(from.state === "limited" && from.extraCredits?.enabled) ? (
          <Hint theme={theme} tone="danger">
            지금 계정이 {stateLabel(from.state, from.credentialKind)} 상태라 인계 문서 대신 최근 대화를 넘깁니다.
          </Hint>
        ) : null}
        {agent?.running && !pending ? <Hint theme={theme}>에이전트가 작업 중입니다. 작업이 끝나면 이어갈 수 있습니다.</Hint> : null}
        {error ? (
          <Hint theme={theme} tone="danger">
            {error}
          </Hint>
        ) : null}
        {job ? (
          <Hint theme={theme} tone={job.status === "failed" ? "danger" : "muted"}>
            {handoffStatusText(job)}
            {pending ? " 창을 닫아도 계속되고, 끝나면 사이드바 '다중 계정관리'에 표시됩니다." : ""}
          </Hint>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ flex: 1, fontSize: 12, color: theme.colors.foreground }} numberOfLines={2}>
            {model && account ? `${PROVIDER_LABEL[provider]} ${model.label} · ${account.label}` : ""}
          </Text>
          <Button
            theme={theme}
            primary
            label={pending ? "이어가는 중…" : "이어가기"}
            disabled={!model || !account || begin.isPending || begin.isSuccess || pending || agent?.running === true}
            onPress={() => begin.mutate()}
          />
        </View>
      </View>
    </View>
  );
}

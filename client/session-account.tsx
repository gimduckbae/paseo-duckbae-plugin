import type { PluginButtonContentProps, PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";
import type { AccountView, Overview } from "../shared/accounts";
import { Hint } from "./form-parts";
import { PROVIDER_LABEL, PROVIDERS } from "./format";
import { AccountRow } from "./handoff-panel";
import { fetchOverview, useAccountActions, useOverview } from "./use-accounts";

const TITLE = "새 대화에 쓸 계정";
const OVERVIEW_POLL_MS = 60_000;

// 고를 계정이 둘 이상인 제공자가 있을 때만 버튼을 보인다.
function hasChoice(overview: Overview | null): boolean {
  return PROVIDERS.some((provider) => (overview?.accounts.filter((account) => account.provider === provider).length ?? 0) >= 2);
}

export function NewSessionAccountPanel({ theme, close }: PluginButtonContentProps) {
  const accounts = useOverview().data?.accounts ?? [];
  const { activate } = useAccountActions();
  const groups = PROVIDERS.map((provider) => ({ provider, items: accounts.filter((account) => account.provider === provider) })).filter(
    (group) => group.items.length > 0,
  );
  const choose = (account: AccountView) => {
    if (!account.active) activate.mutate(account.id);
  };
  return (
    <View style={{ width: 340, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.foreground }}>{TITLE}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} hitSlop={8}>
          <Icon name="X" size={16} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
      <Hint theme={theme}>새 대화는 여기서 고른 계정으로 시작합니다. 진행 중인 대화를 옮기려면 입력창 위 계정 버튼을 누르세요.</Hint>
      {groups.map(({ provider, items }) => (
        <View key={provider} style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.foregroundMuted }}>{PROVIDER_LABEL[provider]}</Text>
          {items.map((account) => (
            <AccountRow key={account.id} theme={theme} account={account} selected={account.active} current={false} onPress={() => choose(account)} />
          ))}
        </View>
      ))}
      {activate.error ? (
        <Hint theme={theme} tone="danger">
          {activate.error instanceof Error ? activate.error.message : String(activate.error)}
        </Hint>
      ) : null}
    </View>
  );
}

/**
 * 워크스페이스 머리글에 '새 대화 계정' 버튼을 단다. 새 대화(초안 탭)는 에이전트 ID가 없어 입력창 알약을 붙일 수 없고,
 * 머리글은 초안 탭에서도 보인다(0.11.4 workspace-screen.tsx). 새 에이전트는 '사용 중' 계정으로 열리므로 그 값을 바꾼다.
 */
export function registerSessionAccountButtons(client: PluginClientContext): () => void {
  const lifetime = new AbortController();
  const buttons = new Map<string, PluginButtonRegistration>();
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // 워크스페이스 목록은 signal을 받지 않아 정리할 때 구독을 직접 놓는다.
  let release: (() => Promise<void>) | null = null;

  const add = (workspaceId: string) => {
    if (buttons.has(workspaceId) || lifetime.signal.aborted) return;
    const button = { title: TITLE, icon: "UserRoundCog", label: "새 대화 계정", visible, behavior: { kind: "popover" as const, Content: NewSessionAccountPanel } };
    buttons.set(workspaceId, client.addHeaderButton({ id: "new-session-account", workspaceId, button }));
  };

  const forget = (workspaceId: string) => {
    buttons.get(workspaceId)?.remove();
    buttons.delete(workspaceId);
  };

  const loadOverview = async (): Promise<void> => {
    if (timer) clearTimeout(timer);
    const overview = await fetchOverview(client);
    const next = overview ? hasChoice(overview) : visible;
    if (next !== visible) {
      visible = next;
      for (const registration of buttons.values()) registration.update({ visible });
    }
    if (!lifetime.signal.aborted) timer = setTimeout(() => void loadOverview(), OVERVIEW_POLL_MS);
  };

  void loadOverview();

  void client.paseo.workspaces
    .list({ subscribe: {} })
    .then(({ subscription }) => {
      if (lifetime.signal.aborted) return subscription.release();
      release = () => subscription.release();
      subscription.subscribe({
        snapshot: ({ entries }) => {
          for (const workspaceId of [...buttons.keys()]) forget(workspaceId);
          for (const workspace of entries) add(workspace.id);
        },
        update: (message) => {
          if (message.type !== "workspace_update") return;
          const update = message.payload;
          if (update.kind === "upsert") return add(update.workspace.id);
          forget(update.id);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("Workspace observation failed", error);
    });

  return () => {
    lifetime.abort();
    if (timer) clearTimeout(timer);
    void release?.();
    for (const workspaceId of [...buttons.keys()]) forget(workspaceId);
  };
}

import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { providerFamily, type Overview } from "../shared/accounts";
import { HandoffPanel } from "./handoff-panel";
import { fetchOverview } from "./use-accounts";

const OVERVIEW_POLL_MS = 30_000;
const PENDING_POLL_MS = 3_000;

const TITLE = "다른 모델·계정에서 이어가기";

interface PillFace {
  label: string;
  icon: string;
  visible: boolean;
}

export function pillFace(agentId: string, overview: Overview | null): PillFace {
  const current = overview?.accounts.find((account) => account.id === overview.agentAccounts[agentId]);
  const pending = overview?.handoffs.some((job) => job.agentId === agentId && job.status === "pending") ?? false;
  return {
    label: pending ? "이어가는 중…" : (current?.label ?? "계정 바꾸기"),
    icon: pending ? "Loader" : "UserRound",
    // 계정 목록을 아직 못 받았으면 보인다. 받기 전에 숨기면 조회가 막혔을 때 알약이 계속 사라져 있었다(2026-10-26).
    visible: overview === null || overview.accounts.length > 0,
  };
}

/** Claude·Codex·Grok 에이전트마다 입력창 위에 지금 계정을 보여 주고, 누르면 다른 모델·계정에서 이어가는 팝오버를 연다. */
export function registerAccountPills(client: PluginClientContext): () => void {
  const lifetime = new AbortController();
  const agents = new Map<string, string>();
  const pills = new Map<string, { registration: PluginButtonRegistration; face: PillFace }>();
  let overview: Overview | null = null;
  let overviewTimer: ReturnType<typeof setTimeout> | null = null;

  // 팝오버(behavior)는 바꾸지 않고 이름·아이콘만 고친다. behavior를 바꾸거나 숨기면 열린 팝오버가 닫힌다(Paseo 버튼 규칙).
  const render = (agentId: string) => {
    const workspaceId = agents.get(agentId);
    if (!workspaceId || lifetime.signal.aborted) return;
    const face = pillFace(agentId, overview);
    const existing = pills.get(agentId);
    if (existing) {
      const { label, icon, visible } = existing.face;
      if (label !== face.label || icon !== face.icon) existing.registration.update({ label: face.label, icon: face.icon });
      if (visible !== face.visible) existing.registration.update({ visible: face.visible });
      existing.face = face;
      return;
    }
    const button = { title: TITLE, ...face, behavior: { kind: "popover" as const, Content: HandoffPanel } };
    pills.set(agentId, { registration: client.addComposerPill({ id: "account", workspaceId, agentId, button }), face });
  };

  const forget = (agentId: string) => {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
    agents.delete(agentId);
  };

  // 이어가기가 진행 중이면 알약의 '이어가는 중…'이 빨리 풀리도록 자주 묻는다.
  const loadOverview = async (): Promise<void> => {
    if (overviewTimer) clearTimeout(overviewTimer);
    overview = (await fetchOverview(client)) ?? overview;
    for (const agentId of agents.keys()) render(agentId);
    if (lifetime.signal.aborted) return;
    const pending = overview?.handoffs.some((job) => job.status === "pending") ?? false;
    overviewTimer = setTimeout(() => void loadOverview(), pending ? PENDING_POLL_MS : OVERVIEW_POLL_MS);
  };

  const track = (agent: { id: string; provider: string; workspaceId?: string | null; archivedAt?: string | null }) => {
    if (!providerFamily(agent.provider) || !agent.workspaceId || agent.archivedAt) return forget(agent.id);
    const isNew = !agents.has(agent.id);
    agents.set(agent.id, agent.workspaceId);
    render(agent.id);
    // 새 에이전트는 열릴 때 계정에 묶이므로 묶인 계정을 바로 받아 온다.
    if (isNew && overview && !overview.agentAccounts[agent.id]) void loadOverview();
  };

  void loadOverview();

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          for (const agentId of [...agents.keys()]) forget(agentId);
          for (const { agent } of entries) track(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") return track(update.agent);
          forget(update.agentId);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!lifetime.signal.aborted) console.error("Agent observation failed", error);
    });

  return () => {
    lifetime.abort();
    if (overviewTimer) clearTimeout(overviewTimer);
    for (const agentId of [...agents.keys()]) forget(agentId);
  };
}

import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { setReasoningTranslateRpc } from "../shared/accounts";
import { reasoningItems } from "../shared/reasoning";
import { fetchOverview } from "./use-accounts";

const OVERVIEW_POLL_MS = 30_000;
const TITLE = "추론 훔쳐보기";

function pillFace(enabled: boolean) {
  return { label: enabled ? "추론 훔쳐보기 켜짐" : "추론 훔쳐보기 꺼짐", icon: enabled ? "Eye" : "EyeOff" };
}

/** 설정이 에이전트별이 아니라 전역이라 알약마다 같은 값을 보여 준다. */
export function registerReasoningPeek(client: PluginClientContext): () => void {
  const lifetime = new AbortController();
  const agents = new Map<string, string>();
  const pills = new Map<string, { registration: PluginButtonRegistration; enabled: boolean }>();
  let enabled = false;
  let overviewTimer: ReturnType<typeof setTimeout> | null = null;
  let removeTransformer: PluginCleanup | null = null;

  // 변환기를 다시 등록해야 호스트가 항목 투영 캐시를 버린다(0.15 plugins/timeline/projection.ts의 WeakMap이 변환 함수마다 잡힌다).
  // 깃발만 바꾸면 이미 그려진 생각 글은 그대로 남아 켠 뒤에도 원문으로 보인다.
  const applyTransformer = () => {
    void removeTransformer?.();
    removeTransformer = client.addTimelineTransformer({
      id: "reasoning-peek",
      query: { itemType: "reasoning" },
      // 증분마다 불리고 결과가 매번 JSON으로 복사된다(projection.ts cloneAndFreeze). 여기서 해싱·번역·쪼개기를 하지 않는다.
      transform: ({ item, phase }) => (enabled ? { items: reasoningItems(item.text, phase) } : undefined),
    });
  };

  const render = (agentId: string) => {
    const workspaceId = agents.get(agentId);
    if (!workspaceId || lifetime.signal.aborted) return;
    const existing = pills.get(agentId);
    if (existing) {
      if (existing.enabled !== enabled) existing.registration.update(pillFace(enabled));
      existing.enabled = enabled;
      return;
    }
    const button = { title: TITLE, ...pillFace(enabled), behavior: { kind: "action" as const, onPress: () => toggle() } };
    pills.set(agentId, { registration: client.addComposerPill({ id: "reasoning", workspaceId, agentId, button }), enabled });
  };

  const apply = (next: boolean) => {
    if (next === enabled) return;
    enabled = next;
    applyTransformer();
    for (const agentId of agents.keys()) render(agentId);
  };

  const toggle = async (): Promise<void> => {
    const result = await client.rpc(setReasoningTranslateRpc, { enabled: !enabled }).catch((error: unknown) => {
      console.error("Reasoning peek toggle failed", error);
      return null;
    });
    if (result) apply(result.reasoning.enabled);
  };

  const loadOverview = async (): Promise<void> => {
    if (overviewTimer) clearTimeout(overviewTimer);
    const overview = await fetchOverview(client);
    if (overview) apply(overview.reasoning.enabled);
    if (lifetime.signal.aborted) return;
    overviewTimer = setTimeout(() => void loadOverview(), OVERVIEW_POLL_MS);
  };

  const forget = (agentId: string) => {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
    agents.delete(agentId);
  };

  const track = (agent: { id: string; workspaceId?: string | null; archivedAt?: string | null }) => {
    if (!agent.workspaceId || agent.archivedAt) return forget(agent.id);
    agents.set(agent.id, agent.workspaceId);
    render(agent.id);
  };

  applyTransformer();
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
    void removeTransformer?.();
    for (const agentId of [...agents.keys()]) forget(agentId);
  };
}

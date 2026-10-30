import type { PaseoAgent, PaseoAgentHandle, PaseoApi } from "./paseo-types";
import { randomUUID } from "node:crypto";
import {
  ACCOUNT_HANDOFF_ITEM_KIND,
  PROVIDER_LABEL,
  providerFamily,
  type AccountHandoffItem,
  type HandoffView,
  type Provider,
} from "../shared/accounts";
import type { AccountService } from "./account-service";
import { continuationPrompt, HANDOFF_REQUEST, timelineHandoff } from "./handoff-guide";
import { isObject } from "./json-lines";
import type { AccountStore, StoredAccount } from "./store";

const WRITE_TIMEOUT_MS = 15 * 60 * 1000;
const KEEP_MS = 24 * 60 * 60 * 1000;
// git 설치 빌드는 @getpaseo/protocol을 타입으로만 통과시켜 PARENT_AGENT_ID_LABEL 값을 가져올 수 없다(Paseo 0.14 compiler-build.js).
const PARENT_AGENT_LABEL = "paseo.parent-agent-id";

type Message = { role: "user" | "assistant"; text: string };

async function recentMessages(handle: PaseoAgentHandle): Promise<Message[]> {
  const page = await handle.timeline.refetch({ direction: "tail", limit: 80 });
  const items: unknown[] = isObject(page) && Array.isArray(page.entries) ? page.entries.map((entry) => (isObject(entry) ? entry.item : null)) : [];
  return items.flatMap((item): Message[] => {
    if (!isObject(item) || typeof item.text !== "string") return [];
    const text = item.text.trim();
    if (!text || text.startsWith(HANDOFF_REQUEST.split("\n")[0])) return [];
    if (item.type === "user_message") return [{ role: "user", text }];
    if (item.type === "assistant_message") return [{ role: "assistant", text }];
    return [];
  });
}

// 모드(권한 수준)는 제공자마다 이름이 달라 옮길 수 없다. 다른 제공자로 갈 때는 사용자가 그 제공자로
// 가장 최근에 쓴 에이전트의 모드를 따른다.
async function recentMode(paseo: PaseoApi, provider: Provider): Promise<string | undefined> {
  const { entries } = await paseo.agents.list();
  const recent = entries
    .map((entry) => entry.agent)
    .filter((agent) => providerFamily(agent.provider) === provider)
    .sort((a, b) => (b.lastUserMessageAt ?? b.updatedAt).localeCompare(a.lastUserMessageAt ?? a.updatedAt))[0];
  return recent?.currentModeId ?? undefined;
}

// 사용자가 지금 에이전트 탭을 닫으면(보관) Paseo가 같은 워크스페이스의 하위도 같이 보관해 하던 일이 끊긴다(2026-10-30 하위 4개).
// 다른 워크스페이스의 하위는 떼어 남기므로 세지 않는다. 열린 탭 라벨이 있는 하위도 떼어 남지만 탭 상태는 그 뒤에 바뀔 수 있어 센다
// (Paseo 0.14 agent-manager cascadeArchiveChildren).
async function countCascadeChildren(paseo: PaseoApi, parent: PaseoAgent): Promise<number | null> {
  try {
    const { entries } = await paseo.agents.list({ filter: { labels: { [PARENT_AGENT_LABEL]: parent.id }, includeBackground: true } });
    return entries.filter(({ agent }) => !(parent.workspaceId && agent.workspaceId && agent.workspaceId !== parent.workspaceId)).length;
  } catch {
    return null;
  }
}

export interface HandoffRequest {
  agentId: string;
  accountId: string;
  /** "provider/model". Paseo는 새 에이전트를 이 형식으로만 만든다(제공자만 넣으면 거절, 2026-10-21 실사용). */
  model: string;
  modelLabel: string;
}

/**
 * 다른 모델·계정에서 이어가기. 지금 에이전트는 그대로 두고, 인계 문서를 첫 프롬프트로 받는 새 에이전트를 만든다.
 * 인계 문서를 쓰는 데 몇 분 걸리므로 사용자는 다른 곳에 가 있다. 결과는 목록(list)과 지금 에이전트 타임라인에 남긴다.
 */
export class HandoffJobs {
  private readonly jobs = new Map<string, HandoffView>();
  private readonly writing = new Set<string>();

  constructor(
    private readonly store: AccountStore,
    private readonly service: AccountService,
  ) {}

  /** 인계 문서를 쓰는 턴의 답변에는 한도 문구가 섞일 수 있어 한도 감지를 건너뛴다. */
  isWriting(agentId: string): boolean {
    return this.writing.has(agentId);
  }

  list(): HandoffView[] {
    const since = Date.now() - KEEP_MS;
    return [...this.jobs.values()]
      .filter((job) => job.status === "pending" || Date.parse(job.startedAt) >= since)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 10);
  }

  markSeen(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job && job.status !== "pending") this.jobs.set(jobId, { ...job, seen: true });
  }

  remove(jobId: string | null): void {
    for (const job of [...this.jobs.values()]) {
      if (job.status !== "pending" && (jobId === null || job.jobId === jobId)) this.jobs.delete(job.jobId);
    }
  }

  async start(paseo: PaseoApi, request: HandoffRequest): Promise<string> {
    const target = this.store.find(request.accountId);
    if (providerFamily(request.model.split("/")[0]) !== target.provider) throw new Error("모델과 계정의 서비스가 다릅니다.");
    const agent = (await paseo.agents.ref(request.agentId).refresh())?.agent;
    if (!agent) throw new Error("에이전트를 찾을 수 없습니다.");
    if (agent.status === "running" || agent.status === "initializing" || this.writing.has(agent.id)) {
      throw new Error("에이전트가 작업 중입니다. 작업이 끝난 뒤 다시 시도하세요.");
    }
    const jobId = randomUUID();
    this.jobs.set(jobId, {
      jobId,
      agentId: agent.id,
      fromTitle: agent.title ?? null,
      toLabel: target.label,
      toProvider: target.provider,
      modelLabel: request.modelLabel,
      startedAt: new Date().toISOString(),
      status: "pending",
      phase: "writing",
      newAgentId: null,
      title: null,
      error: null,
      cascadeChildCount: null,
      seen: false,
    });
    void this.run(paseo, jobId, agent, target, request.model);
    return jobId;
  }

  private update(jobId: string, patch: Partial<HandoffView>): void {
    const job = this.jobs.get(jobId);
    if (job) this.jobs.set(jobId, { ...job, ...patch });
  }

  private async run(paseo: PaseoApi, jobId: string, agent: PaseoAgent, target: StoredAccount, model: string): Promise<void> {
    const handle = paseo.agents.ref(agent.id);
    const from = this.store.pinnedAccount(agent.id);
    const row = { toLabel: target.label, toProvider: target.provider, title: null, handoffPath: null, error: null };
    try {
      const fromLabel = from ? `${PROVIDER_LABEL[from.provider]} · ${from.label}` : agent.provider;
      const handoff = await this.writeHandoff(handle, from);
      const handoffPath = await this.store.saveHandoff(agent.id, handoff);
      this.update(jobId, { phase: "creating" });
      const cascadeChildCount = await countCascadeChildren(paseo, agent);
      const created = await this.createAgent(paseo, agent, target, model, continuationPrompt({ fromLabel, handoff, handoffPath, cascadeChildCount }));
      this.update(jobId, { status: "completed", phase: null, newAgentId: created.id, title: created.title, cascadeChildCount });
      await this.appendRow(handle, { ...row, title: created.title, handoffPath, cascadeChildCount });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.update(jobId, { status: "failed", phase: null, error: message });
      await this.appendRow(handle, { ...row, error: message }).catch(() => undefined);
    }
  }

  private async writeHandoff(handle: PaseoAgentHandle, from: StoredAccount | null): Promise<string> {
    // 한도에 걸렸거나 로그인이 끊긴 계정으로는 인계 문서를 쓸 턴을 돌릴 수 없다. 추가 크레딧이 켜져 있으면 한도에 걸려도 돌릴 수 있다.
    const state = from ? this.service.stateOf(from.id) : "unknown";
    if (state === "limited" && !(from && this.service.overageActive(from.id))) return timelineHandoff("한도에 걸려", await recentMessages(handle));
    if (state === "needs_login") return timelineHandoff("로그인이 끊겨", await recentMessages(handle));
    this.writing.add(handle.id);
    try {
      const result = await handle.run(HANDOFF_REQUEST, { timeoutMs: WRITE_TIMEOUT_MS });
      const text = result.lastMessage?.trim();
      if (result.status === "idle" && text) return text;
      return timelineHandoff(`오류(${result.error ?? result.status})로`, await recentMessages(handle));
    } finally {
      this.writing.delete(handle.id);
    }
  }

  private async createAgent(
    paseo: PaseoApi,
    agent: PaseoAgent,
    target: StoredAccount,
    model: string,
    prompt: string,
  ): Promise<{ id: string; title: string }> {
    const provider = model.split("/")[0];
    // 생각 수준은 모델마다 고를 수 있는 값이 달라 같은 모델일 때만 옮긴다.
    const config = {
      provider: model,
      modeId: (provider === agent.provider ? agent.currentModeId : await recentMode(paseo, target.provider)) ?? undefined,
      thinkingOptionId: (model === `${agent.provider}/${agent.model}` ? agent.thinkingOptionId : null) ?? undefined,
    };
    const title = `${agent.title ?? "이어가기"} · ${target.label}`;
    const agentId = randomUUID();
    // 새 에이전트가 처음 열릴 때(session_open) 이 계정으로 열리도록 만들기 전에 묶어 둔다.
    await this.store.pinAgent(agentId, target.id);
    try {
      const options = { agentId, config, title, prompt };
      const created = agent.workspaceId
        ? await paseo.workspaces.ref(agent.workspaceId).agents.create(options)
        : await paseo.agents.create({ ...options, cwd: agent.cwd });
      return { id: created.id, title };
    } catch (error) {
      await this.store.unpinAgent(agentId);
      throw error;
    }
  }

  private async appendRow(handle: PaseoAgentHandle, data: AccountHandoffItem): Promise<void> {
    await handle.timeline.append({ type: "plugin", id: `account-handoff-${Date.now()}`, kind: ACCOUNT_HANDOFF_ITEM_KIND, version: 1, data });
  }
}

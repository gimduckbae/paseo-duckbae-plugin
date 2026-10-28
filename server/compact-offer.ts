import type { PaseoAgentHandle, PaseoApi } from "@getpaseo/client";
import type { PluginHookAgent } from "@getpaseo/plugin/server";
import { randomUUID } from "node:crypto";
import { providerFamily } from "../shared/accounts";
import { COMPACT_OFFER_ITEM_KIND, type CompactAnswer, type CompactOfferItem } from "../shared/compact";
import type { AccountStore } from "./store";

// '안 함'을 고른 대화는 창의 이만큼 더 차야 다시 묻는다. 매 턴 같은 카드가 붙지 않게.
const REOFFER_STEP = 0.1;
const AUTO_ACCEPT_MS = 10_000;
// turn_ended 훅은 턴 끝 이벤트에서 바로 불려 상태가 아직 running일 수 있다.
const IDLE_WAIT_MS = 5_000;
const IDLE_POLL_MS = 500;
// 정리 명령은 끝나도 에이전트가 하던 일을 다시 시작하지 않는다(2026-10-28 사용자 보고). 정리가 끝난 것을 대화 기록에서 보고 이어서 하라고 보낸다.
// Codex 정리는 턴이 아니라 따로 도는 명령이라(0.13 codex-app-server-agent tryHandleOutOfBand) 턴 종료 훅으로는 끝을 알 수 없다.
const COMPACT_WATCH_MS = 15 * 60 * 1000;
const COMPACT_POLL_MS = 3_000;
const WATCH_TAIL = 50;
const RESUME_TEXT =
  "[자동 이어하기] 컨텍스트 정리가 끝났습니다. 정리 전에 하던 작업이 끝나지 않았다면 남은 일부터 이어서 진행하세요. 이미 끝났거나 사용자의 답을 기다리던 중이었다면 새 일을 시작하지 말고 한 줄로 그렇다고만 답하세요.";

// Claude Code·Agent SDK 문서의 정리 지시 예시(목표·결정과 이유·파일 경로·테스트 결과·남은 일)를 따른다.
const CLAUDE_FOCUS =
  "작업 목표와 완료 기준, 사용자가 정한 결정·제약(원문 그대로)과 그 이유, 읽거나 고친 파일·브랜치·worktree 경로, 테스트 결과와 오류 메시지, 지금 위치와 다음 할 일은 남기고, 끝난 탐색 과정과 긴 도구 출력은 줄여 주세요.";

type By = "user" | "auto";
type Choice = "compact" | "skip";

function row(item: CompactOfferItem) {
  return { type: "plugin" as const, id: `compact-offer-${item.offerId}`, kind: COMPACT_OFFER_ITEM_KIND, version: 1, data: item };
}

function compactCommand(provider: string): string | null {
  const family = providerFamily(provider);
  if (family === "claude") return `/compact ${CLAUDE_FOCUS}`;
  // Codex의 /compact는 Paseo가 thread/compact/start로 바꿔 보내며 인자를 받지 않는다(0.13 codex-app-server-agent).
  if (family === "codex") return "/compact";
  return null;
}

async function settledStatus(handle: PaseoAgentHandle, waitMs: number): Promise<PaseoAgentHandle["status"]> {
  const until = Date.now() + waitMs;
  await handle.refresh();
  while ((handle.status === "running" || handle.status === "initializing") && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
    await handle.refresh();
  }
  return handle.status;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function nextSeq(handle: PaseoAgentHandle): Promise<number> {
  return (await handle.timeline.refetch({ direction: "tail", limit: 1 })).window.nextSeq;
}

/**
 * 컨텍스트가 기준을 넘은 대화에 정리(/compact) 제안 카드를 붙인다. 자동 수락이 켜져 있으면 10초 뒤 받아들인다.
 * 카드·타이머·대기열은 메모리에만 있어 플러그인을 다시 불러오면 지난 카드는 사람이 눌러야 한다.
 */
export class CompactOffers {
  private readonly waiting = new Map<string, { offer: CompactOfferItem; timer: NodeJS.Timeout | null }>();
  private readonly queued = new Map<string, { offer: CompactOfferItem; by: By }>();
  private readonly offeredAt = new Map<string, number>();
  private readonly handled = new Set<string>();
  private disposed = false;

  constructor(private readonly store: AccountStore) {}

  async afterTurn(paseo: PaseoApi, agent: PluginHookAgent): Promise<void> {
    if (agent.parentAgentId || !compactCommand(agent.provider)) return;
    const queued = this.queued.get(agent.id);
    if (queued) {
      this.queued.delete(agent.id);
      await this.start(paseo, agent.id, queued.offer, queued.by, IDLE_WAIT_MS);
      return;
    }
    const handle = paseo.agents.ref(agent.id);
    await handle.refresh();
    const used = handle.lastUsage?.contextWindowUsedTokens;
    const max = handle.lastUsage?.contextWindowMaxTokens;
    if (!used || !max) return;
    const ratio = used / max;
    if (ratio * 100 < this.store.compactThreshold) {
      this.offeredAt.delete(agent.id);
      return;
    }
    const last = this.offeredAt.get(agent.id);
    if (this.waiting.has(agent.id) || (last !== undefined && ratio < last + REOFFER_STEP)) return;
    this.offeredAt.set(agent.id, ratio);
    const auto = this.store.compactAuto;
    const offer: CompactOfferItem = {
      offerId: randomUUID(),
      usedTokens: used,
      maxTokens: max,
      autoAt: auto ? new Date(Date.now() + AUTO_ACCEPT_MS).toISOString() : null,
      answer: null,
    };
    await handle.timeline.append(row(offer));
    const timer = auto ? setTimeout(() => void this.resolve(paseo, agent.id, offer, "compact", "auto").catch(() => undefined), AUTO_ACCEPT_MS) : null;
    this.waiting.set(agent.id, { offer, timer });
  }

  // 카드 내용은 클라이언트가 보낸 것을 쓴다. 서버에 들고 있으면 플러그인을 다시 불러온 뒤 지난 카드에 답할 수 없다.
  async answer(paseo: PaseoApi, input: { agentId: string; offer: CompactOfferItem; choice: Choice }): Promise<void> {
    const { agentId, offer, choice } = input;
    if (offer.answer?.kind === "queued" && choice === "skip") {
      if (this.queued.get(agentId)?.offer.offerId === offer.offerId) this.queued.delete(agentId);
      await paseo.agents.ref(agentId).timeline.append(row({ ...offer, answer: { kind: "skipped" } }));
      return;
    }
    await this.resolve(paseo, agentId, offer, choice, "user");
  }

  /** 사용자가 메시지를 보냈으면 자리에 있으므로 자동 수락을 멈추고 카드는 그대로 둔다. */
  async onTurnStarted(paseo: PaseoApi, agentId: string): Promise<void> {
    await this.stopCountdown(paseo, agentId);
  }

  async setAuto(paseo: PaseoApi, enabled: boolean): Promise<void> {
    if (enabled) return;
    await Promise.all([...this.waiting.keys()].map((agentId) => this.stopCountdown(paseo, agentId)));
  }

  forget(agentId: string): void {
    const waiting = this.waiting.get(agentId);
    if (waiting?.timer) clearTimeout(waiting.timer);
    this.waiting.delete(agentId);
    this.queued.delete(agentId);
    this.offeredAt.delete(agentId);
  }

  dispose(): void {
    this.disposed = true;
    for (const { timer } of this.waiting.values()) if (timer) clearTimeout(timer);
    this.waiting.clear();
  }

  private async stopCountdown(paseo: PaseoApi, agentId: string): Promise<void> {
    const waiting = this.waiting.get(agentId);
    if (!waiting?.timer) return;
    clearTimeout(waiting.timer);
    const offer = { ...waiting.offer, autoAt: null };
    this.waiting.set(agentId, { offer, timer: null });
    await paseo.agents.ref(agentId).timeline.append(row(offer));
  }

  private async resolve(paseo: PaseoApi, agentId: string, offer: CompactOfferItem, choice: Choice, by: By): Promise<void> {
    // 자동 수락과 사람이 누른 것이 엇갈려도 한 번만 처리한다.
    if (offer.answer || this.handled.has(offer.offerId)) throw new Error("이미 처리한 제안입니다.");
    this.handled.add(offer.offerId);
    const waiting = this.waiting.get(agentId);
    if (waiting?.offer.offerId === offer.offerId) {
      if (waiting.timer) clearTimeout(waiting.timer);
      this.waiting.delete(agentId);
    }
    if (choice === "skip") {
      await paseo.agents.ref(agentId).timeline.append(row({ ...offer, answer: { kind: "skipped" } }));
      return;
    }
    await this.start(paseo, agentId, offer, by, 0);
  }

  private async start(paseo: PaseoApi, agentId: string, offer: CompactOfferItem, by: By, waitMs: number): Promise<void> {
    const handle = paseo.agents.ref(agentId);
    const mark = (answer: CompactAnswer) => handle.timeline.append(row({ ...offer, answer }));
    try {
      const status = await settledStatus(handle, waitMs);
      if (status === "running" || status === "initializing") {
        this.queued.set(agentId, { offer, by });
        await mark({ kind: "queued", by });
        return;
      }
      const command = compactCommand(handle.current()?.provider ?? "");
      if (status === "closed" || !command) throw new Error("에이전트가 닫혀 있습니다.");
      const since = await nextSeq(handle);
      await handle.send(command);
      await mark({ kind: "started", by });
      void this.resumeAfterCompact(handle, since, mark, by);
    } catch (error) {
      await mark({ kind: "failed", error: errorText(error) });
    }
  }

  private async resumeAfterCompact(handle: PaseoAgentHandle, since: number, mark: (answer: CompactAnswer) => Promise<unknown>, by: By): Promise<void> {
    try {
      const until = Date.now() + COMPACT_WATCH_MS;
      while (Date.now() < until) {
        await sleep(COMPACT_POLL_MS);
        if (this.disposed) return;
        const entries = (await handle.timeline.refetch({ direction: "tail", limit: WATCH_TAIL })).entries.filter((entry) => entry.seqStart >= since);
        if (!entries.some(({ item }) => item.type === "compaction" && item.status === "completed")) continue;
        const status = await settledStatus(handle, IDLE_WAIT_MS);
        const userSpoke = entries.some(({ item }) => item.type === "user_message" && !item.text.trimStart().startsWith("/compact"));
        if (this.disposed) return;
        if (status !== "idle" || userSpoke) {
          await mark({ kind: "compacted", by });
          return;
        }
        await handle.send(RESUME_TEXT);
        await mark({ kind: "resumed", by });
        return;
      }
      await mark({ kind: "failed", error: "정리가 끝나지 않았습니다. 한도에 걸렸거나 오류가 났을 수 있습니다." });
    } catch (error) {
      await mark({ kind: "failed", error: errorText(error) }).catch(() => undefined);
    }
  }
}

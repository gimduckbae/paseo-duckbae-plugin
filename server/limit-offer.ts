import type { PaseoApi } from "./paseo-types";
import { randomUUID } from "node:crypto";
import { LIMIT_OFFER_ITEM_KIND, type LimitEvent, type LimitOfferItem } from "../shared/accounts";
import type { HandoffJobs } from "./handoff";
import type { AccountStore, StoredAccount } from "./store";

const CONTINUE_PROMPT = "멈춘 곳부터 이어서 진행해 주세요.";

function row(item: LimitOfferItem) {
  return { type: "plugin" as const, id: `limit-offer-${item.offerId}`, kind: LIMIT_OFFER_ITEM_KIND, version: 1, data: item };
}

export async function offerSwap(paseo: PaseoApi, agentId: string, account: StoredAccount, event: LimitEvent): Promise<void> {
  await paseo.agents.ref(agentId).timeline.append(
    row({
      offerId: randomUUID(),
      provider: account.provider,
      accountId: account.id,
      fromLabel: account.label,
      state: event.state,
      extra: event.extra,
      answer: null,
    }),
  );
}

export type SwapChoice = { kind: "stay" } | { kind: "swap"; accountId: string };

// 카드 내용은 클라이언트가 보낸 것을 쓴다. 서버에 들고 있으면 플러그인을 다시 불러온 뒤 지난 카드에 답할 수 없다.
export async function answerSwap(
  paseo: PaseoApi,
  store: AccountStore,
  handoffs: HandoffJobs,
  input: { agentId: string; offer: LimitOfferItem; choice: SwapChoice },
): Promise<void> {
  const { agentId, offer, choice } = input;
  if (offer.answer) throw new Error("이미 답한 질문입니다.");
  const handle = paseo.agents.ref(agentId);
  if (choice.kind === "stay") {
    await handle.timeline.append(row({ ...offer, answer: { kind: "stay" } }));
    if (offer.extra?.status === "enabled") await handle.send(CONTINUE_PROMPT);
    return;
  }
  const target = store.find(choice.accountId);
  if (target.provider !== offer.provider) throw new Error("같은 서비스의 계정만 고를 수 있습니다.");
  const agent = (await handle.refresh())?.agent;
  if (!agent?.model) throw new Error("에이전트 모델을 알 수 없습니다.");
  const { models } = await paseo.providers.listModels(agent.provider).catch(() => ({ models: [] }));
  const modelLabel = models?.find((model) => model.id === agent.model)?.label ?? agent.model;
  await handoffs.start(paseo, { agentId, accountId: target.id, model: `${agent.provider}/${agent.model}`, modelLabel });
  await store.activate(target.id);
  await handle.timeline.append(row({ ...offer, answer: { kind: "swap", accountId: target.id, label: target.label } }));
}

import type { PluginServerContext, PluginTurnOutcome } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import { providerFamily } from "../shared/accounts";
import type { AccountService } from "./account-service";
import type { CompactOffers } from "./compact-offer";
import type { QuestionAuto } from "./question-auto";
import type { HandoffJobs } from "./handoff";
import type { PluginUpdater } from "./updater";
import { isObject } from "./json-lines";
import { offerSwap } from "./limit-offer";
import { QUESTION_GUIDE } from "./question-guide";

// Paseo는 한도 오류를 따로 분류하지 않는다. Claude 한도는 "정상 완료" 턴의 마지막 답변에만
// 문구가 남는 경우가 있어 실패 메시지와 마지막 답변을 모두 검사한다(Paseo 0.11.4 소스 확인).
// 로그인 만료(Claude Code "Login expired · Please run /login" 등). 한도와 달리 다시 로그인해야 풀린다.
const LOGIN_EXPIRED_PATTERN = /login expired|please run \/login|oauth token (has been )?(revoked|expired)|refresh token.*(expired|revoked)/i;

// 월 지출 상한: Claude Code는 "You've hit your monthly spend limit."(채널은 "your channel's monthly"), API는 enforced_spend_limit_reached.
const LIMIT_PATTERN =
  /usage limit|rate limit|hit your limit|limit reached|out of credits|credit balance is too low|plan usage limit|usage_limit_reached|usage_pool_exhausted|usage pool exhausted|hit your (channel's )?monthly spend limit|spend_limit_reached/i;

async function latestAssistantText(paseo: PaseoApi, agentId: string): Promise<string> {
  const page = await paseo.agents.ref(agentId).timeline.refetch({ direction: "tail", limit: 6 });
  const items: unknown[] = isObject(page) && Array.isArray(page.entries) ? page.entries.map((entry) => (isObject(entry) ? entry.item : null)) : [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (isObject(item) && item.type === "assistant_message" && typeof item.text === "string") return item.text;
  }
  return "";
}

function outcomeText(outcome: PluginTurnOutcome): string {
  return outcome.kind === "failed" ? outcome.error.message : "";
}

export function registerHooks(
  server: PluginServerContext,
  service: AccountService,
  handoffs: HandoffJobs,
  compact: CompactOffers,
  questionAuto: QuestionAuto,
  updater: PluginUpdater,
): void {
  // 커밋 메시지·PR 작성 같은 내부 에이전트는 사용자에게 묻지 않는다.
  server.before("agent.create", ({ request }) => {
    if (request.config.internal) return request;
    const systemPrompt = [request.config.systemPrompt, QUESTION_GUIDE].filter(Boolean).join("\n\n");
    return { ...request, config: { ...request.config, systemPrompt } };
  });

  server.before("agent.session_open", async ({ request }) => {
    const provider = providerFamily(request.provider);
    if (!provider) return request;
    // env는 에이전트 설정에 저장되지 않아 재개·다시 불러오기 때마다 빈 값으로 온다. 매번 지금 계정을 넣는다.
    const fresh = request.reason === "create" || request.reason === "import";
    return { ...request, env: { ...request.env, ...(await service.launchEnv(provider, request.agentId, fresh)) } };
  });

  server.on("agent.closed", ({ agent }) => {
    service.forgetAgent(agent.id);
    compact.forget(agent.id);
    questionAuto.forget(agent.id);
  });

  server.on("agent.turn_started", async ({ agent }, { paseo }) => {
    await Promise.all([compact.onTurnStarted(paseo, agent.id), questionAuto.onTurnStarted(agent.id)]);
  });

  server.on("agent.permission_requested", ({ agent, request }, { paseo }) => questionAuto.onPermission(paseo, agent.id, request));
  server.on("agent.permission_resolved", ({ agent, requestId }) => questionAuto.onPermissionResolved(agent.id, requestId));

  server.on("agent.turn_ended", async ({ agent, outcome }, { paseo }) => {
    const account = service.accountOfAgent(agent.id);
    if (account?.credential.kind === "api_key") {
      const handle = paseo.agents.ref(agent.id);
      await handle.refresh();
      const cost = handle.lastUsage?.totalCostUsd;
      if (typeof cost === "number") await service.recordCost(account, agent.id, cost);
    }
    if (outcome.kind === "canceled" || handoffs.isWriting(agent.id)) return;
    const reply = await latestAssistantText(paseo, agent.id);
    const text = `${outcomeText(outcome)}\n${reply}`;
    const expired = LOGIN_EXPIRED_PATTERN.exec(text);
    const match = expired ?? LIMIT_PATTERN.exec(text);
    // 한도에 걸린 대화는 정리도 같은 한도를 쓰므로 묻지 않는다. 계정을 플러그인이 관리하지 않는 에이전트도 정리는 묻는다.
    if (!match) {
      if (await questionAuto.afterTurn(paseo, agent.id, reply)) return;
      await compact.afterTurn(paseo, agent);
      await updater.afterTurn(paseo, agent);
      return;
    }
    if (!account) return;
    const event = await service.handleLimit(account, expired ? "로그인 만료" : match[0], expired ? "needs_login" : "limited");
    if (event && service.swapOffer) await offerSwap(paseo, agent.id, account, event);
  });
}

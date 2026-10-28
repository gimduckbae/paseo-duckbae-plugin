import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  activateRpc,
  handoffRemoveRpc,
  handoffSeenRpc,
  handoffStartRpc,
  limitOfferAnswerRpc,
  addClaudeApiKeyRpc,
  addClaudeLoginRpc,
  claudeLoginFinishRpc,
  claudeLoginStartRpc,
  deviceLoginStartRpc,
  deviceLoginStatusRpc,
  overviewRpc,
  removeAccountRpc,
  renameAccountRpc,
  setAdminKeyRpc,
  setClaudeTokenRpc,
  setMonthlyCreditRpc,
  setQuestionAutoRpc,
  setSwapOfferRpc,
} from "./shared/accounts";
import { compactOfferAnswerRpc, setCompactAutoRpc, setCompactThresholdRpc } from "./shared/compact";
import { questionAnswerRpc, questionAnswersListRpc, questionAutoStopRpc } from "./shared/question";
import { updateApplyRpc, updateCheckRpc, updateModeSetRpc, updateOfferAnswerRpc, updateStatusRpc } from "./shared/update";
import { join } from "node:path";
import { AccountService } from "./server/account-service";
import { CompactOffers } from "./server/compact-offer";
import { HandoffJobs } from "./server/handoff";
import { registerHooks } from "./server/hooks";
import { answerSwap } from "./server/limit-offer";
import { QuestionAuto } from "./server/question-auto";
import { QuestionStore } from "./server/questions";
import { PluginUpdater } from "./server/updater";
import { settleWithin } from "./server/json-lines";
import { AccountStore } from "./server/store";

const USAGE_REFRESH_MS = 5 * 60 * 1000;
const AGENT_LIST_WAIT_MS = 2_000;

export default function contribute(server: PluginServerContext) {
  const store = new AccountStore();
  const service = new AccountService(store);
  const handoffs = new HandoffJobs(store, service);
  service.handoffList = () => handoffs.list();
  const questions = new QuestionStore(join(store.root, "question-answers.json"));
  const compact = new CompactOffers(store);
  const questionAuto = new QuestionAuto(store, questions);
  const questionState = (agentId: string) => ({ ...questions.list(agentId), pending: questionAuto.pendingOf(agentId) });
  const updater = new PluginUpdater(store, () => service.loginPending || handoffs.list().some((job) => job.status === "pending"));
  const ready = Promise.all([store.load(), questions.load()]);
  let timer: NodeJS.Timeout | null = null;

  void ready.then(() => {
    timer = setInterval(() => void service.refreshUsage(), USAGE_REFRESH_MS);
    updater.start();
    return service.refreshUsage();
  });

  registerHooks(server, service, handoffs, compact, questionAuto, updater);

  server.handle(overviewRpc, async ({ refresh }, { paseo }) => {
    await ready;
    // 에이전트 목록이 늦으면 지난 값으로 답한다. overview가 늦으면 알약·사이드바가 함께 멈춘다.
    await settleWithin(service.refreshOpenAgents(paseo), AGENT_LIST_WAIT_MS);
    await updater.flushCards(paseo);
    return service.overview(refresh);
  });
  server.handle(activateRpc, async ({ accountId }) => {
    await ready;
    await store.activate(accountId);
    return service.overview(false);
  });
  server.handle(setSwapOfferRpc, async ({ enabled }) => {
    await ready;
    await store.setSwapOffer(enabled);
    return service.overview(false);
  });
  server.handle(renameAccountRpc, async ({ accountId, label }) => {
    await ready;
    await store.rename(accountId, label);
    return service.overview(false);
  });
  server.handle(removeAccountRpc, async ({ accountId }) => {
    await ready;
    await store.remove(accountId);
    return service.overview(false);
  });
  server.handle(addClaudeLoginRpc, async (input) => {
    await ready;
    await store.addClaudeLogin(input);
    return service.overview(true);
  });
  server.handle(addClaudeApiKeyRpc, async (input) => {
    await ready;
    await store.addClaudeApiKey(input);
    return service.overview(true);
  });
  server.handle(setClaudeTokenRpc, async ({ accountId, token }) => {
    await ready;
    await store.setClaudeToken(accountId, token);
    return service.overview(false);
  });
  server.handle(setAdminKeyRpc, async ({ accountId, adminKey }) => {
    await ready;
    await service.setAdminKey(accountId, adminKey);
    return service.overview(false);
  });
  server.handle(setMonthlyCreditRpc, async ({ accountId, monthlyCredit }) => {
    await ready;
    await store.setMonthlyCredit(accountId, monthlyCredit);
    return service.overview(false);
  });
  server.handle(claudeLoginStartRpc, async ({ accountId }) => {
    await ready;
    return service.startClaudeLogin(accountId);
  });
  server.handle(claudeLoginFinishRpc, ({ loginId, code }) => service.finishClaudeLogin(loginId, code));
  server.handle(deviceLoginStartRpc, async ({ provider, label, accountId }) => {
    await ready;
    return service.startDeviceLogin(provider, label, accountId);
  });
  server.handle(deviceLoginStatusRpc, ({ loginId }) => service.deviceLoginStatus(loginId));
  server.handle(handoffStartRpc, async (request, { paseo }) => {
    await ready;
    return { jobId: await handoffs.start(paseo, request) };
  });
  server.handle(handoffSeenRpc, async ({ jobId }) => {
    handoffs.markSeen(jobId);
    return service.overview(false);
  });
  server.handle(limitOfferAnswerRpc, async (input, { paseo }) => {
    await ready;
    await answerSwap(paseo, store, handoffs, input);
    return { ok: true as const };
  });
  server.handle(setCompactAutoRpc, async ({ enabled }, { paseo }) => {
    await ready;
    await store.setCompactAuto(enabled);
    await compact.setAuto(paseo, enabled);
    return service.overview(false);
  });
  server.handle(setCompactThresholdRpc, async ({ percent }) => {
    await ready;
    await store.setCompactThreshold(percent);
    return service.overview(false);
  });
  server.handle(compactOfferAnswerRpc, async (input, { paseo }) => {
    await compact.answer(paseo, input);
    return { ok: true as const };
  });
  server.handle(setQuestionAutoRpc, async ({ mode }) => {
    await ready;
    await store.setQuestionAuto(mode);
    return service.overview(false);
  });
  server.handle(questionAnswersListRpc, async ({ agentId }) => {
    await ready;
    return questionState(agentId);
  });
  server.handle(questionAnswerRpc, async (input, { paseo }) => {
    await ready;
    // 사람이 보내면 기다리던 자동 답변은 멈춘다.
    await questionAuto.stop(input.agentId, input.key);
    await questions.answer(paseo, input);
    return questionState(input.agentId);
  });
  server.handle(questionAutoStopRpc, async ({ agentId, key }) => {
    await ready;
    await questionAuto.stop(agentId, key);
    return questionState(agentId);
  });
  server.handle(handoffRemoveRpc, async ({ jobId }) => {
    handoffs.remove(jobId);
    return service.overview(false);
  });
  server.handle(updateStatusRpc, async (_input, { paseo }) => {
    await ready;
    await updater.flushCards(paseo);
    return updater.status();
  });
  server.handle(updateCheckRpc, async () => {
    await ready;
    await updater.check();
    return updater.status();
  });
  server.handle(updateApplyRpc, async () => {
    await ready;
    await updater.apply(null);
    return updater.status();
  });
  server.handle(updateModeSetRpc, async ({ mode, card }, { paseo }) => {
    await ready;
    if (card) await updater.answerAsk(paseo, mode, card);
    else await updater.setMode(mode);
    return updater.status();
  });
  server.handle(updateOfferAnswerRpc, async ({ agentId, item, choice }, { paseo }) => {
    await ready;
    if (item.kind !== "offer") throw new Error("업데이트 알림 카드가 아닙니다.");
    await updater.answerOffer(paseo, agentId, item, choice);
    return updater.status();
  });

  return async () => {
    if (timer) clearInterval(timer);
    compact.dispose();
    questionAuto.dispose();
    updater.dispose();
    await service.dispose();
  };
}

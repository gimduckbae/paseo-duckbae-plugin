import { useRpc, type PluginClientContext } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activateRpc, installTranslatorRpc, overviewRpc, removeAccountRpc, setQuestionAutoRpc, setReasoningTranslateRpc, setSwapOfferRpc, type Overview } from "../shared/accounts";
import { isInstalling } from "../shared/reasoning";
import { setCompactAutoRpc, setCompactThresholdRpc } from "../shared/compact";
import type { QuestionAutoMode } from "../shared/question";

export const OVERVIEW_KEY = ["paseo-duckbae-plugin", "overview"] as const;

export function useOverview() {
  const overview = useRpc(overviewRpc);
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => overview({ refresh: false }),
    refetchInterval: (query) => pollMs(query.state.data),
  });
}

// 이어가기가 끝난 것과 번역기를 받는 진행은 바로 보여야 한다. 그 밖에는 30초면 된다.
function pollMs(data: Overview | undefined): number {
  if (data?.handoffs.some((job) => job.status === "pending")) return 3_000;
  if (data && isInstalling(data.reasoning.translator)) return 1_500;
  return 30_000;
}

export function useAccountActions() {
  const queryClient = useQueryClient();
  const overview = useRpc(overviewRpc);
  const activate = useRpc(activateRpc);
  const setSwapOffer = useRpc(setSwapOfferRpc);
  const setCompactAuto = useRpc(setCompactAutoRpc);
  const setCompactThreshold = useRpc(setCompactThresholdRpc);
  const setQuestionAuto = useRpc(setQuestionAutoRpc);
  const setReasoningTranslate = useRpc(setReasoningTranslateRpc);
  const installTranslator = useRpc(installTranslatorRpc);
  const remove = useRpc(removeAccountRpc);
  const onSuccess = (data: Overview) => queryClient.setQueryData(OVERVIEW_KEY, data);
  return {
    refresh: useMutation({ mutationFn: () => overview({ refresh: true }), onSuccess }),
    activate: useMutation({ mutationFn: (accountId: string) => activate({ accountId }), onSuccess }),
    setSwapOffer: useMutation({ mutationFn: (enabled: boolean) => setSwapOffer({ enabled }), onSuccess }),
    setCompactAuto: useMutation({ mutationFn: (enabled: boolean) => setCompactAuto({ enabled }), onSuccess }),
    setCompactThreshold: useMutation({ mutationFn: (percent: number) => setCompactThreshold({ percent }), onSuccess }),
    setQuestionAuto: useMutation({ mutationFn: (mode: QuestionAutoMode) => setQuestionAuto({ mode }), onSuccess }),
    setReasoningTranslate: useMutation({ mutationFn: (enabled: boolean) => setReasoningTranslate({ enabled }), onSuccess }),
    installTranslator: useMutation({ mutationFn: () => installTranslator({}), onSuccess }),
    remove: useMutation({ mutationFn: (accountId: string) => remove({ accountId }), onSuccess }),
  };
}

// 플러그인 RPC가 데몬에서 시간 초과로 끊길 때(2026-10-26 daemon.log) 요청이 끝나지 않으면, 이 결과를 기다려 다음 조회를 예약하는
// 알약·머리글 버튼이 계속 멈춰 있었다. 기다리는 시간을 직접 자르고, 실패하면 null을 돌려준다.
const OVERVIEW_WAIT_MS = 20_000;

export function fetchOverview(client: PluginClientContext): Promise<Overview | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), OVERVIEW_WAIT_MS);
  });
  return Promise.race([client.rpc(overviewRpc, { refresh: false }), timeout])
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

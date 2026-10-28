import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateApplyRpc, updateCheckRpc, updateModeSetRpc, updateStatusRpc, type UpdateMode, type UpdateStatus } from "../shared/update";

export const UPDATE_KEY = ["paseo-duckbae-plugin", "update"] as const;

export function useUpdateStatus() {
  const status = useRpc(updateStatusRpc);
  return useQuery({
    queryKey: UPDATE_KEY,
    queryFn: () => status({}),
    // 업데이트하면 플러그인이 다시 떠서 그동안 조회가 실패한다. 끝난 것을 바로 보여 주도록 자주 묻는다.
    refetchInterval: (query) => (query.state.data?.applying || query.state.data?.checking || query.state.status === "error" ? 3_000 : 60_000),
  });
}

export function useUpdateActions() {
  const queryClient = useQueryClient();
  const check = useRpc(updateCheckRpc);
  const apply = useRpc(updateApplyRpc);
  const setMode = useRpc(updateModeSetRpc);
  const onSuccess = (data: UpdateStatus) => queryClient.setQueryData(UPDATE_KEY, data);
  return {
    check: useMutation({ mutationFn: () => check({}), onSuccess }),
    apply: useMutation({ mutationFn: () => apply({}), onSuccess }),
    setMode: useMutation({ mutationFn: (mode: UpdateMode) => setMode({ mode }), onSuccess }),
  };
}

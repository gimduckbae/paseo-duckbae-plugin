import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { setClaudeTokenRpc, type AccountView } from "../shared/accounts";
import { Button, CopyLine, Field, Hint } from "./form-parts";
import { OVERVIEW_KEY } from "./use-accounts";

/** 구독 로그인 계정 카드의 1년 토큰 넣기·빼기. 토큰이 있으면 그걸로, 없으면 로그인으로 실행한다. */
export function ClaudeTokenControl({ account, theme }: { account: AccountView; theme: PluginTheme }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const setClaudeToken = useRpc(setClaudeTokenRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (value: string | null) => setClaudeToken({ accountId: account.id, token: value }),
    onSuccess: (data, value) => {
      queryClient.setQueryData(OVERVIEW_KEY, data);
      toast.show(value ? "1년 토큰을 넣었습니다." : "1년 토큰을 뺐습니다. 이제 로그인으로 작업합니다.", { variant: "success" });
      setOpen(false);
      setToken("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  if (account.hasToken) {
    return (
      <Pressable accessibilityRole="button" onPress={() => save.mutate(null)} disabled={save.isPending}>
        <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted, textDecorationLine: "underline" }}>1년 토큰 빼기</Text>
      </Pressable>
    );
  }
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted, textDecorationLine: "underline" }}>1년 토큰 넣기</Text>
      </Pressable>
      <Modal title={`${account.label} · 1년 토큰`} icon={<Icon name="KeyRound" size={18} color={theme.colors.foreground} />} open={open} onOpenChange={setOpen}>
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <Hint theme={theme}>1년 토큰을 넣으면 로그인이 만료돼도 1년 동안 작업이 이어집니다. 터미널(PowerShell 등)에서 아래 명령을 실행하고, 이 계정으로 승인한 뒤 나온 토큰을 붙여 넣으세요.</Hint>
            <CopyLine theme={theme} value="claude setup-token" />
            <Field theme={theme} label="토큰" value={token} onChange={setToken} placeholder="sk-ant-oat01-…" secure />
            <Button theme={theme} primary label="저장" disabled={!token.trim() || save.isPending} onPress={() => save.mutate(token.trim())} />
          </View>
        </Modal.Content>
      </Modal>
    </>
  );
}

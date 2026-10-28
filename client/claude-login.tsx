import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal } from "@getpaseo/plugin/client/react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { claudeLoginFinishRpc, claudeLoginStartRpc } from "../shared/accounts";
import { Button, CopyLine, Field, Hint } from "./form-parts";
import { OVERVIEW_KEY } from "./use-accounts";

export interface ClaudeLoginResult {
  email: string | null;
  tier: string | null;
  draftId: string | null;
}

/** 공식 `claude auth login`을 데몬에서 띄우고, 주소 → 로그인 → 코드 붙여넣기로 끝낸다. */
export function ClaudeBrowserLogin({ theme, accountId, onLoggedIn }: { theme: PluginTheme; accountId: string | null; onLoggedIn(result: ClaudeLoginResult): void }) {
  const start = useRpc(claudeLoginStartRpc);
  const finish = useRpc(claudeLoginFinishRpc);
  const [code, setCode] = useState("");
  const started = useMutation({ mutationFn: () => start({ accountId }) });
  const finished = useMutation({
    mutationFn: async () => {
      const result = await finish({ loginId: started.data?.loginId ?? "", code: code.trim() });
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: (result) => onLoggedIn({ email: result.email, tier: result.tier, draftId: started.data?.draftId ?? null }),
  });

  if (!started.data) {
    return (
      <View style={{ gap: 8 }}>
        <Button theme={theme} label={started.isPending ? "로그인 주소 준비 중…" : "로그인 주소 받기"} disabled={started.isPending} onPress={() => started.mutate()} />
        {started.error ? <Hint theme={theme} tone="danger">{started.error.message}</Hint> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Hint theme={theme}>아래 주소를 열어 로그인한 뒤, 화면에 나온 코드를 붙여 넣으세요. 휴대폰이나 다른 PC에서 열어도 됩니다.</Hint>
      <CopyLine theme={theme} value={started.data.url} />
      <ExternalLink href={started.data.url}>브라우저에서 열기</ExternalLink>
      <Field theme={theme} label="로그인 코드" value={code} onChange={setCode} placeholder="화면에 나온 코드" />
      <Button theme={theme} label={finished.isPending ? "확인 중…" : "확인"} disabled={!code.trim() || finished.isPending} onPress={() => finished.mutate()} />
      {finished.error ? <Hint theme={theme} tone="danger">{finished.error.message}</Hint> : null}
    </View>
  );
}

/** 이미 등록한 계정(1년 토큰만 있는 계정)에 사용량 확인용 로그인을 붙인다. */
export function ClaudeLoginModal({ theme, accountId, label, open, onOpenChange }: { theme: PluginTheme; accountId: string; label: string; open: boolean; onOpenChange(open: boolean): void }) {
  const queryClient = useQueryClient();
  return (
    <Modal title={`${label} 로그인`} icon={<Icon name="LogIn" size={18} color={theme.colors.foreground} />} open={open} onOpenChange={onOpenChange}>
      <Modal.Content>
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 13, color: theme.colors.foreground }}>이 계정으로 로그인하면 사용량과 구독 등급이 보입니다.</Text>
          <ClaudeBrowserLogin
            theme={theme}
            accountId={accountId}
            onLoggedIn={() => {
              void queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
              onOpenChange(false);
            }}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}

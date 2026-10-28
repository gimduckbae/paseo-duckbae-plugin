import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { setAdminKeyRpc, setMonthlyCreditRpc, type AccountView } from "../shared/accounts";
import { usageColor } from "./format";
import { Button, Field, Hint, parseDollars } from "./form-parts";
import { OVERVIEW_KEY } from "./use-accounts";

const CONSOLE_BILLING_URL = "https://platform.claude.com/settings/billing";
const ADMIN_KEY_DOCS_URL = "https://platform.claude.com/docs/en/manage-claude/admin-api-keys";

function dollars(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** API 키 계정 카드 본문. 잔액 조회 API는 없어 사용액만 보여 준다. */
export function ApiSpend({ account, theme }: { account: AccountView; theme: PluginTheme }) {
  const [editing, setEditing] = useState(false);
  const used = account.spend?.usd ?? 0;
  const official = account.spend?.source === "console";
  const credit = account.monthlyCredit;
  const percent = credit ? Math.min(100, (used / credit) * 100) : null;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{official ? "이번 달 사용" : "이번 달 사용 추정"}</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"], color: theme.colors.foreground }}>{dollars(used)}</Text>
        {credit ? <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>/ {dollars(credit)}</Text> : null}
      </View>
      {percent !== null ? (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surface2, overflow: "hidden" }}>
          <View style={{ width: `${percent}%`, height: 6, borderRadius: 3, backgroundColor: usageColor(theme, percent) }} />
        </View>
      ) : null}
      <Hint theme={theme}>
        {official
          ? "Console에 나온 이번 달 조직 전체 사용액입니다."
          : "Paseo에서 쓴 만큼만 계산한 대략의 금액입니다. 정확한 금액은 Console에서 보세요."}
      </Hint>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 14, rowGap: 6 }}>
        <ExternalLink href={CONSOLE_BILLING_URL}>Console 잔액 보기</ExternalLink>
        <Pressable accessibilityRole="button" onPress={() => setEditing(true)}>
          <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted, textDecorationLine: "underline" }}>
            {credit ? "월 크레딧 바꾸기" : "월 크레딧 설정"}
          </Text>
        </Pressable>
        <AdminKeyControl account={account} theme={theme} />
      </View>
      <MonthlyCreditModal account={account} theme={theme} open={editing} onOpenChange={setEditing} />
    </View>
  );
}

/** 일반 API 키로 사용액을 조회할 수 없을 때 같은 조직의 Admin 키로 대신 조회한다. */
function AdminKeyControl({ account, theme }: { account: AccountView; theme: PluginTheme }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const setAdminKey = useRpc(setAdminKeyRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (value: string | null) => setAdminKey({ accountId: account.id, adminKey: value }),
    onSuccess: (data, value) => {
      queryClient.setQueryData(OVERVIEW_KEY, data);
      toast.show(value ? "Admin 키를 연결했습니다." : "Admin 키를 뺐습니다.", { variant: "success" });
      setOpen(false);
      setKey("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  const linkStyle = { fontSize: 12, color: theme.colors.foregroundMuted, textDecorationLine: "underline" } as const;

  if (account.hasAdminKey) {
    return (
      <Pressable accessibilityRole="button" onPress={() => save.mutate(null)} disabled={save.isPending}>
        <Text style={linkStyle}>Admin 키 빼기</Text>
      </Pressable>
    );
  }
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
        <Text style={linkStyle}>Admin 키 연결</Text>
      </Pressable>
      <Modal title={`${account.label} · Admin 키`} icon={<Icon name="KeyRound" size={18} color={theme.colors.foreground} />} open={open} onOpenChange={setOpen}>
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <Hint theme={theme}>
              Admin 키를 넣으면 Console에 나온 정확한 사용액을 보여 줍니다. 조직 관리자만 만들 수 있고, 개인 계정에서는 쓸 수 없습니다.
            </Hint>
            <ExternalLink href={ADMIN_KEY_DOCS_URL}>Admin 키 만드는 법</ExternalLink>
            <Field theme={theme} label="Admin 키" value={key} onChange={setKey} placeholder="sk-ant-admin01-…" secure />
            <Button theme={theme} primary label={save.isPending ? "확인 중…" : "저장"} disabled={!key.trim() || save.isPending} onPress={() => save.mutate(key.trim())} />
          </View>
        </Modal.Content>
      </Modal>
    </>
  );
}

function MonthlyCreditModal({ account, theme, open, onOpenChange }: { account: AccountView; theme: PluginTheme; open: boolean; onOpenChange(open: boolean): void }) {
  const [text, setText] = useState(account.monthlyCredit ? String(account.monthlyCredit) : "");
  const setCredit = useRpc(setMonthlyCreditRpc);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => setCredit({ accountId: account.id, monthlyCredit: parseDollars(text) }),
    onSuccess: (data) => {
      queryClient.setQueryData(OVERVIEW_KEY, data);
      onOpenChange(false);
    },
  });
  return (
    <Modal title="월 크레딧" icon={<Icon name="Wallet" size={18} color={theme.colors.foreground} />} open={open} onOpenChange={onOpenChange}>
      <Modal.Content>
        <View style={{ gap: 12 }}>
          <Hint theme={theme}>구독에 딸린 월 크레딧입니다. Max 5x는 $100, Max 20x는 $200입니다. 비워 두면 사용액만 보여 줍니다.</Hint>
          <Field theme={theme} label="달러" value={text} onChange={setText} placeholder="예: 200" numeric />
          <Button theme={theme} primary label="저장" disabled={save.isPending} onPress={() => save.mutate()} />
        </View>
      </Modal.Content>
    </Modal>
  );
}

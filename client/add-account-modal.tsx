import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText, Icon, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { addClaudeApiKeyRpc, addClaudeLoginRpc, deviceLoginStartRpc, deviceLoginStatusRpc, type DeviceLoginProvider, type Overview } from "../shared/accounts";
import { ClaudeBrowserLogin, type ClaudeLoginResult } from "./claude-login";
import { Button, CopyLine, Field, Hint, parseDollars, Step, StepTitle } from "./form-parts";
import { Paragraph } from "./paragraph";
import { OVERVIEW_KEY } from "./use-accounts";

type Method = "claude_token" | "claude_api" | "codex" | "grok";

const METHODS: { id: Method; label: string }[] = [
  { id: "claude_token", label: "Claude 구독" },
  { id: "claude_api", label: "Claude API" },
  { id: "codex", label: "Codex 구독" },
  { id: "grok", label: "Grok 구독" },
];

interface AddAccountModalProps {
  theme: PluginTheme;
  open: boolean;
  onOpenChange(open: boolean): void;
  initialMethod?: Method;
}

export function AddAccountModal({ theme, open, onOpenChange, initialMethod = "claude_token" }: AddAccountModalProps) {
  const [method, setMethod] = useState<Method>(initialMethod);
  const close = () => onOpenChange(false);
  return (
    <Modal title="계정 추가" icon={<Icon name="UserPlus" size={18} color={theme.colors.foreground} />} open={open} onOpenChange={onOpenChange}>
      <Modal.Content>
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: "row", gap: 6, padding: 3, borderRadius: 8, backgroundColor: theme.colors.surface2 }}>
            {METHODS.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: method === item.id }}
                onPress={() => setMethod(item.id)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 7,
                  borderRadius: 6,
                  backgroundColor: method === item.id ? theme.colors.surface0 : "transparent",
                }}
              >
                <Text style={{ fontSize: 13, color: method === item.id ? theme.colors.foreground : theme.colors.foregroundMuted }}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {method === "claude_token" ? <ClaudeSubscriptionForm theme={theme} onDone={close} /> : null}
          {method === "claude_api" ? <ClaudeApiForm theme={theme} onDone={close} /> : null}
          {method === "codex" || method === "grok" ? <DeviceLogin key={method} theme={theme} provider={method} onDone={close} /> : null}
        </View>
      </Modal.Content>
    </Modal>
  );
}

function useSaveAccount<Input>(save: (input: Input) => Promise<Overview>, label: (input: Input) => string, onDone: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: save,
    onSuccess: (data, input) => {
      queryClient.setQueryData(OVERVIEW_KEY, data);
      toast.show(`${label(input)} 계정을 추가했습니다.`, { variant: "success" });
      onDone();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
}

function ClaudeSubscriptionForm({ theme, onDone }: { theme: PluginTheme; onDone(): void }) {
  const [login, setLogin] = useState<ClaudeLoginResult | null>(null);
  const [label, setLabel] = useState("");
  const [withToken, setWithToken] = useState(false);
  const [token, setToken] = useState("");
  const save = useSaveAccount(useRpc(addClaudeLoginRpc), (input) => input.label, onDone);
  const draftId = login?.draftId ?? null;

  return (
    <View style={{ gap: 16 }}>
      <Step theme={theme} index={1} done={login !== null}>
        <StepTitle theme={theme}>브라우저로 로그인</StepTitle>
        {login ? (
          <Hint theme={theme}>{[login.email, login.tier].filter(Boolean).join(" · ") || "로그인했습니다."}</Hint>
        ) : (
          <ClaudeBrowserLogin
            theme={theme}
            accountId={null}
            onLoggedIn={(result) => {
              setLogin(result);
              if (!label && result.email) setLabel(result.email.split("@")[0] ?? "");
            }}
          />
        )}
      </Step>
      <Step theme={theme} index={2} done={withToken && token.trim().length > 0}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <StepTitle theme={theme}>1년 토큰 (선택)</StepTitle>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" onPress={() => setWithToken(!withToken)}>
            <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted, textDecorationLine: "underline" }}>{withToken ? "넣지 않기" : "넣기"}</Text>
          </Pressable>
        </View>
        <Hint theme={theme}>
          로그인만 해도 바로 쓸 수 있습니다. 1년 토큰을 넣으면 로그인이 만료돼도 1년 동안 작업이 이어집니다. 나중에 넣어도 됩니다.
        </Hint>
        {withToken ? (
          <>
            <Hint theme={theme}>터미널(PowerShell 등)에서 아래 명령을 실행하고, 1번에서 로그인한 계정으로 승인한 뒤 나온 토큰을 붙여 넣으세요.</Hint>
            <CopyLine theme={theme} value="claude setup-token" />
            <Field theme={theme} label="토큰" value={token} onChange={setToken} placeholder="sk-ant-oat01-…" secure />
          </>
        ) : null}
      </Step>
      <Field theme={theme} label="이름" value={label} onChange={setLabel} placeholder="예: 업무 Max" />
      <Button
        theme={theme}
        primary
        label="저장"
        disabled={!draftId || !label.trim() || (withToken && !token.trim()) || save.isPending}
        onPress={() => draftId && save.mutate({ label: label.trim(), draftId, token: withToken && token.trim() ? token.trim() : null })}
      />
    </View>
  );
}

function ClaudeApiForm({ theme, onDone }: { theme: PluginTheme; onDone(): void }) {
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [credit, setCredit] = useState("");
  const save = useSaveAccount(useRpc(addClaudeApiKeyRpc), (input) => input.label, onDone);
  return (
    <View style={{ gap: 14 }}>
      <Hint theme={theme}>
        구독의 월 크레딧이 들어오는 Claude Console 조직에서 API 키를 만들어 넣으세요. 구독 한도를 다 쓰면 이 키로 이어갈 수 있습니다. 카드 결제를 막으려면 Console의 자동 충전을 꺼 두세요.
      </Hint>
      <Field theme={theme} label="이름" value={label} onChange={setLabel} placeholder="예: 업무 Max API" />
      <Field theme={theme} label="API 키" value={key} onChange={setKey} placeholder="sk-ant-api03-…" secure />
      <Field theme={theme} label="월 크레딧 (달러, 선택)" value={credit} onChange={setCredit} placeholder="Max 5x는 100, Max 20x는 200" numeric />
      <Button
        theme={theme}
        primary
        label="저장"
        disabled={!label.trim() || !key.trim() || save.isPending}
        onPress={() => save.mutate({ label: label.trim(), apiKey: key.trim(), monthlyCredit: parseDollars(credit) })}
      />
    </View>
  );
}

const DEVICE_LOGIN_TEXT: Record<DeviceLoginProvider, { intro: string; placeholder: string }> = {
  codex: { intro: "ChatGPT 계정으로 로그인합니다. 휴대폰이나 다른 PC에서 해도 됩니다.", placeholder: "예: 개인 Pro" },
  grok: { intro: "SuperGrok 또는 X Premium+ 계정으로 로그인합니다. 휴대폰이나 다른 PC에서 해도 됩니다.", placeholder: "예: 개인 SuperGrok" },
};

/** 이미 있는 계정에 다시 로그인하는 창. 로그인 파일이 만료·손상된 Codex·Grok 계정에 쓴다. */
export function DeviceReloginModal(props: {
  theme: PluginTheme;
  provider: DeviceLoginProvider;
  accountId: string;
  label: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { theme } = props;
  return (
    <Modal title={`${props.label} 다시 로그인`} icon={<Icon name="LogIn" size={18} color={theme.colors.foreground} />} open={props.open} onOpenChange={props.onOpenChange}>
      <Modal.Content>
        {props.open ? (
          <DeviceLogin theme={theme} provider={props.provider} existing={{ id: props.accountId, label: props.label }} onDone={() => props.onOpenChange(false)} />
        ) : null}
      </Modal.Content>
    </Modal>
  );
}

function DeviceLogin({
  theme,
  provider,
  existing,
  onDone,
}: {
  theme: PluginTheme;
  provider: DeviceLoginProvider;
  existing?: { id: string; label: string };
  onDone(): void;
}) {
  const [name, setName] = useState("");
  const label = existing?.label ?? name;
  const start = useRpc(deviceLoginStartRpc);
  const status = useRpc(deviceLoginStatusRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const login = useMutation({ mutationFn: () => start({ provider, label: label.trim(), accountId: existing?.id }) });
  const loginId = login.data?.loginId;
  const poll = useQuery({
    queryKey: ["paseo-duckbae-plugin", "device-login", loginId],
    queryFn: async () => {
      const result = await status({ loginId: loginId ?? "" });
      if (result.status === "completed") {
        await queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
        toast.show(existing ? `${label.trim()} 계정에 다시 로그인했습니다.` : `${label.trim()} 계정을 추가했습니다.`, { variant: "success" });
        onDone();
      }
      return result;
    },
    enabled: Boolean(loginId),
    refetchInterval: (query) => (query.state.data?.status === "pending" || !query.state.data ? 2000 : false),
  });

  if (!login.data) {
    return (
      <View style={{ gap: 14 }}>
        <Hint theme={theme}>{DEVICE_LOGIN_TEXT[provider].intro}</Hint>
        {existing ? null : <Field theme={theme} label="이름" value={name} onChange={setName} placeholder={DEVICE_LOGIN_TEXT[provider].placeholder} />}
        <Button theme={theme} primary label={login.isPending ? "코드 받는 중…" : "로그인 코드 받기"} disabled={!label.trim() || login.isPending} onPress={() => login.mutate()} />
        {login.error ? <Hint theme={theme} tone="danger">{login.error.message}</Hint> : null}
      </View>
    );
  }
  const failed = poll.data?.status === "failed" ? poll.data.error : null;
  return (
    <View style={{ gap: 14 }}>
      <Step theme={theme} index={1}>
        <StepTitle theme={theme}>아래 주소를 열어 로그인하세요.</StepTitle>
        <CopyLine theme={theme} value={login.data.verificationUrl} />
      </Step>
      <Step theme={theme} index={2}>
        <StepTitle theme={theme}>이 코드를 입력하세요.</StepTitle>
        <Pressable accessibilityRole="button" accessibilityLabel="로그인 코드 복사" onPress={() => void copyText(login.data.userCode)}>
          <Text style={{ fontSize: 26, fontWeight: "700", letterSpacing: 4, color: theme.colors.foreground }}>{login.data.userCode}</Text>
        </Pressable>
      </Step>
      <Paragraph style={{ fontSize: 12, color: failed ? theme.colors.statusDanger : theme.colors.foregroundMuted }}>
        {failed ?? "로그인을 기다리는 중입니다. 끝나면 이 창이 저절로 닫힙니다."}
      </Paragraph>
    </View>
  );
}

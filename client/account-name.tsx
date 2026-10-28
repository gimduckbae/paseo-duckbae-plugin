import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { renameAccountRpc, type AccountView } from "../shared/accounts";
import { OVERVIEW_KEY } from "./use-accounts";

/** 카드 제목. 연필을 누르면 그 자리에서 이름을 바꾼다(Enter 저장, Esc·✕ 취소). */
export function AccountName({ account, theme }: { account: AccountView; theme: PluginTheme }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(account.label);
  const rename = useRpc(renameAccountRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => rename({ accountId: account.id, label: text.trim() }),
    onSuccess: (data) => {
      queryClient.setQueryData(OVERVIEW_KEY, data);
      setEditing(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });
  const cancel = () => {
    setText(account.label);
    setEditing(false);
  };
  const submit = () => {
    if (!text.trim() || text.trim() === account.label) cancel();
    else save.mutate();
  };

  if (!editing) {
    return (
      <View style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: "600", color: theme.colors.foreground }} numberOfLines={1}>
          {account.label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${account.label} 이름 바꾸기`}
          hitSlop={6}
          onPress={() => {
            setText(account.label);
            setEditing(true);
          }}
        >
          <Icon name="Pencil" size={12} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        selectTextOnFocus
        maxLength={40}
        onSubmitEditing={submit}
        onKeyPress={(event) => {
          if (event.nativeEvent.key === "Escape") cancel();
        }}
        style={{
          flex: 1,
          minWidth: 0,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: theme.colors.accent,
          fontSize: 14,
          fontWeight: "600",
          color: theme.colors.foreground,
        }}
      />
      <Pressable accessibilityRole="button" accessibilityLabel="이름 저장" hitSlop={6} disabled={save.isPending} onPress={submit}>
        <Icon name="Check" size={15} color={theme.colors.statusSuccess} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="이름 바꾸기 취소" hitSlop={6} onPress={cancel}>
        <Icon name="X" size={15} color={theme.colors.foregroundMuted} />
      </Pressable>
    </View>
  );
}

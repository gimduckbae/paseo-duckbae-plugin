import type { PluginTheme } from "@getpaseo/plugin";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { COMPACT_THRESHOLD_PRESETS, compactThresholdSchema } from "../shared/compact";
import { Hint } from "./form-parts";

export function Chip(props: { theme: PluginTheme; label: string; selected: boolean; disabled: boolean; onPress(): void }) {
  const { theme, selected } = props;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? `${theme.colors.accent}1F` : "transparent",
      }}
    >
      <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: selected ? "600" : "400", color: theme.colors.foreground }}>{props.label}</Text>
    </Pressable>
  );
}

/** 계정 화면의 정리 제안 기준. 정해 둔 값 몇 개와 직접 입력. */
export function CompactThresholdPicker(props: { theme: PluginTheme; value: number; busy: boolean; onChange(percent: number): void }) {
  const { theme, value } = props;
  const custom = !COMPACT_THRESHOLD_PRESETS.includes(value);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(custom ? String(value) : "");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = compactThresholdSchema.safeParse(Number(text.trim()));
    if (!text.trim() || !parsed.success) {
      setError("5에서 95 사이 숫자를 입력하세요.");
      return;
    }
    setError(null);
    setEditing(false);
    props.onChange(parsed.data);
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted, marginRight: 2 }}>컨텍스트 정리 제안</Text>
        {COMPACT_THRESHOLD_PRESETS.map((preset) => (
          <Chip
            key={preset}
            theme={theme}
            label={`${preset}%`}
            selected={!editing && value === preset}
            disabled={props.busy}
            onPress={() => {
              setEditing(false);
              setError(null);
              props.onChange(preset);
            }}
          />
        ))}
        <Chip
          theme={theme}
          label={custom && !editing ? `직접 입력 · ${value}%` : "직접 입력"}
          selected={editing || custom}
          disabled={props.busy}
          onPress={() => {
            setText(custom ? String(value) : "");
            setEditing(true);
          }}
        />
        {editing ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              autoFocus
              keyboardType="number-pad"
              placeholder="45"
              placeholderTextColor={theme.colors.foregroundMuted}
              style={{
                width: 52,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: error ? theme.colors.statusDanger : theme.colors.border,
                color: theme.colors.foreground,
                fontSize: 12,
                textAlign: "right",
              }}
            />
            <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>%</Text>
            <Pressable
              accessibilityRole="button"
              disabled={props.busy}
              onPress={submit}
              style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: theme.colors.accent }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.accentForeground }}>저장</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {error ? (
        <Hint theme={theme} tone="danger">
          {error}
        </Hint>
      ) : (
        <Hint theme={theme}>
          컨텍스트가 {value}% 이상 차면 정리할지 묻습니다.
        </Hint>
      )}
    </View>
  );
}

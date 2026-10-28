import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Paragraph } from "./paragraph";

export function Step({ theme, index, done, children }: { theme: PluginTheme; index: number; done?: boolean; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: done ? theme.colors.accent : theme.colors.surface2,
        }}
      >
        {done ? (
          <Icon name="Check" size={12} color={theme.colors.accentForeground} />
        ) : (
          <Text style={{ fontSize: 11, color: theme.colors.foreground }}>{index}</Text>
        )}
      </View>
      <View style={{ flex: 1, gap: 8 }}>{children}</View>
    </View>
  );
}

export function StepTitle({ theme, children }: { theme: PluginTheme; children: ReactNode }) {
  return <Paragraph style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foreground }}>{children}</Paragraph>;
}

export function Hint({ theme, tone = "muted", children }: { theme: PluginTheme; tone?: "muted" | "danger"; children: ReactNode }) {
  const color = tone === "danger" ? theme.colors.statusDanger : theme.colors.foregroundMuted;
  return <Paragraph style={{ fontSize: 12, lineHeight: 17, color }}>{children}</Paragraph>;
}

export function CopyLine({ theme, value }: { theme: PluginTheme; value: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="복사"
      onPress={() => void copyText(value)}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, backgroundColor: theme.colors.surface2 }}
    >
      <Text style={{ flex: 1, fontFamily: "monospace", fontSize: 12, color: theme.colors.foreground }} numberOfLines={1}>
        {value}
      </Text>
      <Icon name="Copy" size={13} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

export function Field(props: {
  theme: PluginTheme;
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder: string;
  secure?: boolean;
  numeric?: boolean;
}) {
  const { theme } = props;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor={theme.colors.foregroundMuted}
        secureTextEntry={props.secure}
        keyboardType={props.numeric ? "decimal-pad" : "default"}
        autoCapitalize="none"
        style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, color: theme.colors.foreground, fontSize: 13 }}
      />
    </View>
  );
}

export function Button(props: { theme: PluginTheme; label: string; primary?: boolean; disabled?: boolean; onPress(): void }) {
  const { theme, primary } = props;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        alignItems: "center",
        paddingVertical: primary ? 10 : 8,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: primary ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor: primary ? theme.colors.accent : "transparent",
        opacity: props.disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: primary ? "600" : "400", color: primary ? theme.colors.accentForeground : theme.colors.foreground }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

/** 입력칸의 달러 금액. 비었거나 숫자가 아니면 null. */
export function parseDollars(text: string): number | null {
  const value = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { UsageWindow } from "../shared/accounts";
import { untilReset, usageColor } from "./format";

interface UsageBarProps {
  usage: UsageWindow;
  theme: PluginTheme;
  compact: boolean;
}

export function UsageBar({ usage, theme, compact }: UsageBarProps) {
  const percent = Math.min(100, Math.max(0, usage.usedPercent));
  const reset = untilReset(usage.resetsAt);
  const track = (
    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.colors.surface2, overflow: "hidden" }}>
      <View style={{ width: `${percent}%`, height: 6, borderRadius: 3, backgroundColor: usageColor(theme, percent) }} />
    </View>
  );
  const label = <Text style={{ width: 86, fontSize: 12, color: theme.colors.foregroundMuted }} numberOfLines={1}>{usage.label}</Text>;
  const value = (
    <Text style={{ width: 40, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"], color: theme.colors.foreground }}>
      {Math.round(usage.usedPercent)}%
    </Text>
  );
  const resetText = reset ? (
    <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }} numberOfLines={1}>
      {reset} 초기화
    </Text>
  ) : null;

  if (compact) {
    return (
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {label}
          <View style={{ flex: 1 }} />
          {resetText}
          {value}
        </View>
        {track}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      {label}
      {track}
      {value}
      <View style={{ width: 104, alignItems: "flex-end" }}>{resetText}</View>
    </View>
  );
}

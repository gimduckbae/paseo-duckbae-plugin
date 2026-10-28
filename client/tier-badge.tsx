import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";

export function TierBadge({ theme, tier, borderColor }: { theme: PluginTheme; tier: string; borderColor?: string }) {
  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: borderColor ?? theme.colors.border }}>
      <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }} numberOfLines={1}>
        {tier}
      </Text>
    </View>
  );
}

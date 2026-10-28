// Paseo 앱이 제공하는 @getpaseo/plugin/client/ui 대역. 미리보기 캡처 전용.
import { marked } from "marked";
import type { ComponentType, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { previewTheme, sidebarColors } from "../theme";
import { Icon } from "./plugin-rn";

interface SidebarRowProps {
  icon?: string | ComponentType<{ size: number; color: string }>;
  label?: string;
  onPress(): void;
  active?: boolean;
  trailing?: ReactNode;
}

export function SidebarRow({ icon, label, onPress, active, trailing }: SidebarRowProps) {
  const c = previewTheme.colors;
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: active ? sidebarColors.selected : "transparent" }}
    >
      {typeof icon === "string" ? <Icon name={icon} size={16} color={c.foregroundMuted} /> : null}
      <Text style={{ flex: 1, fontSize: 13, color: c.foreground }}>{label}</Text>
      {trailing}
    </Pressable>
  );
}

export function SidebarSeparator() {
  return <View style={{ height: 1, marginVertical: 6, backgroundColor: previewTheme.colors.border }} />;
}

export function ExternalLink({ children }: { href: string; children: ReactNode }) {
  return <Text style={{ fontSize: 12, color: previewTheme.colors.accent, textDecorationLine: "underline" }}>{children}</Text>;
}

// Paseo의 MarkdownRenderer 대역. 표·목록이 깨지지 않는지만 보려고 marked로 그린다(글꼴·간격은 실제 앱과 다르다).
export function Markdown({ children }: { children: string }) {
  const c = previewTheme.colors;
  const css = `.md{color:${c.foreground};font-size:14px;line-height:22px}.md table{border-collapse:collapse;margin:6px 0}.md th,.md td{border:1px solid ${c.border};padding:4px 8px}.md code{background:${c.surface2};padding:1px 4px;border-radius:4px}.md p{margin:4px 0}`;
  return (
    <div className="md">
      <style>{css}</style>
      <div dangerouslySetInnerHTML={{ __html: marked.parse(children, { async: false }) as string }} />
    </div>
  );
}

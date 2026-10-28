// Paseo 앱이 제공하는 @getpaseo/plugin/client/react-native 대역. 미리보기 캡처 전용.
import { icons } from "lucide-react";
import type { ReactNode } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { previewTheme } from "../theme";

export { ScrollView, TextInput };

export function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const Glyph = icons[name as keyof typeof icons];
  return Glyph ? <Glyph size={size} color={color} strokeWidth={2} /> : null;
}

function ModalRoot({ title, icon, open, children }: { title: string; icon?: ReactNode; open: boolean; onOpenChange(open: boolean): void; children: ReactNode }) {
  if (!open) return null;
  const c = previewTheme.colors;
  return (
    <View style={{ position: "fixed" as "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", zIndex: 50 } as never}>
      <View style={{ width: 520, maxWidth: "92%", borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0 } as never}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderColor: c.border }}>
          {icon}
          <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.foreground }}>{title}</Text>
          <Icon name="X" size={16} color={c.foregroundMuted} />
        </View>
        {children}
      </View>
    </View>
  );
}

function ModalContent({ children }: { children: ReactNode }) {
  return <View style={{ padding: 18 }}>{children}</View>;
}

export const Modal = Object.assign(ModalRoot, { Content: ModalContent });

export function useToast() {
  return { show() {}, error() {} };
}

export async function copyText(): Promise<void> {}

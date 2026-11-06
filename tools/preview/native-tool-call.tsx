// Paseo 기본 도구 호출 카드 재현(0.15.0 `components/message.tsx` expandableBadgeStylesheet,
// `components/tool-call-details.tsx` buildUnknownSections). 비교 캡처 전용이라 플러그인 코드에서는 쓰지 않는다.
import { Text, View } from "react-native";
import { previewTheme } from "./theme";
import { Icon } from "./stubs/plugin-rn";

const c = previewTheme.colors;

function Dump({ title, value }: { title: string; value: unknown }) {
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ fontSize: 14, color: c.foregroundMuted }}>{title}</Text>
      </View>
      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ fontFamily: "monospace", fontSize: 12, lineHeight: 18, color: c.foreground }}>{JSON.stringify(value, null, 2)}</Text>
      </View>
    </>
  );
}

export function NativeToolCall({ name, input, output, expanded }: { name: string; input: unknown; output: unknown; expanded?: boolean }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: "transparent", paddingHorizontal: 8, paddingVertical: 4 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 4 }}>
          <Icon name="Wrench" size={14} color={c.foregroundMuted} />
        </View>
        <Text style={{ flex: 1, fontSize: 14, color: c.foreground }}>{name}</Text>
        <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={14} color={c.foregroundMuted} />
      </View>
      {expanded ? (
        <View style={{ marginTop: -1, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderWidth: 1, borderTopWidth: 0, borderColor: c.border, overflow: "hidden" }}>
          <Dump title="Input" value={input} />
          <Dump title="Output" value={output} />
        </View>
      ) : null}
    </View>
  );
}

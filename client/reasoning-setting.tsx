import type { PluginTheme } from "@getpaseo/plugin";
import { Switch, Text, View } from "react-native";
import type { ReasoningView, TranslatorState } from "../shared/reasoning";
import { Hint } from "./form-parts";

const STATE_LABEL: Record<TranslatorState, string> = {
  missing: "없음",
  loading: "준비 중",
  ready: "준비됨",
  failed: "실패",
};

export function ReasoningSetting(props: { theme: PluginTheme; compact: boolean; value: ReasoningView; busy: boolean; onChange(enabled: boolean): void }) {
  const { theme, value } = props;
  const detail =
    value.translator === "missing"
      ? "번역기 파일이 없어 생각 글을 원문으로 보여 줍니다."
      : value.translator === "failed"
        ? (value.error ?? "번역기를 띄우지 못했습니다.")
        : "에이전트의 생각 글을 한국어로 바꿔 대화에 보여 줍니다.";

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: props.compact ? 1 : undefined, fontSize: 12, color: theme.colors.foregroundMuted }}>추론 훔쳐보기(생각 글 한국어로)</Text>
        <Switch
          value={value.enabled}
          disabled={props.busy}
          onValueChange={props.onChange}
          trackColor={{ true: theme.colors.accent, false: theme.colors.surface2 }}
        />
        <Text style={{ fontSize: 12, color: value.translator === "failed" ? theme.colors.statusDanger : theme.colors.foregroundMuted }}>
          번역기 {STATE_LABEL[value.translator]}
        </Text>
      </View>
      <Hint theme={theme} tone={value.translator === "failed" ? "danger" : "muted"}>
        {detail}
      </Hint>
    </View>
  );
}

import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { QuestionAutoMode } from "../shared/question";
import { Chip } from "./compact-threshold";
import { Hint } from "./form-parts";

const MODES: { mode: QuestionAutoMode; label: string }[] = [
  { mode: "wait", label: "직접 답하기" },
  { mode: "delay", label: "10초 뒤 권장안으로" },
  { mode: "instant", label: "바로 권장안으로" },
];

/** 계정 화면의 에이전트 질문 자동 답변 설정. 모든 에이전트에 같이 쓴다. */
export function QuestionAutoPicker(props: { theme: PluginTheme; value: QuestionAutoMode; busy: boolean; onChange(mode: QuestionAutoMode): void }) {
  const { theme, value } = props;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted, marginRight: 2 }}>에이전트 질문 답변</Text>
        {MODES.map((item) => (
          <Chip key={item.mode} theme={theme} label={item.label} selected={value === item.mode} disabled={props.busy} onPress={() => props.onChange(item.mode)} />
        ))}
      </View>
      {value !== "wait" ? (
        <Hint theme={theme}>
          '확인 필수'가 붙은 질문은 자동으로 답하지 않습니다. 권장안이 없는 질문은 에이전트가 알아서 고릅니다.
        </Hint>
      ) : null}
    </View>
  );
}

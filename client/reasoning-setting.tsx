import type { PluginTheme } from "@getpaseo/plugin";
import { Switch, Text, View } from "react-native";
import { TRANSLATOR_BYTES, translatorPercent, type ReasoningView, type TranslatorState } from "../shared/reasoning";
import { formatMegabytes } from "./format";
import { Button, Hint } from "./form-parts";

const STATE_LABEL: Record<TranslatorState, string> = {
  missing: "없음",
  downloading: "받는 중",
  extracting: "압축 푸는 중",
  loading: "준비 중",
  ready: "준비됨",
  failed: "실패",
};

function stateText(value: ReasoningView): string {
  const percent = translatorPercent(value.download);
  if (value.translator === "downloading" && percent !== null) return `받는 중 ${String(percent)}%`;
  return STATE_LABEL[value.translator];
}

function detailText(value: ReasoningView): string {
  const { download } = value;
  if (value.translator === "downloading") {
    return `번역기를 받습니다. ${formatMegabytes(download.receivedBytes)} / ${formatMegabytes(download.totalBytes)}`;
  }
  if (value.translator === "extracting") return "받은 파일 압축을 풉니다.";
  if (value.translator === "failed") return value.error ?? "번역기를 띄우지 못했습니다.";
  if (value.translator === "missing") {
    if (!download.supported) return "번역기는 윈도 x64만 지원합니다. 생각 글을 원문으로 보여 줍니다.";
    return `켜면 번역기를 받습니다(${formatMegabytes(TRANSLATOR_BYTES)}). 받는 동안에는 생각 글을 원문으로 보여 줍니다.`;
  }
  return "에이전트의 생각 글을 한국어로 바꿔 대화에 보여 줍니다.";
}

export function ReasoningSetting(props: {
  theme: PluginTheme;
  compact: boolean;
  value: ReasoningView;
  busy: boolean;
  installing: boolean;
  onChange(enabled: boolean): void;
  onInstall(): void;
}) {
  const { theme, value } = props;
  const danger = value.translator === "failed";
  // 깔려 있는데 번역기가 죽은 실패는 다시 받아도 고쳐지지 않는다.
  const retry = danger && value.enabled && value.download.needed;

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
        <Text style={{ fontSize: 12, color: danger ? theme.colors.statusDanger : theme.colors.foregroundMuted }}>번역기 {stateText(value)}</Text>
      </View>
      <Hint theme={theme} tone={danger ? "danger" : "muted"}>
        {detailText(value)}
      </Hint>
      {retry ? (
        <View style={{ alignSelf: "flex-start" }}>
          <Button theme={theme} label="다시 받기" disabled={props.installing} onPress={props.onInstall} />
        </View>
      ) : null}
    </View>
  );
}

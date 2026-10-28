import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text, View } from "react-native";
import { shortRevision, type UpdateMode, type UpdateStatus } from "../shared/update";
import { Chip } from "./compact-threshold";
import { Hint } from "./form-parts";
import { ChangeList, UPDATE_MODE_LABEL } from "./update-card";
import { useUpdateActions, useUpdateStatus } from "./use-update";

const MODES: UpdateMode[] = ["auto", "confirm", "off"];
// 업데이트한 뒤 이만큼은 계정 화면에 알린다.
const RECENT_UPDATE_MS = 3 * 24 * 60 * 60 * 1000;

function timeText(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function SmallButton(props: { theme: PluginTheme; label: string; primary?: boolean; disabled: boolean; onPress(): void }) {
  const { theme, primary } = props;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: primary ? theme.colors.accent : theme.colors.border,
        backgroundColor: primary ? theme.colors.accent : "transparent",
        opacity: props.disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: primary ? "600" : "400", color: primary ? theme.colors.accentForeground : theme.colors.foreground }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function statusLine(status: UpdateStatus): string {
  if (status.applying) return "업데이트하는 중입니다. 플러그인이 잠깐 다시 시작됩니다.";
  if (status.available && status.latest) {
    return `새 버전이 있습니다. ${status.current ? `${shortRevision(status.current)} → ` : ""}${shortRevision(status.latest)}`;
  }
  if (status.checking && !status.checkedAt) return "확인하는 중입니다.";
  if (!status.checkedAt) return status.mode === "off" ? "업데이트를 확인하지 않습니다." : "아직 확인하지 않았습니다.";
  return `최신 버전입니다${status.current ? ` (${shortRevision(status.current)})` : ""}. ${timeText(status.checkedAt)} 확인`;
}

/** 계정 화면의 플러그인 업데이트 설정과 지금 상태. */
export function UpdateSection({ theme }: { theme: PluginTheme }) {
  const { data: status } = useUpdateStatus();
  const actions = useUpdateActions();
  if (!status) return null;
  const local = status.source === "local";
  const busy = status.applying || actions.apply.isPending;
  const actionError = actions.apply.error ?? actions.check.error ?? actions.setMode.error;
  const error = status.error ?? (actionError ? (actionError instanceof Error ? actionError.message : String(actionError)) : null);
  const recent = status.lastUpdate && Date.now() - Date.parse(status.lastUpdate.at) < RECENT_UPDATE_MS ? status.lastUpdate : null;

  if (local) {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>플러그인 업데이트</Text>
        <Hint theme={theme}>폴더에서 설치한 개발용이라 쓰지 않습니다.</Hint>
      </View>
    );
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted, marginRight: 2 }}>플러그인 업데이트</Text>
        {MODES.map((mode) => (
          <Chip
            key={mode}
            theme={theme}
            label={UPDATE_MODE_LABEL[mode]}
            selected={status.mode === mode}
            disabled={actions.setMode.isPending}
            onPress={() => actions.setMode.mutate(mode)}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Hint theme={theme}>{statusLine(status)}</Hint>
        {status.available && !busy ? <SmallButton theme={theme} primary label="지금 업데이트" disabled={false} onPress={() => actions.apply.mutate()} /> : null}
        {!status.available && !busy ? (
          <SmallButton theme={theme} label="지금 확인" disabled={status.checking || actions.check.isPending} onPress={() => actions.check.mutate()} />
        ) : null}
      </View>
      {status.available && !busy ? <ChangeList theme={theme} changes={status.changes} /> : null}
      {recent ? <Hint theme={theme}>{`${timeText(recent.at)}에 업데이트했습니다 (${shortRevision(recent.from)} → ${shortRevision(recent.to)}).`}</Hint> : null}
      {error ? (
        <Hint theme={theme} tone="danger">
          {error}
        </Hint>
      ) : null}
    </View>
  );
}

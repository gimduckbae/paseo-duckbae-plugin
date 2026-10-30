import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Text, View } from "react-native";
import { ChildrenWarning } from "./handoff-list";
import { Paragraph } from "./paragraph";
import { PROVIDER_LABEL, type AccountHandoffItem, type AccountSwitchItem } from "../shared/accounts";

export function AccountSwitchRow({ theme, item }: PluginTimelineItemProps<AccountSwitchItem>) {
  const { fromLabel, toLabel } = item.data;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
      <Icon name="ArrowLeftRight" size={14} color={theme.colors.statusWarning} />
      <Paragraph style={{ flex: 1, fontSize: 13, color: theme.colors.foregroundMuted }}>
        {toLabel
          ? `${fromLabel} 한도 도달. 새 대화는 ${toLabel} 계정으로 시작합니다. 이 대화는 입력창 위 계정 버튼을 눌러 다른 계정에서 이어갈 수 있습니다.`
          : `${fromLabel} 한도 도달. 바꿀 수 있는 계정이 없습니다.`}
      </Paragraph>
    </View>
  );
}

export function AccountHandoffRow({ theme, item }: PluginTimelineItemProps<AccountHandoffItem>) {
  const { toLabel, toProvider, title, handoffPath, error, cascadeChildCount } = item.data;
  const target = `${PROVIDER_LABEL[toProvider]} · ${toLabel}`;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 6 }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name="ArrowLeftRight" size={14} color={error ? theme.colors.statusDanger : theme.colors.statusSuccess} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Paragraph style={{ fontSize: 13, color: theme.colors.foregroundMuted }}>
          {error ? `${target}에서 이어가지 못했습니다. ${error}` :`${target} 계정의 새 에이전트 '${title ?? ""}'에서 이어갑니다.`}
        </Paragraph>
        <ChildrenWarning theme={theme} count={cascadeChildCount} tabOwner="이 에이전트" />
        {handoffPath ? (
          <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }} numberOfLines={1}>
            인계 문서: {handoffPath}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

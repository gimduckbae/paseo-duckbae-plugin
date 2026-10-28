import type { PluginClientContext } from "@getpaseo/plugin/client";
import {
  ACCOUNT_HANDOFF_ITEM_KIND,
  ACCOUNT_SWITCH_ITEM_KIND,
  accountHandoffItemSchema,
  accountSwitchItemSchema,
  LIMIT_OFFER_ITEM_KIND,
  limitOfferItemSchema,
} from "./shared/accounts";
import { COMPACT_OFFER_ITEM_KIND, compactOfferItemSchema } from "./shared/compact";
import { UPDATE_CARD_ITEM_KIND, updateCardItemSchema } from "./shared/update";
import {
  AGENT_TEXT_ITEM_KIND,
  agentTextItemSchema,
  QUESTION_AUTO_NOTE_ITEM_KIND,
  QUESTION_CARD_ITEM_KIND,
  questionAutoNoteItemSchema,
  questionCardItemSchema,
} from "./shared/question";
import { QuestionAutoNoteRow } from "./client/question-auto-note";
import { transformQuestionMessage } from "./client/question-block";
import { AgentTextRow, QuestionCardRow } from "./client/question-row";
import { registerSessionAccountButtons } from "./client/session-account";
import { registerAccountPills } from "./client/account-pill";
import { AccountsScreen } from "./client/accounts-screen";
import { CompactOfferCard } from "./client/compact-offer";
import { LimitOfferCard } from "./client/limit-offer";
import { UpdateCard } from "./client/update-card";
import { AccountsSidebarItem } from "./client/sidebar";
import { AccountHandoffRow, AccountSwitchRow } from "./client/switch-item";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "accounts", title: "다중 계정관리", Component: AccountsScreen });
  client.addSidebarFooterItem({ id: "accounts", title: "다중 계정관리", Component: AccountsSidebarItem });
  client.addCommandCenterItem({
    id: "open-accounts",
    title: "다중 계정관리 열기",
    icon: "Gauge",
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "accounts" });
    },
  });
  client.addTimelineRenderer({
    kind: ACCOUNT_SWITCH_ITEM_KIND,
    version: 1,
    schema: accountSwitchItemSchema,
    Component: AccountSwitchRow,
  });
  client.addTimelineRenderer({
    kind: ACCOUNT_HANDOFF_ITEM_KIND,
    version: 1,
    schema: accountHandoffItemSchema,
    Component: AccountHandoffRow,
  });
  client.addTimelineRenderer({
    kind: LIMIT_OFFER_ITEM_KIND,
    version: 1,
    schema: limitOfferItemSchema,
    Component: LimitOfferCard,
  });
  client.addTimelineRenderer({
    kind: COMPACT_OFFER_ITEM_KIND,
    version: 1,
    schema: compactOfferItemSchema,
    Component: CompactOfferCard,
  });
  client.addTimelineRenderer({
    kind: UPDATE_CARD_ITEM_KIND,
    version: 1,
    schema: updateCardItemSchema,
    Component: UpdateCard,
  });
  client.addTimelineTransformer({
    id: "question-block",
    query: { itemType: "assistant_message" },
    transform: ({ item }) => transformQuestionMessage(item.text),
  });
  client.addTimelineRenderer({
    kind: QUESTION_CARD_ITEM_KIND,
    version: 1,
    schema: questionCardItemSchema,
    Component: QuestionCardRow,
  });
  client.addTimelineRenderer({
    kind: AGENT_TEXT_ITEM_KIND,
    version: 1,
    schema: agentTextItemSchema,
    Component: AgentTextRow,
  });
  client.addTimelineRenderer({
    kind: QUESTION_AUTO_NOTE_ITEM_KIND,
    version: 1,
    schema: questionAutoNoteItemSchema,
    Component: QuestionAutoNoteRow,
  });
  const removePills = registerAccountPills(client);
  const removeHeaderButtons = registerSessionAccountButtons(client);
  return () => {
    removePills();
    removeHeaderButtons();
  };
}

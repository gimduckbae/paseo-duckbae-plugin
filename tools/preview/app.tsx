import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { Text, View } from "react-native";
import { AccountsScreen } from "../../client/accounts-screen";
import { AddAccountModal } from "../../client/add-account-modal";
import { AccountsPopover, AccountsSidebarItem } from "../../client/sidebar";
import { HandoffPanel } from "../../client/handoff-panel";
import { NewSessionAccountPanel } from "../../client/session-account";
import { QuestionCard } from "../../client/question-card";
import { transformQuestionMessage } from "../../client/question-block";
import { AgentTextRow, QuestionCardRow } from "../../client/question-row";
import { QUESTION_FENCE, type QuestionBlock } from "../../shared/question";
import { NativeQuestionCard } from "./native-question";
import { SAMPLES } from "./question-samples";
import { LimitOfferCard } from "../../client/limit-offer";
import { CompactOfferCard } from "../../client/compact-offer";
import { UpdateCard } from "../../client/update-card";
import type { UpdateCardItem } from "../../shared/update";
import { QuestionAutoNoteRow } from "../../client/question-auto-note";
import type { QuestionAutoNoteItem } from "../../shared/question";
import type { CompactOfferItem } from "../../shared/compact";
import type { LimitOfferItem } from "../../shared/accounts";
import { AccountHandoffRow, AccountSwitchRow } from "../../client/switch-item";
import { WorkflowCard } from "../../client/workflow-card";
import { transformWorkflowToolCall } from "../../client/workflow-block";
import { CARD as WF_CARD, KILLED_CARD, LAUNCH_OUTPUT, SCRIPT as WF_SCRIPT } from "./workflow-samples";
import { NativeToolCall } from "./native-tool-call";
import { ReasoningRow } from "../../client/reasoning-row";
import { REASONING_LIVE, REASONING_LIVE_HALF, REASONING_SOURCE } from "./reasoning-samples";
import { overview } from "./mock";
import { Icon } from "./stubs/plugin-rn";
import { previewTheme as theme, sidebarColors } from "./theme";

const view = location.hash.slice(1) || "desktop";
const host = { id: "srv", label: "my-pc" };
const c = theme.colors;
const noop = () => {};

function SidebarMockRow({ icon, label, muted, indent }: { icon?: string; label: string; muted?: boolean; indent?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, paddingHorizontal: 10, paddingLeft: indent ? 28 : 10 }}>
      {icon ? <Icon name={icon} size={15} color={c.foregroundMuted} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.statusSuccess }} />}
      <Text style={{ fontSize: 13, color: muted ? c.foregroundMuted : c.foreground }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Sidebar({ popover }: { popover: boolean }) {
  return (
    <View style={{ width: 264, zIndex: 10, backgroundColor: sidebarColors.background, borderRightWidth: 1, borderColor: c.border, padding: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: c.accent }} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: c.foreground }}>Paseo</Text>
      </View>
      <SidebarMockRow icon="SquarePen" label="새 에이전트" />
      <View style={{ height: 12 }} />
      <SidebarMockRow icon="Folder" label="shop_web" />
      <SidebarMockRow label="상품 페이지 개선" indent />
      <SidebarMockRow label="관리자 화면 정리" indent />
      <SidebarMockRow icon="Folder" label="order_worker" />
      <SidebarMockRow label="실패 기록 모으기" indent />
      <SidebarMockRow icon="Folder" label="paseo_plugin" />
      <SidebarMockRow label="계정 전환 초안" indent />
      <View style={{ flex: 1 }} />
      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 6 }} />
      <AccountsSidebarItem theme={theme} host={host} layout={{ compact: false, platform: "web" }} currentScreen={{ screenId: "accounts", params: {} }} openScreen={noop} openPopover={noop} />
      <SidebarMockRow icon="Settings" label="설정" />
      {popover ? (
        <View style={{ position: "absolute", left: 270, bottom: 52, borderRadius: 10, borderWidth: 1, borderColor: c.border, overflow: "hidden", boxShadow: "0 12px 32px rgba(0,0,0,0.45)" } as never}>
          <AccountsPopover theme={theme} host={host} layout={{ compact: false, platform: "web" }} close={noop} openScreen={noop} />
        </View>
      ) : null}
    </View>
  );
}

function ScreenHeader({ title }: { title: string }) {
  return (
    <View style={{ height: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 20, borderBottomWidth: 1, borderColor: c.border, backgroundColor: c.surface0 }}>
      <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.foreground }}>{title}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: c.surface1 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.statusSuccess }} />
        <Text style={{ fontSize: 12, color: c.foregroundMuted }}>{host.label}</Text>
      </View>
    </View>
  );
}

function Desktop({ popover, modal }: { popover?: boolean; modal?: "claude_token" | "claude_api" | "codex" | "grok" }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", minHeight: "100vh" as never, backgroundColor: c.surface0 }}>
      <Sidebar popover={Boolean(popover)} />
      <View style={{ flex: 1 }}>
        <ScreenHeader title="다중 계정관리" />
        <AccountsScreen theme={theme} host={host} layout={{ compact: false, platform: "web" }} params={{}} />
      </View>
      {modal ? <AddAccountModal theme={theme} open onOpenChange={noop} initialMethod={modal} /> : null}
    </View>
  );
}

function Mobile() {
  return (
    <View style={{ width: 390, minHeight: "100vh" as never, backgroundColor: c.surface0 }}>
      <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: c.border }}>
        <Icon name="ChevronLeft" size={20} color={c.foreground} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: c.foreground }}>다중 계정관리</Text>
      </View>
      <AccountsScreen theme={theme} host={host} layout={{ compact: true, platform: "ios" }} params={{}} />
    </View>
  );
}

function Agent() {
  return (
    <View style={{ width: 760, padding: 24, gap: 14, backgroundColor: c.surface0 }}>
      <View style={{ alignSelf: "flex-end", maxWidth: 520, padding: 12, borderRadius: 10, backgroundColor: c.surface2 }}>
        <Text style={{ fontSize: 14, color: c.foreground }}>결제 모듈 리팩토링 이어서 진행해줘</Text>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 21, color: c.foreground }}>
        결제 승인 흐름을 정리하고 있습니다. `PaymentService`의 재시도 로직을 분리한 뒤 테스트를 돌리겠습니다…
      </Text>
      <Text style={{ fontSize: 14, color: c.foregroundMuted }}>Claude AI usage limit reached · resets 3:50pm</Text>
      <AccountSwitchRow
        theme={theme}
        host={host}
        layout={{ compact: false, platform: "web" }}
        agentId="a1"
        timestamp={new Date()}
        item={{ type: "plugin", kind: "account-switch", version: 1, data: { provider: "claude", fromLabel: "개인 Max", toLabel: "업무 Max", reason: "usage limit" } }}
      />
    </View>
  );
}

function Offer({ data }: { data: LimitOfferItem }) {
  return (
    <LimitOfferCard theme={theme} host={host} layout={{ compact: false, platform: "web" }} agentId="a1" timestamp={new Date()}
      item={{ type: "plugin", kind: "limit-offer", version: 1, data }} />
  );
}

const OFFER: LimitOfferItem = { offerId: "o1", provider: "claude", accountId: "c2", fromLabel: "개인 Max", state: "limited", extra: { status: "enabled", capUsd: 20 }, answer: null };

function Limit({ done }: { done?: boolean }) {
  return (
    <View style={{ width: 760, padding: 24, gap: 14, backgroundColor: c.surface0 }}>
      <View style={{ alignSelf: "flex-end", maxWidth: 520, padding: 12, borderRadius: 10, backgroundColor: c.surface2 }}>
        <Text style={{ fontSize: 14, color: c.foreground }}>결제 모듈 리팩토링 이어서 진행해줘</Text>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 21, color: c.foreground }}>
        결제 승인 흐름을 정리하고 있습니다. `PaymentService`의 재시도 로직을 분리한 뒤 테스트를 돌리겠습니다…
      </Text>
      <Text style={{ fontSize: 14, color: c.foregroundMuted }}>You've hit your limit · resets 3:50pm</Text>
      {done ? (
        <>
          <Offer data={{ ...OFFER, answer: { kind: "swap", accountId: "c1", label: "업무 Max" } }} />
          <Offer data={{ ...OFFER, answer: { kind: "stay" } }} />
          <Offer data={{ ...OFFER, extra: { status: "failed", error: "켜기 실패: HTTP 403 Permission denied" } }} />
          <Offer data={{ ...OFFER, provider: "codex", accountId: "x2", fromLabel: "회사 Plus", extra: null }} />
          <Offer data={{ ...OFFER, fromLabel: "팀 Pro", state: "needs_login", extra: null, answer: { kind: "stay" } }} />
        </>
      ) : (
        <Offer data={OFFER} />
      )}
    </View>
  );
}

function CompactCard({ data }: { data: CompactOfferItem }) {
  return (
    <CompactOfferCard theme={theme} host={host} layout={{ compact: false, platform: "web" }} agentId="a1" timestamp={new Date()}
      item={{ type: "plugin", kind: "compact-offer", version: 1, data }} />
  );
}

const COMPACT: CompactOfferItem = { offerId: "c1", usedTokens: 214_300, maxTokens: 1_000_000, autoAt: null, answer: null };

function Compact({ width }: { width: number }) {
  return (
    <View style={{ width, minHeight: "100vh" as never, padding: 16, gap: 8, backgroundColor: c.surface0 }}>
      <Text style={{ fontSize: 14, lineHeight: 21, color: c.foreground }}>결제 승인 흐름을 정리했고 테스트 15개가 통과했습니다. 다음은 환불 쪽입니다.</Text>
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— 자동 수락 켜짐: 카운트다운 —</Text>
      <CompactCard data={{ ...COMPACT, autoAt: new Date(Date.now() + 7_400).toISOString() }} />
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— 카운트다운 없음: 붙일 때 자동 수락이 꺼져 있었거나 메시지를 보냄 —</Text>
      <CompactCard data={{ ...COMPACT, offerId: "c2" }} />
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— 답한 뒤 —</Text>
      <CompactCard data={{ ...COMPACT, offerId: "c3", maxTokens: 272_000, usedTokens: 190_400, answer: { kind: "queued", by: "auto" } }} />
      <CompactCard data={{ ...COMPACT, offerId: "c4", answer: { kind: "started", by: "auto" } }} />
      <CompactCard data={{ ...COMPACT, offerId: "c5", answer: { kind: "started", by: "user" } }} />
      <CompactCard data={{ ...COMPACT, offerId: "c8", answer: { kind: "resumed", by: "auto" } }} />
      <CompactCard data={{ ...COMPACT, offerId: "c9", answer: { kind: "compacted", by: "user" } }} />
      <CompactCard data={{ ...COMPACT, offerId: "c6", answer: { kind: "skipped" } }} />
      <CompactCard data={{ ...COMPACT, offerId: "c7", answer: { kind: "failed", error: "정리할 수 없는 에이전트입니다." } }} />
    </View>
  );
}

function UpdateRow({ data }: { data: UpdateCardItem }) {
  return (
    <UpdateCard theme={theme} host={host} layout={{ compact: false, platform: "web" }} agentId="a1" timestamp={new Date()}
      item={{ type: "plugin", kind: "plugin-update", version: 1, data }} />
  );
}

const UPDATE_OFFER: Extract<UpdateCardItem, { kind: "offer" }> = {
  kind: "offer",
  cardId: "u1",
  latest: "8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b",
  changes: ["업데이트 방식을 고르고 새 버전을 알리기", "계정 화면 글을 쉬운 말로", "다시 로그인 버튼", "질문 카드 세로 길이 줄이기", "사이드바 에이전트 수 배지", "컨텍스트 정리 기준 고르기", "한도 카드 문구 정리"],
  answer: null,
  error: null,
};

function Update({ width }: { width: number }) {
  return (
    <View style={{ width, minHeight: "100vh" as never, padding: 16, gap: 8, backgroundColor: c.surface0 }}>
      <Text style={{ fontSize: 14, lineHeight: 21, color: c.foreground }}>플러그인을 설치하고 켰습니다. 사이드바 아래 '다중 계정관리'에서 계정을 추가하시면 됩니다.</Text>
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— 설치 뒤 처음 끝난 대화: 방식 묻기 —</Text>
      <UpdateRow data={{ kind: "ask", cardId: "a1", mode: null }} />
      <UpdateRow data={{ kind: "ask", cardId: "a2", mode: "confirm" }} />
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— '알려 주면 직접': 새 버전 알림 —</Text>
      <UpdateRow data={UPDATE_OFFER} />
      <UpdateRow data={{ ...UPDATE_OFFER, cardId: "u2", answer: "updating", changes: UPDATE_OFFER.changes.slice(0, 2) }} />
      <UpdateRow data={{ ...UPDATE_OFFER, cardId: "u3", answer: "updated" }} />
      <UpdateRow data={{ ...UPDATE_OFFER, cardId: "u4", answer: "failed", error: "clone failed: Authentication failed for 'https://github.com/…'" }} />
      <UpdateRow data={{ ...UPDATE_OFFER, cardId: "u5", answer: "later" }} />
    </View>
  );
}

function AutoNote({ data }: { data: QuestionAutoNoteItem }) {
  return (
    <QuestionAutoNoteRow theme={theme} host={host} layout={{ compact: false, platform: "web" }} agentId="a1" timestamp={new Date()}
      item={{ type: "plugin", kind: "question-auto-note", version: 1, data }} />
  );
}

const NOTE: QuestionAutoNoteItem = {
  requestId: "r1",
  answers: [
    { header: "방식", answer: "새로 만들기 (Recommended)" },
    { header: "범위", answer: "웹 (권장), 앱 (권장)" },
    { header: "이름", answer: "권장안 없음 · 에이전트 판단" },
  ],
  autoAt: null,
  status: "auto",
  error: null,
};

function QuestionAuto({ width }: { width: number }) {
  const sample = SAMPLES[0];
  const label = (text: string) => <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— {text} —</Text>;
  return (
    <View style={{ width, minHeight: "100vh" as never, padding: 16, gap: 10, backgroundColor: c.surface0 }}>
      {label("질문 블록 · 10초 뒤 권장안 대기")}
      <QuestionCard theme={theme} block={{ ...sample.block, confirm: undefined }} autoAt={new Date(Date.now() + 6_400).toISOString()} />
      {label("질문 블록 · 확인 필수(자동 답변 안 함)")}
      <QuestionCard theme={theme} block={{ ...sample.block, confirm: true }} />
      {label("질문 블록 · 자동으로 답함")}
      <QuestionCard theme={theme} block={sample.block} answered={sample.answered} auto />
      {label("기본 질문 창 · 대기 / 자동 답함 / 멈춤 / 직접 답함 / 실패")}
      <AutoNote data={{ ...NOTE, status: "pending", autoAt: new Date(Date.now() + 6_400).toISOString() }} />
      <AutoNote data={NOTE} />
      <AutoNote data={{ ...NOTE, status: "stopped" }} />
      <AutoNote data={{ ...NOTE, status: "user" }} />
      <AutoNote data={{ ...NOTE, status: "failed", error: "Permission request r1 is no longer pending" }} />
    </View>
  );
}

function ColumnLabel({ text, sub }: { text: string; sub: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: "600", color: c.foreground }}>{text}</Text>
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>{sub}</Text>
    </View>
  );
}

function QuestionCompare({ id }: { id: string }) {
  const sample = SAMPLES.find((item) => item.id === id) ?? SAMPLES[0];
  return (
    <View style={{ width: 1280, padding: 24, gap: 16, backgroundColor: c.surface0 }}>
      <Text style={{ fontSize: 15, fontWeight: "600", color: c.foreground }}>{sample.caption}</Text>
      <View style={{ flexDirection: "row", gap: 28, alignItems: "flex-start" }}>
        <View style={{ width: 540, gap: 10 }}>
          <ColumnLabel text="지금 · Paseo 기본 질문 카드" sub="AskUserQuestion 실제 입력 그대로" />
          <NativeQuestionCard questions={sample.native} active={sample.nativeActive} selected={sample.nativeSelected} />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Icon name="TriangleAlert" size={13} color={c.statusWarning} />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 18, color: c.statusWarning, wordBreak: "keep-all" } as never}>{sample.nativeNote}</Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <ColumnLabel text="플러그인 맞춤 카드" sub="같은 결정을 질문 블록으로" />
          <QuestionCard theme={theme} block={sample.block} />
          <ColumnLabel text="보낸 뒤" sub="실제로 받은 답" />
          <QuestionCard theme={theme} block={sample.block} answered={sample.answered} />
        </View>
      </View>
    </View>
  );
}

function QuestionMobile({ id }: { id: string }) {
  const sample = SAMPLES.find((item) => item.id === id) ?? SAMPLES[0];
  return (
    <View style={{ width: 390, minHeight: "100vh" as never, backgroundColor: c.surface0 }}>
      <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: c.border }}>
        <Icon name="ChevronLeft" size={20} color={c.foreground} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: c.foreground }} numberOfLines={1}>{sample.caption.split(" · ")[0]}</Text>
      </View>
      <View style={{ padding: 12, gap: 12 }}>
        <QuestionCard theme={theme} block={sample.block} />
        <QuestionCard theme={theme} block={sample.block} answered={sample.answered} />
      </View>
    </View>
  );
}

// 설명 없는 선택지(칩)와 설명 있는 선택지(줄)를 한 카드에서 비교.
const CHIP_BLOCK: QuestionBlock = {
  title: "롤백 이미지 정리",
  summary: "오늘 배포로 밀려난 옛 이미지가 운영 서버에 남아 있습니다(backend 632MB, frontend 210MB).",
  questions: [
    { header: "롤백 이미지", question: "롤백용 직전 이미지는 어떻게 할까요?", options: [{ label: "한 세대 보관", recommended: true }, { label: "확인 후 바로 삭제" }] },
    { header: "정리할 것", question: "남은 문구 가운데 무엇을 고칠까요?", multiSelect: true, options: [{ label: "'시험용' 사유", recommended: true }, { label: "'충전은 준비 중'" }, { label: "글자 겹침" }, { label: "천 단위 쉼표" }] },
    { header: "오늘 정리", question: "옛 이미지를 지금 정리할까요?", options: [{ label: "지금 정리", description: "운영 서버에서 이미지 2개를 지움, 롤백은 직전 한 세대만 가능", recommended: true }, { label: "다음 배포 때", description: "그대로 두고 다음 배포에서 한 번에 정리" }] },
  ],
};

function QuestionChips({ width }: { width: number }) {
  return (
    <View style={{ width, minHeight: "100vh" as never, padding: 16, gap: 12, backgroundColor: c.surface0 }}>
      <QuestionCard theme={theme} block={CHIP_BLOCK} />
      <QuestionCard theme={theme} block={CHIP_BLOCK} answered={{ "롤백 이미지": "한 세대 보관", "정리할 것": "'시험용' 사유, 글자 겹침", "오늘 정리": "지금 정리" }} />
    </View>
  );
}

function TimelineMessage({ text }: { text: string }) {
  const layout = { compact: false, platform: "web" as const };
  const result = transformQuestionMessage(text);
  if (!result) return <Text style={{ fontSize: 14, lineHeight: 22, color: c.foreground }}>{text}</Text>;
  return (
    <>
      {result.items.map((item) =>
        item.kind === "question-card" ? (
          <QuestionCardRow key={item.id} theme={theme} host={host} layout={layout} agentId="a1" timestamp={new Date()} item={item as never} />
        ) : (
          <AgentTextRow key={item.id} theme={theme} host={host} layout={layout} agentId="a1" timestamp={new Date()} item={item as never} />
        ),
      )}
    </>
  );
}

function QuestionTimeline() {
  const block = JSON.stringify(SAMPLES[2].block, null, 2);
  return (
    <View style={{ width: 760, padding: 24, gap: 14, backgroundColor: c.surface0 }}>
      <View style={{ alignSelf: "flex-end", maxWidth: 520, padding: 12, borderRadius: 10, backgroundColor: c.surface2 }}>
        <Text style={{ fontSize: 14, color: c.foreground }}>도움말 봇 diff 확인하고 합칠지 물어봐줘</Text>
      </View>
      <TimelineMessage text={`diff를 확인했습니다. **합치기 전에** 정할 것이 두 가지 있습니다.

| 항목 | 상태 | 비고 |
|---|---|---|
| 계산기 | eval 안 씀 | \`safe_eval\` |
| AI 비용 | 하루 상한 있음 | 사용자 청구 없음 |

- 시험 15개 통과
- 빌드·린트 통과

${QUESTION_FENCE}
${block}
\`\`\``} />
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— 스트리밍 중(블록을 쓰는 중) —</Text>
      <TimelineMessage text={`정리했습니다.

${QUESTION_FENCE}
{"title": "배`} />
      <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— 형식이 틀린 블록 —</Text>
      <TimelineMessage text={`${QUESTION_FENCE}
{"title": "배포", questions: []}
\`\`\``} />
    </View>
  );
}

// 생각 줄 하나. 호스트가 주는 플러그인 항목을 그대로 흉내 낸다(id는 주지 않는다).
function ReasoningLine({ text, phase }: { text: string; phase: "streaming" | "complete" }) {
  return (
    <ReasoningRow
      theme={theme}
      host={host}
      layout={{ compact: false, platform: "web" }}
      agentId="a1"
      timestamp={new Date()}
      item={{ type: "plugin", kind: "reasoning-peek", version: 1, data: { text, phase } }}
    />
  );
}

// Paseo 기본 생각 줄(앱 agent-stream/view.tsx ThoughtSlot) 흉내. 알약을 끄면 이 모습으로 돌아간다.
function NativeThoughtLine({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}>
      <Icon name="ChevronRight" size={14} color={c.foregroundMuted} />
      <Icon name="Lightbulb" size={14} color={c.foregroundMuted} />
      <Text style={{ fontSize: 13, color: c.foregroundMuted }} numberOfLines={1}>
        thinking · {text.slice(0, 48)}…
      </Text>
    </View>
  );
}

function ComposerWithPill({ on }: { on: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: c.border }}>
          <Icon name="UserRound" size={13} color={c.foreground} />
          <Text style={{ fontSize: 12, color: c.foreground }}>업무 Max</Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: on ? c.accent : c.border,
            backgroundColor: on ? `${c.accent}1F` : "transparent",
          }}
        >
          <Icon name={on ? "Eye" : "EyeOff"} size={13} color={on ? c.foreground : c.foregroundMuted} />
          <Text style={{ fontSize: 12, fontWeight: on ? "600" : "400", color: on ? c.foreground : c.foregroundMuted }}>
            추론 훔쳐보기 {on ? "켜짐" : "꺼짐"}
          </Text>
        </View>
      </View>
      <View style={{ height: 72, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14 }}>
        <Text style={{ fontSize: 13, color: c.foregroundMuted }}>에이전트에게 메시지를 보내거나 @files 태그, /command</Text>
      </View>
    </View>
  );
}

function Reasoning({ variant }: { variant: string }) {
  return (
    <View style={{ width: 760, padding: 24, gap: 12, backgroundColor: c.surface0 }}>
      <View style={{ alignSelf: "flex-end", maxWidth: 520, padding: 12, borderRadius: 10, backgroundColor: c.surface2 }}>
        <Text style={{ fontSize: 14, color: c.foreground }}>main.py 수정 전에 import 먼저 확인해줘</Text>
      </View>
      {variant === "off" ? <NativeThoughtLine text={REASONING_SOURCE} /> : null}
      {variant === "on" ? <ReasoningLine text={REASONING_LIVE} phase="streaming" /> : null}
      {variant.startsWith("live") ? <ReasoningLine text={REASONING_LIVE_HALF} phase="streaming" /> : null}
      {variant === "on" || variant === "wait" || variant === "done" || variant === "fail" || variant === "dl" ? (
        <ReasoningLine text={REASONING_SOURCE} phase="complete" />
      ) : null}
      <Text style={{ fontSize: 14, lineHeight: 21, color: c.foreground }}>config/app.toml을 읽고 import를 확인했습니다. 고칠 곳은 두 군데입니다.</Text>
      <View style={{ height: 12 }} />
      <ComposerWithPill on={variant !== "off"} />
    </View>
  );
}

function SessionAccount() {
  const layout = { compact: false, platform: "web" as const };
  return (
    <View style={{ width: 1100, height: 640, backgroundColor: c.surface0 }}>
      <View style={{ height: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, borderBottomWidth: 1, borderColor: c.border }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: c.foreground }}>shop_web</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: c.accent }}>
          <Icon name="UserRoundCog" size={14} color={c.foreground} />
          <Text style={{ fontSize: 13, color: c.foreground }}>새 대화 계정</Text>
          <Icon name="ChevronDown" size={13} color={c.foregroundMuted} />
        </View>
        <Icon name="SquareTerminal" size={16} color={c.foregroundMuted} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: c.surface2 }}>
          <Text style={{ fontSize: 12, color: c.foreground }}>새 에이전트</Text>
        </View>
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", padding: 24 }}>
        <View style={{ width: 640, height: 90, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14 }}>
          <Text style={{ fontSize: 13, color: c.foregroundMuted }}>새 에이전트에게 무엇을 시킬까요?</Text>
        </View>
      </View>
      <View style={{ position: "absolute", right: 60, top: 52, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, boxShadow: "0 12px 32px rgba(0,0,0,0.35)" } as never}>
        <NewSessionAccountPanel theme={theme} host={host} layout={layout} context="workspace" workspaceId="w1" close={noop} />
      </View>
    </View>
  );
}

function Handoff() {
  const layout = { compact: false, platform: "web" as const };
  return (
    <View style={{ width: 1100, height: 760, flexDirection: "row", backgroundColor: c.surface0 }}>
      <View style={{ flex: 1, padding: 24, gap: 14 }}>
        <Text style={{ fontSize: 14, lineHeight: 21, color: c.foreground }}>결제 승인 흐름을 정리했습니다. 테스트는 아직 돌리지 않았습니다.</Text>
        <AccountHandoffRow theme={theme} host={host} layout={layout} agentId="a1" timestamp={new Date()}
          item={{ type: "plugin", kind: "account-handoff", version: 1, data: { toLabel: "개인 Pro", toProvider: "codex", title: "결제 리팩토링 · 개인 Pro", handoffPath: "C:/Users/me/.paseo/paseo-duckbae-plugin/handoffs/2026-10-21T07-30-00-000Z-a1.md", error: null, cascadeChildCount: 3 } }} />
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: c.border }}>
            <Text style={{ fontSize: 12, color: c.foregroundMuted }}>하위 에이전트 4개</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: c.accent }}>
            <Icon name="UserRound" size={13} color={c.foreground} />
            <Text style={{ fontSize: 12, color: c.foreground }}>업무 Max</Text>
          </View>
        </View>
        <View style={{ height: 90, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 14 }}>
          <Text style={{ fontSize: 13, color: c.foregroundMuted }}>에이전트에게 메시지를 보내거나 @files 태그, /command</Text>
        </View>
      </View>
      <View style={{ position: "absolute", left: 160, bottom: 150, minWidth: 280, maxWidth: 420, maxHeight: 440, overflow: "auto", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, boxShadow: "0 12px 32px rgba(0,0,0,0.25)" } as never}>
        <HandoffPanel theme={theme} host={host} layout={layout} context="agent" workspaceId="w1" agentId="a1" close={noop} />
      </View>
    </View>
  );
}


function WorkflowRow({ runId, card = WF_CARD }: { runId: string; card?: typeof WF_CARD }) {
  return (
    <WorkflowCard theme={theme} host={host} layout={{ compact: false, platform: "web" }} agentId="a1" timestamp={new Date()}
      item={{ type: "plugin", kind: "workflow-card", version: 1, data: { ...card, runId } }} />
  );
}

function WorkflowLabel({ text }: { text: string }) {
  return <Text style={{ fontSize: 12, color: c.foregroundMuted }}>— {text} —</Text>;
}

function WorkflowRunning({ width }: { width: number }) {
  return (
    <View style={{ width, minHeight: "100vh" as never, padding: 16, gap: 10, backgroundColor: c.surface0 }}>
      <Text style={{ fontSize: 14, lineHeight: 21, color: c.foreground }}>조사 워크플로를 띄웠습니다. 에이전트 다섯 명이 돌고 끝나면 알려 드립니다.</Text>
      <WorkflowLabel text="띄운 직후: 아직 journal.jsonl이 없다" />
      <WorkflowRow runId="wf-waiting" />
      <WorkflowLabel text="도는 중: 시작한 3명 가운데 2명 끝남" />
      <WorkflowRow runId="wf-running" />
    </View>
  );
}

function WorkflowDone({ width }: { width: number }) {
  return (
    <View style={{ width, minHeight: "100vh" as never, padding: 16, gap: 10, backgroundColor: c.surface0 }}>
      <WorkflowLabel text="끝남: 단계 3개 · 에이전트 5명 · 걸린 시간·토큰·도구 호출" />
      <WorkflowRow runId="wf_fdfc102b-fe0" />
      <WorkflowLabel text="중간에 멈춘 워크플로" />
      <WorkflowRow runId="wf_3801297a-e3e" card={KILLED_CARD} />
    </View>
  );
}

function WorkflowRaw({ width }: { width: number }) {
  const broken = LAUNCH_OUTPUT.replace(/^Run ID:.*$/m, "Started run wf_fdfc102b-fe0");
  const input = { script: WF_SCRIPT };
  return (
    <View style={{ width, minHeight: "100vh" as never, padding: 16, gap: 12, backgroundColor: c.surface0 }}>
      <WorkflowLabel text={`문구가 바뀌어 못 알아봄 → 카드를 바꾸지 않음 (변환 결과 ${String(transformWorkflowToolCall({ type: "tool_call", name: "Workflow", callId: "t1", status: "completed", error: null, detail: { type: "unknown", input, output: { output: broken } } } as never))})`} />
      <NativeToolCall name="Workflow" input={input} output={{ output: broken }} />
      <WorkflowLabel text="펼치면: 지금까지 보이던 것 (스크립트 원문 JSON 덤프)" />
      <NativeToolCall name="Workflow" input={input} output={{ output: broken }} expanded />
    </View>
  );
}

const content =
  view === "handoff" ? <Handoff /> :
  view.startsWith("rz-") ? <Reasoning variant={view.slice(3)} /> :
  view.startsWith("desktop-rz-") ? <Desktop /> :
  view === "mobile" || view === "mobile-edit" ? <Mobile /> :
  view === "desktop-edit" ? <Desktop /> :
  view === "agent" ? <Agent /> :
  view === "session" ? <SessionAccount /> :
  view === "accounts-popover" ? (
    <View style={{ width: 340, borderRadius: 10, borderWidth: 1, borderColor: c.border, overflow: "hidden" }}>
      <AccountsPopover theme={theme} host={host} layout={{ compact: false, platform: "web" }} close={noop} openScreen={noop} />
    </View>
  ) :
  view.startsWith("q-") ? <QuestionCompare id={view.slice(2)} /> :
  view.startsWith("qm-") ? <QuestionMobile id={view.slice(3)} /> :
  view === "qt" ? <QuestionTimeline /> :
  view === "qc" ? <QuestionChips width={680} /> :
  view === "qcm" ? <QuestionChips width={390} /> :
  view === "qa" ? <QuestionAuto width={760} /> :
  view === "qa-m" ? <QuestionAuto width={390} /> :
  view === "update" ? <Update width={760} /> :
  view === "update-m" ? <Update width={390} /> :
  view.startsWith("desktop-upd-") ? <Desktop /> :
  view.startsWith("mobile-upd-") ? <Mobile /> :
  view === "wf-running" ? <WorkflowRunning width={760} /> :
  view === "wf-done" ? <WorkflowDone width={760} /> :
  view === "wf-raw" ? <WorkflowRaw width={760} /> :
  view === "wf-m" ? <WorkflowDone width={390} /> :
  view === "compact" ? <Compact width={760} /> :
  view === "compact-m" ? <Compact width={390} /> :
  view === "limit" || view === "limit-pick" ? <Limit /> :
  view === "limit-done" ? <Limit done /> :
  view === "popover" ? <Desktop popover /> :
  view === "modal" ? <Desktop modal="claude_token" /> :
  view === "modal-codex" ? <Desktop modal="codex" /> :
  view === "modal-api" ? <Desktop modal="claude_api" /> :
  view === "modal-grok" ? <Desktop modal="grok" /> :
  <Desktop />;

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>{content}</QueryClientProvider>,
);

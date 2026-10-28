import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Question, QuestionAnswers, QuestionBlock } from "../shared/question";
import { Paragraph } from "./paragraph";
import { useSecondsLeft } from "./use-seconds-left";

const OTHER = -1;

function answerOf(question: Question, picked: readonly number[], text: string): string | null {
  const labels = picked.filter((index) => index !== OTHER).map((index) => question.options[index].label);
  const typed = picked.includes(OTHER) ? text.trim() : "";
  if (typed) return question.multiSelect ? [...labels, typed].join(", ") : typed;
  return labels.length > 0 ? labels.join(", ") : null;
}

function Control({ theme, multi, selected }: { theme: PluginTheme; multi: boolean; selected: boolean }) {
  return (
    <View
      style={{
        width: 16,
        height: 16,
        marginTop: 2,
        borderRadius: multi ? 4 : 8,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.foregroundMuted,
        backgroundColor: selected && multi ? theme.colors.accent : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected && multi ? <Icon name="Check" size={11} color={theme.colors.accentForeground} /> : null}
      {selected && !multi ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.accent }} /> : null}
    </View>
  );
}

function OptionRow(props: {
  theme: PluginTheme;
  multi: boolean;
  selected: boolean;
  label: string;
  description?: string;
  recommended?: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const { theme, selected } = props;
  return (
    <Pressable
      accessibilityRole={props.multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.surface2 : "transparent",
      }}
    >
      <Control theme={theme} multi={props.multi} selected={selected} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ flexShrink: 1, fontSize: 13, lineHeight: 20, fontWeight: selected ? "600" : "400", color: theme.colors.foreground }}>{props.label}</Text>
          {props.recommended ? (
            <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: theme.colors.accent }}>
              <Text style={{ fontSize: 10, lineHeight: 14, color: theme.colors.statusSuccess }}>권장</Text>
            </View>
          ) : null}
        </View>
        {props.description ? (
          <Paragraph style={{ fontSize: 12, lineHeight: 18, color: theme.colors.foregroundMuted }}>{props.description}</Paragraph>
        ) : null}
      </View>
    </Pressable>
  );
}

function OptionChip(props: {
  theme: PluginTheme;
  multi: boolean;
  selected: boolean;
  label: string;
  recommended?: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  const { theme, selected } = props;
  return (
    <Pressable
      accessibilityRole={props.multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.surface2 : "transparent",
      }}
    >
      {selected ? <Icon name="Check" size={12} color={theme.colors.accent} /> : null}
      <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: selected ? "600" : "400", color: theme.colors.foreground }}>{props.label}</Text>
      {props.recommended ? <Text style={{ fontSize: 10, lineHeight: 14, color: theme.colors.statusSuccess }}>권장</Text> : null}
    </Pressable>
  );
}

function HeaderChip({ theme, label }: { theme: PluginTheme; label: string }) {
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: theme.colors.surface2 }}>
      <Text style={{ fontSize: 11, lineHeight: 16, color: theme.colors.foregroundMuted }}>{label}</Text>
    </View>
  );
}

function Items({ theme, items }: { theme: PluginTheme; items: NonNullable<QuestionBlock["items"]> }) {
  return (
    <View style={{ gap: 8 }}>
      {items.map((item, index) => (
        <View key={item.name} style={{ flexDirection: "row", gap: 8 }}>
          <View
            style={{
              width: 18,
              height: 18,
              marginTop: 1,
              borderRadius: 9,
              backgroundColor: theme.colors.surface2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 11, color: theme.colors.foreground }}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Paragraph style={{ fontSize: 13, lineHeight: 20, fontWeight: "600", color: theme.colors.foreground }}>{item.name}</Paragraph>
            {item.details?.map((detail) => (
              <Paragraph key={detail} style={{ fontSize: 12, lineHeight: 18, color: theme.colors.foregroundMuted }}>
                · {detail}
              </Paragraph>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Notes({ theme, notes }: { theme: PluginTheme; notes: NonNullable<QuestionBlock["notes"]> }) {
  return (
    <>
      {notes.map((note) => (
        <View key={note.text} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
          <View style={{ paddingTop: 2 }}>
            <Icon
              name={note.tone === "warn" ? "TriangleAlert" : "Info"}
              size={13}
              color={note.tone === "warn" ? theme.colors.statusWarning : theme.colors.foregroundMuted}
            />
          </View>
          <Paragraph style={{ flex: 1, fontSize: 12, lineHeight: 18, color: note.tone === "warn" ? theme.colors.statusWarning : theme.colors.foregroundMuted }}>
            {note.text}
          </Paragraph>
        </View>
      ))}
    </>
  );
}

// 대상 목록이 이보다 길면 이름만 한 줄로 보이고 '자세히'로 편다. 위험·비용(notes)은 접지 않는다.
const ITEM_DETAIL_LINES = 4;

function Context({ theme, block }: { theme: PluginTheme; block: QuestionBlock }) {
  const [expanded, setExpanded] = useState(false);
  const items = block.items ?? [];
  const long = items.length > 2 || items.reduce((sum, item) => sum + (item.details?.length ?? 0), 0) > ITEM_DETAIL_LINES;
  if (!block.summary && items.length === 0 && !block.notes?.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {block.summary ? <Paragraph style={{ fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>{block.summary}</Paragraph> : null}
      {items.length > 0 && long && !expanded ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <Paragraph style={{ flex: 1, fontSize: 13, lineHeight: 19, color: theme.colors.foreground }} numberOfLines={2}>
            {items.map((item, index) => `${index + 1}. ${item.name}`).join("  ·  ")}
          </Paragraph>
          <Text style={{ fontSize: 12, lineHeight: 19, color: theme.colors.accent }}>자세히</Text>
        </Pressable>
      ) : null}
      {items.length > 0 && (!long || expanded) ? <Items theme={theme} items={items} /> : null}
      {block.notes?.length ? <Notes theme={theme} notes={block.notes} /> : null}
    </View>
  );
}

function CollapsedQuestion(props: { theme: PluginTheme; question: Question; answer: string | null; disabled: boolean; onPress(): void }) {
  const { theme, question, answer } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={answer !== null ? "다시 펼쳐 답을 바꿉니다" : "펼쳐서 답합니다"}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderColor: theme.colors.border }}
    >
      <Icon name={answer !== null ? "CircleCheck" : "Circle"} size={14} color={answer !== null ? theme.colors.statusSuccess : theme.colors.foregroundMuted} />
      <HeaderChip theme={theme} label={question.header} />
      <Text style={{ flex: 1, fontSize: 13, color: answer !== null ? theme.colors.foreground : theme.colors.foregroundMuted }} numberOfLines={1}>
        {answer ?? question.question}
      </Text>
      {answer !== null ? <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>바꾸기</Text> : null}
    </Pressable>
  );
}

/**
 * 질문 블록을 그리는 카드. 기본 질문 창처럼 탭으로 숨기지 않되, 질문이 여럿이면 세로로 길어져서(2026-10-26 사용자)
 * 답하는 질문 하나만 펼치고 답한 질문은 고른 답 한 줄로, 남은 질문은 질문 한 줄로 접는다.
 * 하나 고르기는 고르면 다음 질문이 열리고, 여러 개 고르기·직접 입력은 [다음]으로 넘어간다.
 */
export function QuestionCard(props: {
  theme: PluginTheme;
  block: QuestionBlock;
  answered?: QuestionAnswers | null;
  /** 자동 답변 설정으로 답했다. */
  auto?: boolean;
  /** 자동 답변을 보낼 시각. 기다리는 중이 아니면 null. */
  autoAt?: string | null;
  busy?: boolean;
  error?: string | null;
  onSubmit?(answers: QuestionAnswers): void;
  onStopAuto?(): void;
}) {
  const { theme, block, answered } = props;
  const secondsLeft = useSecondsLeft(answered ? null : (props.autoAt ?? null));
  const [picked, setPicked] = useState<Record<number, number[]>>({});
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const answers = block.questions.map((question, index) => answerOf(question, picked[index] ?? [], texts[index] ?? ""));
  const done = answers.filter((answer) => answer !== null).length;
  const disabled = Boolean(props.busy) || Boolean(answered);

  function nextUnanswered(qIndex: number, filled: readonly (string | null)[]): number | null {
    for (let step = 1; step <= block.questions.length; step += 1) {
      const index = (qIndex + step) % block.questions.length;
      if (filled[index] === null) return index;
    }
    return null;
  }

  function choose(qIndex: number, option: number) {
    // 사용자가 직접 고르기 시작하면 자리에 있는 것이라 자동 답변을 멈춘다.
    if (secondsLeft !== null) props.onStopAuto?.();
    const question = block.questions[qIndex];
    const multi = question.multiSelect === true;
    const current = picked[qIndex] ?? [];
    const next = multi ? (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]) : [option];
    setPicked((previous) => ({ ...previous, [qIndex]: next }));
    if (!multi && option !== OTHER) {
      setOpenIndex(nextUnanswered(qIndex, answers.map((answer, index) => (index === qIndex ? question.options[option].label : answer))));
    }
  }

  return (
    <View
      style={{
        maxWidth: 640,
        gap: answered ? 12 : 10,
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: answered ? theme.colors.border : theme.colors.accent,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name={answered ? "CircleCheck" : "MessageCircleQuestionMark"} size={16} color={answered ? theme.colors.statusSuccess : theme.colors.accent} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.foreground }} numberOfLines={2}>
          {block.title}
        </Text>
        {block.confirm && !answered ? (
          <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: theme.colors.statusWarning }}>
            <Text style={{ fontSize: 11, lineHeight: 16, color: theme.colors.statusWarning }}>확인 필수</Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>
          {answered ? (props.auto ? "자동 답변" : "답함") : `${done}/${block.questions.length} 답함`}
        </Text>
      </View>

      {secondsLeft !== null ? (
        <View style={{ gap: 5 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.surface2, overflow: "hidden" }}>
            <View style={{ width: `${Math.min(100, secondsLeft * 10)}%`, height: 3, backgroundColor: theme.colors.accent }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Paragraph style={{ flex: 1, fontSize: 12, lineHeight: 17, fontVariant: ["tabular-nums"], color: theme.colors.foregroundMuted }}>
              {secondsLeft}초 뒤 권장안으로 자동 답합니다. 직접 고르면 멈춥니다.
            </Paragraph>
            <Pressable accessibilityRole="button" onPress={() => props.onStopAuto?.()} hitSlop={8}>
              <Text style={{ fontSize: 12, color: theme.colors.accent }}>멈춤</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {answered ? (
        <View style={{ gap: 8 }}>
          {block.questions.map((question) => (
            <View key={question.header} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <HeaderChip theme={theme} label={question.header} />
              <Paragraph style={{ flex: 1, fontSize: 13, lineHeight: 19, color: theme.colors.foreground }}>{answered[question.header] ?? "답 없음"}</Paragraph>
            </View>
          ))}
        </View>
      ) : (
        <>
          <Context theme={theme} block={block} />
          <View style={{ borderTopWidth: 1, borderColor: theme.colors.border }}>
            {block.questions.map((question, qIndex) => {
              if (openIndex !== qIndex) {
                return (
                  <CollapsedQuestion
                    key={question.header}
                    theme={theme}
                    question={question}
                    answer={answers[qIndex]}
                    disabled={disabled}
                    onPress={() => setOpenIndex(qIndex)}
                  />
                );
              }
              const multi = question.multiSelect === true;
              const selected = picked[qIndex] ?? [];
              const typing = selected.includes(OTHER);
              const typed = typing && Boolean(texts[qIndex]?.trim());
              const canAdvance = multi ? selected.some((item) => item !== OTHER) || typed : typed;
              // 설명이 하나라도 있으면 줄마다 그린다. 칩과 줄을 섞으면 권장(맨 앞) 순서가 흐트러진다.
              const chips = question.options.every((option) => !option.description);
              return (
                <View key={question.header} style={{ gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.border }}>
                  <View style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <HeaderChip theme={theme} label={question.header} />
                      {multi ? <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>여러 개 고르기</Text> : null}
                    </View>
                    <Paragraph style={{ fontSize: 14, lineHeight: 21, fontWeight: "600", color: theme.colors.foreground }}>{question.question}</Paragraph>
                  </View>
                  {chips ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {question.options.map((option, oIndex) => (
                        <OptionChip
                          key={option.label}
                          theme={theme}
                          multi={multi}
                          selected={selected.includes(oIndex)}
                          label={option.label}
                          recommended={option.recommended}
                          disabled={disabled}
                          onPress={() => choose(qIndex, oIndex)}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={{ gap: 4 }}>
                      {question.options.map((option, oIndex) => (
                        <OptionRow
                          key={option.label}
                          theme={theme}
                          multi={multi}
                          selected={selected.includes(oIndex)}
                          label={option.label}
                          description={option.description}
                          recommended={option.recommended}
                          disabled={disabled}
                          onPress={() => choose(qIndex, oIndex)}
                        />
                      ))}
                    </View>
                  )}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Pressable
                      accessibilityRole={multi ? "checkbox" : "radio"}
                      accessibilityState={{ checked: typing }}
                      disabled={disabled}
                      onPress={() => choose(qIndex, OTHER)}
                      hitSlop={10}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 3 }}
                    >
                      <Icon name="PenLine" size={12} color={typing ? theme.colors.accent : theme.colors.foregroundMuted} />
                      <Text style={{ fontSize: 12, color: typing ? theme.colors.foreground : theme.colors.foregroundMuted }}>직접 입력</Text>
                    </Pressable>
                    <View style={{ flex: 1 }} />
                    {canAdvance ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setOpenIndex(nextUnanswered(qIndex, answers))}
                        style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}
                      >
                        <Text style={{ fontSize: 12, color: theme.colors.foreground }}>다음</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {typing ? (
                    <TextInput
                      value={texts[qIndex] ?? ""}
                      onChangeText={(text: string) => setTexts((previous) => ({ ...previous, [qIndex]: text }))}
                      placeholder="답을 입력하세요"
                      placeholderTextColor={theme.colors.foregroundMuted}
                      multiline
                      style={{
                        minHeight: 38,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surface0,
                        color: theme.colors.foreground,
                        fontSize: 13,
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
          {props.error ? <Paragraph style={{ fontSize: 12, lineHeight: 18, color: theme.colors.statusDanger }}>{props.error}</Paragraph> : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
            <Pressable
              accessibilityRole="button"
              disabled={disabled || done < block.questions.length}
              onPress={() => props.onSubmit?.(Object.fromEntries(block.questions.map((question, index) => [question.header, answers[index] ?? ""])))}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 8,
                backgroundColor: theme.colors.accent,
                opacity: disabled || done < block.questions.length ? 0.5 : 1,
              }}
            >
              <Icon name="Send" size={13} color={theme.colors.accentForeground} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.accentForeground }}>보내기</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

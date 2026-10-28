// Paseo 0.11.4 기본 질문 카드(packages/app/src/components/question-form-card.tsx)를 같은 크기·색으로 옮긴 것. 비교 캡처 전용.
import { Check, X } from "lucide-react";
import { Text, View } from "react-native";
import { previewTheme } from "./theme";

export interface AskQuestion {
  question: string;
  header: string;
  multiSelect?: boolean;
  options: { label: string; description?: string }[];
}

const c = previewTheme.colors;

function Control({ multi, selected }: { multi: boolean; selected: boolean }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        marginTop: 2,
        borderRadius: multi ? 4 : 999,
        borderWidth: 1,
        borderColor: selected ? c.accent : "#a1a1aa",
        backgroundColor: selected && multi ? c.accent : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {selected && multi ? <Check size={12} color={c.accentForeground} /> : null}
      {selected && !multi ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.accent }} /> : null}
    </View>
  );
}

export function NativeQuestionCard({ questions, active = 0, selected = {} }: { questions: AskQuestion[]; active?: number; selected?: Record<number, number[]> }) {
  const question = questions[active];
  const picked = selected[active] ?? [];
  const last = active === questions.length - 1;
  return (
    <View style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, gap: 12 }}>
      {questions.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, paddingHorizontal: 12 }}>
          {questions.map((item, index) => {
            const isActive = index === active;
            const answered = (selected[index] ?? []).length > 0;
            return (
              <View
                key={item.header}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  minHeight: 28,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  borderWidth: 1,
                  backgroundColor: isActive ? c.surface2 : c.surface1,
                  borderColor: isActive ? c.foregroundMuted : c.border,
                }}
              >
                {answered ? <Check size={12} color={isActive ? c.foreground : c.foregroundMuted} /> : null}
                <Text style={{ fontSize: 14, color: isActive ? c.foreground : c.foregroundMuted }} numberOfLines={1}>
                  {item.header}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
        <Text style={{ fontSize: 14, lineHeight: 22, color: c.foreground }}>{question.question}</Text>
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ gap: 4 }}>
          {question.options.map((option, index) => {
            const isSelected = picked.includes(index);
            return (
              <View key={option.label} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: isSelected ? c.surface2 : "transparent" }}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Control multi={question.multiSelect === true} selected={isSelected} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 14, lineHeight: 22, color: isSelected ? c.foreground : c.foregroundMuted }}>{option.label}</Text>
                    {option.description ? <Text style={{ fontSize: 14, lineHeight: 20, color: c.foregroundMuted }}>{option.description}</Text> : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ borderWidth: 1, borderRadius: 8, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, paddingVertical: 12 }}>
          <Text style={{ fontSize: 14, color: c.foregroundMuted }}>기타...</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1 }}>
          <X size={14} color={c.foregroundMuted} />
          <Text style={{ fontSize: 14, color: c.foregroundMuted }}>닫기</Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: c.accent,
            backgroundColor: c.accent,
            opacity: picked.length > 0 ? 1 : 0.5,
          }}
        >
          <Check size={14} color={c.accentForeground} />
          <Text style={{ fontSize: 14, color: c.accentForeground }}>{last ? "제출" : "다음"}</Text>
        </View>
      </View>
    </View>
  );
}

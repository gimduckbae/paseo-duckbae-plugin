import type { PluginTheme } from "@getpaseo/plugin";
import { Fragment, useMemo, type ReactNode } from "react";
import { Platform, Text, View, type TextStyle } from "react-native";
import { Paragraph } from "./paragraph";
import { reasoningBlocks } from "./reasoning-blocks";

/** 호스트 Markdown으로 그리면 본문과 같은 15/foreground가 되어 에이전트의 답변 글과 구별되지 않는다(2026-11-06 사용자 보고). */
export const REASONING_FONT_SIZE = 13;
export const REASONING_LINE_HEIGHT = 20;

const INLINE = /`[^`]+`|\*\*[^*]+\*\*/g;
// iOS에는 monospace라는 글꼴 이름이 없다.
const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";
const CODE_FONT_SIZE = 12;
const INDENT = 14;

function Inline({ theme, text }: { theme: PluginTheme; text: string }) {
  const code: TextStyle = { fontFamily: MONO, fontSize: CODE_FONT_SIZE, color: theme.colors.foreground, backgroundColor: theme.colors.surface2 };
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > at) parts.push(text.slice(at, start));
    const piece = match[0];
    parts.push(
      piece.startsWith("`") ? (
        <Text style={code}>{piece.slice(1, -1)}</Text>
      ) : (
        <Text style={{ fontWeight: "600" }}>{piece.slice(2, -2)}</Text>
      ),
    );
    at = start + piece.length;
  }
  if (at < text.length) parts.push(text.slice(at));
  return (
    <Fragment>
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
    </Fragment>
  );
}

export function ReasoningText({ theme, text }: { theme: PluginTheme; text: string }) {
  const blocks = useMemo(() => reasoningBlocks(text), [text]);
  const body: TextStyle = { fontSize: REASONING_FONT_SIZE, lineHeight: REASONING_LINE_HEIGHT, color: theme.colors.foregroundMuted };
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return (
            <View
              key={index}
              style={{ padding: 8, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface1 }}
            >
              <Text selectable style={{ fontFamily: MONO, fontSize: CODE_FONT_SIZE, lineHeight: 17, color: theme.colors.foregroundMuted }}>
                {block.text}
              </Text>
            </View>
          );
        }
        if (block.kind === "item") {
          return (
            <View key={index} style={{ flexDirection: "row", gap: 6, paddingLeft: block.depth * INDENT }}>
              <Text style={{ ...body, minWidth: 12 }}>{block.marker}</Text>
              <Paragraph selectable style={{ ...body, flex: 1 }}>
                <Inline theme={theme} text={block.text} />
              </Paragraph>
            </View>
          );
        }
        return (
          <Paragraph key={index} selectable style={block.kind === "heading" ? { ...body, fontWeight: "600" } : body}>
            <Inline theme={theme} text={block.text} />
          </Paragraph>
        );
      })}
    </View>
  );
}

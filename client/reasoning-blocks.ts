// 호스트 Markdown은 children만 받고 스타일을 받지 못한다(@getpaseo/plugin/client/ui MarkdownProps). 앱 안쪽
// MarkdownRenderer에는 compact·muted가 있지만 플러그인에 열려 있지 않아, 생각 글을 원문과 같은 크기·색으로
// 보이려면 우리가 읽어 그려야 한다.
const FENCE = /^[ \t]*(?:```|~~~)/;
const BULLET = /^([ \t]*)[-*+][ \t]+/;
const ORDERED = /^([ \t]*)(\d+)[.)][ \t]+/;
const HEADING = /^(#{1,6})[ \t]+/;

export type ReasoningBlock =
  | { kind: "code"; text: string }
  | { kind: "item"; marker: string; depth: number; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string };

function depthOf(indent: string): number {
  return Math.min(2, Math.floor(indent.replace(/\t/g, "  ").length / 2));
}

/**
 * 표는 생각 글에 거의 없고, 펜스 코드는 번역에서 빼 두므로 영어로 남는다(server/reasoning-text.ts segmentReasoning).
 * 한 문단 안의 줄바꿈은 호스트도 hardSoftBreaks로 살려 그린다(components/markdown/renderer.tsx MD4C_FLAGS).
 */
export function reasoningBlocks(text: string): ReasoningBlock[] {
  const blocks: ReasoningBlock[] = [];
  let lines: string[] = [];
  let code: string[] | null = null;
  const flush = () => {
    if (lines.length > 0) blocks.push({ kind: "paragraph", text: lines.join("\n") });
    lines = [];
  };
  for (const line of text.split("\n")) {
    if (FENCE.test(line)) {
      if (code) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else {
        flush();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: line.slice(heading[0].length) });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      blocks.push({ kind: "item", marker: "·", depth: depthOf(bullet[1]), text: line.slice(bullet[0].length) });
      continue;
    }
    const ordered = ORDERED.exec(line);
    if (ordered) {
      flush();
      blocks.push({ kind: "item", marker: `${ordered[2]}.`, depth: depthOf(ordered[1]), text: line.slice(ordered[0].length) });
      continue;
    }
    lines.push(line);
  }
  if (code) blocks.push({ kind: "code", text: code.join("\n") });
  flush();
  return blocks;
}

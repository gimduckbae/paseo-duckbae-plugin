import { hashText } from "../shared/hash";

/** keep: 번역기에 보내지 않고 그대로 두는 조각. */
export type ReasoningSegment =
  | { kind: "keep"; text: string }
  | { kind: "sentence"; text: string; masked: string; tokens: string[]; hash: string };

export type ReasoningSentence = Extract<ReasoningSegment, { kind: "sentence" }>;

const FENCE = /^[ \t]*(?:```|~~~)/;
// 머리표 뒤에 공백을 요구한다. 없으면 "3.14"의 "3."을 머리표로 잘라내 문장이 깨진다.
const LINE_PREFIX = /^[ \t>]*(?:(?:[-*+]|\d+[.)]|#{1,6})[ \t]+)?/;
// 숫자가 바로 뒤에 오는 마침표는 소수점·버전 번호다(0.13.0).
const TERMINATOR = /[.!?]+(?!\d)/g;
// 경로·중괄호·꺾쇠가 든 조각은 번역기가 쪼개거나 번역해 버린다.
const RISKY = /[\\/{}()<>]/;
const PLACEHOLDER = /\[\[(\d+)\]\]/g;

// 번역기가 자주 바꿔 놓는 낱말만 되돌린다. 치환이 조사를 흐트러뜨릴 수 있어(후크를 → 훅를) 목록을 늘리지 않는다.
const TERMS: readonly (readonly [string, string])[] = [
  ["변압기", "transformer"],
  ["스위트 룸", "suite"],
  ["낙태", "abort"],
  ["작업 트리", "worktree"],
  ["타임 라인", "타임라인"],
];

// 문장을 나누기 전에 가려야 `src/a.ts`의 점에서 문장이 끊기지 않는다.
function mask(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  const masked = text.replace(/`[^`]*`|\S+/g, (piece) => {
    if (!piece.startsWith("`") && !RISKY.test(piece)) return piece;
    tokens.push(piece);
    return `[[${tokens.length}]]`;
  });
  return { masked, tokens };
}

function restore(masked: string, tokens: string[]): string {
  return masked.replace(PLACEHOLDER, (_, index: string) => tokens[Number(index) - 1]);
}

// 자리표시자 번호를 문장마다 1부터 다시 매긴다. 같은 문장이 같은 캐시 열쇠가 되게.
function sentence(masked: string, lineTokens: string[]): ReasoningSentence {
  const tokens: string[] = [];
  const renumbered = masked.replace(PLACEHOLDER, (_, index: string) => {
    tokens.push(lineTokens[Number(index) - 1]);
    return `[[${tokens.length}]]`;
  });
  return { kind: "sentence", text: restore(renumbered, tokens), masked: renumbered, tokens, hash: hashText(renumbered) };
}

function pieces(body: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const match of body.matchAll(TERMINATOR)) {
    const end = (match.index ?? 0) + match[0].length;
    out.push(body.slice(start, end));
    start = end;
  }
  if (start < body.length) out.push(body.slice(start));
  return out;
}

export function unmask(translated: string, tokens: string[]): string | null {
  const numbers = [...translated.matchAll(PLACEHOLDER)].map((match) => Number(match[1]));
  if (numbers.length !== tokens.length) return null;
  if (new Set(numbers).size !== tokens.length) return null;
  if (numbers.some((number) => number < 1 || number > tokens.length)) return null;
  return restore(translated, tokens);
}

export function applyTerms(text: string): string {
  let result = text;
  for (const [from, to] of TERMS) result = result.split(from).join(to);
  return result;
}

/**
 * 조각의 text를 순서대로 이어 붙이면 원문이 그대로 나와야 한다.
 * 펜스 코드 블록은 통째로 빼둔다 — 번역기에 넣으면 코드가 한국어로 바뀐다.
 */
export function segmentReasoning(text: string): ReasoningSegment[] {
  const segments: ReasoningSegment[] = [];
  const keep = (piece: string) => segments.push({ kind: "keep", text: piece });
  let inFence = false;
  text.split("\n").forEach((line, index) => {
    if (index > 0) keep("\n");
    if (FENCE.test(line)) {
      inFence = !inFence;
      keep(line);
      return;
    }
    if (inFence) {
      keep(line);
      return;
    }
    const prefix = LINE_PREFIX.exec(line)?.[0] ?? "";
    if (prefix) keep(prefix);
    const { masked, tokens } = mask(line.slice(prefix.length));
    for (const piece of pieces(masked)) {
      const leading = /^\s*/.exec(piece)?.[0] ?? "";
      const trimmed = piece.trim();
      if (leading) keep(leading);
      if (trimmed) segments.push(sentence(trimmed, tokens));
      const trailing = piece.slice(leading.length + trimmed.length);
      if (trailing) keep(trailing);
    }
  });
  return segments;
}

export function renderReasoning(segments: ReasoningSegment[], translated: (hash: string) => string | undefined): string {
  return segments
    .map((segment) => {
      if (segment.kind === "keep") return segment.text;
      const korean = translated(segment.hash);
      if (!korean) return segment.text;
      const restored = unmask(korean, segment.tokens);
      return restored === null ? segment.text : applyTerms(restored);
    })
    .join("");
}

export function sentencesOf(segments: ReasoningSegment[]): ReasoningSentence[] {
  return segments.filter((segment): segment is ReasoningSentence => segment.kind === "sentence");
}

// 계정을 바꿔 이어갈 때 쓰는 인계 지침. 제공자(Claude·Codex·Grok)와 상관없이 이 문서 하나를 쓴다.
// 플러그인 서버는 자기 폴더 경로를 받지 못해 .md 대신 이 파일에 둔다.
// 새 에이전트는 인계 문서만 첫 프롬프트로 받는다. 대화를 통째로 넘기지 않으므로 이어서 일하는 데 필요한 것만 남기게 한다.

/** 지금 에이전트에게 보내는 요청. 답변 전체가 그대로 새 에이전트의 첫 프롬프트에 들어간다. */
export const HANDOFF_REQUEST = `[계정 전환 인계 요청]
이 작업은 다른 계정의 새 에이전트가 이어받습니다. 새 에이전트는 이 대화를 전혀 모르고, 지금 쓰는 답변 하나만 받습니다.
아래 형식의 인계 문서를 답변 전체로 출력하세요.

- 파일을 만들거나 고치지 말고, 작업도 더 진행하지 마세요. 상태 확인이 필요하면 읽기만 합니다.
- 대화 원문을 옮기지 말고 이어서 일하는 데 필요한 사실만 짧게 씁니다. 해당 없는 항목은 "없음"으로 둡니다.
- 확인하지 않은 내용은 "추정"이라고 표시합니다.
- 인계 문서 앞뒤에 다른 말을 붙이지 마세요.

# 인계 문서
## 목표
사용자가 원하는 결과와 범위. 사용자가 준 지시·선호는 그대로 옮긴다.
## 현재 상태
끝난 것, 진행 중인 것, 검증 결과.
## 작업 위치
작업 폴더, 브랜치·worktree, 커밋 여부, 실행 중인 서버나 프로세스.
## 관련 파일
- 경로 — 역할, 이번에 바꾼 내용
## 결정과 이유
## 시도했다 버린 것
## 다음 할 일
1. 바로 할 일부터 순서대로
## 주의
하지 말 것, 지켜야 할 규칙, 사용자 확인이 필요한 것.`;

export function continuationPrompt(input: { fromLabel: string; handoff: string; handoffPath: string }): string {
  return `[계정 전환으로 이어받은 작업]
이전 에이전트(${input.fromLabel})가 남긴 인계 문서입니다. 이 문서를 바탕으로 작업을 이어가세요.
시작하기 전에 작업 폴더의 실제 상태(git status 등)가 문서와 맞는지 확인하고, 사용자 확인이 필요한 일은 먼저 묻습니다.
인계 문서 원본: ${input.handoffPath}

${input.handoff}`;
}

const MESSAGE_LIMIT = 1_500;
const TOTAL_LIMIT = 12_000;

/** 지금 에이전트가 인계 문서를 쓸 수 없을 때(한도 도달 등) 최근 대화로 대신한다. */
export function timelineHandoff(reason: string, messages: { role: "user" | "assistant"; text: string }[]): string {
  const lines: string[] = [];
  let size = 0;
  for (const message of [...messages].reverse()) {
    const text = message.text.length > MESSAGE_LIMIT ? `${message.text.slice(0, MESSAGE_LIMIT)}…(생략)` : message.text;
    const line = `**${message.role === "user" ? "사용자" : "에이전트"}**: ${text}`;
    if (size + line.length > TOTAL_LIMIT) break;
    lines.unshift(line);
    size += line.length;
  }
  return `# 인계 문서 (최근 대화로 대신함)
이전 에이전트가 ${reason} 인계 문서를 쓰지 못해 최근 대화를 옮깁니다. 작업 폴더의 실제 상태를 먼저 확인하세요.

## 최근 대화
${lines.join("\n\n") || "없음"}`;
}

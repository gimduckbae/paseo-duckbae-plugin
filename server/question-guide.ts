// 새 에이전트의 시스템 프롬프트에 붙이는 질문 블록 안내. 제공자(Claude·Codex·Grok)와 상관없이 이 글 하나를 쓴다.
// Paseo는 systemPrompt를 기본 지침 뒤에 덧붙인다(Claude preset append, Codex developer_instructions, 0.11.4 소스 확인).
// 기본 질문 창(AskUserQuestion)은 앞 글을 가리고 플러그인이 바꿀 수 없어서 질문을 글로 쓰게 하고 카드로 그린다(2026-10-23).
import { QUESTION_FENCE } from "../shared/question";

const EXAMPLE = `${QUESTION_FENCE}
{
  "title": "운영 배포 3건",
  "summary": "운영 서버는 b7069a7이고 main에 기능 커밋 6개가 쌓였습니다.",
  "items": [
    {"name": "재고 추가상품 정리", "details": ["같은 이름 추가상품을 SKU 하나로 묶음"]}
  ],
  "notes": [
    {"tone": "warn", "text": "배포하면 서버 시작 때 SKU가 210개에서 8개로 자동 정리됩니다."}
  ],
  "confirm": true,
  "questions": [
    {
      "header": "배포",
      "question": "디자인팀 튜토리얼·재고 정리·통합 매니저 3건을 지금 배포할까요?",
      "multiSelect": false,
      "options": [
        {"label": "지금 배포", "description": "블루·그린으로 배포하고 결과를 보고", "recommended": true},
        {"label": "보류", "description": "지금은 배포하지 않음"}
      ]
    }
  ]
}
\`\`\``;

export const QUESTION_GUIDE = `[사용자에게 결정을 물을 때 — 질문 블록]
사용자가 골라야 할 결정은 AskUserQuestion 같은 질문 도구를 쓰지 말고, 답변 맨 끝에 아래 형식의 질문 블록을 써서 묻는다. Paseo 화면에서 이 블록은 선택 카드로 바뀐다.

${EXAMPLE}

- 고르는 데 필요한 사실(대상 이름, 무엇이 바뀌는지, 위험·비용)은 모두 블록 안(summary·items·notes·description)에 쓴다. "이 3건", "위 내용"처럼 블록 밖 글을 가리키지 않는다.
- 블록 앞에는 평소처럼 설명·표를 써도 된다. 다만 카드만 보고도 고를 수 있게 꼭 필요한 사실은 블록 안에도 넣는다.
- 블록은 답변마다 하나, 맨 끝에 둔다. 블록을 쓴 뒤에는 작업을 더 진행하지 말고 턴을 끝낸다.
- JSON만 쓴다(큰따옴표, 주석·끝 쉼표 없음). summary·items·notes는 필요 없으면 뺀다.
- questions는 1~4개. header는 12자 이하로 질문마다 다르게, question은 무엇을 정하는지 한 문장으로 물음표로 끝낸다.
- options는 2~4개, 서로 겹치지 않게. 권하는 답을 맨 앞에 두고 "recommended": true로 표시한다(label에 "(권장)"을 쓰지 않는다). description에는 고르면 무엇이 어떻게 되는지 한 줄.
- 여러 개를 함께 고를 수 있을 때만 "multiSelect": true. 직접 입력 칸은 카드가 늘 붙인다.
- 사용자가 자동 답변을 켜 두면 자리에 없을 때 권장안("recommended": true)으로 답이 온다. 권장안은 그대로 진행해도 되는 답에만 붙인다.
- 배포·운영 DB 쓰기·push·삭제·돈이 드는 일처럼 되돌리기 어려운 결정을 묻는 블록에는 "confirm": true를 넣는다. 이 블록은 자동 답변 없이 사람이 답할 때까지 기다린다.
- 자동 답변에서 권장안이 없던 질문은 "권장안 없음 · 에이전트 판단"으로 온다. 그 질문은 스스로 판단해 정하고, 무엇을 골랐는지와 이유를 다음 보고에 적는다.
- 답은 "[질문 답변] 제목"으로 시작하는 메시지로 온다(줄마다 "- header: 답"). 사용자가 카드 대신 글로 답할 수도 있다. 답이 되묻는 말이면 설명한 뒤 다시 묻는다.`;

// 기본 질문 창(AskUserQuestion)과 플러그인 질문 카드를 나란히 비교하는 예시. 미리보기 캡처 전용.
import type { QuestionAnswers, QuestionBlock } from "../../shared/question";
import type { AskQuestion } from "./native-question";

export interface QuestionSample {
  id: string;
  caption: string;
  native: AskQuestion[];
  nativeActive?: number;
  nativeSelected?: Record<number, number[]>;
  /** 기본 질문 창으로 물었을 때 생기는 문제. */
  nativeNote: string;
  block: QuestionBlock;
  answered: QuestionAnswers;
}

export const SAMPLES: QuestionSample[] = [
  {
    id: "deploy",
    caption: "운영 배포 3건 · 예시",
    native: [
      {
        question: "이 3건을 운영에 배포할까요?",
        header: "배포",
        options: [
          { label: "지금 배포 (권장)", description: "블루·그린으로 배포한 뒤 상태 확인 결과를 보고" },
          { label: "검색 개선과 한 번에", description: "진행 중인 검색 개선을 합친 뒤 같이 배포" },
          { label: "보류", description: "지금은 배포하지 않음" },
        ],
      },
    ],
    nativeNote: "앞에 쓴 '배포 대기 3건' 설명이 질문 창에 가려져, 무엇을 배포하는지 질문 창만 보고는 알 수 없습니다.",
    block: {
      title: "운영 배포 3건",
      summary: "운영 서버는 a1b2c3d이고 main에 기능 커밋 6개가 쌓였습니다. 바뀐 곳은 서버·웹뿐이고 설정 파일은 그대로입니다.",
      items: [
        { name: "댓글 알림 메일", details: ["새 댓글이 달리면 글쓴이에게 메일", "하루 알림은 20건까지"] },
        { name: "태그 정리", details: ["같은 이름 태그를 하나로 묶음", "잘못 묶인 태그는 '떼어 내기'로 뺌"] },
        { name: "검색 자동 완성", details: ["최근 검색어와 인기 글 제목에서 추천", "DB에 새 표 2개가 서버 시작 때 만들어짐"] },
      ],
      notes: [
        { tone: "warn", text: "배포하면 서버 시작 때 태그가 자동 정리됩니다: 1,240개 → 310개 (빠지는 태그는 보관)" },
        { tone: "info", text: "메일 발송 비용 · 1,000통에 약 $0.10" },
      ],
      questions: [
        {
          header: "배포",
          question: "운영 배포 3건(댓글 알림·태그 정리·검색 자동 완성)을 지금 배포할까요?",
          options: [
            { label: "지금 배포", recommended: true, description: "블루·그린으로 배포한 뒤 상태 확인과 태그 수 변화를 보고" },
            { label: "검색 개선과 한 번에", description: "진행 중인 검색 개선을 합친 뒤 같이 배포" },
            { label: "보류", description: "지금은 배포하지 않음" },
          ],
        },
      ],
    },
    answered: { 배포: "지금 배포" },
  },
  {
    id: "memo",
    caption: "메모 보드 기획 · 예시",
    native: [
      {
        question: "메모를 어디에 저장할까요?",
        header: "저장 범위",
        options: [
          { label: "회원별 서버 저장 (권장)", description: "어느 기기에서 열어도 같은 메모" },
          { label: "기기에만 저장", description: "브라우저를 바꾸면 안 보임" },
        ],
      },
      { question: "메모는 어떤 모양으로 쓰게 할까요?", header: "메모 형태", options: [{ label: "자유 글 한 칸 (권장)" }, { label: "포스트잇 여러 장" }, { label: "체크리스트" }] },
      { question: "보드를 어떻게 나눌지는 어떻게 정할까요?", header: "나누는 모양", options: [{ label: "시안 2~3개 보고 고르기 (권장)" }, { label: "반반으로 바로 만들기" }] },
    ],
    nativeNote: "질문 3개가 탭으로 나뉘어 첫 탭만 보이고, 설명 없는 선택지는 고르면 무엇이 달라지는지 알 수 없습니다.",
    block: {
      title: "메모 보드 기획",
      summary: "대시보드 오른쪽에 메모 칸을 붙입니다. 저장 방식·모양·배치를 정해야 만들 수 있습니다.",
      questions: [
        {
          header: "저장 범위",
          question: "메모를 어디에 저장할까요?",
          options: [
            { label: "회원별 서버 저장", recommended: true, description: "어느 기기에서 열어도 같은 메모, 서버에 표 1개 추가" },
            { label: "기기에만 저장", description: "브라우저를 바꾸면 안 보임, 서버는 그대로" },
          ],
        },
        {
          header: "메모 형태",
          question: "메모는 어떤 모양으로 쓰게 할까요?",
          options: [
            { label: "자유 글 한 칸", recommended: true, description: "가장 단순하고, 나중에 다른 모양을 더할 수 있음" },
            { label: "포스트잇 여러 장", description: "색·위치를 고를 수 있음, 만드는 데 2배" },
            { label: "체크리스트", description: "할 일을 체크하고 완료 표시" },
          ],
        },
        {
          header: "나누는 모양",
          question: "보드를 어떻게 나눌지는 어떻게 정할까요?",
          options: [
            { label: "시안 2~3개 보고 고르기", recommended: true, description: "HTML 시안을 먼저 보여 드림" },
            { label: "반반으로 바로 만들기", description: "왼쪽 대시보드, 오른쪽 메모로 바로 만듦" },
          ],
        },
      ],
    },
    answered: { "저장 범위": "회원별 서버 저장", "메모 형태": "자유 글 한 칸", "나누는 모양": "시안 2~3개 보고 고르기" },
  },
  {
    id: "manager",
    caption: "도움말 봇 합치기 · 예시",
    native: [
      {
        question: "AI 답변을 회원마다 하루 몇 번까지 허용할까요?",
        header: "하루 상한",
        options: [{ label: "20번 (권장)" }, { label: "50번" }, { label: "100번" }, { label: "제한 없음" }],
      },
      {
        question: "합치기 전에 같이 고칠 것을 골라 주세요.",
        header: "작은 수정",
        multiSelect: true,
        options: [{ label: "'아직 못 해요' 문구 (권장)" }, { label: "비용 화면 모델 이름표 (권장)" }, { label: "로그 보관 30일" }, { label: "없음" }],
      },
    ],
    nativeActive: 1,
    nativeSelected: { 1: [0] },
    nativeNote: "여러 개 고르기 탭에서는 설명이 없어 각 수정이 무엇을 바꾸는지 알 수 없습니다.",
    block: {
      title: "도움말 봇 합치기",
      summary: "도움말 봇 diff를 확인했습니다. 시험 15개와 빌드가 통과했습니다.",
      notes: [{ tone: "info", text: "AI 답은 운영자 비용 · 한 번 약 $0.0006" }],
      questions: [
        {
          header: "하루 상한",
          question: "AI 답변을 회원마다 하루 몇 번까지 허용할까요?",
          options: [
            { label: "20번", recommended: true, description: "보통 쓰기엔 충분하고 남용을 막음" },
            { label: "50번", description: "자주 쓰는 회원도 거의 막히지 않음" },
            { label: "100번", description: "비용이 늘 수 있음" },
            { label: "제한 없음", description: "비용 상한이 없음" },
          ],
        },
        {
          header: "작은 수정",
          question: "합치기 전에 같이 고칠 것을 골라 주세요?",
          multiSelect: true,
          options: [
            { label: "'아직 못 해요' 문구", recommended: true, description: "답을 못 할 때 문구를 부드럽게" },
            { label: "비용 화면 모델 이름표", recommended: true, description: "비용 표에 모델 이름을 표시" },
            { label: "로그 보관 30일", description: "질문 기록을 30일 뒤 지움" },
            { label: "없음", description: "지금 그대로 합침" },
          ],
        },
      ],
    },
    answered: { "하루 상한": "20번", "작은 수정": "'아직 못 해요' 문구, 비용 화면 모델 이름표" },
  },
  {
    id: "marketing",
    caption: "공지 기능 설정 · 예시",
    native: [
      { question: "공지 목록에서 회원에게 무엇을 보여 줄까요?", header: "정보 범위", options: [{ label: "다 보이기 (권장)", description: "제목·날짜·작성자 모두" }, { label: "제목만", description: "작성자는 숨김" }] },
      { question: "공지를 누가 고칠 수 있게 할까요?", header: "편집 권한", options: [{ label: "관리자만 (권장)" }, { label: "운영 직원도" }] },
      { question: "지난 공지를 얼마나 남길까요?", header: "보관 기간", options: [{ label: "1년 (권장)" }, { label: "계속" }] },
      {
        question: "남은 문구와 작은 화면 버그 가운데 무엇을 고칠까요?",
        header: "정리할 것",
        multiSelect: true,
        options: [{ label: "'시험용' 문구 바꾸기 (권장)" }, { label: "'준비 중' 안내 지우기 (권장)" }, { label: "글자 겹침 고치기 (권장)" }, { label: "천 단위 쉼표 (권장)" }],
      },
    ],
    nativeNote: "질문 4개가 탭으로 나뉘어, 앞에서 고른 답을 다시 보려면 탭을 하나씩 눌러야 합니다.",
    block: {
      title: "공지 기능 설정",
      summary: "공지 게시판을 회원 화면에 붙입니다. 보여 줄 정보와 권한, 남은 정리 거리를 정해 주세요.",
      questions: [
        {
          header: "정보 범위",
          question: "공지 목록에서 회원에게 무엇을 보여 줄까요?",
          options: [
            { label: "다 보이기", recommended: true, description: "제목·날짜·작성자 모두" },
            { label: "제목만", description: "작성자는 숨김" },
          ],
        },
        {
          header: "편집 권한",
          question: "공지를 누가 고칠 수 있게 할까요?",
          options: [
            { label: "관리자만", recommended: true, description: "실수로 바뀌는 일을 막음" },
            { label: "운영 직원도", description: "직원이 바로 고칠 수 있음" },
          ],
        },
        {
          header: "보관 기간",
          question: "지난 공지를 얼마나 남길까요?",
          options: [
            { label: "1년", recommended: true, description: "1년 지난 공지는 보관함으로" },
            { label: "계속", description: "지우지 않음" },
          ],
        },
        {
          header: "정리할 것",
          question: "남은 문구와 작은 화면 버그 가운데 무엇을 고칠까요?",
          multiSelect: true,
          options: [
            { label: "'시험용' 문구 바꾸기", recommended: true, description: "버튼의 '시험용' 글을 실제 이름으로" },
            { label: "'준비 중' 안내 지우기", recommended: true, description: "이미 되는 기능의 '준비 중' 안내" },
            { label: "글자 겹침 고치기", recommended: true, description: "좁은 화면에서 제목과 날짜가 겹침" },
            { label: "천 단위 쉼표", recommended: true, description: "조회 수에 쉼표" },
          ],
        },
      ],
    },
    answered: { "정보 범위": "다 보이기", "편집 권한": "관리자만", "보관 기간": "1년", "정리할 것": "'시험용' 문구 바꾸기, 글자 겹침 고치기" },
  },
  {
    id: "images",
    caption: "옛 Docker 이미지 정리 · 예시",
    native: [
      { question: "어떤 이미지를 정리할까요?", header: "정리 범위", options: [{ label: "태그 없는 이미지만 (Recommended)" }, { label: "30일 넘은 이미지 전부" }] },
      { question: "롤백용 직전 이미지는 어떻게 할까요?", header: "롤백 이미지", options: [{ label: "한 세대 보관 (Recommended)" }, { label: "확인 후 바로 삭제" }] },
      { question: "오늘 배포로 밀려난 옛 이미지(backend 632MB, frontend 210MB)를 지금 정리할까요?", header: "오늘 정리", options: [{ label: "지금 정리" }, { label: "다음 배포 때" }] },
      { question: "정리 스크립트를 저장소에 커밋하고 push할까요?", header: "커밋·push", options: [{ label: "커밋 + push" }, { label: "커밋만" }] },
    ],
    nativeNote: "권장 표시가 영어 '(Recommended)'로 붙고, 운영 서버에서 이미지를 지우는 일인데 무엇이 지워지는지 질문 창에 없습니다.",
    block: {
      title: "옛 Docker 이미지 정리",
      summary: "운영 서버 디스크가 82% 찼습니다. 배포 때마다 남은 옛 이미지가 대부분입니다.",
      notes: [{ tone: "warn", text: "운영 서버에서 이미지를 지우는 일입니다. 보관하지 않은 이미지는 되돌릴 수 없습니다." }],
      questions: [
        {
          header: "정리 범위",
          question: "어떤 이미지를 정리할까요?",
          options: [
            { label: "태그 없는 이미지만", recommended: true, description: "어디에도 안 쓰이는 이미지만 지움, 약 4GB" },
            { label: "30일 넘은 이미지 전부", description: "약 9GB, 오래된 롤백 이미지도 지워짐" },
          ],
        },
        {
          header: "롤백 이미지",
          question: "롤백용 직전 이미지는 어떻게 할까요?",
          options: [
            { label: "한 세대 보관", recommended: true, description: "바로 전 버전 하나는 남김" },
            { label: "확인 후 바로 삭제", description: "배포 확인이 끝나면 지움" },
          ],
        },
        {
          header: "오늘 정리",
          question: "오늘 배포로 밀려난 옛 이미지(backend 632MB, frontend 210MB)를 지금 정리할까요?",
          options: [
            { label: "지금 정리", recommended: true, description: "위 기준대로 바로 지움" },
            { label: "다음 배포 때", description: "다음 배포 스크립트가 정리" },
          ],
        },
        {
          header: "커밋·push",
          question: "정리 스크립트를 저장소에 커밋하고 push할까요?",
          options: [
            { label: "커밋만", recommended: true, description: "push는 확인 뒤에" },
            { label: "커밋 + push", description: "main에 바로 올림" },
          ],
        },
      ],
    },
    answered: { "정리 범위": "태그 없는 이미지만", "롤백 이미지": "한 세대 보관", "오늘 정리": "지금 정리", "커밋·push": "커밋만" },
  },
];

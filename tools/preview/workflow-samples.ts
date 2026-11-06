// 값은 실제로 돈 기록 wf_fdfc102b-fe0(2026-11-06, 에이전트 5명 24분 42초)·wf_3801297a-e3e(2026-11-02 지사 7곳)에서 가져왔다.
import type { WorkflowCardItem, WorkflowProgress } from "../../shared/workflow";

const SESSION = "C:\\Users\\gimduckbae\\.paseo\\paseo-duckbae-plugin\\claude\\7f06f8cf-e097-4510-95ca-c4732853ddab\\projects\\C--Users-gimduckbae-Desktop-WorkSpace\\b39b7922-ec6f-40dc-9893-0ab467972c78";

export const SCRIPT = `export const meta = {
  name: 'naver-product-mgmt-plan',
  description: '오피스 네이버 상품관리 편의기능: 현재 기능·커머스API·네이버 로그인을 조사해 제품 원칙 기준 제안서와 반대 검토',
  phases: [
    { title: 'Research', detail: '현재 화면·커머스API·네이버 로그인을 따로 조사' },
    { title: 'Synthesize', detail: '조사 셋을 제품 원칙으로 걸러 제안서 하나' },
    { title: 'Review', detail: '같은 저장소 결정과 부딪히는지 반대로 검토' },
  ],
};

export default async function run({ agent, phase }) {
  const research = await phase('Research', () =>
    Promise.all([
      agent({ label: 'research:현재 화면', prompt: PROMPT_SCREENS }),
      agent({ label: 'research:커머스API', prompt: PROMPT_COMMERCE }),
      agent({ label: 'research:네이버 로그인', prompt: PROMPT_LOGIN }),
    ]),
  );
  const proposal = await phase('Synthesize', () => agent({ label: 'synthesize', prompt: synthesize(research) }));
  const review = await phase('Review', () => agent({ label: 'review', prompt: review(proposal) }));
  return { research, proposal, review };
}`;

export const CARD: WorkflowCardItem = {
  runId: "wf_fdfc102b-fe0",
  transcriptDir: `${SESSION}\\subagents\\workflows\\wf_fdfc102b-fe0`,
  name: "naver-product-mgmt-plan",
  summary: "오피스 네이버 상품관리 편의기능: 현재 기능·커머스API·네이버 로그인을 조사해 제품 원칙 기준 제안서와 반대 검토",
  taskId: "wrk8dkq3i",
  script: SCRIPT,
  scriptPath: `${SESSION}\\workflows\\scripts\\naver-product-mgmt-plan-wf_fdfc102b-fe0.js`,
};

const SCREENS = "기준 코드: storeart_market 메인 7407b8a(P0·P1a 포함). 상품 등록은 도우미가 커머스API로 직접 올리고, 웹은 후보 값만 만든다.";
const COMMERCE = "네이버 커머스API 문서 2.91.0(2026-11-06 확인)으로 보면 상품의 처음부터 끝까지에 필요한 API는 모두 있습니다.";
const LOGIN = "도우미의 네이버 로그인은 일반 네이버 아이디 로그인입니다. 지금은 리뷰 수집과 참고 상세페이지 읽기에만 씁니다.";

export const RUNNING: WorkflowProgress = {
  state: "running",
  phases: [
    {
      title: "Research",
      detail: null,
      agents: [
        { agentId: "aad3815db4eb717e7", label: "research:현재 화면", done: true, toolCount: 6, resultPreview: SCREENS },
        { agentId: "aa883efb1e6182d50", label: "research:커머스API", done: true, toolCount: 3, resultPreview: COMMERCE },
        { agentId: "a70f65eaf99b648a9", label: "research:네이버 로그인", done: false, toolCount: null, resultPreview: null },
      ],
    },
  ],
  startedCount: 3,
  doneCount: 2,
  agentCount: null,
  status: null,
  durationMs: null,
  totalTokens: null,
  totalToolCalls: null,
  error: null,
};

export const WAITING: WorkflowProgress = {
  state: "waiting",
  phases: [],
  startedCount: 0,
  doneCount: 0,
  agentCount: null,
  status: null,
  durationMs: null,
  totalTokens: null,
  totalToolCalls: null,
  error: null,
};

export const FINISHED: WorkflowProgress = {
  state: "finished",
  phases: [
    {
      title: "Research",
      detail: "현재 화면·커머스API·네이버 로그인을 따로 조사",
      agents: [
        { agentId: "aad3815db4eb717e7", label: "research:현재 화면", done: true, toolCount: 6, resultPreview: SCREENS },
        { agentId: "aa883efb1e6182d50", label: "research:커머스API", done: true, toolCount: 3, resultPreview: COMMERCE },
        { agentId: "a70f65eaf99b648a9", label: "research:네이버 로그인", done: true, toolCount: 5, resultPreview: LOGIN },
      ],
    },
    {
      title: "Synthesize",
      detail: "조사 셋을 제품 원칙으로 걸러 제안서 하나",
      agents: [{ agentId: "a2824d64213dab185", label: "synthesize", done: true, toolCount: 2, resultPreview: "# 네이버 상품관리 편의기능 제안서 (2026-11-06)" }],
    },
    {
      title: "Review",
      detail: "같은 저장소 결정과 부딪히는지 반대로 검토",
      agents: [
        {
          agentId: "a0dc6003d6bdb55b0",
          label: "review",
          done: true,
          toolCount: 4,
          resultPreview: "방향(커머스API만 쓰기, 센터 로그인 빼기, 용어 문서 한 곳)은 원칙에 맞습니다. 다만 핵심 권장 세 가지가 저장소에 이미 있는 결정과 부딪힙니다.",
        },
      ],
    },
  ],
  startedCount: 5,
  doneCount: 5,
  agentCount: 5,
  status: "completed",
  durationMs: 1_481_618,
  totalTokens: 1_177_585,
  totalToolCalls: 259,
  error: null,
};

export const KILLED: WorkflowProgress = {
  state: "finished",
  phases: [
    {
      title: "Branches",
      detail: "지사마다 통화 기록에서 키워드를 센다",
      agents: [
        { agentId: "a541c206900d4bafd", label: "지사:시흥", done: true, toolCount: 3, resultPreview: null },
        { agentId: "ac0cd6792172c38b2", label: "지사:가산", done: false, toolCount: null, resultPreview: null },
        { agentId: "aea686cc82927fc86", label: "지사:수원", done: false, toolCount: null, resultPreview: null },
        { agentId: "a01ab0b69d31a5325", label: "지사:고잔", done: false, toolCount: null, resultPreview: null },
        { agentId: "a3ea7f5123a8a2d6a", label: "지사:안양", done: false, toolCount: null, resultPreview: null },
        { agentId: "a785ff8d6ac874f49", label: "지사:제주", done: false, toolCount: null, resultPreview: null },
        { agentId: "a778de662233d6ba8", label: "지사:안산", done: false, toolCount: null, resultPreview: null },
      ],
    },
  ],
  startedCount: 7,
  doneCount: 1,
  agentCount: 7,
  status: "killed",
  durationMs: 79_332,
  totalTokens: 530_554,
  totalToolCalls: 79,
  error: "Error: Workflow aborted",
};

export const KILLED_CARD: WorkflowCardItem = {
  runId: "wf_3801297a-e3e",
  transcriptDir: `${SESSION}\\subagents\\workflows\\wf_3801297a-e3e`,
  name: "branch-keyword-calls",
  summary: "지사 7곳의 통화 기록에서 키워드가 나온 건을 세고 리뷰 전후를 가른다",
  taskId: "w133gdol2",
  script: null,
  scriptPath: `${SESSION}\\workflows\\scripts\\branch-keyword-calls-wf_3801297a-e3e.js`,
};

export const PROGRESS_BY_RUN: Record<string, WorkflowProgress> = {
  "wf_fdfc102b-fe0": FINISHED,
  "wf-running": RUNNING,
  "wf-waiting": WAITING,
  "wf_3801297a-e3e": KILLED,
};

export const LAUNCH_OUTPUT = `Workflow launched in background. Task ID: wrk8dkq3i
Summary: ${CARD.summary}
Transcript dir: ${CARD.transcriptDir}
Script file: ${CARD.scriptPath}
(Edit this file with Write/Edit and re-invoke Workflow with {scriptPath: "${CARD.scriptPath}"} to iterate without resending the script.)
Run ID: wf_fdfc102b-fe0
To resume after editing the script: Workflow({scriptPath: "${CARD.scriptPath}", resumeFromRunId: "wf_fdfc102b-fe0"}) — completed agents return cached results.

You will be notified when it completes. Use /workflows to watch live progress.`;

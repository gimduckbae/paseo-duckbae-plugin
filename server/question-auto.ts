import type { PaseoApi } from "./paseo-types";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import { QUESTION_AUTO_NOTE_ITEM_KIND, type QuestionAnswers, type QuestionAutoNoteItem, type QuestionBlock } from "../shared/question";
import { parseQuestionBlock, splitQuestionBlock } from "../shared/question-parse";
import { isObject } from "./json-lines";
import type { QuestionStore } from "./questions";
import type { AccountStore } from "./store";

const AUTO_DELAY_MS = 10_000;
const BLOCK_DECIDE = "권장안 없음 · 에이전트 판단";
const BLOCK_NOTE =
  "(자동 답변 설정에 따라 권장안으로 답했습니다. 사용자는 자리에 없을 수 있습니다. '권장안 없음 · 에이전트 판단'인 질문은 직접 판단해 정하고, 무엇을 골랐는지와 그 이유를 다음 보고에 적어 주세요.)";
const NATIVE_DECIDE = "권장안이 없습니다. 사용자가 자리에 없어 자동으로 답하는 중이니 직접 판단해서 정하고, 무엇을 골랐는지와 그 이유를 다음 보고에 적어 주세요.";
// 기본 질문 창에는 권장 표시 필드가 없어 Claude가 선택지 이름에 붙이는 표시로 고른다.
const RECOMMENDED_LABEL = /\((recommended|권장)\)/i;

function blockAnswers(block: QuestionBlock): QuestionAnswers {
  return Object.fromEntries(
    block.questions.map((question) => {
      const picks = question.options.filter((option) => option.recommended).map((option) => option.label);
      return [question.header, picks.length === 0 ? BLOCK_DECIDE : question.multiSelect ? picks.join(", ") : picks[0]];
    }),
  );
}

interface NativeQuestion {
  question: string;
  header: string;
  multiSelect: boolean;
  labels: string[];
}

function nativeQuestions(input: unknown): NativeQuestion[] {
  if (!isObject(input) || !Array.isArray(input.questions)) return [];
  return input.questions.flatMap((item): NativeQuestion[] => {
    if (!isObject(item) || typeof item.question !== "string") return [];
    const labels = Array.isArray(item.options) ? item.options.flatMap((option) => (isObject(option) && typeof option.label === "string" ? [option.label] : [])) : [];
    const header = typeof item.header === "string" && item.header ? item.header : item.question;
    return [{ question: item.question, header, multiSelect: item.multiSelect === true, labels }];
  });
}

// Claude는 answers[질문 문장] 다음 answers[header]를, Codex는 answers[header]만 읽는다(0.13 소스). 여러 개는 쉼표로 잇는다.
function nativeAnswers(questions: readonly NativeQuestion[]): { byKey: Record<string, string>; list: QuestionAutoNoteItem["answers"] } {
  const byKey: Record<string, string> = {};
  const list: QuestionAutoNoteItem["answers"] = [];
  for (const question of questions) {
    const picks = question.labels.filter((label) => RECOMMENDED_LABEL.test(label));
    const answer = picks.length === 0 ? NATIVE_DECIDE : question.multiSelect ? picks.join(", ") : picks[0];
    byKey[question.question] = answer;
    byKey[question.header] = answer;
    list.push({ header: question.header, answer: picks.length === 0 ? "권장안 없음 · 에이전트 판단" : answer });
  }
  return { byKey, list };
}

function noteRow(note: QuestionAutoNoteItem) {
  return { type: "plugin" as const, id: `question-auto-${note.requestId}`, kind: QUESTION_AUTO_NOTE_ITEM_KIND, version: 1, data: note };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Pending {
  timer: NodeJS.Timeout;
  autoAt: string;
  onStop?(): Promise<void>;
  onUser?(): Promise<void>;
}

/**
 * 에이전트 질문(질문 블록, 기본 질문 창)에 권장안으로 답한다. 설정은 전역 하나(wait·delay·instant).
 * 질문 블록에 confirm이 있으면 설정과 상관없이 사용자를 기다린다. 타이머는 메모리에만 있다.
 */
export class QuestionAuto {
  private readonly pending = new Map<string, Map<string, Pending>>();

  constructor(
    private readonly store: AccountStore,
    private readonly questions: QuestionStore,
  ) {}

  pendingOf(agentId: string): Record<string, string> {
    return Object.fromEntries([...(this.pending.get(agentId)?.entries() ?? [])].map(([key, pending]) => [key, pending.autoAt]));
  }

  /** 턴 끝 답변에 질문 블록이 있으면 true. 답을 기다리는 대화에는 정리 제안을 붙이지 않는다. */
  async afterTurn(paseo: PaseoApi, agentId: string, reply: string): Promise<boolean> {
    const parts = splitQuestionBlock(reply);
    if (!parts) return false;
    const card = parseQuestionBlock(parts.raw);
    const mode = this.store.questionAuto;
    if (card.status !== "ready" || mode === "wait" || card.block.confirm || this.questions.has(agentId, card.key)) return true;
    const { key, block } = card;
    const send = () => this.questions.answer(paseo, { agentId, key, title: block.title, answers: blockAnswers(block), by: "auto", note: BLOCK_NOTE });
    if (mode === "instant") await send().catch(() => undefined);
    else this.schedule(agentId, key, send, {});
    return true;
  }

  async onPermission(paseo: PaseoApi, agentId: string, request: AgentPermissionRequest): Promise<void> {
    const mode = this.store.questionAuto;
    if (request.kind !== "question" || mode === "wait") return;
    const questions = nativeQuestions(request.input);
    if (questions.length === 0) return;
    const { byKey, list } = nativeAnswers(questions);
    const handle = paseo.agents.ref(agentId);
    let note: QuestionAutoNoteItem = { requestId: request.id, answers: list, autoAt: null, status: "pending", error: null };
    const write = async (patch: Partial<QuestionAutoNoteItem>) => {
      note = { ...note, ...patch };
      await handle.timeline.append(noteRow(note));
    };
    const respond = async () => {
      try {
        await handle.respondToPermission({ requestId: request.id, response: { behavior: "allow", updatedInput: { ...request.input, answers: byKey } } });
        await write({ status: "auto", autoAt: null });
      } catch (error) {
        await write({ status: "failed", autoAt: null, error: errorText(error) });
      }
    };
    if (mode === "instant") {
      await respond();
      return;
    }
    const autoAt = this.schedule(agentId, request.id, respond, {
      onStop: () => write({ status: "stopped", autoAt: null }),
      onUser: () => write({ status: "user", autoAt: null }),
    });
    await write({ autoAt });
  }

  /** 사용자가 기본 질문 창에서 직접 답했다. */
  async onPermissionResolved(agentId: string, requestId: string): Promise<void> {
    await this.take(agentId, requestId)?.onUser?.();
  }

  /** 사용자가 메시지를 보냈으면 자리에 있으므로 기다리던 자동 답변을 멈춘다. */
  async onTurnStarted(agentId: string): Promise<void> {
    await Promise.all([...(this.pending.get(agentId)?.keys() ?? [])].map((key) => this.stop(agentId, key)));
  }

  async stop(agentId: string, key: string): Promise<void> {
    await this.take(agentId, key)?.onStop?.();
  }

  forget(agentId: string): void {
    for (const pending of this.pending.get(agentId)?.values() ?? []) clearTimeout(pending.timer);
    this.pending.delete(agentId);
  }

  dispose(): void {
    for (const agentId of [...this.pending.keys()]) this.forget(agentId);
  }

  private schedule(agentId: string, key: string, run: () => Promise<void>, hooks: Pick<Pending, "onStop" | "onUser">): string {
    const autoAt = new Date(Date.now() + AUTO_DELAY_MS).toISOString();
    const timer = setTimeout(() => {
      this.take(agentId, key);
      void run().catch(() => undefined);
    }, AUTO_DELAY_MS);
    const map = this.pending.get(agentId) ?? new Map<string, Pending>();
    map.set(key, { timer, autoAt, ...hooks });
    this.pending.set(agentId, map);
    return autoAt;
  }

  private take(agentId: string, key: string): Pending | undefined {
    const map = this.pending.get(agentId);
    const pending = map?.get(key);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    map?.delete(key);
    return pending;
  }
}

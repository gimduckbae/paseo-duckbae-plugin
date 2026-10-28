import type { PaseoApi } from "./paseo-types";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { QuestionAnswers } from "../shared/question";

interface StoredAnswer {
  answers: QuestionAnswers;
  at: string;
  by?: "auto";
}

export function answerMessage(title: string, answers: QuestionAnswers): string {
  return [`[질문 답변] ${title}`, ...Object.entries(answers).map(([header, answer]) => `- ${header}: ${answer}`)].join("\n");
}

// 카드가 답했는지는 타임라인에서 알 수 없어(변환기는 항목 하나만 본다) 에이전트·블록별로 따로 남긴다.
export class QuestionStore {
  private data: Record<string, Record<string, StoredAnswer>> = {};

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.file, "utf8")) as typeof this.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  has(agentId: string, key: string): boolean {
    return Boolean(this.data[agentId]?.[key]);
  }

  list(agentId: string): { answers: Record<string, QuestionAnswers>; auto: string[] } {
    const entries = Object.entries(this.data[agentId] ?? {});
    return {
      answers: Object.fromEntries(entries.map(([key, stored]) => [key, stored.answers])),
      auto: entries.filter(([, stored]) => stored.by === "auto").map(([key]) => key),
    };
  }

  /** note는 메시지 끝에 덧붙이는 설명(자동 답변일 때). */
  async answer(
    paseo: PaseoApi,
    input: { agentId: string; key: string; title: string; answers: QuestionAnswers; by?: "auto"; note?: string },
  ): Promise<void> {
    if (this.has(input.agentId, input.key)) throw new Error("이미 답한 질문입니다.");
    const message = [answerMessage(input.title, input.answers), input.note].filter(Boolean).join("\n\n");
    // 보내기가 실패하면 기록을 남기지 않아 다시 보낼 수 있게 한다.
    await paseo.agents.ref(input.agentId).send(message);
    const stored: StoredAnswer = { answers: input.answers, at: new Date().toISOString(), ...(input.by ? { by: input.by } : {}) };
    this.data[input.agentId] = { ...this.data[input.agentId], [input.key]: stored };
    await this.save();
  }

  private async save(): Promise<void> {
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(this.data, null, 2), "utf8");
    await rename(temp, this.file);
  }
}

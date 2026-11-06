import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isObject, type JsonObject } from "./json-lines";
import type { WorkflowAgent, WorkflowPhase, WorkflowProgress } from "../shared/workflow";

/** 기록에는 결과 전문이 들어 있다 — 제안서 하나가 17,585자였다(2026-11-06 wf_fdfc102b-fe0). */
const PREVIEW_CHARS = 160;

interface Started {
  key: string;
  agentId: string;
  label: string;
  phase: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstLine(value: string): string {
  const line = value.split("\n").find((part) => part.trim()) ?? "";
  const trimmed = line.trim();
  return trimmed.length > PREVIEW_CHARS ? `${trimmed.slice(0, PREVIEW_CHARS)}…` : trimmed;
}

/** 날 JSON을 카드에 보여 주지 않는다. 쓸 만한 칸이 없으면 결과 줄 없이 그린다. */
function resultPreview(result: unknown): string | null {
  if (typeof result === "string") return result.trim() ? firstLine(result) : null;
  if (!isObject(result)) return null;
  const summary = text(result.summary) ?? text(result.verdict);
  return summary ? firstLine(summary) : null;
}

async function readJsonFile(path: string): Promise<JsonObject | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function journalRows(journal: string): JsonObject[] {
  const rows: JsonObject[] = [];
  for (const line of journal.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      // 생중계 파일이라 마지막 줄이 쓰이는 중일 수 있다.
      continue;
    }
    if (isObject(parsed)) rows.push(parsed);
  }
  return rows;
}

/** 설명만 가져온다. 순서는 끝 기록이 없는 동안에도 있는 journal 순서를 쓴다. */
function phaseDetails(run: JsonObject | null): Map<string, string> {
  const details = new Map<string, string>();
  const phases = run?.phases;
  if (!Array.isArray(phases)) return details;
  for (const phase of phases) {
    if (!isObject(phase)) continue;
    const title = text(phase.title);
    const detail = text(phase.detail);
    if (title && detail) details.set(title, detail);
  }
  return details;
}

function groupByPhase(starts: Started[], agents: Map<string, WorkflowAgent>, details: Map<string, string>): WorkflowPhase[] {
  const order: (string | null)[] = [];
  const byPhase = new Map<string | null, WorkflowAgent[]>();
  for (const started of starts) {
    let list = byPhase.get(started.phase);
    if (!list) {
      list = [];
      byPhase.set(started.phase, list);
      order.push(started.phase);
    }
    const agent = agents.get(started.key);
    if (agent) list.push(agent);
  }
  return order.map((title) => ({ title, detail: (title === null ? null : details.get(title)) ?? null, agents: byPhase.get(title) ?? [] }));
}

export async function readWorkflowProgress(runId: string, transcriptDir: string): Promise<WorkflowProgress> {
  const run = await readJsonFile(join(transcriptDir, "..", "..", "..", "workflows", `${runId}.json`));
  let journal: string | null = null;
  let readError: string | null = null;
  try {
    journal = await readFile(join(transcriptDir, "journal.jsonl"), "utf8");
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") readError = error instanceof Error ? error.message : String(error);
  }

  const starts: Started[] = [];
  const agents = new Map<string, WorkflowAgent>();
  for (const row of journalRows(journal ?? "")) {
    const key = text(row.key);
    const agentId = text(row.agentId);
    if (!key || !agentId) continue;
    if (row.type === "started") {
      const started = { key, agentId, label: text(row.label) ?? agentId, phase: text(row.phase) };
      starts.push(started);
      agents.set(key, { agentId, label: started.label, done: false, toolCount: null, resultPreview: null });
      continue;
    }
    if (row.type !== "result") continue;
    const agent = agents.get(key);
    if (!agent) continue;
    agent.done = true;
    agent.toolCount = Array.isArray(row.toolsUsed) ? row.toolsUsed.length : null;
    agent.resultPreview = resultPreview(row.result);
  }

  const doneCount = [...agents.values()].filter((agent) => agent.done).length;
  const runError = run ? text(run.error) : null;
  return {
    state: run ? "finished" : journal === null ? "waiting" : "running",
    phases: groupByPhase(starts, agents, phaseDetails(run)),
    startedCount: starts.length,
    doneCount,
    agentCount: run ? count(run.agentCount) : null,
    status: run ? text(run.status) : null,
    durationMs: run ? count(run.durationMs) : null,
    totalTokens: run ? count(run.totalTokens) : null,
    totalToolCalls: run ? count(run.totalToolCalls) : null,
    error: readError ?? (runError ? firstLine(runError) : null),
  };
}

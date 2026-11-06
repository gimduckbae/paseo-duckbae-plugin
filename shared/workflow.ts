import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const WORKFLOW_CARD_ITEM_KIND = "workflow-card";

export const WORKFLOW_TOOL_NAME = "Workflow";

/** API가 아니라 Claude Code가 사람에게 쓴 글에서 뽑는 값이다. 문구가 바뀌면 못 뽑는다. */
export const workflowCardItemSchema = z.object({
  runId: z.string(),
  transcriptDir: z.string(),
  name: z.string().nullable(),
  summary: z.string().nullable(),
  taskId: z.string().nullable(),
  script: z.string().nullable(),
  scriptPath: z.string().nullable(),
});
export type WorkflowCardItem = z.infer<typeof workflowCardItemSchema>;

export const workflowAgentSchema = z.object({
  agentId: z.string(),
  label: z.string(),
  done: z.boolean(),
  toolCount: z.number().nullable(),
  resultPreview: z.string().nullable(),
});
export type WorkflowAgent = z.infer<typeof workflowAgentSchema>;

export const workflowPhaseSchema = z.object({
  title: z.string().nullable(),
  detail: z.string().nullable(),
  agents: z.array(workflowAgentSchema),
});
export type WorkflowPhase = z.infer<typeof workflowPhaseSchema>;

/** 끝 기록 `workflows/<runId>.json`은 끝날 때 한 번만 쓰여서(2026-11-06 기록 8건 전부 파일 시각 = 종료 시각) 그 파일이 끝 신호다. */
export const workflowProgressSchema = z.object({
  state: z.enum(["waiting", "running", "finished"]),
  phases: z.array(workflowPhaseSchema),
  startedCount: z.number(),
  doneCount: z.number(),
  /** 도는 동안은 아직 시작하지 않은 에이전트를 알 길이 없다. */
  agentCount: z.number().nullable(),
  status: z.string().nullable(),
  durationMs: z.number().nullable(),
  totalTokens: z.number().nullable(),
  totalToolCalls: z.number().nullable(),
  error: z.string().nullable(),
});
export type WorkflowProgress = z.infer<typeof workflowProgressSchema>;

export const workflowProgressRpc = defineRpc({
  name: "workflow.progress",
  input: z.object({ runId: z.string(), transcriptDir: z.string() }),
  output: workflowProgressSchema,
});

/** 도구가 쓴 글에서 온 값으로 파일 경로를 만든다. 경로 조각이 섞이지 못하게 막는다. */
const RUN_ID = /^wf_[A-Za-z0-9_-]+$/;

function labeledLine(text: string, label: string): string | null {
  const found = new RegExp(`^${label}:[ \\t]*(.+)$`, "m").exec(text);
  return found ? found[1].trim() || null : null;
}

function outputText(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const inner = (output as { output?: unknown }).output;
    if (typeof inner === "string") return inner;
  }
  return null;
}

function inputScript(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const script = (input as { script?: unknown }).script;
  return typeof script === "string" && script ? script : null;
}

function workflowName(scriptPath: string, runId: string): string | null {
  const file = scriptPath.split(/[\\/]/).pop() ?? "";
  const found = new RegExp(`^(.+)-${runId}\\.js$`).exec(file);
  return found ? found[1] : null;
}

export function parseWorkflowLaunch(input: unknown, output: unknown): WorkflowCardItem | null {
  const text = outputText(output);
  if (!text) return null;
  const runId = labeledLine(text, "Run ID");
  const transcriptDir = labeledLine(text, "Transcript dir");
  if (!runId || !transcriptDir || !RUN_ID.test(runId)) return null;
  const scriptPath = labeledLine(text, "Script file");
  return {
    runId,
    transcriptDir,
    name: scriptPath ? workflowName(scriptPath, runId) : null,
    summary: labeledLine(text, "Summary"),
    taskId: /Task ID:[ \t]*(\S+)/.exec(text)?.[1] ?? null,
    script: inputScript(input),
    scriptPath,
  };
}

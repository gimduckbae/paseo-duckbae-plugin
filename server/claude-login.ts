import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawnProcess, terminateProcess } from "@getpaseo/plugin/server";
import { withTimeout } from "./json-lines";

const URL_PATTERN = /https:\/\/\S+\/oauth\/authorize\?\S+/;
const URL_TIMEOUT_MS = 30_000;
const CODE_TIMEOUT_MS = 60_000;
const STRIPPED_ENV = ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "CLAUDECODE"];

// 터미널이 아니면 Claude Code는 브라우저 자동 복귀 대신 코드 붙여넣기 방식으로 로그인한다
// (2.1.306 실측: "Paste code here if prompted >"). 그래서 휴대폰·다른 PC 브라우저로도 끝낼 수 있다.
// 같은 방식의 `claude setup-token`은 터미널이 아니면 아무것도 출력하지 않아 자동화하지 않는다.
export class ClaudeLoginSession {
  private readonly child: ChildProcessWithoutNullStreams;
  private output = "";
  private readonly exited: Promise<number | null>;

  constructor(readonly configDir: string) {
    const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: configDir };
    for (const key of STRIPPED_ENV) delete env[key];
    this.child = spawnProcess("claude", ["auth", "login", "--claudeai"], { stdio: "pipe", env, windowsHide: true });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => (this.output += chunk));
    this.child.stderr.on("data", (chunk: string) => (this.output += chunk));
    this.exited = new Promise((resolve) => this.child.on("exit", (code) => resolve(code)));
  }

  async authorizeUrl(): Promise<string> {
    const found = new Promise<string>((resolve, reject) => {
      const check = () => {
        const match = URL_PATTERN.exec(this.output);
        if (match) resolve(match[0]);
      };
      this.child.stdout.on("data", check);
      void this.exited.then(() => reject(new Error(this.lastLines() || "Claude 로그인을 시작하지 못했습니다.")));
      check();
    });
    return withTimeout(found, URL_TIMEOUT_MS, "Claude 로그인 주소 받기");
  }

  async submitCode(code: string): Promise<void> {
    this.child.stdin.write(`${code.trim()}\n`);
    const exitCode = await withTimeout(this.exited, CODE_TIMEOUT_MS, "Claude 로그인 확인");
    if (exitCode !== 0) throw new Error(this.lastLines() || "Claude 로그인에 실패했습니다.");
  }

  async close(): Promise<void> {
    if (this.child.exitCode === null) await terminateProcess(this.child);
  }

  private lastLines(): string {
    return this.output.trim().split(/\r?\n/).slice(-3).join(" ").slice(0, 300);
  }
}

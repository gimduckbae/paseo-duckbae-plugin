import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function onJsonLines(child: ChildProcessWithoutNullStreams, handler: (message: JsonObject) => void) {
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
      if (!line) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (isObject(parsed)) handler(parsed);
    }
  });
}

/** promise가 끝나거나 ms가 지나면 끝난다. 실패는 삼킨다(기다리는 시간만 자를 때 쓴다). */
export function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    void promise.catch(() => undefined).finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export function withTimeout<Value>(promise: Promise<Value>, ms: number, what: string): Promise<Value> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what}: 응답이 없습니다.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

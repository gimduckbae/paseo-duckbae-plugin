import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModelSpeedView } from "../shared/reasoning";
import type { AccountStore } from "./store";

// 생각이 많은 턴은 한 번에 수십 줄이 끝난다(실측 p90 54줄). 줄마다 파일을 쓰지 않고 모아 쓴다.
const SAVE_MS = 1_000;

interface Tally {
  samples: number;
  total: number;
}

interface Stored {
  version: 1;
  models: Record<string, Tally>;
}

/** state.json에는 계정 목록이 있어 1초에 여러 번 다시 쓰는 길에 두지 않는다. */
export class ReasoningSpeeds {
  private readonly models = new Map<string, Tally>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly store: AccountStore) {}

  async load(): Promise<void> {
    try {
      const loaded = JSON.parse(await readFile(this.path(), "utf8")) as Stored;
      for (const [model, tally] of Object.entries(loaded.models ?? {})) {
        if (tally.samples > 0 && Number.isFinite(tally.total)) this.models.set(model, { samples: tally.samples, total: tally.total });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  add(model: string, tokensPerSecond: number): void {
    const tally = this.models.get(model) ?? { samples: 0, total: 0 };
    this.models.set(model, { samples: tally.samples + 1, total: tally.total + tokensPerSecond });
    this.timer ??= setTimeout(() => void this.flush(), SAVE_MS);
  }

  list(): ModelSpeedView[] {
    return [...this.models.entries()]
      .map(([model, tally]) => ({ model, samples: tally.samples, tokensPerSecond: tally.total / tally.samples }))
      .sort((a, b) => b.tokensPerSecond - a.tokensPerSecond);
  }

  async dispose(): Promise<void> {
    if (!this.timer) return;
    await this.flush();
  }

  private path(): string {
    return join(this.store.root, "reasoning-speed.json");
  }

  private async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const stored: Stored = { version: 1, models: Object.fromEntries(this.models) };
    const temporary = `${this.path()}.tmp`;
    await writeFile(temporary, JSON.stringify(stored, null, 2));
    await rename(temporary, this.path());
  }
}

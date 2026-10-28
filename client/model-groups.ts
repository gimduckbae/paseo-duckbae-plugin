import type { Provider } from "../shared/accounts";

export interface ModelOption {
  /** "provider/model" */
  value: string;
  label: string;
}

export interface ModelGroup {
  family: string;
  models: { option: ModelOption; short: string }[];
}

// 위가 높은 체급. Claude는 사용자 지정(2026-10-21). Codex는 Paseo 모델 설명 기준이다:
// Astra "Frontier intelligence", Sol "workhorse", Terra "balanced", Luna "fast and affordable".
const FAMILY_ORDER: Record<Provider, string[]> = {
  claude: ["Fable", "Opus", "Sonnet", "Haiku"],
  codex: ["Astra", "Sol", "Terra", "Luna"],
  grok: [],
};

const OTHER = "기타";

// Paseo 모델 이름 모양: Claude "Opus 4.8 1M", Codex "GPT-6.1-Sol". 둘 다 아니면 기타로 둔다.
function parse(label: string): { family: string; version: string; variant: string } | null {
  const named = /^([A-Za-z]+)\s+(\d+(?:\.\d+)*)\s*(.*)$/.exec(label);
  if (named) return { family: named[1], version: named[2], variant: named[3].trim() };
  const gpt = /^GPT-(\d+(?:\.\d+)*)-([A-Za-z]+)$/i.exec(label);
  if (gpt) return { family: gpt[2], version: gpt[1], variant: "" };
  return null;
}

function compareVersion(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 계열(체급) 순서로 묶고, 계열 안에서는 높은 버전 먼저, 같은 버전은 기본형 다음 변형(1M 등). */
export function groupModels(provider: Provider, options: readonly ModelOption[]): ModelGroup[] {
  const groups = new Map<string, { option: ModelOption; short: string; version: string; variant: string }[]>();
  for (const option of options) {
    const parsed = parse(option.label);
    const family = parsed?.family ?? OTHER;
    const list = groups.get(family) ?? [];
    list.push({
      option,
      short: parsed ? `${parsed.version}${parsed.variant ? ` ${parsed.variant}` : ""}` : option.label,
      version: parsed?.version ?? "0",
      variant: parsed?.variant ?? "",
    });
    groups.set(family, list);
  }
  const order = FAMILY_ORDER[provider];
  const rank = (family: string) => (family === OTHER ? Number.MAX_SAFE_INTEGER : order.includes(family) ? order.indexOf(family) : order.length);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([family, models]) => ({
      family,
      models: models
        .sort(
          (a, b) =>
            compareVersion(a.version, b.version) ||
            (a.variant === b.variant ? 0 : a.variant === "" ? -1 : b.variant === "" ? 1 : a.variant.localeCompare(b.variant)),
        )
        .map(({ option, short }) => ({ option, short })),
    }));
}

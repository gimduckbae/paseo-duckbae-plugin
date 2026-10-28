// Paseo 앱이 제공하는 @getpaseo/plugin/client 대역. RPC는 mock 데이터로 답한다.
import { mockRpc } from "../mock";

export function useAgent<Selection>(_agentId: string, selector: (agent: { status: string; provider: string; model: string }) => Selection): Selection {
  return selector({ status: "idle", provider: "claude", model: "claude-opus-5-5" });
}

export function useRpc(contract: { name: string }) {
  return (input: unknown) => mockRpc(contract.name, input);
}

const MODELS: Record<string, { id: string; label: string }[]> = {
  claude: ["Opus 5.5", "Opus 5", "Fable 5.1", "Fable 5", "Opus 4.8 1M", "Opus 4.8", "Sonnet 5.5", "Sonnet 5", "Sonnet 5 1M", "Opus 4.7 1M", "Opus 4.7", "Opus 4.6 1M", "Opus 4.6", "Sonnet 4.6 1M", "Sonnet 4.6", "Haiku 4.5"].map(
    (label) => ({ id: `claude-${label.toLowerCase().replace(/[ .]/g, "-")}`, label }),
  ),
  codex: ["GPT-6.1-Sol", "GPT-6-Astra", "GPT-6-Sol", "GPT-6-Luna", "GPT-5.6-Sol", "GPT-5.6-Terra", "GPT-5.6-Luna", "Daybreak Blue"].map((label) => ({
    id: label.toLowerCase(),
    label,
  })),
};

export function usePaseo() {
  return {
    providers: {
      listModels: async (provider: string) => ({ provider, models: (MODELS[provider] ?? []).map((model) => ({ ...model, provider })) }),
    },
    agents: { list: async () => ({ entries: [] }) },
  };
}

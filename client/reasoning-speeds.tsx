import type { PluginTheme } from "@getpaseo/plugin";
import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import { providerFamily, type Provider } from "../shared/accounts";
import type { ModelSpeedView } from "../shared/reasoning";

/** 사람이 읽는 이름은 listModels에만 있다. */
function useModelLabels(models: readonly string[]) {
  const paseo = usePaseo();
  const providers = [...new Set(models.map((model) => providerFamily(model.split("/")[0])).filter((provider): provider is Provider => provider !== null))].sort();
  return useQuery({
    queryKey: ["paseo-duckbae-plugin", "model-labels", providers.join(",")],
    queryFn: async (): Promise<Record<string, string>> => {
      const labels: Record<string, string> = {};
      for (const provider of providers) {
        const { models: list } = await paseo.providers.listModels(provider);
        for (const model of list ?? []) labels[`${model.provider}/${model.id}`] = model.label;
      }
      return labels;
    },
    enabled: providers.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export function ReasoningSpeeds({ theme, speeds }: { theme: PluginTheme; speeds: readonly ModelSpeedView[] }) {
  const labels = useModelLabels(speeds.map((speed) => speed.model));
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>생각 속도 · 모델별 평균</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {speeds.map((speed) => (
          <View
            key={speed.model}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: theme.colors.surface1,
            }}
          >
            <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{labels.data?.[speed.model] ?? (speed.model.split("/")[1] ?? speed.model)}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foreground }}>초당 {Math.round(speed.tokensPerSecond).toLocaleString("ko-KR")}토큰</Text>
            <Text style={{ fontSize: 11, color: theme.colors.foregroundMuted }}>{speed.samples.toLocaleString("ko-KR")}줄</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

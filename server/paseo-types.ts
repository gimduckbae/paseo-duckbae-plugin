import type { PluginHandlerContext } from "@getpaseo/plugin/server";

// git으로 설치하면 Paseo가 npm 설치를 하지 않아, @getpaseo/client는 타입만 가져와도 찾지 못해 설치가 실패한다(2026-10-28 실측).
// Paseo 번들러는 SDK(@getpaseo/plugin/*) 타입만 설치 없이 통과시키므로 같은 타입을 SDK에서 꺼낸다.
export type PaseoApi = PluginHandlerContext["paseo"];
export type PaseoAgentHandle = ReturnType<PaseoApi["agents"]["ref"]>;
export type PaseoAgent = NonNullable<ReturnType<PaseoAgentHandle["current"]>>;

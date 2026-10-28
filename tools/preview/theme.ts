// Paseo 0.11.4 기본 테마(packages/app/src/styles/theme.ts paseoDarkColors·lightSemanticColors)에서 옮긴 값.
// 주소에 ?light 를 붙이면 밝은 테마로 그린다.
const light = typeof location !== "undefined" && location.search.includes("light");

const darkTheme = {
  colors: {
    surface0: "#181B1A",
    surface1: "#1E2120",
    surface2: "#272A29",
    border: "#252B2A",
    foreground: "#fafafa",
    foregroundMuted: "#A1A5A4",
    accent: "#20744A",
    accentForeground: "#ffffff",
    statusSuccess: "#6cb17b",
    statusWarning: "#c09664",
    statusDanger: "#d8847b",
  },
};

const lightTheme = {
  colors: {
    surface0: "#ffffff",
    surface1: "#fafafa",
    surface2: "#f4f4f5",
    border: "#e4e4e7",
    foreground: "#1a1a1e",
    foregroundMuted: "#71717a",
    accent: "#20744A",
    accentForeground: "#ffffff",
    statusSuccess: "#3e704a",
    statusWarning: "#7b5d39",
    statusDanger: "#9d433b",
  },
};

export const previewTheme = light ? lightTheme : darkTheme;

export const sidebarColors = light
  ? { background: "#f4f4f5", hover: "#fafafa", selected: "#e4e4e7" }
  : { background: "#141716", hover: "#1E2120", selected: "#272A29" };

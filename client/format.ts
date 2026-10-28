import type { PluginTheme } from "@getpaseo/plugin";
import type { AccountState, AccountView, Provider } from "../shared/accounts";

export { PROVIDER_LABEL } from "../shared/accounts";

type CredentialKind = AccountView["credentialKind"];

export const PROVIDERS: Provider[] = ["claude", "codex", "grok"];

export function formatMoney(value: number, currency: string): string {
  return currency === "USD" ? `$${value.toFixed(2)}` : `${value.toLocaleString()} ${currency}`;
}

export function monthDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function countdown(iso: string, now: number): string | null {
  const total = Math.floor((Date.parse(iso) - now) / 1000);
  if (Number.isNaN(total)) return null;
  if (total <= 0) return "곧";
  if (total >= 86_400) return `${Math.floor(total / 86_400)}d`;
  if (total >= 3_600) return `${Math.floor(total / 3_600)}h`;
  if (total >= 60) return `${Math.floor(total / 60)}m`;
  return `${total}s`;
}

export function untilReset(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (minutes <= 0) return "곧";
  if (minutes < 60) return `${minutes}분 후`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours}시간 후` : `${hours}시간 ${minutes % 60}분 후`;
  return `${Math.round(hours / 24)}일 후`;
}

// 테마 색은 #rrggbb다(Paseo도 뒤에 투명도 hex를 붙여 쓴다).
function mixHex(from: string, to: string, ratio: number): string {
  const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  const mixed = [0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * ratio));
  return `#${mixed.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

// 처음부터 섞으면 30%만 써도 경고처럼 보여서 절반까지는 초록을 유지한다.
export function usageColor(theme: PluginTheme, percent: number): string {
  const { statusSuccess, statusWarning, statusDanger } = theme.colors;
  if (percent <= 50) return statusSuccess;
  if (percent < 80) return mixHex(statusSuccess, statusWarning, (percent - 50) / 30);
  if (percent < 100) return mixHex(statusWarning, statusDanger, (percent - 80) / 20);
  return statusDanger;
}

export function stateLabel(state: AccountState, kind?: CredentialKind): string {
  switch (state) {
    case "ok":
      return "정상";
    case "limited":
      return kind === "api_key" ? "크레딧 소진" : "한도 도달";
    case "needs_login":
      return "로그인 필요";
    case "error":
      return "확인 실패";
    case "unknown":
      return "확인 중";
  }
}

export function stateColor(theme: PluginTheme, state: AccountState): string {
  switch (state) {
    case "ok":
      return theme.colors.statusSuccess;
    case "limited":
      return theme.colors.statusDanger;
    case "needs_login":
    case "error":
      return theme.colors.statusWarning;
    case "unknown":
      return theme.colors.foregroundMuted;
  }
}

export function peakPercent(account: AccountView): number | null {
  if (account.windows.length === 0) return null;
  return account.windows.reduce((peak, usage) => Math.max(peak, usage.usedPercent), 0);
}

export function credentialText(account: AccountView): string {
  const until = account.credentialExpiresAt ? ` · ${account.credentialExpiresAt.slice(0, 10)}까지` : "";
  switch (account.credentialKind) {
    case "claude_login":
      return account.hasToken ? `1년 토큰${until}` : `로그인${until}`;
    case "oauth_token":
      return account.credentialExpiresAt ? `1년 토큰 · ${account.credentialExpiresAt.slice(0, 10)}까지` : "1년 토큰";
    case "api_key":
      return "API 키";
    case "codex_home":
      return "ChatGPT 로그인 · 자동 갱신";
    case "grok_home":
      return "Grok 로그인 · 자동 갱신";
  }
}

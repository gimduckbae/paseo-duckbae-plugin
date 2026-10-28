import { isObject, withTimeout } from "./json-lines";

// API 키로 잔액을 주는 API는 없다(2026-10-21 문서 확인). Admin API cost_report는 이번 달 조직 전체 금액을
// 주지만 Admin 키나 워크스페이스에 묶이지 않은 개인 키만 받고, 개인(individual) 계정은 쓸 수 없다.
// 금액은 센트 단위 소수 문자열이고 버킷은 UTC 하루 단위다.
// https://platform.claude.com/docs/en/api/beta/organization/cost_report/retrieve
const COST_REPORT_URL = "https://api.anthropic.com/v1/organizations/cost_report";

function adminHeaders(apiKey: string): Record<string, string> {
  return { "x-api-key": apiKey, "anthropic-version": "2023-06-01", Accept: "application/json" };
}

/** 키가 속한 Console 조직 ID. 일반 API 키도 된다(2026-10-21 실측). 조회할 수 없으면 null. */
export async function organizationId(apiKey: string): Promise<string | null> {
  const res = await withTimeout(
    fetch("https://api.anthropic.com/v1/organizations/me", { headers: adminHeaders(apiKey) }),
    15_000,
    "Claude 조직 확인",
  );
  if (!res.ok) return null;
  const body: unknown = await res.json();
  return isObject(body) && typeof body.id === "string" ? body.id : null;
}

/** 이 키로 조회할 수 없으면 null. 일시적인 실패는 예외로 던진다. */
export async function monthCostUsd(apiKey: string, now = new Date()): Promise<number | null> {
  const monthStart = `${now.toISOString().slice(0, 7)}-01T00:00:00Z`;
  const res = await withTimeout(
    fetch(`${COST_REPORT_URL}?starting_at=${monthStart}&limit=31`, { headers: adminHeaders(apiKey) }),
    15_000,
    "Claude API 사용액 확인",
  );
  // 권한 없는 개인 키(sk-ant-usr-)는 403 permission_error다(2026-10-21 실측). 다른 경우는 문서에 없어 4xx는 모두 '조회 불가'로 본다.
  if (res.status >= 400 && res.status < 500 && res.status !== 429) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: unknown = await res.json();
  const buckets = isObject(body) && Array.isArray(body.data) ? body.data.filter(isObject) : [];
  let cents = 0;
  for (const bucket of buckets) {
    for (const result of Array.isArray(bucket.results) ? bucket.results.filter(isObject) : []) {
      if (typeof result.amount === "string") cents += Number(result.amount);
    }
  }
  return cents / 100;
}

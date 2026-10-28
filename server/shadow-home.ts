import { copyFile, link, lstat, mkdir, readdir, readlink, rename, stat, symlink, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface ShadowRules {
  /** 계정마다 따로 두는 항목(로그인 파일 등). 원래 폴더 쪽은 연결하지 않는다. */
  isPrivate(name: string): boolean;
}

const COMMON_PRIVATE = /^(\.account-swap-replaced|\.tmp|tmp)$|\.(lock|sock)$/;

// sqlite(·-wal·-shm)를 하드링크로 두 경로에서 열면 WAL 파일이 경로마다 따로 생겨 깨질 수 있다.
// Codex는 CODEX_SQLITE_HOME을 원래 폴더로 돌려 같은 파일을 쓰고, Grok의 worktrees.db는 계정별로 둔다.
// app-server-*·process_manager·leader는 실행 중인 프로세스와 연결되는 자리라 원래 계정 프로세스에 붙지 않게 뺀다.
export const CODEX_RULES: ShadowRules = {
  isPrivate: (name) =>
    COMMON_PRIVATE.test(name) ||
    /^(auth\.json|\.sandbox|cap_sid|installation_id|process_manager)$|^app-server-|\.sqlite(-wal|-shm)?$/.test(name),
};

// .claude.json에는 MCP 목록과 함께 로그인한 계정 정보(oauthAccount)가 들어 있어 계정별로 두고,
// MCP 등 공유할 부분만 store가 원래 파일에서 옮겨 맞춘다. backups도 그 파일의 사본이라 계정별로 둔다.
export const CLAUDE_RULES: ShadowRules = {
  isPrivate: (name) => COMMON_PRIVATE.test(name) || /^(\.credentials\.json|\.claude\.json|backups)$/.test(name),
};

export const GROK_RULES: ShadowRules = {
  isPrivate: (name) =>
    COMMON_PRIVATE.test(name) ||
    /^(auth\.json|active_sessions\.json|agent_id|settings_cache\.json|models_cache\.json|campaigns_state\.json)$|^leader|\.db$/.test(name),
};

// 계정 폴더(CODEX_HOME·GROK_HOME)를 통째로 따로 두면 설정·MCP·스킬·대화 기록이 계정마다 갈라진다
// (2026-10-21 Codex 계정 폴더에 config.toml 두 줄만 있어 MCP 7개가 빠진 것을 확인). 그래서
// 로그인 파일만 계정 폴더에 두고 나머지는 원래 폴더를 가리키게 한다. 폴더는 junction(관리자 권한
// 불필요), 파일은 하드링크다. 프로그램이 파일을 새로 써서 하드링크가 끊기면 다음 동기화 때 다시 잇는다.
/** 실패한 항목 이름을 돌려준다. 한 항목이 잠겨 있어도 에이전트 실행을 막지 않도록 계속 진행한다. */
export async function syncShadowHome(main: string, shadow: string, rules: ShadowRules): Promise<string[]> {
  await mkdir(shadow, { recursive: true });
  const entries = await readdir(main, { withFileTypes: true }).catch(() => []);
  const failed: string[] = [];
  for (const entry of entries) {
    if (rules.isPrivate(entry.name)) continue;
    const source = join(main, entry.name);
    const target = join(shadow, entry.name);
    try {
      if (entry.isDirectory()) await linkDirectory(source, target, shadow);
      else if (entry.isFile()) await linkFile(source, target, shadow);
    } catch {
      failed.push(entry.name);
    }
  }
  return failed;
}

async function linkDirectory(source: string, target: string, shadow: string): Promise<void> {
  const existing = await lstat(target).catch(() => null);
  if (existing?.isSymbolicLink()) {
    const pointsTo = await readlink(target).catch(() => "");
    if (resolve(pointsTo) === resolve(source)) return;
    await unlink(target);
  } else if (existing) {
    await setAside(target, shadow);
  }
  await symlink(source, target, "junction");
}

async function linkFile(source: string, target: string, shadow: string): Promise<void> {
  // Windows 파일 번호는 64비트라 number로 비교하면 틀릴 수 있어 bigint로 읽는다.
  const [from, existing] = await Promise.all([stat(source, { bigint: true }), lstat(target, { bigint: true }).catch(() => null)]);
  if (existing && existing.isFile() && existing.ino === from.ino && existing.dev === from.dev) return;
  if (existing) {
    // 계정 폴더 쪽에서 새로 써진 파일은 지우지 않고 옆으로 치운다.
    if (existing.isFile() && existing.nlink === 1n) await setAside(target, shadow);
    else await unlink(target);
  }
  await link(source, target).catch(() => copyFile(source, target));
}

/**
 * 계정 폴더를 보관하기 전에 원래 폴더로 이어진 링크만 끊는다. 나중에 누가 보관 폴더를 통째로 지울 때
 * 링크를 따라가 원래 대화 기록을 지우는 일이 없게 하려는 것이다.
 */
export async function detachShadowHome(shadow: string): Promise<void> {
  const entries = await readdir(shadow).catch(() => [] as string[]);
  for (const name of entries) {
    const path = join(shadow, name);
    const info = await lstat(path, { bigint: true }).catch(() => null);
    if (info?.isSymbolicLink() || (info?.isFile() && info.nlink > 1n)) await unlink(path).catch(() => undefined);
  }
}

async function setAside(target: string, shadow: string): Promise<void> {
  const folder = join(shadow, ".account-swap-replaced");
  await mkdir(folder, { recursive: true });
  const name = target.slice(shadow.length + 1);
  await rename(target, join(folder, `${name}-${Date.now()}`));
}

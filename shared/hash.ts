/**
 * FNV-1a. 같은 글이면 화면과 서버 어디서 읽어도 같은 값이 나와야 캐시·답한 기록을 찾는다.
 * 클라이언트 번들은 node:crypto를 쓸 수 없어 직접 센다.
 */
export function hashText(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16);
}

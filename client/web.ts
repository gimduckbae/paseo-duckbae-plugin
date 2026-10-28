import { Platform } from "react-native";

// 플러그인은 DOM 라이브러리 없이 타입 검사한다. 이 모듈이 쓰는 것만 선언한다.
declare const history: { back(): void };

// Paseo 0.11.4는 플러그인에 화면 닫기 API를 주지 않는다. 머리글 X 버튼은 router.back()이고,
// 데스크톱·브라우저(웹)에서는 history.back()이 같은 이동을 한다. 휴대폰은 Paseo 머리글과
// 뒤로 가기 제스처로 닫으므로 화면 안 버튼을 두지 않는다.
export const canCloseInPage = Platform.OS === "web";

export function closeScreen(): void {
  if (Platform.OS === "web") history.back();
}

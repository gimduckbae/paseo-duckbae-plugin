import { Platform, Text, type TextProps, type TextStyle } from "react-native";

// 한글은 기본 줄바꿈이 글자 단위라 "계정이 / 면"처럼 낱말 중간에서 끊긴다(미리보기 캡처로 확인).
// 웹·데스크톱은 keep-all, iOS는 hangul-word로 낱말 단위로 끊는다. Android는 해당 옵션이 없다.
const KEEP_ALL = (Platform.OS === "web" ? { wordBreak: "keep-all" } : {}) as TextStyle;

export function Paragraph({ style, ...props }: TextProps) {
  return <Text lineBreakStrategyIOS="hangul-word" {...props} style={[KEEP_ALL, style]} />;
}

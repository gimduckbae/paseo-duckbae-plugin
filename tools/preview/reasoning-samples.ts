// 추론 훔쳐보기 미리보기용 생각 글 한 덩이와, 번역기가 돌려줄 결과.
export const REASONING_SOURCE = `Let me check the file first. The user wants \`app/web/main.py\` changed, so I should read src/main.ts and look at the imports.

- First I read the config under config/app.toml.
- Then I run the tests.

If the tests fail I will revert the change and report it.`;

export const REASONING_KOREAN = `먼저 파일을 봅니다. 사용자가 \`app/web/main.py\`를 고치길 원하므로 src/main.ts를 읽고 import를 살펴야 합니다.

- 먼저 config/app.toml 아래의 설정을 읽습니다.
- 그다음 시험을 돌립니다.

시험이 실패하면 변경을 되돌리고 알립니다.`;

export const REASONING_LIVE = "Let me check the file first. The user wants `app/web/main.py` changed, so I should read src/";

export const REASONING_LIVE_HALF = `Let me check the file first. The user wants \`app/web/main.py\` changed, so I should read src/main.ts and look at the imports.

- First I read the config under config/app.toml.
- Then I run the te`;

# 다중 계정관리 (paseo-duckbae-plugin)

[Paseo](https://paseo.sh)에서 Claude·Codex·Grok 계정을 여러 개 등록해 두고, 사용량을 한눈에 보면서 한도에 걸리면 다른 계정으로 이어서 일하게 해 주는 플러그인입니다. 화면은 한국어입니다.

A Paseo plugin for juggling several Claude, Codex and Grok accounts: usage at a glance, switch or hand off when a limit hits, question cards and context compact offers. The UI is Korean.

## 할 수 있는 일

- **사용량 보기**: 사이드바와 계정 화면에서 계정마다 5시간·주간 사용률과 다시 차기까지 남은 시간을 봅니다.
- **계정 추가**: Claude는 브라우저 로그인·1년 토큰·API 키, Codex와 Grok은 기기 코드 로그인으로 추가합니다.
- **새 대화 계정 고르기**: 새 에이전트가 쓸 계정을 머리글 버튼에서 고릅니다.
- **한도에 걸렸을 때**: 대화에 카드가 붙고, 다른 계정을 고르면 지금 에이전트가 인계 문서를 써서 같은 모델의 새 에이전트가 이어받습니다.
- **질문 카드**: 에이전트가 정해진 형식으로 질문을 쓰면 선택 카드로 보여 줍니다. 원하면 추천 답으로 자동 답하게 할 수 있습니다(직접 답하기 / 10초 뒤 / 바로).
- **컨텍스트 정리(compact) 제안**: 대화가 길어져 컨텍스트가 정한 비율만큼 차면 정리할지 묻습니다. 10초 뒤 자동으로 진행하게 할 수도 있고, 정리가 끝나면 하던 작업을 이어서 하게 합니다.
- **업데이트**: 새 버전이 나오면 자동으로 업데이트하거나, 대화에 알려 주고 직접 고르게 하거나, 확인하지 않게 할 수 있습니다.

## 필요한 것

- Paseo 0.13.0 이상(데몬과 앱 모두)
- 쓰려는 도구: Claude Code, Codex CLI, Grok CLI
- Windows에서 만들고 시험했습니다. macOS·Linux는 확인하지 않았습니다.

## 설치

1. Paseo **설정 → 플러그인**에서 **Enable plugins**를 켭니다. 그 PC의 모든 플러그인에 걸리는 스위치입니다.
2. 설치합니다.

   ```sh
   paseo plugin install git:https://github.com/gimduckbae/paseo-duckbae-plugin.git
   ```

3. 설치한 뒤 처음 끝나는 대화에 업데이트 방식을 묻는 카드가 붙습니다. **자동으로 / 알려 주면 직접 / 안 함** 가운데 고릅니다.
4. 사이드바 아래쪽 **다중 계정관리**에서 계정을 추가합니다. 계정은 Paseo가 도는 PC마다 따로 등록합니다.

데스크톱 앱만 설치했다면 `paseo` 명령이 PATH에 없을 수 있습니다. 앱에 들어 있는 CLI를 쓰면 됩니다.

- Windows: `C:\Program Files\Paseo\resources\bin\paseo.cmd`
- macOS: `/Applications/Paseo.app/Contents/Resources/bin/paseo`

### AI 에이전트에게 설치를 맡길 때 (for AI agents)

이 저장소 링크를 받고 설치를 맡았다면 아래 순서로 진행하세요.

1. `paseo plugin ls --json`으로 `paseo-duckbae-plugin`이 이미 있는지 봅니다. 있으면 설치하지 않고 사용자에게 알립니다.
2. 플러그인 전체 스위치(데몬 `config.json`의 `pluginsEnabled`)가 꺼져 있으면, 켜기 전에 사용자에게 먼저 묻습니다. 켜는 방법은 위 1번입니다.
3. `paseo plugin install git:https://github.com/gimduckbae/paseo-duckbae-plugin.git`를 실행합니다.
4. `paseo plugin ls --json`에서 상태가 `running`인지 확인합니다. 아니면 `paseo plugin logs paseo-duckbae-plugin`의 오류를 사용자에게 보여 줍니다.
5. 업데이트 방식은 정하지 마세요. 이 대화가 끝나면 플러그인이 카드로 사용자에게 직접 묻습니다.

## 업데이트

업데이트 방식은 설치 뒤 카드에서 고르고, **다중 계정관리** 화면의 **플러그인 업데이트** 줄에서 언제든 바꿉니다.

- **자동으로**: 6시간마다 확인해서 새 버전이 있으면 바로 업데이트합니다. 다른 계정으로 이어가기·로그인이 진행 중이면 끝난 뒤에 합니다.
- **알려 주면 직접**: 새 버전이 나오면 다음에 끝나는 대화에 변경 내용과 [지금 업데이트] 카드를 붙입니다.
- **안 함**: 확인하지 않습니다. 화면의 **지금 확인**으로 직접 확인할 수 있습니다.

업데이트하면 Paseo가 플러그인을 내렸다가 새 버전으로 다시 띄웁니다. 명령으로 직접 업데이트해도 됩니다.

```sh
paseo plugin update paseo-duckbae-plugin
```

로컬 폴더로 설치한 경우(`paseo plugin install <폴더>`)에는 업데이트 기능을 쓰지 않습니다.

## 알아 둘 점

- **에이전트를 계정 폴더로 실행합니다.** 에이전트가 시작될 때 고른 계정의 폴더나 토큰을 환경 변수(`CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `CODEX_HOME`, `GROK_HOME` 등)로 넣습니다. 계정 폴더는 로그인 파일만 따로 두고 나머지 설정은 원래 폴더(`~/.claude`, `~/.codex`, `~/.grok`)를 가리킵니다.
- **새 에이전트의 시스템 프롬프트에 질문 형식 안내를 덧붙입니다.** 질문 카드를 쓰기 위해서입니다.
- **저장 위치**: 계정 정보와 토큰은 `~/.paseo/paseo-duckbae-plugin/`(또는 `$PASEO_HOME/paseo-duckbae-plugin/`)에 파일로 저장합니다. OS 자격 증명 저장소를 쓰지 않습니다.
- **외부로 보내는 요청**: 사용량과 비용을 알기 위해 아래 주소만 부릅니다. 이 가운데 일부는 공개 문서에 없는 주소라 바뀌면 사용량이 안 보일 수 있습니다.
  - `api.anthropic.com` (구독 사용량, 추가 크레딧, Admin 키를 넣은 경우 이번 달 사용액)
  - `cli-chat-proxy.grok.com` (Grok 사용량)
  - Codex 사용량은 이 PC의 Codex CLI에서 읽습니다.
  - 업데이트를 켜 두면 Paseo CLI가 이 저장소(`github.com`)에서 새 버전을 확인하고, 변경 내용은 `api.github.com`에서 읽습니다.
- **추가 크레딧**: 한도에 걸리면 다른 계정으로 바꿀지 묻는 설정이 켜져 있을 때, 브라우저로 로그인한 Claude 구독 계정이 한도에 걸리고 미리 충전한 잔액이 있으면 추가 크레딧을 켭니다. 월 상한은 "이번 달 사용분 + 잔액"으로 잡아 잔액을 넘어 카드로 결제되지 않게 합니다.
- **자동 답변**: 자동 답변을 켜면 에이전트 질문에 추천 답으로 답합니다. 배포처럼 되돌리기 어려운 결정은 에이전트가 "직접 확인" 표시를 붙이면 자동으로 답하지 않습니다. Claude 기본 질문 창에는 이 표시를 붙일 수 없습니다.
- 여러 계정을 바꿔 가며 쓰는 것이 각 서비스 약관에 맞는지는 직접 확인해 주세요. 이 플러그인은 Anthropic·OpenAI·xAI·Paseo와 관련이 없는 개인 프로젝트입니다.

## 개발

```sh
npm ci
npx tsc --noEmit
```

화면 미리보기(웹, Playwright 캡처)는 `tools/preview`에 있습니다.

```sh
cd tools/preview && npm ci && cd ../..
node tools/preview/build.mjs
cd tools/preview && python -m http.server 8765 --bind 127.0.0.1
python shoot.py desktop compact qa
```

로컬 폴더를 Paseo에 바로 연결해 고치면서 쓰려면 `paseo plugin install <폴더 경로>`로 설치하고, 고친 뒤 `paseo plugin reload paseo-duckbae-plugin`을 실행합니다.

## 라이선스

MIT

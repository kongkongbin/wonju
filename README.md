# 응급도 안내 (KTAS 기반 RAG)

증상을 말하거나 쓰거나 몸 그림에서 누르면, 한국형 응급환자 분류도구(KTAS) 지침에서 맞는 기준을 찾아 응급도 1~5단계를 판정하고, 지금 위치에서 갈 곳을 1·2·3 순서로 알려 주는 웹 앱입니다.

원주 오픈소스 경진대회 2026 6조 "막국수" 출품작이자 캡스톤 프로젝트입니다.

- 서비스: https://wonju-one.vercel.app
- 대회 서버(AWS, 행사 기간만): https://13-127-36-32.sslip.io

> 이 앱은 의료기기가 아니며 진단을 대신하지 않습니다. 위급하다고 느끼면 판정을 기다리지 말고 119에 전화하세요. KTAS 기준과 안전 규칙은 의료진 검수 전 초안입니다.

## 할 수 있는 일

- **세 가지 입력:** 말하기(브라우저 음성 인식), 글로 쓰기, 아픈 곳 누르기(팀이 그린 사람 실루엣, 앞뒤 전환, 부위 확대, 통증 점수·느낌·시작 시점).
- **KTAS 판정:** 응급도 1~5, 판정 근거가 된 KTAS 기준 원문, 신뢰도, 추천 진료과.
- **되묻기:** 정보가 모자라면 고르기 질문(+ "모름")을 최대 두 번 묻고, 이미 답한 질문은 다시 묻지 않습니다.
- **판정 과정 보기:** 증상 듣기 → KTAS 지침에서 후보 8개 찾기 → AI 비교 → 안전 규칙 확인 → 결과.
- **갈 곳 1·2·3과 지도:** 응급도에 따라 다르게 안내합니다.
  - KTAS 1~2(또는 AI가 119가 필요하다고 본 경우): 119 신고, 신고할 때 말할 주소 안내, 가까운 응급실.
  - KTAS 3: 실시간 병상과 거리를 보고 AI가 응급실 3곳을 고릅니다.
  - KTAS 4~5: 진료 중인 병·의원 2곳, 증상이 나빠질 때 갈 응급실 1곳.
- **길찾기와 전화:** 네이버 지도 길찾기, 병원 전화 연결, 결과 음성 안내.
- **시연 모드(주소 뒤 `?demo`):** 위급 판정이 나오면 10초 뒤 119 종합상황실에 자동 신고하고, AI가 고른 응급실 3곳에 환자 정보를 보내 수용을 묻는 흐름을 시민 앱·119 상황실·병원 응급실 세 화면으로 보여 줍니다. 위치·병상·병원 선택은 실제 데이터이고, 신고와 병원 응답만 흉내 냅니다. 실제로 신고하거나 연락하지 않습니다.

## 동작 방식

```
증상 문장
  │
  ├─ 1. 검색: bge-m3 임베딩(Cloudflare Workers AI) + BM25 키워드 → KTAS 후보 8개
  │      (성인·소아를 문장에서 구분, data/kb.json 348개 청크)
  ├─ 2. 판정: Claude 구조화 출력(zod 스키마) → 후보 중 하나와 KTAS 단계, 근거, 되묻기 질문
  ├─ 3. 안전망: 의식 없음·경련·청색증·뇌졸중 신호 등은 규칙으로 최소 단계를 올림
  └─ 4. 갈 곳: 공공데이터(국립중앙의료원) 실시간 병상·병의원 → 규칙 정렬 + AI 선택
```

- KTAS 지침서(pptx)를 슬라이드 단위로 뽑고(`scripts/extract-ktas.js`), 증상 단위 청크로 나눈 뒤(`scripts/chunk-ktas.js`), 임베딩해서 `data/kb.json`을 만듭니다(`npm run build:kb`).
- 검색 평가(`npm run eval`, 30건): bge-m3는 Hit@1 47%, Hit@3 77%, Hit@8 93%였습니다. 같은 평가에서 Amazon Titan 임베딩은 Hit@8 73%여서 쓰지 않았습니다.
- 판정 예비 평가(`npm run eval:triage`, 40건): KTAS 지침 기준 한 줄마다 그에 맞는 환자 말을 쓴 사례(단계별 8건, 소아 12건)로, Claude Opus 5.5와 Sonnet 5.5 모두 40건 정답, 덜 위급하게 판정한 경우 0건이었습니다. 사례에 판정을 가르는 정보가 분명히 들어 있어 실제 사용자의 애매한 말보다 쉬운 시험이며, 의료진 검수 전입니다.

## 구성

| 위치 | 내용 |
|---|---|
| `src/App.jsx`, `src/components/` | React 화면 (몸 그림, 결과 카드, 판정 과정, 갈 곳·지도) |
| `src/lib/rag/` | 임베딩, 검색, 지식베이스 생성, 검색 평가 |
| `src/lib/triage/` | 프롬프트, 판정, 안전 규칙, 몸 그림 문장 만들기 |
| `src/lib/hospital/` | 응급실·병의원 조회, 1·2·3 추천, 길찾기 링크 |
| `src/lib/llm/claude.js` | Claude 호출 (Anthropic API 또는 Amazon Bedrock) |
| `src/demo/` | 시연 모드: 자동 신고, 119 상황실, 병원 응급실 화면 |
| `server/index.js` | Express API: `/api/triage`, `/api/plan`, `/api/hospitals`, `/api/address` |
| `api/index.js` | Vercel 함수 진입점 |

## 실행

Node.js 20.6 이상이 필요합니다(`--env-file` 사용).

```bash
npm ci
cp .env.example .env   # 키 값을 채웁니다
npm run dev            # API 3001, 화면 5173
```

| 환경 변수 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude 판정 (Bedrock을 쓰면 필요 없음) |
| `CLAUDE_MODEL` | 기본 `claude-opus-5-5` |
| `CF_ACCOUNT_ID`, `CF_API_TOKEN` | Cloudflare Workers AI 임베딩 |
| `DATA_GO_KR_KEY` | 공공데이터포털 응급의료기관·병의원 API |
| `ACCESS_CODE` | 설정하면 화면에서 접근 코드를 묻습니다 |
| `AI_PROVIDER=bedrock`, `AWS_REGION`, `HOST` | 대회 AWS 서버용 |

음성 인식과 위치는 HTTPS(또는 localhost)에서만 동작합니다.

## 시험

```bash
npm run test:safety      # 안전 규칙, 몸 그림 문장
npm run test:hospitals   # 병원 정렬, 길찾기 링크
npm run test:plan        # 1·2·3 추천
npm run test:access      # 접근 코드
npm run eval             # 검색 정확도 (키 필요)
npm run eval:triage      # 판정 정확도 예비 평가 40건 (키 필요, Opus 기준 약 $1.3)
npm run triage -- "가슴이 쥐어짜듯 아파요"   # 판정 한 건 (키 필요)
```

## 배포

- **Vercel:** `main`에 push하면 자동 배포됩니다(서울 리전). 키는 Vercel 환경 변수에 넣습니다.
- **대회 AWS 서버:** EC2(Ubuntu 24.04, ap-south-1)에서 Bedrock Claude Sonnet 5.5를 서버 권한으로 호출합니다. Caddy가 HTTPS와 화면 파일을 맡고, API는 systemd 서비스로 127.0.0.1:3001에서 돕니다.

## 밖으로 나가는 데이터

| 대상 | 보내는 것 |
|---|---|
| Anthropic 또는 Amazon Bedrock | 증상 문장 |
| Cloudflare Workers AI | 증상 문장(임베딩용) |
| 공공데이터포털 | 위치(응급실·병의원 조회) |
| OpenStreetMap | 위치(주소 변환, 지도 타일) |
| 브라우저 음성 인식(예: Google, Apple) | 음성 |

저장하는 개인정보는 없습니다.

## 출처

- 판정 기준: 한국형 응급환자 분류도구(KTAS) 2021 지침서 ver1.6, 대한응급의학회. `data/kb.json`에 들어 있는 KTAS 내용의 저작권은 대한응급의학회에 있습니다.
- 병원 정보: 국립중앙의료원 전국 응급의료기관 정보 조회 서비스, 전국 병·의원 찾기 서비스(공공데이터포털).
- 지도: © OpenStreetMap 기여자.

## 팀

6조 막국수: 이현구(대표), 정병열, 김민수, 권빈, 이원빈

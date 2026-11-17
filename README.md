# 백발백중 (JamesWorks Games)

픽셀 활쏘기 io 배틀 게임. 사람이 없는 자리는 🤖 봇이 채워요.

모드: 개인전 · 팀 데스매치 · 점령전 · 깃발뺏기 · 배틀로얄 (모드별로 따로 방이 잡혀요). 레벨업 스킬 24종.

## 구조
- `index.html` — 게임 화면 (서버에 못 붙으면 자동으로 오프라인 봇전)
- `sim.js` — 게임 규칙/물리/봇 AI. 브라우저와 서버가 같이 씀
- `server/` — Cloudflare Worker + Durable Objects
  - `src/worker.js` — 게임 파일 제공, `/api/assign`(방 배정), `/api/ws`(방 접속)
  - `src/room-logic.js` — 방 하나: 12자리, 빈자리 봇, 6분 라운드
  - `wrangler.toml` — 배포 설정
- `.github/workflows/deploy.yml` — main에 올리면 자동 배포

## 배포
GitHub Secrets에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`가 있으면 main 브랜치에 push할 때마다 자동 배포돼요.
게임 주소: `https://baekbal.<workers 서브도메인>.workers.dev`

- `?offline` 붙이면 무조건 봇전
- `?server=https://...` 로 다른 서버 지정
- `/api/stats` 에서 방/접속자 수 확인

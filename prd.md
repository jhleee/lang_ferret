# local-lang-trace — Product Specification

## 1. 개요

LangSmith 없이 로컬에서 동작하는 경량 LangChain Trace 수집·저장·시각화 도구.
기존 LangChain 코드의 `LANGSMITH_ENDPOINT` 환경변수만 교체하면 연동.

---

## 2. 시스템 아키텍처
```
LangChain App
  └─ LANGSMITH_ENDPOINT=http://localhost:4318
        │
        ▼ HTTP POST /runs/batch (LangSmith 호환)
┌─────────────────────────────┐
│         Fastify Server       │
│                             │
│  ┌──────────────────────┐   │
│  │   In-Memory Buffer   │   │  ← 수신 즉시 적재
│  │   (Circular Array)   │   │
│  └────────┬─────────────┘   │
│           │ flush trigger    │
│           ▼                  │
│  ┌──────────────────────┐   │
│  │  better-sqlite3      │   │  ← 동기 write, 빠름
│  │  traces.db           │   │
│  └──────────────────────┘   │
│                             │
│  ┌──────────────────────┐   │
│  │  Static SPA (React)  │   │  ← /ui 경로로 serve
│  └──────────────────────┘   │
└─────────────────────────────┘
```

---

## 3. 수집 레이어 (Collection)

### 3-1. LangSmith 호환 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/runs/batch` | Run(Span) 일괄 수신 |
| `POST` | `/runs` | 단건 Run 수신 |
| `PATCH` | `/runs/:id` | Run 업데이트 (종료 시각, 출력 등) |
| `GET` | `/info` | 서버 메타 응답 (SDK handshake용) |

> LangSmith SDK가 최초 `/info` 로 서버 확인 후 `/runs/batch` 로 전송.
> 미구현 엔드포인트는 `200 OK` 빈 응답으로 silent pass.

### 3-2. In-Memory Buffer

- 자료구조: 고정 크기 Circular Buffer (Array + head pointer)
- 수신된 Run 객체를 그대로 적재, 직렬화 없음
- Buffer 최대 크기: `BUFFER_MAX_SIZE` (기본 1,000건)
- Buffer 초과 시: 가장 오래된 항목 덮어쓰기 (drop oldest)
- 프로세스 종료 시 미flush 데이터는 graceful shutdown 훅에서 강제 flush

---

## 4. 저장 레이어 (Storage)

### 4-1. Flush 전략

두 조건 중 **먼저 충족되는 쪽**으로 flush 트리거:

| 설정 키 | 기본값 | 설명 |
|---|---|---|
| `FLUSH_INTERVAL_MS` | `5000` | 시간 기반 (ms) |
| `FLUSH_BATCH_SIZE` | `100` | 건수 기반 |

flush 사이클마다 buffer → SQLite bulk INSERT (단일 트랜잭션).

### 4-2. SQLite 스키마
```sql
CREATE TABLE IF NOT EXISTS runs (
  id          TEXT PRIMARY KEY,
  trace_id    TEXT NOT NULL,
  parent_id   TEXT,
  name        TEXT,
  run_type    TEXT,          -- 'llm' | 'chain' | 'tool' | 'retriever'
  status      TEXT,          -- 'success' | 'error'
  inputs      TEXT,          -- JSON string
  outputs     TEXT,          -- JSON string
  error       TEXT,
  start_time  INTEGER NOT NULL,  -- Unix ms
  end_time    INTEGER,
  tokens_prompt    INTEGER,
  tokens_completion INTEGER,
  extra       TEXT           -- JSON string (나머지 메타)
);

CREATE INDEX IF NOT EXISTS idx_trace_id  ON runs(trace_id);
CREATE INDEX IF NOT EXISTS idx_start_time ON runs(start_time);
CREATE INDEX IF NOT EXISTS idx_status    ON runs(status);
```

### 4-3. TTL & 크기 기반 정리

flush 사이클 종료 직후 실행:
```
1. 기간 기반: DELETE WHERE start_time < (NOW - TTL_DAYS * 86400000)
2. 크기 기반: DB 파일 크기 > MAX_DB_SIZE_MB 이면
             오래된 trace_id 단위로 삭제 (크기 내려올 때까지 반복)
3. VACUUM (선택적, VACUUM_ON_CLEANUP=true 시)
```

| 설정 키 | 기본값 | 설명 |
|---|---|---|
| `TTL_DAYS` | `3` | 보존 기간 (일) |
| `MAX_DB_SIZE_MB` | `200` | DB 파일 최대 크기 |
| `VACUUM_ON_CLEANUP` | `false` | 정리 후 VACUUM 실행 여부 |

---

## 5. API 레이어 (Viewer Backend)

Fastify에서 `/api/*` 로 SPA에 데이터 제공.

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/traces` | Trace 목록 (페이지네이션, 필터) |
| `GET` | `/api/traces/:traceId` | Trace 상세 (하위 Run 트리 포함) |
| `GET` | `/api/stats` | 전체 통계 (토큰, 지연시간, 에러율) |
| `GET` | `/api/health` | 서버 상태, buffer 크기, DB 크기 |

### `/api/traces` Query Parameters

| 파라미터 | 타입 | 설명 |
|---|---|---|
| `limit` | number | 기본 50 |
| `offset` | number | 페이지네이션 |
| `status` | `success\|error` | 에러 필터 |
| `from` | ISO datetime | 시작 시각 필터 |
| `to` | ISO datetime | 종료 시각 필터 |
| `name` | string | Run 이름 검색 |

---

## 6. Viewer UI (React SPA)

Fastify `/ui` 경로에서 정적 파일 serve. Vite 빌드 결과물 동봉.

### 6-1. 화면 구성
```
┌─────────────────────────────────────────────┐
│  [local-lang-trace]   🟢 Live  Buffer: 23   │  ← Header
├──────────┬──────────────────────────────────┤
│          │  필터: [기간▼] [상태▼] [이름 검색]  │
│  통계 패널│─────────────────────────────────  │
│  - 총 실행│  Trace 목록 (무한 스크롤)           │
│  - 평균 지│  ┌────────────────────────────┐  │
│    연시간 │  │ 🔴 rag_chain   2.3s  1.2k t│  │
│  - 에러율 │  │ ✅ retriever   0.8s   320 t│  │
│  - 총 토큰│  │ ✅ llm_call    1.5s   890 t│  │
│          │  └────────────────────────────┘  │
└──────────┴──────────────────────────────────┘
```

**Trace 상세 뷰 (우측 패널 또는 모달)**
```
Trace: rag_chain [2026-02-19 14:32:01]  총 2.3s
──────────────────────────────────────────────
▼ rag_chain (chain)                    2,300ms
  ├▶ retriever (retriever)               800ms
  └▼ llm_call (llm)                    1,500ms
       Prompt ──────────────────────────────
       [system] Answer using only...
       [user]   Where did Harrison work?
       Response ─────────────────────────────
       Harrison worked at Kensho.
       ─────────────────────────────────────
       Tokens: prompt=42 / completion=8
```

### 6-2. 에러 하이라이트
- 목록에서 에러 trace는 빨간 배지 표시
- 상세 뷰에서 에러 Run에 `error.message` 인라인 표시
- 상단 통계 패널에 에러율 실시간 업데이트 (polling 5초)

### 6-3. UI 기술 스택

| 항목 | 선택 |
|---|---|
| 프레임워크 | React 18 |
| 빌드 | Vite |
| 상태관리 | Zustand (경량) |
| 스타일 | Tailwind CSS |
| 트리 시각화 | 커스텀 재귀 컴포넌트 (외부 의존 최소화) |
| 데이터 패칭 | SWR (자동 polling) |

---

## 7. 패키지 구조
```
local-lang-trace/
├── packages/
│   ├── server/                  # Fastify 서버
│   │   ├── src/
│   │   │   ├── index.js         # 진입점
│   │   │   ├── routes/
│   │   │   │   ├── ingest.js    # /runs/* LangSmith 호환
│   │   │   │   └── api.js       # /api/* Viewer API
│   │   │   ├── buffer.js        # Circular Buffer
│   │   │   ├── flusher.js       # Flush + TTL 로직
│   │   │   └── db.js            # better-sqlite3 래퍼
│   │   └── package.json
│   └── ui/                      # React SPA
│       ├── src/
│       │   ├── App.jsx
│       │   ├── pages/
│       │   │   ├── TraceList.jsx
│       │   │   └── TraceDetail.jsx
│       │   └── components/
│       │       ├── RunTree.jsx
│       │       ├── StatsPanel.jsx
│       │       └── PromptViewer.jsx
│       └── package.json
├── .env.example
└── package.json                 # root (npx 진입점)
```

---

## 8. 환경변수 (.env)
```dotenv
# Server
PORT=4318
DB_PATH=./traces.db

# Buffer
BUFFER_MAX_SIZE=1000

# Flush
FLUSH_INTERVAL_MS=5000
FLUSH_BATCH_SIZE=100

# TTL & Cleanup
TTL_DAYS=3
MAX_DB_SIZE_MB=200
VACUUM_ON_CLEANUP=false
```

---

## 9. 실행 방법
```bash
# 1회성 실행
npx local-lang-trace

# LangChain 앱 연동
LANGSMITH_TRACING=true \
LANGSMITH_ENDPOINT=http://localhost:4318 \
LANGSMITH_API_KEY=local \
python your_app.py

# Viewer
open http://localhost:4318/ui
```

---

## 10. 비기능 요건

| 항목 | 목표 |
|---|---|
| 수집 응답 지연 | < 5ms (buffer write만 수행) |
| 메모리 사용 | < 80MB (idle 기준) |
| SQLite flush 지연 | < 50ms (100건 bulk insert) |
| 프로세스 종료 안전성 | SIGTERM 수신 시 graceful flush 후 종료 |
| Node.js 최소 버전 | v18 LTS 이상 |
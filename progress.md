# GUARDIAN — Project Progress

## Overview
Real-time AI fall detection system with a Python detection engine, voice AI assistant,
and a Next.js multi-user dashboard.

## Repository Structure
```
falldetection/
├── alerts/             FastAPI server (WS + MJPEG + voice session endpoints)
├── core/               Fall detection logic + SOS gesture + legacy voice app
├── data/               Dataset download scripts
├── tests/              Demo entry point (test_video.py)
├── training/           YOLO11 fine-tuning script
├── models/             Model weights (gitignored)
├── dashboard/          Next.js 14 web app (GUARDIAN Dashboard)
├── progress.md         This file
└── README.md           Full setup and usage documentation
```

## Running the System
```bash
# Terminal 1 — Detection engine + voice server (all-in-one)
source venv/bin/activate
python tests/test_video.py

# Terminal 2 — Dashboard
cd dashboard && npm run dev
```
> Voice assistant is built into `alerts/server.py` — no separate script needed.
> Start a call from the dashboard's Voice Assistant panel (bottom-right).

---

## Phase 1 — Python Detection Engine ✅

- YOLO11 Nano model classifies poses: `up`, `bending`, `down`
- State machine: STABLE → TRANSITION → VALIDATION → INACTIVITY → ALARM → RECOVERY
- SOS gesture: palm → fist sequence via MediaPipe
- FastAPI WebSocket server on port 8765
- MJPEG video stream at http://localhost:8765/video (annotated with bounding boxes, AR, banners)
- 15-second ACK timer: if no responder acknowledges, `_escalate()` fires (hookable for future alerting)

---

## Phase 2 — GUARDIAN Dashboard (Next.js) ✅

### Phase 2a — Core Setup
- [x] Next.js 14 App Router + TypeScript strict mode
- [x] Tailwind CSS v4 dark theme with `@theme` color tokens in `globals.css`
- [x] Prisma + SQLite database
- [x] NextAuth v5 with JWT + role-based routing (ADMIN / RESPONDER)
- [x] Seed data (admin + 2 responder accounts: authorized + unauthorized)
- [x] Global color token system: `lib/colors.ts` + semantic Tailwind tokens

### Phase 2b — Responder Dashboard
- [x] WebSocket hook (`useWebSocket`) connecting to ws://localhost:8765/ws
- [x] Heartbeat → online/offline indicator + person count
- [x] Fall alert banner with severity color (AR-based) + 15s countdown bar
- [x] Acknowledge button (sends ACK back to Python, cancels escalation timer)
- [x] Live MJPEG feed component (annotated frames)
- [x] Incident status flow buttons: RESPONDING → ON_SCENE → RESOLVED / FALSE_ALARM
- [x] Event log (timestamped, scrollable, incident-scoped — clears on each new fall/SOS)
- [x] Non-scrollable locked viewport layout (h-screen chain + min-h-0)
- [x] Responsive 2-column grid
- [x] Incident created in DB on every fall/SOS; `incidentIdRef` keeps async callbacks current

### Phase 2c — Admin Dashboard
- [x] System overview + live analytics (Recharts)
- [x] User management CRUD (add/edit/deactivate responders)
- [x] `isAuthorized` tier toggle per responder
- [x] Detection threshold settings sliders
- [x] Incident history with search + filters
- [x] AI-generated incident report (Claude API, streaming)

---

## Phase 3 — Voice AI Assistant (built into server.py) ✅

Replaced the separate `fall_detection_voice_app.py` process. Voice is now fully managed
by `alerts/server.py` with a clean REST API.

- [x] `InterruptibleSpeaker` class — `threading.Lock`-protected `afplay` subprocess; `stop()` kills audio instantly when user speaks
- [x] `POST /call/start` — initializes voice session with language, speed, authorization tier, and optional incident context
- [x] `POST /call/stop` — ends session and interrupts any playing audio
- [x] `GET /call/status` — returns `{ "active": bool }`
- [x] `POST /call/settings` — updates language and/or speed mid-call without restarting the session
- [x] `_voice_loop()` — listen → STT → Claude → TTS pipeline running as a daemon thread
- [x] Live-adjustable globals: `_current_lang`, `_current_voice`, `_current_stt_lang`, `_current_rate` read on every iteration
- [x] Speaking speed: 0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x mapped to Edge TTS rate strings
- [x] System prompt rebuilt on every loop iteration so language/speed changes take effect on the next response
- [x] **Auto language detection**: bot responds in whatever language the responder is speaking, regardless of the default setting
- [x] Readable section comments (STEP A–D) throughout voice functions

### Incident Context Injection
- [x] `_build_incident_block(incident)` — converts AR + down_duration into plain-English risk context prepended to system prompt
- [x] AR risk: < 0.5 = HIGH, 0.5–0.7 = MODERATE, > 0.7 = LOW
- [x] Duration risk: ≥ 30s = CRITICAL, ≥ 10s = HIGH, < 10s = MODERATE
- [x] SOS context: conscious enough to signal, advise checking pain/injury/mobility
- [x] Bot answers "what happened?", "how serious is it?", "what should I check?" immediately on call start

---

## Phase 4 — Incident History & DB Persistence ✅

### New Prisma Models
- [x] `IncidentLog` — per-incident event timeline (type: fall/sos/recovery/ack, message, timestamp)
- [x] `IncidentTranscript` — per-incident voice conversation lines (speaker: user/assistant, text, timestamp)
- [x] Relations added to `Incident` model; migrated with `prisma db push`

### New API Routes
- [x] `GET/POST /api/incidents/[id]/log` — fetch or append incident log entries
- [x] `GET/POST /api/incidents/[id]/transcript` — fetch or append transcript entries
- [x] `GET /api/incidents/[id]` updated to include related `logs` and `transcripts`

### Incident Detail Page (`/responder/incidents/[id]`)
- [x] **Timeline tab** — vertical connector lines with icons per event type (fall, SOS, ack, recovery, status)
- [x] **Transcript tab** — chat bubble layout matching live ChatPanel style
- [x] **Report tab** — existing AI report generator
- [x] `persistLog()` / `persistTranscript()` — fire-and-forget DB saves called from dashboard WS handlers
- [x] `incidentIdRef` ref keeps the current incident ID accessible in all async callbacks

---

## Phase 5 — ChatPanel & Voice UI ✅

### Chat Panel States
- [x] **LOCKED** — chatbot disabled until first emergency is detected (latched via `incidentEverFired` ref, never resets)
- [x] **IDLE** — unlocked, no active call; shows incident badge when fall/SOS is active
- [x] **ACTIVE** — live call in progress; mid-call language + speed controls visible
- [x] **HISTORY** — call ended, transcript visible with replay option

### Incident Badge (idle state)
- [x] FALL: red tint with person ID, AR, down duration, "Bot is briefed on this incident"
- [x] SOS: amber tint with alert type
- [x] Call button changes to pulsing red; label changes to "Brief AI on incident"

### AI Response Animation
- [x] **Thinking dots** — animated `...` shown between user speech and AI reply (`isThinking` state, CSS `@keyframes thinking-dot`)
- [x] **In-place typewriter animation** — AI messages added to transcript immediately; `animatingTs` + `displayedLen` + `setInterval` reveals text character by character (22ms/char)
- [x] No race conditions — text always in `transcript`, animation is purely cosmetic reveal
- [x] Cursor blink during animation; full text visible immediately on animation complete

### Language & Speed Controls
- [x] Language picker (English / Thai / Japanese / Chinese) — pill selector in idle, dropdown in active
- [x] Speed picker (0.5x / 0.75x / 1x / 1.25x / 1.5x / 2x) — pill selector in idle, dropdown in active
- [x] Changes during a call POST to `/call/settings` immediately
- [x] Changes before a call are sent with `/call/start` payload

### Event Log Cleanup
- [x] Removed `voice` and `heartbeat` types from EventLog — only `fall`, `sos`, `recovery`, `ack`
- [x] Voice transcripts moved to incident detail Transcript tab only
- [x] `EventLogEntry` type updated accordingly

---

## FastAPI Endpoints (current)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Server status |
| WS | `/ws` | WebSocket (alerts → dashboard, ACK ← dashboard) |
| GET | `/video` | MJPEG annotated video stream |
| POST | `/transcript` | Voice chatbot line → broadcast to all dashboards |
| POST | `/call/start` | Start voice session (language, speed, is_authorized, incident) |
| POST | `/call/stop` | End voice session + kill TTS playback |
| GET | `/call/status` | Returns `{ active: bool }` |
| POST | `/call/settings` | Update language/speed mid-call without restart |

## WebSocket Protocol

| Direction | Message Type | Fields |
|-----------|-------------|--------|
| Python → Dashboard | `heartbeat` | persons_detected |
| Python → Dashboard | `fall_alert` | event_id, person_id, ar, down_duration |
| Python → Dashboard | `sos_alert` | event_id |
| Python → Dashboard | `recovery` | person_id |
| Python → Dashboard | `voice_alert` | message, speaker ("user"\|"assistant"), mid (dedup ID) |
| Python → Dashboard | `call_status` | callStatus ("active"\|"idle") |
| Dashboard → Python | `acknowledge` | event_id |

---

## Seed Accounts

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Admin | admin@guardian.com | admin123 | Full |
| Authorized Responder | responder@guardian.com | resp123 | Clinical guidance |
| Unauthorized Responder | responder2@guardian.com | resp456 | Emergency contacts only |

# GUARDIAN — Project Progress

## Overview
Real-time AI fall detection system with a Python detection engine, voice AI assistant,
and a Next.js multi-user dashboard.

## Repository Structure
```
falldetection/
├── alerts/             FastAPI server (WS + MJPEG + /transcript endpoint)
├── core/               Fall detection logic + SOS gesture + voice AI assistant
├── data/               Dataset download scripts
├── tests/              Demo entry point (test_video.py)
├── training/           YOLO11 fine-tuning script
├── models/             Model weights (gitignored)
├── dashboard/          Next.js 14 web app (GUARDIAN Dashboard)
├── progress.md         This file
└── README.md           Full setup and usage documentation
```

## Completed Work

### Python Detection Engine
- YOLO11 Nano model classifies poses: `up`, `bending`, `down`
- State machine: STABLE → TRANSITION → VALIDATION → ALARM → RECOVERY
- SOS gesture: palm → fist sequence via MediaPipe
- FastAPI WebSocket server on port 8765
- MJPEG video stream at http://localhost:8765/video (annotated with bounding boxes, AR, banners)
- WebSocket at ws://localhost:8765/ws

### Voice AI Assistant (`core/fall_detection_voice_app.py`)
- Claude Haiku + Edge TTS + SpeechRecognition (Tkinter GUI)
- **Authorized tier**: clinical first-aid guidance (positioning, CPR, EMS instructions)
- **Unauthorized tier**: "Don't panic. Help is on the way." + hospital contacts only
- Multi-language: English, Thai, Japanese, Chinese
- Interruptible TTS: `afplay` subprocess killed instantly when user speaks
- Transcript streamed to dashboard via `POST /transcript` → WebSocket broadcast

### GUARDIAN Dashboard (Next.js)
See `dashboard/progress.md` for detailed progress.

#### Phase 1 — Core Setup ✅
- [x] Next.js 14 App Router + TypeScript strict mode
- [x] Tailwind CSS v4 (dark theme, no config file)
- [x] Prisma + SQLite database
- [x] NextAuth v5 with role-based routing (ADMIN / RESPONDER)
- [x] Seed data (admin + 2 responder accounts: authorized + unauthorized)

#### Phase 2 — Responder Dashboard ✅
- [x] WebSocket hook (useWebSocket) connecting to ws://localhost:8765/ws
- [x] Heartbeat → online/offline indicator + person count
- [x] Fall alert banner + 15s countdown timer
- [x] Acknowledge button (sends ACK back to Python)
- [x] Live MJPEG feed component (annotated frames with bounding boxes)
- [x] Incident status flow buttons (RESPONDING → ON_SCENE → RESOLVED / FALSE_ALARM)
- [x] Voice Assistant Panel (shows tier badge + live transcript from voice bot)
- [x] Event log (scrollable, timestamped, all event types)
- [x] Non-scrollable locked viewport layout (h-screen chain + min-h-0)
- [x] Responsive 2-column grid

#### Phase 2b — UI & Color System ✅
- [x] Global color token system: `lib/colors.ts` + `globals.css @theme`
- [x] All hardcoded hex values replaced with semantic Tailwind tokens
- [x] MJPEG feed env var fixed (`NEXT_PUBLIC_FEED_URL`)

#### Phase 3 — Admin Dashboard ✅
- [x] System overview + analytics
- [x] User management CRUD (add/edit/deactivate responders)
- [x] **isAuthorized tier toggle** per responder (checkbox in edit modal)
- [x] Detection threshold settings sliders
- [x] Incident history with filters
- [x] Recharts analytics
- [x] Auto incident report generator (Claude API)

## FastAPI Endpoints
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Server status |
| WS | `/ws` | WebSocket (alerts → dashboard, ACK ← dashboard) |
| GET | `/video` | MJPEG annotated video stream |
| POST | `/transcript` | Voice chatbot line → broadcast to dashboard |
| POST | `/call/start` | Start voice session (language, is_authorized, incident context) |
| POST | `/call/stop` | End voice session + kill TTS playback |
| GET | `/call/status` | Returns `{ active: bool }` |

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

## User Roles & Authorization Tiers
| Role | isAuthorized | Voice AI Response |
|------|-------------|-------------------|
| ADMIN | — | N/A |
| RESPONDER | true | Clinical first-aid guidance |
| RESPONDER | false | Emergency contacts only |

## Phase 5 — Incident-Aware Voice Bot & Event Log ✅

### Incident-Based Event Log
- Event log is **cleared on each new fall or SOS** — always shows only the current incident's timeline
- Events accumulate from detection through acknowledgement, status transitions, and voice exchanges
- On recovery or false alarm, the final log state remains visible until a new incident fires

### Context-Aware Voice Bot
- `POST /call/start` now accepts optional `incident` field (`IncidentContext` Pydantic model)
  ```json
  { "language": "English", "is_authorized": true,
    "incident": { "type": "FALL", "person_id": 0, "ar": 0.42, "down_duration": 18.3, "status": "ACKNOWLEDGED" } }
  ```
- `_build_incident_block()` converts incident data into a plain-English clinical context block injected above the system prompt
- AR risk levels: < 0.5 = HIGH (fully horizontal), 0.5–0.7 = MODERATE, > 0.7 = LOW (more upright)
- Down-duration risk levels: ≥ 30s = CRITICAL, ≥ 10s = HIGH, < 10s = MODERATE
- SOS context: states person was conscious enough to signal, advises checking pain/injury/mobility
- Bot can answer "what happened?", "how serious is it?", "what should I check?" immediately

### ChatPanel Incident Badge
- When a fall/SOS is active, the idle call launcher shows a colored incident badge:
  - FALL: red tint with person ID, AR value, down duration, "Bot is briefed on this incident"
  - SOS: amber tint with alert type
- Call button changes from green to red/pulsing when an incident is active
- Call button label changes: "Start voice call" → "Brief AI on incident"
- Subtitle changes to "incident aware" to confirm context injection

## Running the System
```bash
# Terminal 1 — Detection engine + voice server (all-in-one)
source venv/bin/activate
python tests/test_video.py

# Terminal 2 — Dashboard
cd dashboard && npm run dev
```
> Voice assistant is now built into `alerts/server.py` — no separate script needed.
> Start a call from the dashboard's Voice Assistant panel (bottom-right).

## Seed Accounts
| Role | Email | Password | Access |
|------|-------|----------|--------|
| Admin | admin@guardian.com | admin123 | Full |
| Authorized | responder@guardian.com | resp123 | Clinical |
| Unauthorized | responder2@guardian.com | resp456 | Contacts only |

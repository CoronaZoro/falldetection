# GUARDIAN — Project Progress

## Overview
Real-time AI fall detection system with a Python detection engine and a Next.js multi-user dashboard.

## Repository Structure
```
falldetection/
├── alerts/             Python WebSocket alert server (port 8765)
├── core/               Fall detection logic + SOS gesture
├── data/               Dataset download scripts
├── tests/              Demo entry point (test_video.py)
├── training/           YOLO11 fine-tuning script
├── models/             Model weights (gitignored)
├── dashboard/          Next.js 14 web app (GUARDIAN Dashboard)
├── progress.md         This file
└── README.md           Python engine documentation
```

## Completed Work

### Python Detection Engine (pre-existing)
- YOLO11 Nano model classifies poses: `up`, `bending`, `down`
- State machine: STABLE → TRANSITION → VALIDATION → ALARM → RECOVERY
- SOS gesture: palm → fist sequence via MediaPipe
- FastAPI WebSocket server on port 8765
- MJPEG video stream at http://localhost:8765/video
- WebSocket at ws://localhost:8765/ws

### GUARDIAN Dashboard (Next.js) — In Progress
See `dashboard/progress.md` for detailed dashboard progress.

#### Phase 1 — Core Setup ✅
- [x] Next.js 14 App Router + TypeScript strict mode
- [x] Tailwind CSS v4 (dark theme, no config file)
- [x] Prisma + SQLite database
- [x] NextAuth v5 with role-based routing (ADMIN / RESPONDER)
- [x] Seed data (admin + responder accounts, default config)

#### Phase 2 — Responder Dashboard ✅
- [x] WebSocket hook (useWebSocket) connecting to ws://localhost:8765/ws
- [x] Heartbeat → online/offline indicator
- [x] Fall alert banner + 15s countdown timer
- [x] Acknowledge button (sends ACK back to Python)
- [x] Live MJPEG feed component
- [x] Incident status flow buttons (RESPONDING → ON_SCENE → RESOLVED / FALSE_ALARM)
- [x] Voice alert transcript log
- [x] AI First Aid Chatbot (Claude claude-sonnet-4-20250514, placeholder API key)
- [x] Event log (scrollable, timestamped)

#### Phase 3 — Admin Dashboard ✅
- [x] System overview + analytics
- [x] User management CRUD (add/edit/deactivate responders)
- [x] Detection threshold settings sliders
- [x] Incident history with filters
- [x] Recharts analytics (falls per day, response time, incident type pie)
- [x] Auto incident report generator (Claude API, triggers on RESOLVED)

## WebSocket Protocol
| Direction | Message Type | Description |
|-----------|-------------|-------------|
| Python → Next.js | `heartbeat` | Every 3s, system alive |
| Python → Next.js | `fall_alert` | Fall confirmed |
| Python → Next.js | `sos_alert` | Manual SOS gesture |
| Python → Next.js | `recovery` | Person stood up |
| Python → Next.js | `voice_alert` | TTS transcript |
| Next.js → Python | `acknowledge` | Responder acknowledged alert |

## User Roles
| Role | Capabilities |
|------|-------------|
| ADMIN | Full system management, analytics, user CRUD, settings |
| RESPONDER | Live feed, alert response, incident management, AI chatbot |

## Running the System
```bash
# Terminal 1 — Python detection engine
cd falldetection
python tests/test_video.py

# Terminal 2 — Next.js dashboard
cd falldetection/dashboard
npm run dev
```

## Environment Setup
Copy `.env.local.example` to `.env.local` and fill in:
- `NEXTAUTH_SECRET` — any random string
- `ANTHROPIC_API_KEY` — from Anthropic console (for AI chatbot + reports)

## Seed Accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@guardian.com | admin123 |
| Responder | responder@guardian.com | resp123 |

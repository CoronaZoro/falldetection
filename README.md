# Fall Detection System — GUARDIAN

Real-time AI fall detection and emergency alert system using computer vision + voice AI.
Detects falls via YOLO object detection, supports manual SOS via hand gesture, voice-activated
emergency assistant (Claude), and broadcasts everything to a live multi-user web dashboard.

## Features

- **Fall detection** — YOLO11 Nano model classifies pose as `up`, `bending`, or `down`
- **State machine** — filters false positives using aspect ratio, transition time, and inactivity checks
- **SOS gesture** — palm → fist sequence triggers a manual emergency alert
- **WebSocket alerts** — real-time broadcasts to connected dashboards on fall, SOS, or recovery events
- **MJPEG live feed** — annotated video stream with bounding boxes, AR values, and state banners
- **Voice AI assistant** — Claude-powered voice chatbot built into the server; authorized/unauthorized tiers; incident-aware context injection
- **Multi-language voice** — auto-detects and responds in the responder's spoken language (English, Thai, Japanese, Chinese); language and speed changeable mid-call
- **Incident history** — every incident's timeline, voice transcript, and AI-generated report stored and reviewable
- **Apple Silicon support** — runs inference on MPS (Metal Performance Shaders)

## Tech Stack

- Python 3.11 · PyTorch (MPS) · Ultralytics YOLO11 · MediaPipe · OpenCV
- FastAPI + Uvicorn (WebSocket alert server + MJPEG stream + voice session API)
- Anthropic SDK (Claude Haiku — voice assistant)
- Edge TTS + SpeechRecognition + PyAudio (voice I/O)
- Next.js 14 App Router + TypeScript + Tailwind CSS v4 + Prisma + SQLite (web dashboard)
- NextAuth v5 JWT (role-based access: ADMIN / RESPONDER)

## Project Structure

```
falldetection/
├── core/
│   ├── fall_logic.py              Fall detection state machine
│   ├── sos_gesture.py             Hand gesture SOS trigger
│   └── fall_detection_voice_app.py  Standalone voice app (legacy — voice now in server.py)
├── alerts/
│   └── server.py                  FastAPI server — WebSocket, MJPEG, voice session endpoints
├── training/
│   └── train.py                   YOLO11 fine-tuning script
├── tests/
│   └── test_video.py              Main entry point (starts camera + server)
├── data/
│   ├── dataset/                   Training data (gitignored)
│   └── roboflow_download.py       Dataset download script
├── models/                        Trained weights (gitignored)
│   ├── best.pt                    Fine-tuned YOLO11 model
│   └── hand_landmarker.task       MediaPipe hand landmark model
└── dashboard/                     Next.js web app (GUARDIAN Dashboard)
    ├── app/                       App Router pages + API routes
    ├── components/                UI components (responder + admin + shared)
    ├── prisma/                    Schema + SQLite database
    └── .env.local                 Environment variables
```

## Setup

### 1. Create & activate virtual environment

```bash
python -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows
```

### 2. Install Python dependencies

```bash
pip install ultralytics mediapipe fastapi uvicorn opencv-python python-dotenv \
            anthropic SpeechRecognition pyaudio edge-tts
```

> **PyAudio on macOS** requires PortAudio first:
> ```bash
> brew install portaudio && pip install pyaudio
> ```

### 3. Configure environment

Create a `.env` file in the project root:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Configure the dashboard

Create `dashboard/.env.local`:
```
NEXTAUTH_SECRET=change-me-to-a-random-string
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=sk-ant-...
DETECTION_WS_URL=ws://localhost:8765/ws
DETECTION_FEED_URL=http://localhost:8765/video
NEXT_PUBLIC_DETECTION_WS_URL=ws://localhost:8765/ws
NEXT_PUBLIC_FEED_URL=http://localhost:8765/video
```

### 5. Download model weights

Place `best.pt` in `models/`. The MediaPipe hand model is auto-downloaded on first run.

## Running the System

```bash
# Terminal 1 — Detection engine + FastAPI server (camera + WebSocket + voice)
source venv/bin/activate
python tests/test_video.py

# Terminal 2 — Next.js dashboard
cd dashboard
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open **http://localhost:3000**

> The voice assistant is built directly into `alerts/server.py`.
> Start a call from the **Voice Assistant panel** on the responder dashboard — no separate script needed.

### Train a new model

```bash
python training/train.py
```

## WebSocket / API Protocol

**WebSocket** — `ws://localhost:8765/ws`

| Direction | Message Type | Description |
|-----------|-------------|-------------|
| Python → Dashboard | `heartbeat` | Every 3s — persons detected count |
| Python → Dashboard | `fall_alert` | Fall confirmed (event_id, person_id, AR, duration) |
| Python → Dashboard | `sos_alert` | SOS gesture completed (event_id) |
| Python → Dashboard | `recovery` | Person stood back up |
| Python → Dashboard | `voice_alert` | Transcript line (speaker + text + mid dedup ID) |
| Python → Dashboard | `call_status` | Voice session started or ended |
| Dashboard → Python | `acknowledge` | Responder acknowledged alert (event_id) |

**HTTP endpoints** — `http://localhost:8765`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Server status |
| GET | `/video` | MJPEG annotated video stream |
| POST | `/transcript` | Push voice transcript line to all dashboards |
| POST | `/call/start` | Start voice session (language, speed, is_authorized, incident context) |
| POST | `/call/stop` | End voice session + interrupt TTS immediately |
| GET | `/call/status` | Returns `{ "active": bool }` |
| POST | `/call/settings` | Update language or speed mid-call without restarting |

**POST /call/start payload:**
```json
{
  "language": "English",
  "speed": "1x",
  "is_authorized": true,
  "incident": {
    "type": "FALL",
    "person_id": 0,
    "ar": 0.42,
    "down_duration": 18.3,
    "status": "ACKNOWLEDGED"
  }
}
```

**POST /call/settings payload (mid-call changes):**
```json
{ "language": "Thai", "speed": "1.25x" }
```

## Voice Assistant

### Authorization Tiers

| Tier | Who | What they get |
|------|-----|---------------|
| **Authorized** | Healthcare providers (nurses, doctors, paramedics) | Clinical first-aid guidance — positioning, CPR, EMS escalation |
| **Unauthorized** | Bystanders, general staff | "Don't panic. Help is on the way." + nearest hospital contacts |

Authorization is set per-user by the Admin (User Management → Edit → "Authorized healthcare provider" checkbox).

### Incident Context Injection

When a call starts during an active incident, a context block is automatically built from the incident data and injected into the system prompt:

- **AR risk levels**: < 0.5 = HIGH (fully horizontal), 0.5–0.7 = MODERATE, > 0.7 = LOW
- **Duration risk levels**: ≥ 30s = CRITICAL, ≥ 10s = HIGH, < 10s = MODERATE
- Bot can immediately answer "what happened?", "how serious is it?", "what should I check?"

### Language & Speed

- **Supported languages**: English · Thai · Japanese · Chinese
- **Speaking speeds**: 0.5x · 0.75x · 1x · 1.25x · 1.5x · 2x
- Language and speed can be changed **mid-call** without restarting
- Bot **auto-detects** the responder's spoken language and responds in it

## How Fall Detection Works

1. YOLO detects person and classifies pose (`up` / `bending` / `down`)
2. Bounding box aspect ratio is computed — standing ≈ 0.9–1.3, fallen ≈ 2–3
3. State machine transitions: `STABLE → TRANSITION → VALIDATION → INACTIVITY → ALARM`
4. Transitions faster than 1.2s are flagged; slow movements (intentional lying down) are ignored
5. Alarm requires confirmed immobility (no micro-movement for 1.5s)
6. On recovery, `ALARM → STABLE` and a recovery broadcast is sent

## Dashboard — Key Pages

| Page | Path | Description |
|------|------|-------------|
| Responder Dashboard | `/responder/dashboard` | Live feed, alerts, event log, voice chatbot |
| Incident Detail | `/responder/incidents/[id]` | Timeline, transcript, AI report per incident |
| Incident History | `/responder/incidents` | Searchable list of all past incidents |
| Admin Dashboard | `/admin/dashboard` | Analytics, system status |
| User Management | `/admin/users` | Add/edit/deactivate responders, set authorization tier |
| Incident Management | `/admin/incidents` | All incidents with filters |
| Settings | `/admin/settings` | Detection thresholds |

## Dashboard Accounts (seed defaults)

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Admin | admin@guardian.com | admin123 | Full system management |
| Responder (Authorized) | responder@guardian.com | resp123 | Clinical guidance |
| Responder (Unauthorized) | responder2@guardian.com | resp456 | Emergency contacts |

## Dataset

[Roboflow — falling detection dataset](https://roboflow.com) · License: CC BY 4.0

Classes: `bending` · `down` · `up`

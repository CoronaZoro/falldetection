# Fall Detection System — GUARDIAN

Real-time AI fall detection and emergency alert system using computer vision + voice AI.
Detects falls via YOLO object detection + MediaPipe skeleton analysis, voice-activated
emergency assistant (Claude), and broadcasts everything to a live multi-user web dashboard.

## Features

- **Sudden Fall detection (Strokes, heart attacks, etc )** — Roboflow hosted inference classifies pose as `up`, `bending`, or `down`
- **Velocity-based classification** — MediaPipe hip velocity discriminates true falls (fast) from intentional lie-downs (slow); spine angle + head position break ties
- **SLEEPING state** — persons lying down slowly are flagged as SLEEPING (no alarm, purple indicator); alarm only fires on fast falls
- **MediaPipe skeleton** — `PoseAnalyzer` extracts spine angle, hip velocity, head-below-waist signals per frame; skeleton overlay toggleable from dashboard
- **State machine** — `STABLE → TRANSITION → VALIDATION → INACTIVITY → ALARM → RECOVERY`; filters false positives using AR, velocity, and pose confirmation
- **Live down-duration counter** — tracks how long the person has been on the ground from first fall to recovery; shown live on dashboard, passed to chatbot as context
- **WebSocket alerts** — real-time broadcasts to connected dashboards on fall, recovery, and state changes
- **Instant state updates** — `state_update` WS message fires immediately on every state change; heartbeat carries state every 3s as backup
- **MJPEG live feed** — annotated video stream; per-frame visualizer toggles (skeleton / bounding box / status bar)
- **WebRTC VAD** — Google WebRTC VAD (`webrtcvad`) replaces energy-threshold listening; ring-buffer pre-roll prevents onset clipping; 4-level aggressiveness
- **Live Voice AI assistant** — Claude-powered voice chatbot; authorized/unauthorized tiers; incident-aware context injection including live down-duration
- **Multi-language voice** — auto-detects and responds in the responder's spoken language (English, Thai, Japanese, Chinese); language and speed changeable mid-call
- **Incident history** — every incident's timeline, voice transcript, and AI-generated report stored and reviewable
- **Mic mute** — responder can mute/unmute their mic mid-call; audio is still captured but discarded, not sent to STT or Claude
- **LINE broadcast alerts** — when the 15s escalation timer fires, a LINE message is sent directly from FastAPI to all bot friends; dashboard shows "LINE alert sent" confirmation
- **Live config sync** — detection thresholds editable from the admin settings page and applied to the running engine without restart
- **Apple Silicon support** — runs inference on MPS (Metal Performance Shaders)

## Tech Stack

- Python 3.11 · OpenCV · Roboflow `inference` SDK (local on-device inference)
- MediaPipe Tasks API 0.10+ — `PoseLandmarker` with `RunningMode.VIDEO` for skeleton analysis
- FastAPI + Uvicorn (WebSocket alert server + MJPEG stream + voice session API + config API)
- Anthropic SDK (Claude — voice assistant + incident reports)
- Edge TTS + `webrtcvad-wheels` + PyAudio (voice I/O with WebRTC VAD)
- Next.js 14 App Router + TypeScript + Tailwind CSS v4 + Prisma + SQLite (web dashboard)
- NextAuth v5 JWT (role-based access: ADMIN / RESPONDER)

## Project Structure

```
falldetection/
├── alerts/
│   ├── server.py                  FastAPI server — WebSocket, MJPEG, config, viz flags, escalation
│   ├── voice.py                   Voice session module — WebRTC VAD, STT, Claude, TTS
│   ├── fall_logic.py              Per-person fall state machine (velocity-first)
│   └── pose_analyzer.py           MediaPipe skeleton signals (spine angle, hip velocity)
├── training/
│   └── train.py                   YOLO11 fine-tuning script
├── tests/
│   └── test_video.py              Main entry point (starts camera + server)
├── data/
│   ├── dataset/                   Training data (gitignored)
│   └── roboflow_download.py       Dataset download script
├── models/
│   ├── best.pt                    Fine-tuned YOLO11 model (gitignored)
│   └── pose_landmarker_lite.task  MediaPipe pose model (download separately)
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
pip install inference fastapi uvicorn opencv-python python-dotenv \
            anthropic SpeechRecognition pyaudio webrtcvad-wheels edge-tts mediapipe
```

> **PyAudio on macOS** requires PortAudio first:
>
> ```bash
> brew install portaudio && pip install pyaudio
> ```
>
> `webrtcvad-wheels` provides prebuilt wheels for the Google WebRTC VAD library — no compiler needed.
>
> `mediapipe` 0.10+ uses the Tasks API — the legacy `mp.solutions` API is removed.

### 3. Download the MediaPipe pose model

```bash
mkdir -p models
curl -sL https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task \
     -o models/pose_landmarker_lite.task
```

### 4. Configure environment

Create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
ROBOFLOW_API_KEY=your_key
ROBOFLOW_WORKSPACE=your_workspace
ROBOFLOW_PROJECT=your_project_name
ROBOFLOW_VERSION=1
```

### 5. Configure the dashboard

Create `dashboard/.env.local` (for Next.js at runtime):

```
NEXTAUTH_SECRET=change-me-to-a-random-string
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY=sk-ant-...
DETECTION_WS_URL=ws://localhost:8765/ws
DETECTION_FEED_URL=http://localhost:8765/video
NEXT_PUBLIC_DETECTION_WS_URL=ws://localhost:8765/ws
NEXT_PUBLIC_FEED_URL=http://localhost:8765/video
NEXT_PUBLIC_DETECTION_API_URL=http://localhost:8765
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
```

Also create `dashboard/.env` (for Prisma CLI commands like `db:push` / `db:seed`):

```
DATABASE_URL="file:./dev.db"
```

### 6. Download model weights

Place `best.pt` in `models/`. The MediaPipe pose model must be downloaded manually (step 3 above).

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

> The voice assistant is built directly into `alerts/voice.py`.
> Start a call from the **Voice Assistant panel** on the responder dashboard — no separate script needed.

### Train a new model

```bash
python training/train.py
```

## WebSocket / API Protocol

**WebSocket** — `ws://localhost:8765/ws`

| Direction          | Message Type   | Fields                                         | Description                                                  |
| ------------------ | -------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Python → Dashboard | `heartbeat`    | `state`, `persons_detected`                    | Every 3s — current state + person count                      |
| Python → Dashboard | `state_update` | `state`, `persons_detected`                    | Fires immediately on every state change                      |
| Python → Dashboard | `fall_alert`   | `event_id`, `person_id`, `ar`, `down_duration` | Fall confirmed                                               |
| Python → Dashboard | `recovery`     | `person_id`, `auto_resolved`, `down_duration`  | Person stood back up; `down_duration` = total time on ground |
| Python → Dashboard | `escalation`   | `event_id`                                     | 15s ACK timer fired — no responder acknowledged              |
| Python → Dashboard | `voice_alert`  | `message`, `speaker`, `mid`                    | Transcript line (dedup ID prevents double-processing)        |
| Python → Dashboard | `call_status`  | `callStatus`                                   | Voice session started or ended                               |
| Python → Dashboard | `mic_status`   | `status`                                       | `"listening"` · `"speaking"` · `"muted"`                     |
| Dashboard → Python | `acknowledge`  | `event_id`                                     | Responder acknowledged alert                                 |

**HTTP endpoints** — `http://localhost:8765`

| Method  | Route            | Description                                                            |
| ------- | ---------------- | ---------------------------------------------------------------------- |
| GET     | `/health`        | Server status + WS connection count                                    |
| GET     | `/video`         | MJPEG annotated video stream                                           |
| GET/PUT | `/config`        | Read or update live detection thresholds                               |
| GET/PUT | `/visualization` | Toggle skeleton / bounding box / status bar overlays                   |
| POST    | `/transcript`    | Push voice transcript line to all dashboards                           |
| POST    | `/call/start`    | Start voice session (language, speed, is_authorized, incident context) |
| POST    | `/call/stop`     | End voice session + interrupt TTS immediately                          |
| GET     | `/call/status`   | Returns `{ "active": bool, "muted": bool }`                            |
| POST    | `/call/settings` | Update language or speed mid-call without restarting                   |
| POST    | `/call/mute`     | Mute mic — audio captured but discarded, not sent to STT               |
| POST    | `/call/unmute`   | Unmute mic — resume normal STT processing                              |

**GET/PUT /config** — live detection thresholds (all fields optional on PUT):

```json
{
  "cameraIndex": 0,
  "arThreshold": 1.5,
  "transitionTime": 1.5,
  "confirmSeconds": 1.5,
  "escalationSeconds": 15,
  "fallVelThreshold": 0.3,
  "sleepVelThreshold": 0.2,
  "poseSpineFallen": 45.0,
  "recoveryLabelTime": 0.5,
  "movementThreshold": 10
}
```

Changes are applied immediately to the running `FallLogic` instance without restart.

**GET/PUT /visualization** — overlay toggles:

```json
{ "skeleton": true, "bbox": true, "status_bar": true }
```

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

## How Fall Detection Works

### YOLO Model Labels

The fine-tuned YOLO11 model classifies each detected person as one of three poses:

| Label     | Meaning                             |
| --------- | ----------------------------------- |
| `up`      | Standing or sitting upright         |
| `bending` | Bending over — transitional posture |
| `down`    | Lying or fallen                     |

### Velocity-Based Classification

Once a person is detected `down`, the system must decide if it is a **fall** or a **sleep** (intentional lie-down):

1. `PoseAnalyzer` computes **hip velocity** (normalized screen units/s) over a 0.5s rolling window from MediaPipe landmarks
2. **Fast drop** (`vel > 0.30/s`) → classified as **fall** immediately
3. **Slow transition** (`vel < 0.20/s`) → classified as **sleep** → `SLEEPING` state (no alarm)
4. **Ambiguous zone** (0.20–0.30/s) → resolved by body geometry:
   - **spine angle > 45°** from vertical (body roughly horizontal) → **fall**
   - **head below hip midpoint** → **fall**
   - Otherwise → **sleep**
5. If pose is not visible, falls back to transition time: > 1.5s = sleep, ≤ 1.5s = fall

### State Machine

```
STABLE → TRANSITION → VALIDATION → ALARM
                   ↘ INACTIVITY ↗
                   ↘ SLEEPING (no alarm, purple)
ALARM → RECOVERY (person stood up)
SLEEPING → STABLE (person woke up, sustained "up" for 0.5s)
```

- **TRANSITION** — person first detected `down`; starts confirmation timer
- **VALIDATION** — pose gate: if skeleton visible but body is NOT horizontal, block the alarm
- **INACTIVITY** — person `down` and not moving (micro-movement check)
- **ALARM** — confirmed fall; broadcasts `fall_alert`; 15s escalation timer starts
- **RECOVERY** — person stood back up during ALARM; broadcasts `recovery` with `auto_resolved=true`; total `down_duration` computed from first `down` to recovery moment
- **SLEEPING** — slow transition detected; displayed in purple; no alarm fired

### Down Duration

- Starts counting from the moment the person first goes `down` (before alarm confirmation)
- Shown as a live ticking counter on the dashboard alert card
- Final duration included in the `recovery` WS message
- Passed to the voice AI on call start so the chatbot knows how long the person has been on the ground

### Skeleton Signals (MediaPipe)

`PoseAnalyzer` (`alerts/pose_analyzer.py`) wraps the MediaPipe Tasks API:

| Signal             | How computed                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `spine_angle`      | Degrees from vertical — shoulder midpoint → hip midpoint vector (0° = upright, 90° = flat) |
| `hip_velocity`     | Normalized screen units/s downward — rolling 0.5s deque of hip midpoint Y positions        |
| `head_below_waist` | `nose.y > hip_mid.y` in image coordinates                                                  |

Skeleton overlay is drawn with OpenCV (MediaPipe 0.10+ removed the legacy drawing utilities).
The overlay can be toggled on/off from the dashboard live feed without restarting.

## Voice Assistant

### WebRTC VAD

The voice loop uses **Google WebRTC VAD** (`webrtcvad`) instead of energy-threshold silence detection:

- PyAudio stream is held open for the entire call at 16 kHz / 16-bit / mono
- Audio is classified in 30 ms frames; speech frames trigger capture, silence frames end it
- A 300 ms ring-buffer **pre-roll** prevents clipping the first syllable
- 4-level aggressiveness maps to the sensitivity picker on the dashboard:

| Dashboard label | VAD aggressiveness | Pause threshold | Best for                 |
| --------------- | ------------------ | --------------- | ------------------------ |
| Sensitive       | 0                  | 100 ms          | Soft voices, quiet room  |
| Balanced        | 1                  | 300 ms          | Normal speech, indoors   |
| Clear           | 2                  | 600 ms          | Clear speech, some noise |
| Strict          | 3                  | 1200 ms         | Loud speech, noisy room  |

- A `mic_status` WebSocket message fires on speech onset (`"speaking"`) so the dashboard waveform only animates while speech is actively detected — not during the idle listening wait

### Authorization Tiers

| Tier             | Who                                                | What they get                                                  |
| ---------------- | -------------------------------------------------- | -------------------------------------------------------------- |
| **Authorized**   | Healthcare providers (nurses, doctors, paramedics) | Clinical first-aid guidance — positioning, CPR, EMS escalation |
| **Unauthorized** | Bystanders, general staff                          | "Don't panic. Help is on the way." + nearest hospital contacts |

Authorization is set per-user by the Admin (User Management → Edit → "Authorized healthcare provider" checkbox).

### Incident Context Injection

When a call starts during an active incident, a context block is automatically built from the incident data and injected into the system prompt:

- **AR risk levels**: < 0.5 = HIGH (fully horizontal), 0.5–0.7 = MODERATE, > 0.7 = LOW
- **Duration risk levels**: ≥ 30s = CRITICAL, ≥ 10s = HIGH, < 10s = MODERATE
- **Live down-duration** — the total time the person has been on the ground (not just the snapshot at alarm time) is passed to the bot
- Bot can immediately answer "what happened?", "how serious is it?", "how long have they been down?"

### Language & Speed

- **Supported languages**: English · Thai · Japanese · Chinese
- **Speaking speeds**: 0.5x · 0.75x · 1x · 1.25x · 1.5x · 2x
- Language and speed can be changed **mid-call** without restarting
- Bot **auto-detects** the responder's spoken language and responds in it

## Dashboard — Key Pages

| Page                | Path                        | Description                                                      |
| ------------------- | --------------------------- | ---------------------------------------------------------------- |
| Responder Dashboard | `/responder/dashboard`      | Live feed, alerts, event log, voice chatbot                      |
| Incident Detail     | `/responder/incidents/[id]` | Timeline, transcript, AI report per incident                     |
| Incident History    | `/responder/incidents`      | Searchable list of all past incidents                            |
| Admin Dashboard     | `/admin/dashboard`          | Analytics, system status                                         |
| User Management     | `/admin/users`              | Add/edit/deactivate responders, set authorization tier           |
| Incident Management | `/admin/incidents`          | All incidents with filters                                       |
| Settings            | `/admin/settings`           | Live detection thresholds — synced to Python engine in real time |

### Live Feed Visualizer Toggles

The live feed overlay can be toggled without restarting the Python engine:

| Button   | Toggles                                     | Default |
| -------- | ------------------------------------------- | ------- |
| Skeleton | MediaPipe pose landmarks + connection lines | On      |
| Box      | Bounding boxes + AR values + state labels   | On      |
| Status   | Top state banner + bottom debug bar         | On      |

Toggles call `PUT /visualization` immediately; the Python loop reads flags once per frame.

## Dashboard Accounts (seed defaults)

| Role                     | Email                   | Password | Access                 |
| ------------------------ | ----------------------- | -------- | ---------------------- |
| Admin                    | admin@guardian.com      | admin123 | Full system management |
| Responder (Authorized)   | responder@guardian.com  | resp123  | Clinical guidance      |
| Responder (Demo)         | demo@guardian.com       | demo123  | Emergency contacts     |
| Responder (Demo 2)       | demo2@guardian.com      | demo456  | Emergency contacts     |

> Add LINE IDs to responder profiles (User Management → Edit) so they receive LINE broadcast alerts on escalation.

## LINE Alert Setup

1. Create a LINE Official Account at [manager.line.biz](https://manager.line.biz)
2. In OA Manager → Settings → Messaging API → **Enable Messaging API** (links to LINE Developers)
3. In [developers.line.biz](https://developers.line.biz) → your channel → Messaging API tab → Issue a **Channel Access Token**
4. Add the token to `dashboard/.env.local` as `LINE_CHANNEL_ACCESS_TOKEN`
5. Set **Use webhook → Off** in LINE Developers (broadcast doesn't need a webhook)
6. Responders add the bot as a LINE friend — they will receive alerts when the 15s escalation timer fires

The broadcast is sent directly from FastAPI (`_notify_line` in `server.py`) — Next.js is not involved.

## Dataset

[Roboflow — falling detection dataset](https://roboflow.com) · License: CC BY 4.0

Classes: `bending` · `down` · `up`

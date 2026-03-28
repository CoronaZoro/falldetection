# GUARDIAN — Project Progress

## Overview
Real-time AI fall detection system with a Python detection engine, voice AI assistant,
and a Next.js multi-user dashboard.

## Repository Structure
```
falldetection/
├── alerts/             FastAPI server + voice module + fall state machine + pose analyzer
│   ├── server.py       Core server — WS, MJPEG, config, viz flags, escalation, broadcasts
│   ├── voice.py        Voice session — WebRTC VAD, STT, Claude, TTS, /call/* routes
│   ├── fall_logic.py   Per-person fall state machine (velocity-first + SLEEPING state)
│   └── pose_analyzer.py  MediaPipe Tasks API wrapper (spine angle, hip velocity, head pos)
├── data/               Dataset download scripts
├── tests/              Demo entry point (test_video.py)
├── training/           YOLO11 fine-tuning script
├── models/             Model weights (gitignored)
│   ├── best.pt         Fine-tuned YOLO11 model
│   └── pose_landmarker_lite.task  MediaPipe pose model (download separately)
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
> Voice assistant is built into `alerts/voice.py` and mounted via `alerts/server.py` — no separate script needed.
> Start a call from the dashboard's Voice Assistant panel (bottom-right).

---

## Phase 1 — Python Detection Engine ✅

- **Roboflow `inference` SDK** — model runs **locally on-device**, no network call per frame (~30–80 ms on M2)
- Model downloaded once on first run via `get_model(model_id, api_key)` and cached on disk
- Roboflow credentials loaded from `.env` (`ROBOFLOW_API_KEY`, `ROBOFLOW_PROJECT`, `ROBOFLOW_VERSION`)
- Prediction format converted from inference SDK center-based (`pred.x`, `pred.y`, `pred.width`, `pred.height`) to corner-based (x1, y1, x2, y2) for state machine
- Class label accessed via `pred.class_name` (no CLASSES dict needed)
- State machine: STABLE → TRANSITION → VALIDATION → INACTIVITY → ALARM → RECOVERY
- FastAPI WebSocket server on port 8765
- MJPEG video stream at http://localhost:8765/video (annotated with bounding boxes, AR, banners)
- 15-second ACK timer: if no responder acknowledges, `_escalate()` fires (hookable for future alerting)
- **SOS hand gesture removed** — `sos_gesture.py` and all SOS detection code scrapped
- **`core/` package removed** — `fall_logic.py` moved to `alerts/`; entire `core/` directory deleted

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

## Phase 3 — Voice AI Assistant (`alerts/voice.py`) ✅

Replaced the separate `fall_detection_voice_app.py` process. Voice is now a standalone
`alerts/voice.py` module with its own `APIRouter`, mounted into `server.py`.

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
- [x] `init(broadcast_fn)` injection pattern — avoids circular imports; `_broadcast` passed from `server.py` at FastAPI startup
- [x] `router = APIRouter(tags=["voice"])` mounted in `server.py` via `app.include_router(_voice.router)`

### Incident Context Injection
- [x] `_build_incident_block(incident)` — converts AR + down_duration into plain-English risk context prepended to system prompt
- [x] AR risk: < 0.5 = HIGH, 0.5–0.7 = MODERATE, > 0.7 = LOW
- [x] Duration risk: ≥ 30s = CRITICAL, ≥ 10s = HIGH, < 10s = MODERATE
- [x] Bot answers "what happened?", "how serious is it?", "how long have they been down?" immediately on call start

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
- [x] EventLog only handles `fall`, `recovery`, `ack` — voice/heartbeat/SOS removed
- [x] Voice transcripts moved to incident detail Transcript tab only
- [x] `EventLogEntry` type updated accordingly

### SOS & Twilio Removed
- [x] `sos_gesture.py` and all SOS detection code removed from Python engine
- [x] `broadcast_sos` removed from `server.py`
- [x] `sos_alert` WebSocket handler removed from dashboard
- [x] SOS removed from `IncidentType` enum, `EventLogEntry`, `WSMessage`, `StatusBadge`, `EventLog`, `ChatPanel`
- [x] Twilio fields (`twilioEnabled`, `twilioNumber`) removed from `SystemConfig` schema + DB

---

## Phase 6 — WebRTC VAD ✅

Replaced `sr.Recognizer.listen()` energy-threshold VAD with Google WebRTC VAD for more
accurate speech boundary detection — prevents cutoff on natural pauses.

- [x] `webrtcvad-wheels` installed — prebuilt, no compiler needed
- [x] PyAudio stream opened once and held for the entire call (16 kHz / 16-bit / mono)
- [x] `_capture_utterance()` — 30 ms frame loop; ring-buffer pre-roll (300 ms) prevents onset clipping
- [x] `on_speech_start` callback — fires exactly once on first speech frame; broadcasts `mic_status: "speaking"` to dashboard
- [x] 4-level aggressiveness: `_vad_aggressiveness()` maps dashboard sensitivity to 0–3
- [x] Sensitivity → VAD mapping:

  | Dashboard label | Aggressiveness | Silence threshold |
  |----------------|---------------|-------------------|
  | Sensitive | 0 | 100 ms |
  | Balanced | 1 | 300 ms |
  | Clear | 2 | 600 ms |
  | Strict | 3 | 1200 ms |

- [x] `mic_status` WS message: `"listening"` (mic open, waiting) · `"speaking"` (speech onset detected)

---

## Phase 7 — MediaPipe Skeleton Integration ✅

Added `PoseAnalyzer` (`alerts/pose_analyzer.py`) to extract biomechanical signals per frame
using the MediaPipe Tasks API (0.10+). Replaced the removed legacy `mp.solutions` API.

- [x] Uses `PoseLandmarker` with `RunningMode.VIDEO` — stateful, processes timestamps in order
- [x] Model file: `models/pose_landmarker_lite.task` (downloaded separately via `curl`)
- [x] Landmark indices tracked: nose (0), left/right shoulder (11/12), left/right hip (23/24), left/right ankle (27/28)
- [x] Visibility threshold: 0.5 — landmarks below this are excluded from calculations

### Signals extracted per person per frame

| Signal | Description |
|--------|-------------|
| `spine_angle` | Degrees from vertical — shoulder midpoint → hip midpoint vector. 0° = upright, 90° = flat |
| `hip_velocity` | Normalized screen units/s downward — rolling 0.5s deque of hip midpoint Y positions |
| `head_below_waist` | Boolean — `nose.y > hip_mid.y` in image coordinates |
| `visible` | Boolean — whether any reliable landmarks were found this frame |

- [x] Person matching: hip midpoint checked against bounding boxes; falls back to first person if only one detected
- [x] `_extract_signals()` uses `collections.deque` with maxlen based on FPS estimate for velocity window
- [x] `remove_person(person_id)` — cleans up state when a tracked person leaves the frame
- [x] `draw(frame)` — OpenCV skeleton overlay using `PoseLandmarksConnections.POSE_LANDMARKS`; manual line/circle drawing (no `mp.solutions.drawing_utils`)

### MediaPipe API migration notes
- Legacy `mp.solutions.pose` and `mp.solutions.drawing_utils` are entirely removed in 0.10+
- New import path: `from mediapipe.tasks.python import vision, BaseOptions`
- Inference: `detect_for_video(mp.Image(...), timestamp_ms)` instead of `process(rgb_frame)`
- Landmarks: `result.pose_landmarks[0]` returns a list of `NormalizedLandmark` objects

---

## Phase 8 — Velocity-Based Fall Classification & SLEEPING State ✅

Replaced time-based transition detection with hip velocity as the primary discriminator
between true falls and intentional lie-downs. Added `SLEEPING` as a first-class state.

### Root cause of previous false positives
`last_up_time` was updated for both `"up"` AND `"bending"` frames. A person bending for
3s then lying down slowly showed `transition_time ≈ 33ms`, bypassing the slow-transition
guard entirely.

### Velocity-first classification (`_classify()` in `fall_logic.py`)

- [x] `hip_velocity > FALL_VEL_THRESHOLD (0.30/s)` → **fall** — fast drop, alarm fires
- [x] `hip_velocity < SLEEP_VEL_THRESHOLD (0.20/s)` → **sleep** — slow descent, no alarm
- [x] Ambiguous zone (0.20–0.30/s) → resolved by body geometry:
  - `spine_angle > POSE_SPINE_FALLEN (45°)` → fall
  - `head_below_waist == True` → fall
  - Otherwise → sleep
- [x] Fallback when pose not visible: `transition_time > MAX_TRANSITION_TIME (1.5s)` → sleep

### `SLEEPING` state
- [x] `SLEEPING` constant added to `fall_logic.py`
- [x] State machine branch: person in SLEEPING stays until sustained `"up"` for `RECOVERY_LABEL_TIME (0.5s)`, then returns to STABLE
- [x] No alarm fired in SLEEPING state
- [x] Visual indicator: purple bounding box + "SLEEPING — no alarm" banner in `test_video.py`
- [x] `STATE_COLORS` includes `SLEEPING: (180, 80, 220)` purple in `test_video.py`
- [x] `StatusBadge.tsx` updated to include SLEEPING (purple/accent color)

### Pose gate for VALIDATION → ALARM
- [x] `_pose_confirms_fall(pose)` — blocks alarm if skeleton visible and body is NOT horizontal
- [x] Prevents false positives where bounding box AR is high but person is not actually flat

### Key thresholds

| Constant | Value | Purpose |
|----------|-------|---------|
| `FALL_VEL_THRESHOLD` | 0.30 /s | Hip velocity above = definite fall |
| `SLEEP_VEL_THRESHOLD` | 0.20 /s | Hip velocity below = definite sleep |
| `POSE_SPINE_FALLEN` | 45.0° | Spine angle above = body horizontal |
| `MAX_TRANSITION_TIME` | 1.5 s | Fallback: slow transition = sleep |
| `AR_FALL_THRESHOLD` | 1.5 | Bounding box aspect ratio gate |
| `DOWN_CONFIRM` | 1.5 s | Immobility required before ALARM |
| `RECOVERY_LABEL_TIME` | 0.5 s | Sustained "up" required to exit ALARM or SLEEPING |

---

## Phase 9 — Dashboard Improvements ✅

### Live Feed Visualizer Toggles
- [x] `_viz_flags` dict in `server.py`: `{"skeleton": True, "bbox": True, "status_bar": True}`
- [x] `GET /visualization` — returns current toggle state
- [x] `PUT /visualization` — updates any combination of flags; applied per-frame in `test_video.py`
- [x] `LiveFeed.tsx` — three toggle buttons (top-right of video): Skeleton (`Scan`), Box (`Square`), Status (`PanelTop`)
- [x] Optimistic UI updates with server rollback on error
- [x] Initial state synced from server on component mount

### StatusBadge — All Detection States
- [x] Added `SLEEPING` (purple/accent), `INACTIVITY` (amber/warning), `SOS` (amber/warning)
- [x] Full set: STABLE, MONITORING, SLEEPING, TRANSITION, VALIDATION, INACTIVITY, ALARM, RECOVERY + incident flow statuses

### Real-Time Badge Updates
- [x] `broadcast_state(state, persons_detected)` in `server.py` — fires immediately on every state change (no waiting for heartbeat)
- [x] `broadcast_heartbeat(persons_detected, state)` — updated to carry `state` field (3s fallback sync)
- [x] `state_update` WS message type added to `dashboard/types/index.ts`
- [x] `ResponderDashboardClient.tsx` — both `heartbeat` and `state_update` call `setSystemState(msg.state)`; previously hardcoded `"STABLE"`

### Recovery Flow
- [x] `ALARM → RECOVERY` transition: `down_since` captured as final duration before clearing
- [x] `s["final_down_duration"]` stored in state; used in `_result()` for the RECOVERY frame
- [x] `broadcast_recovery(person_id, down_duration)` — includes final down duration in WS message
- [x] `recovery` message with `auto_resolved=true` → dashboard auto-closes incident as RECOVERED
- [x] Countdown timer stops immediately when `auto_resolved` recovery arrives
- [x] Incident closed as "Fall but Recovered" (RECOVERED status) with 4s auto-dismiss
- [x] ChatPanel returns to LOCKED state after recovery (no active incident)

### Live Down-Duration Counter
- [x] `elapsedSeconds` state in `ResponderDashboardClient.tsx` — increments every second while alert active
- [x] Display: `initialDownDuration + elapsedSeconds` — counts from when person first went "down"
- [x] Counter freezes on recovery; final duration from server `down_duration` field shown
- [x] `totalDownRef` keeps current elapsed value accessible in async callbacks (e.g. `onCallStart`)
- [x] Voice chatbot receives live elapsed duration, not the snapshot from alarm time

### Admin Settings — Live Sync to FastAPI
- [x] Admin settings page reads initial values from `GET /config` on mount
- [x] Each slider/input change triggers `PUT /config` with the changed field
- [x] `FallLogic` attributes updated in-place on `PUT /config` — no restart needed
- [x] `SystemConfig` Prisma model stays in sync (dual-write: FastAPI + DB via Next.js API)
- [x] Settings persist across restarts: Python engine reads from DB on startup via `/config` seed

---

## FastAPI Endpoints (current)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Server status + WS connection count |
| WS | `/ws` | WebSocket (alerts → dashboard, ACK ← dashboard) |
| GET | `/video` | MJPEG annotated video stream |
| GET/PUT | `/config` | Read or update live detection thresholds |
| GET/PUT | `/visualization` | Toggle skeleton / bounding box / status bar overlays |
| POST | `/transcript` | Voice chatbot line → broadcast to all dashboards |
| POST | `/call/start` | Start voice session (language, speed, is_authorized, incident) |
| POST | `/call/stop` | End voice session + kill TTS playback |
| GET | `/call/status` | Returns `{ active: bool }` |
| POST | `/call/settings` | Update language/speed mid-call without restart |

## WebSocket Protocol

| Direction | Message Type | Fields |
|-----------|-------------|--------|
| Python → Dashboard | `heartbeat` | `state`, `persons_detected` |
| Python → Dashboard | `state_update` | `state`, `persons_detected` |
| Python → Dashboard | `fall_alert` | `event_id`, `person_id`, `ar`, `down_duration` |
| Python → Dashboard | `recovery` | `person_id`, `auto_resolved`, `down_duration` |
| Python → Dashboard | `voice_alert` | `message`, `speaker` ("user"\|"assistant"), `mid` (dedup ID) |
| Python → Dashboard | `call_status` | `callStatus` ("active"\|"idle") |
| Python → Dashboard | `mic_status` | `status` ("listening"\|"speaking") |
| Python → Dashboard | `escalation` | `event_id` |
| Dashboard → Python | `acknowledge` | `event_id` |

---

## Seed Accounts

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Admin | admin@guardian.com | admin123 | Full |
| Authorized Responder | responder@guardian.com | resp123 | Clinical guidance |
| Unauthorized Responder | responder2@guardian.com | resp456 | Emergency contacts only |

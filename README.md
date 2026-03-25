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
- **Voice AI assistant** — Claude-powered voice chatbot with authorized/unauthorized tier system
- **Apple Silicon support** — runs inference on MPS (Metal Performance Shaders)

## Tech Stack

- Python 3.11 · PyTorch (MPS) · Ultralytics YOLO11 · MediaPipe · OpenCV
- FastAPI + Uvicorn (WebSocket alert server + MJPEG stream + transcript API)
- Anthropic SDK (Claude Haiku — voice assistant)
- Edge TTS + SpeechRecognition + PyAudio (voice I/O)
- Next.js 14 + TypeScript + Tailwind CSS v4 + Prisma (web dashboard)

## Project Structure

```
falldetection/
├── core/
│   ├── fall_logic.py              Fall detection state machine
│   ├── sos_gesture.py             Hand gesture SOS trigger
│   └── fall_detection_voice_app.py  Claude voice assistant (authorized/unauthorized tiers)
├── alerts/
│   └── server.py                  FastAPI server (WS + MJPEG + /transcript)
├── training/
│   └── train.py                   YOLO11 fine-tuning script
├── tests/
│   └── test_video.py              Main demo entry point
├── data/
│   ├── dataset/                   Training data (gitignored)
│   └── roboflow_download.py       Dataset download script
├── models/                        Trained weights (gitignored)
│   ├── best.pt                    Fine-tuned YOLO11 model
│   └── hand_landmarker.task       MediaPipe hand landmark model
└── dashboard/                     Next.js web dashboard (GUARDIAN)
```

## Setup

### 1. Create & activate virtual environment

```bash
python -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows
```

### 2. Install Python dependencies

**Core detection engine:**
```bash
pip install ultralytics mediapipe fastapi uvicorn opencv-python python-dotenv roboflow
```

**Voice assistant (fall_detection_voice_app.py):**
```bash
pip install anthropic SpeechRecognition pyaudio edge-tts
```

> **PyAudio on macOS** requires PortAudio. If `pip install pyaudio` fails:
> ```bash
> brew install portaudio
> pip install pyaudio
> ```

**All in one:**
```bash
pip install ultralytics mediapipe fastapi uvicorn opencv-python python-dotenv roboflow \
            anthropic SpeechRecognition pyaudio edge-tts
```

### 3. Configure environment

Create a `.env` file in the project root:
```
ROBOFLOW_API_KEY=your_key
ROBOFLOW_WORKSPACE=your_workspace
ROBOFLOW_PROJECT=falling-zvpqk-pslnk
ROBOFLOW_VERSION=1
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Download model weights

Place `best.pt` in `models/`. The MediaPipe hand model is auto-downloaded on first run.

## Usage

### Run the main detection system

```bash
# Terminal 1 — Python detection engine + FastAPI server
python tests/test_video.py

# Terminal 2 — Voice assistant
export ANTHROPIC_API_KEY="sk-ant-..."
python core/fall_detection_voice_app.py
```

### Run the dashboard

```bash
# Terminal 3 — Next.js dashboard
cd dashboard
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open http://localhost:3000

### Train a new model

```bash
python training/train.py
```

## WebSocket / API Protocol

**WebSocket** — `ws://localhost:8765/ws`

| Direction | Message Type | Description |
|-----------|-------------|-------------|
| Python → Dashboard | `heartbeat` | Every 3s — persons detected count |
| Python → Dashboard | `fall_alert` | Fall confirmed (person_id, AR, duration) |
| Python → Dashboard | `sos_alert` | SOS gesture completed |
| Python → Dashboard | `recovery` | Person stood back up |
| Python → Dashboard | `voice_alert` | Voice session transcript line (speaker + text) |
| Dashboard → Python | `acknowledge` | Responder acknowledged alert |

**HTTP endpoints** — `http://localhost:8765`

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Server status |
| GET | `/video` | MJPEG annotated video stream |
| POST | `/transcript` | Push voice transcript line to dashboard |

**POST /transcript payload:**
```json
{ "speaker": "user",      "text": "Is the patient breathing?" }
{ "speaker": "assistant", "text": "Check for chest rise and call EMS." }
```

## Voice Assistant — Authorization Tiers

The voice chatbot (`fall_detection_voice_app.py`) uses two system prompts based on who is responding:

| Tier | Who | What they get |
|------|-----|---------------|
| **Authorized** | Healthcare providers (nurses, doctors, paramedics) | Clinical first-aid guidance — what to do RIGHT NOW, positioning, CPR steps |
| **Unauthorized** | Bystanders, students, general responders | "Don't panic. Help is on the way." + nearest hospital contacts |

Authorization is set per-user in the dashboard by the Admin (User Management → Edit → "Authorized healthcare provider" checkbox).

Supported languages: English · Thai · Japanese · Chinese

## How Fall Detection Works

1. YOLO detects person and classifies pose (`up` / `bending` / `down`)
2. Bounding box aspect ratio is computed — standing ≈ 0.9–1.3, fallen ≈ 2–3
3. State machine transitions: `STABLE → TRANSITION → VALIDATION → ALARM`
4. Transitions faster than 1.2s are flagged; slow movements (intentional lying down) are ignored
5. Alarm requires confirmed immobility (no micro-movement for 1.5s)

## Dashboard Accounts (seed defaults)

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Admin | admin@guardian.com | admin123 | Full system management |
| Responder (Authorized) | responder@guardian.com | resp123 | Clinical guidance |
| Responder (Unauthorized) | responder2@guardian.com | resp456 | Emergency contacts |

## Dataset

[Roboflow — falling detection dataset](https://roboflow.com) · License: CC BY 4.0

Classes: `bending` · `down` · `up`

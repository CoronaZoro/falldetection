# Fall Detection System

Real-time fall detection and emergency alert system using computer vision. Detects falls via YOLO object detection, supports manual SOS via hand gesture, and broadcasts alerts over WebSocket.

## Features

- **Fall detection** — YOLO11 Nano model classifies pose as `up`, `bending`, or `down`
- **State machine** — filters false positives using aspect ratio, transition time, and inactivity checks
- **SOS gesture** — palm → fist sequence triggers a manual emergency alert
- **WebSocket alerts** — real-time broadcasts to connected dashboards on fall, SOS, or recovery events
- **Apple Silicon support** — runs inference on MPS (Metal Performance Shaders)

## Tech Stack

- Python 3.14 · PyTorch (MPS) · Ultralytics YOLO11 · MediaPipe · OpenCV
- FastAPI + Uvicorn (WebSocket alert server)
- Roboflow (dataset)

## Project Structure

```
fall-detection/
├── core/
│   ├── fall_logic.py        # Fall detection state machine
│   └── sos_gesture.py       # Hand gesture SOS trigger
├── alerts/
│   └── server.py            # WebSocket alert server (port 8765)
├── training/
│   └── train.py             # YOLO11 fine-tuning script
├── tests/
│   └── test_video.py        # Main demo entry point
├── data/
│   ├── dataset/             # Training data (gitignored, re-download via script)
│   └── roboflow_download.py # Dataset download script
└── models/                  # Trained weights (gitignored)
    ├── best.pt              # Fine-tuned YOLO11 model
    └── hand_landmarker.task # MediaPipe hand landmark model
```

## Setup

1. **Install dependencies**
   ```bash
   pip install ultralytics mediapipe fastapi uvicorn opencv-python python-dotenv roboflow
   ```

2. **Configure environment** — create a `.env` file:
   ```
   ROBOFLOW_API_KEY=your_key
   ROBOFLOW_WORKSPACE=your_workspace
   ROBOFLOW_PROJECT=falling-zvpqk-pslnk
   ROBOFLOW_VERSION=1
   ```

3. **Download dataset** (optional, for training)
   ```bash
   python data/roboflow_download.py
   ```

4. **Download model weights** — place `best.pt` in `models/`. The MediaPipe hand model is auto-downloaded on first run.

## Usage

**Run the demo (webcam)**
```bash
python tests/test_video.py
```

**Train a new model**
```bash
python training/train.py
```

**Connect a dashboard** — connect any WebSocket client to `ws://<your-ip>:8765/ws` to receive alert messages:

| Message | Trigger |
|---------|---------|
| `fall_alert` | Fall confirmed (down > 1.5s, no movement) |
| `sos_alert` | SOS gesture completed |
| `recovery` | Person stood back up |
| `heartbeat` | Every 3s (system alive) |

## How Fall Detection Works

1. YOLO detects person and classifies pose (`up` / `bending` / `down`)
2. Bounding box aspect ratio is computed — standing ≈ 0.9–1.3, fallen ≈ 2–3
3. State machine transitions: `STABLE → TRANSITION → VALIDATION → ALARM`
4. Transitions faster than 1.2s are flagged; slow movements (intentional lying down) are ignored
5. Alarm requires confirmed immobility (no micro-movement for 1.5s)

## Dataset

[Roboflow — falling detection dataset](https://roboflow.com) · License: CC BY 4.0

Classes: `bending` · `down` · `up`

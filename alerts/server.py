"""
alerts/server.py — WebSocket server, video stream, fall/recovery logic.
Voice assistant (/call/*) lives in voice.py and is mounted here.
"""

import asyncio
import json
import time
import threading

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from . import voice as _voice

# ── Live runtime config ────────────────────────────────────────────────
_config: dict = {
    "location":          "Rangsit University, Pathum Thani, Thailand",
    "cameraIndex":       0,
    "arThreshold":       1.5,
    "transitionTime":    1.5,
    "confirmSeconds":    1.5,
    "escalationSeconds": 15,
    "fallVelThreshold":  0.30,
    "sleepVelThreshold": 0.20,
    "poseSpineFallen":   45.0,
    "recoveryLabelTime": 0.5,
    "movementThreshold": 10,
}
_fall_logic_ref = None   # injected by test_video.py via register_fall_logic()


def register_fall_logic(logic_instance) -> None:
    """Called by test_video.py after creating FallLogic so PUT /config can hot-update it."""
    global _fall_logic_ref
    _fall_logic_ref = logic_instance


def get_config() -> dict:
    return _config


def _apply_config_to_logic(logic) -> None:
    """Push current _config values onto the FallLogic instance attributes."""
    logic.AR_FALL_THRESHOLD   = _config["arThreshold"]
    logic.MAX_TRANSITION_TIME = _config["transitionTime"]
    logic.DOWN_CONFIRM        = _config["confirmSeconds"]
    logic.FALL_VEL_THRESHOLD  = _config["fallVelThreshold"]
    logic.SLEEP_VEL_THRESHOLD = _config["sleepVelThreshold"]
    logic.POSE_SPINE_FALLEN   = _config["poseSpineFallen"]
    logic.RECOVERY_LABEL_TIME = _config["recoveryLabelTime"]
    logic.MOVEMENT_THRESHOLD  = _config["movementThreshold"]


# Visualizer feature flags — toggled live by the dashboard
_viz_flags: dict[str, bool] = {"skeleton": True, "bbox": True, "status_bar": True}


def get_viz_flags() -> dict[str, bool]:
    return _viz_flags

app = FastAPI(title="Fall Detection Alert Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(_voice.router)

connections: list[WebSocket] = []
pending: dict = {}                      # event_id -> {ts, timer}
_person_to_event: dict[int, str] = {}   # person_id -> event_id
latest_frame: bytes | None = None
_loop: asyncio.AbstractEventLoop | None = None


@app.on_event("startup")
async def _on_startup():
    global _loop
    _loop = asyncio.get_event_loop()
    _voice.init(_broadcast)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connections.append(websocket)
    print(f"[Server] dashboard connected ({len(connections)} total)")

    try:
        async for message in websocket.iter_text():
            data = json.loads(message)
            if data.get("type") == "acknowledge":
                _handle_ack(data.get("event_id"))
    except WebSocketDisconnect:
        connections.remove(websocket)
        print(f"[Server] dashboard disconnected ({len(connections)} remaining)")


@app.get("/health")
async def health():
    return {"status": "running", "connections": len(connections), "timestamp": time.time()}


class VizFlagsModel(BaseModel):
    skeleton:   bool | None = None
    bbox:       bool | None = None
    status_bar: bool | None = None


@app.get("/visualization")
async def get_visualization():
    return _viz_flags


@app.put("/visualization")
async def update_visualization(body: VizFlagsModel):
    if body.skeleton   is not None: _viz_flags["skeleton"]   = body.skeleton
    if body.bbox       is not None: _viz_flags["bbox"]       = body.bbox
    if body.status_bar is not None: _viz_flags["status_bar"] = body.status_bar
    return _viz_flags


class ConfigModel(BaseModel):
    location:          str   | None = None
    cameraIndex:       int   | None = None
    arThreshold:       float | None = None
    transitionTime:    float | None = None
    confirmSeconds:    float | None = None
    escalationSeconds: int   | None = None
    fallVelThreshold:  float | None = None
    sleepVelThreshold: float | None = None
    poseSpineFallen:   float | None = None
    recoveryLabelTime: float | None = None
    movementThreshold: int   | None = None


@app.get("/config")
async def get_config_route():
    return _config


@app.put("/config")
async def update_config_route(body: ConfigModel):
    for field, value in body.model_dump(exclude_none=True).items():
        _config[field] = value
    if _fall_logic_ref is not None:
        _apply_config_to_logic(_fall_logic_ref)
        print(f"[Config] thresholds hot-applied to FallLogic: {_config}")
    return _config


async def _mjpeg_generator():
    while True:
        if latest_frame is not None:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + latest_frame
                + b"\r\n"
            )
        await asyncio.sleep(0.033)


@app.get("/video")
async def video_feed():
    return StreamingResponse(_mjpeg_generator(), media_type="multipart/x-mixed-replace; boundary=frame")


def update_frame(jpeg_bytes: bytes) -> None:
    global latest_frame
    latest_frame = jpeg_bytes


def broadcast_fall(person_id: int, ar: float, down_duration: float) -> None:
    event_id  = f"fall_{int(time.time() * 1000)}"
    fall_time = time.time()
    _broadcast({
        "type":          "fall_alert",
        "event_id":      event_id,
        "timestamp":     fall_time,
        "person_id":     person_id,
        "state":         "ALARM",
        "ar":            round(ar, 2),
        "down_duration": down_duration,
    })
    timer = threading.Timer(_config["escalationSeconds"], _escalate, args=(event_id,))
    timer.daemon = True
    timer.start()
    pending[event_id] = {
        "ts":            fall_time,
        "timer":         timer,
        "person_id":     person_id,
        "ar":            round(ar, 2),
        "down_duration": down_duration,
    }
    _person_to_event[person_id] = event_id
    print(f"[Server] fall alert sent: {event_id}")


def broadcast_recovery(person_id: int, down_duration: float = 0.0) -> None:
    """auto_resolved=True if person recovered before the escalation timer fired."""
    event_id      = _person_to_event.pop(person_id, None)
    auto_resolved = False

    if event_id and event_id in pending:
        pending[event_id]["timer"].cancel()
        del pending[event_id]
        auto_resolved = True
        print(f"[Server] person {person_id} recovered after {down_duration:.1f}s, timer cancelled")
    else:
        print(f"[Server] person {person_id} recovered after {down_duration:.1f}s (post-escalation)")

    _broadcast({
        "type":          "recovery",
        "timestamp":     time.time(),
        "person_id":     person_id,
        "down_duration": round(down_duration, 1),
        "auto_resolved": auto_resolved,
    })


def broadcast_heartbeat(persons_detected: int, state: str = "STABLE") -> None:
    _broadcast({
        "type":             "heartbeat",
        "timestamp":        time.time(),
        "status":           "monitoring",
        "state":            state,
        "persons_detected": persons_detected,
    })


def broadcast_state(state: str, persons_detected: int = 0) -> None:
    """Immediate state-change broadcast — fired whenever detection state transitions."""
    _broadcast({
        "type":             "state_update",
        "timestamp":        time.time(),
        "state":            state,
        "persons_detected": persons_detected,
    })


class TranscriptPayload(BaseModel):
    speaker: str  # "user" or "assistant"
    text: str


class DebugFallPayload(BaseModel):
    person_id: int = 0
    ar: float = 0.35
    down_duration: float = 3.0


@app.post("/debug/fall")
async def debug_fall(payload: DebugFallPayload):
    """Manually trigger a fall alert (for testing)."""
    broadcast_fall(payload.person_id, payload.ar, payload.down_duration)
    return {"ok": True, "person_id": payload.person_id, "ar": payload.ar, "down_duration": payload.down_duration}


@app.post("/debug/recovery")
async def debug_recovery(payload: DebugFallPayload):
    """Manually trigger a recovery event (for testing)."""
    broadcast_recovery(payload.person_id, payload.down_duration)
    return {"ok": True, "person_id": payload.person_id, "down_duration": payload.down_duration}

@app.post("/transcript")
async def post_transcript(payload: TranscriptPayload):
    """Push a transcript line from an external voice script to the dashboard."""
    _broadcast({
        "type":      "voice_alert",
        "speaker":   payload.speaker,
        "message":   payload.text,
        "timestamp": time.time(),
    })
    return {"ok": True}


def _broadcast(payload: dict) -> None:
    """Send to all connected dashboards. Safe to call from any thread."""
    if not _loop or not connections:
        return
    message = json.dumps(payload)
    for ws in list(connections):
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), _loop)
        except Exception:
            pass


def _handle_ack(event_id: str) -> None:
    if event_id in pending:
        pending[event_id]["timer"].cancel()
        del pending[event_id]
        for pid, eid in list(_person_to_event.items()):
            if eid == event_id:
                del _person_to_event[pid]
        print(f"[Server] acknowledged: {event_id}")


def _escalate(event_id: str) -> None:
    if event_id in pending:
        info = pending.pop(event_id)
        _broadcast({"type": "escalation", "event_id": event_id, "timestamp": time.time()})
        print(f"[Server] no ack after {_config['escalationSeconds']}s, escalated: {event_id}")
        _notify_line(event_id, info)


def _notify_line(event_id: str, info: dict) -> None:
    """Broadcast a fall escalation message to all LINE bot friends directly."""
    import os, urllib.request
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
    if not token:
        print("[Server] LINE_CHANNEL_ACCESS_TOKEN not set — skipping LINE notification")
        return

    elapsed    = time.time() - info["ts"]
    total_down = round(info.get("down_duration", 0.0) + elapsed, 1)
    person_id  = info.get("person_id", 0)
    ar         = info.get("ar", 0.0)
    fall_ts    = info["ts"]
    confidence = min(99, round(min(ar / 3, 1) * 100))

    import datetime
    fall_time = datetime.datetime.fromtimestamp(fall_ts).strftime("%H:%M:%S")

    location = _config.get("location", "Guardian Monitoring Station")

    message = "\n".join([
        "🚨 FALL ALERT — Unacknowledged",
        "",
        "A fall was detected and no responder has confirmed within the escalation window.",
        "",
        f"Location: {location}",
        f"Down Duration: {total_down:.1f}s",
        f"Confidence: {confidence}%",
        f"Detected At: {fall_time}",
        "",
        "Immediate response required. Open the Guardian dashboard to acknowledge and respond.",
    ])

    payload = json.dumps({
        "messages": [{"type": "text", "text": message}]
    }).encode()

    try:
        req = urllib.request.Request(
            "https://api.line.me/v2/bot/message/broadcast",
            data    = payload,
            headers = {
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {token}",
            },
            method = "POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[Server] LINE broadcast sent (HTTP {resp.status}) for {event_id}")
        # Tell the dashboard the LINE alert went out
        _broadcast({
            "type":      "line_notified",
            "event_id":  event_id,
            "timestamp": time.time(),
        })
    except Exception as exc:
        print(f"[Server] LINE broadcast failed: {exc}")


def start_server(host: str = "0.0.0.0", port: int = 8765) -> None:
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    print("[Server] starting on port 8765")
    start_server()

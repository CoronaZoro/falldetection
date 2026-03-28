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

_ESCALATION_TIMEOUT_SECS = 15

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
    event_id = f"fall_{int(time.time() * 1000)}"
    _broadcast({
        "type":          "fall_alert",
        "event_id":      event_id,
        "timestamp":     time.time(),
        "person_id":     person_id,
        "state":         "ALARM",
        "ar":            round(ar, 2),
        "down_duration": down_duration,
    })
    timer = threading.Timer(_ESCALATION_TIMEOUT_SECS, _escalate, args=(event_id,))
    timer.daemon = True
    timer.start()
    pending[event_id]           = {"ts": time.time(), "timer": timer}
    _person_to_event[person_id] = event_id
    print(f"[Server] fall alert sent: {event_id}")


def broadcast_recovery(person_id: int) -> None:
    """auto_resolved=True if person recovered before the escalation timer fired."""
    event_id      = _person_to_event.pop(person_id, None)
    auto_resolved = False

    if event_id and event_id in pending:
        pending[event_id]["timer"].cancel()
        del pending[event_id]
        auto_resolved = True
        print(f"[Server] person {person_id} recovered, timer cancelled")
    else:
        print(f"[Server] person {person_id} recovered (post-escalation)")

    _broadcast({
        "type":          "recovery",
        "timestamp":     time.time(),
        "person_id":     person_id,
        "auto_resolved": auto_resolved,
    })


def broadcast_heartbeat(persons_detected: int) -> None:
    _broadcast({
        "type":             "heartbeat",
        "timestamp":        time.time(),
        "status":           "monitoring",
        "persons_detected": persons_detected,
    })


class TranscriptPayload(BaseModel):
    speaker: str  # "user" or "assistant"
    text: str


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
        del pending[event_id]
        _broadcast({"type": "escalation", "event_id": event_id, "timestamp": time.time()})
        print(f"[Server] no ack after {_ESCALATION_TIMEOUT_SECS}s, escalated: {event_id}")


def start_server(host: str = "0.0.0.0", port: int = 8765) -> None:
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    print("[Server] starting on port 8765")
    start_server()

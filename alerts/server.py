"""
alerts/server.py
WebSocket server — broadcasts fall events to dashboard.
Runs on your M4 Mac, dashboard connects from friend's Mac.
"""
import asyncio
import json
import time
import threading
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="Fall Detection Alert Server")

# Allow all origins so friend's Mac can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track connected dashboards
connections: list[WebSocket] = []

# Track pending acknowledgements
# event_id → {"ts": float, "timer": threading.Timer}
pending: dict = {}

# MJPEG frame buffer — written by main OpenCV thread, read by /video endpoint
latest_frame: bytes | None = None

# Event loop reference — captured on startup so sync threads can schedule coroutines
_loop: asyncio.AbstractEventLoop | None = None


@app.on_event("startup")
async def _on_startup():
    global _loop
    _loop = asyncio.get_event_loop()


# ── WebSocket endpoint ────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connections.append(websocket)
    print(f"[Server] Dashboard connected! "
          f"({len(connections)} total)")

    try:
        async for message in websocket.iter_text():
            data = json.loads(message)

            if data.get("type") == "acknowledge":
                event_id = data.get("event_id")
                _handle_ack(event_id)

    except WebSocketDisconnect:
        connections.remove(websocket)
        print(f"[Server] Dashboard disconnected "
              f"({len(connections)} remaining)")


@app.get("/health")
async def health():
    return {
        "status": "running",
        "connections": len(connections),
        "timestamp": time.time()
    }


# ── MJPEG video stream ─────────────────────────────────────
async def _mjpeg_generator():
    """Yields the latest annotated frame as a multipart JPEG stream."""
    while True:
        if latest_frame is not None:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + latest_frame
                + b"\r\n"
            )
        await asyncio.sleep(0.033)  # ~30 fps cap


@app.get("/video")
async def video_feed():
    return StreamingResponse(
        _mjpeg_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


def update_frame(jpeg_bytes: bytes) -> None:
    """Called from the main OpenCV loop with the fully-annotated JPEG frame."""
    global latest_frame
    latest_frame = jpeg_bytes


# ── Broadcast helpers ─────────────────────────────────────
def broadcast_fall(person_id: int, ar: float, down_duration: float):
    """Call this when fall is confirmed."""
    event_id = f"fall_{int(time.time()*1000)}"
    payload  = {
        "type":          "fall_alert",
        "event_id":      event_id,
        "timestamp":     time.time(),
        "person_id":     person_id,
        "state":         "ALARM",
        "ar":            round(ar, 2),
        "down_duration": down_duration,
    }
    _broadcast(payload)

    # Start 15s acknowledgement timer
    timer = threading.Timer(15.0, _escalate, args=(event_id,))
    timer.daemon = True
    timer.start()
    pending[event_id] = {"ts": time.time(), "timer": timer}
    print(f"[Server] 🚨 Fall alert sent: {event_id}")


def broadcast_sos(ts: float):
    """Call this when SOS gesture is detected."""
    event_id = f"sos_{int(ts*1000)}"
    payload  = {
        "type":      "sos_alert",
        "event_id":  event_id,
        "timestamp": ts,
        "message":   "Manual SOS gesture detected",
    }
    _broadcast(payload)
    print(f"[Server] ✊ SOS alert sent: {event_id}")


def broadcast_recovery(person_id: int):
    """Call this when person gets up."""
    payload = {
        "type":      "recovery",
        "timestamp": time.time(),
        "person_id": person_id,
    }
    _broadcast(payload)
    print(f"[Server] 🟢 Recovery broadcast: person {person_id}")


def broadcast_heartbeat(persons_detected: int):
    """Call this every 3 seconds to show system is alive."""
    payload = {
        "type":             "heartbeat",
        "timestamp":        time.time(),
        "status":           "monitoring",
        "persons_detected": persons_detected,
    }
    _broadcast(payload)


# ── Internal helpers ──────────────────────────────────────
def _broadcast(payload: dict):
    """Send to all connected dashboards (safe to call from any thread)."""
    if not _loop or not connections:
        return
    message = json.dumps(payload)
    for ws in list(connections):
        try:
            asyncio.run_coroutine_threadsafe(ws.send_text(message), _loop)
        except Exception:
            pass


def _handle_ack(event_id: str):
    if event_id in pending:
        pending[event_id]["timer"].cancel()
        del pending[event_id]
        print(f"[Server] ✅ Alert acknowledged: {event_id}")


def _escalate(event_id: str):
    if event_id in pending:
        del pending[event_id]
        print(f"[Server] ⏰ No ACK in 15s — would trigger Twilio: {event_id}")
        # Twilio call goes here later


# ── Run server ────────────────────────────────────────────
def start_server(host="0.0.0.0", port=8765):
    """Run in background thread."""
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    print(f"[Server] Starting on port 8765...")
    print(f"[Server] Dashboard connects to: ws://YOUR_MAC_IP:8765/ws")
    start_server()
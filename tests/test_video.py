"""
tests/test_video.py — GUARDIAN Fall Detection
Local inference via Roboflow inference SDK (no network round trip).
Press Q to quit.
"""

import os
import time
import threading
import cv2
from dotenv import load_dotenv

load_dotenv()

from inference import get_model
from alerts.fall_logic import FallLogic, ALARM, STABLE, TRANSITION, VALIDATION, INACTIVITY
from alerts.server import start_server, broadcast_fall, broadcast_recovery, update_frame, broadcast_heartbeat

# ── Load model locally (downloaded once, cached on disk) ─────
# Model runs on-device — no network call per frame.
_model_id = f"{os.getenv('ROBOFLOW_PROJECT')}/{os.getenv('ROBOFLOW_VERSION', '1')}"
print(f"[Model] Loading {_model_id} (may take 30–60s)...")
model = get_model(
    model_id = _model_id,
    api_key  = os.getenv("ROBOFLOW_API_KEY"),
)
print("[Model] Ready")

INFER_CONF = 0.4    # confidence threshold (0–1)

COLORS = {
    "bending": (0, 165, 255),   # orange
    "down":    (0, 0,   255),   # red
    "up":      (0, 255,   0),   # green
}

STATE_COLORS = {
    STABLE:     (0, 255,   0),
    TRANSITION: (0, 165, 255),
    VALIDATION: (0, 165, 255),
    INACTIVITY: (0, 100, 255),
    ALARM:      (0, 0,   255),
    "RECOVERY": (255, 255,  0),
}

# ── Fall logic + alert server ──────────────────────────────────
logic = FallLogic()

print("[Main] Starting alert server...")
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()
print("[Main] Alert server running on port 8765")
print("[Main] Find your IP with: ipconfig getifaddr en0\n")

CAMERA_INDEX = 1
cap = cv2.VideoCapture(CAMERA_INDEX)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

alerted_persons: set = set()
last_heartbeat        = 0.0

print("Starting webcam... Press Q to quit\n")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w = frame.shape[:2]
    now  = time.time()

    # ── Run inference on every frame (local — ~30–80 ms on M2) ──
    try:
        results = model.infer(frame, confidence=INFER_CONF)
        preds   = results[0].predictions if results else []
    except Exception as exc:
        print(f"[Inference] ⚠️  {exc}")
        preds = []

    any_alarm     = False
    current_state = STABLE
    persons_count = len(preds)

    for i, pred in enumerate(preds):
        # inference SDK: center-based coords → convert to corners
        x1 = int(pred.x - pred.width  / 2)
        y1 = int(pred.y - pred.height / 2)
        x2 = int(pred.x + pred.width  / 2)
        y2 = int(pred.y + pred.height / 2)

        label      = pred.class_name    # "up" | "bending" | "down"
        confidence = pred.confidence
        color      = COLORS.get(label, (255, 255, 255))

        # Run state machine
        fall_result   = logic.update(i, label, (x1, y1, x2, y2))
        current_state = fall_result["state"]

        # ── Broadcast fall alert (once per person per incident) ──
        if fall_result["is_alarm"]:
            any_alarm = True
            if i not in alerted_persons:
                alerted_persons.add(i)
                broadcast_fall(
                    person_id     = i,
                    ar            = fall_result["aspect_ratio"],
                    down_duration = fall_result["down_duration"],
                )

        # ── Broadcast recovery ────────────────────────────────────
        if fall_result["is_recovery"] and i in alerted_persons:
            alerted_persons.discard(i)
            broadcast_recovery(i)

        if current_state == STABLE and i in alerted_persons:
            alerted_persons.discard(i)

        # Draw bounding box + labels
        box_color = STATE_COLORS.get(current_state, color)
        cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
        cv2.putText(frame, f"{label} {confidence:.0%}",
                    (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, box_color, 2)
        cv2.putText(frame, f"AR:{fall_result['aspect_ratio']}",
                    (x1, y2 + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

    # ── Heartbeat every 3 s ───────────────────────────────────
    if now - last_heartbeat > 3.0:
        last_heartbeat = now
        broadcast_heartbeat(persons_count)

    # ── Top status banner ─────────────────────────────────────
    banner_color = STATE_COLORS.get(current_state, (50, 50, 50))
    cv2.rectangle(frame, (0, 0), (w, 70), banner_color, -1)

    if any_alarm:
        cv2.putText(frame, "FALL DETECTED — EMERGENCY",
                    (20, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 3)
    else:
        cv2.putText(frame, f"STATUS: {current_state}",
                    (20, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)

    # ── Bottom debug bar ──────────────────────────────────────
    cv2.rectangle(frame, (0, h - 35), (w, h), (30, 30, 30), -1)
    if preds:
        reason = logic.states.get(0, {}).get("reason", "")
        cv2.putText(frame, f"reason: {reason}",
                    (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)

    # ── Push annotated frame to MJPEG stream ─────────────────
    _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    update_frame(jpeg.tobytes())

    cv2.imshow("GUARDIAN — Fall Detection", frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()

"""
tests/test_video.py — GUARDIAN Fall Detection
Local inference via Ultralytics YOLO (models/best.pt).
Press Q to quit.
"""

import os
import time
import threading
import cv2
from dotenv import load_dotenv
from ultralytics import YOLO

load_dotenv()

from alerts.fall_logic   import FallLogic, ALARM, STABLE, SLEEPING, TRANSITION, VALIDATION, INACTIVITY
from alerts.pose_analyzer import PoseAnalyzer
from alerts.server import start_server, broadcast_fall, broadcast_recovery, update_frame, broadcast_heartbeat, broadcast_state, get_viz_flags, register_fall_logic, get_config

# ── Load local model ──────────────────────────────────────────
_model_path = "models/best.pt"
print(f"[Model] Loading {_model_path}...")
model = YOLO(_model_path)
print("[Model] Ready")

INFER_CONF = 0.4    # confidence threshold (0–1)

COLORS = {
    "bending": (0, 165, 255),   # orange
    "down":    (0, 0,   255),   # red
    "up":      (0, 255,   0),   # green
}

STATE_COLORS = {
    STABLE:     (0,   255,   0),   # green
    SLEEPING:   (180,  80, 220),   # purple
    TRANSITION: (0,   165, 255),   # orange
    VALIDATION: (0,   165, 255),   # orange
    INACTIVITY: (0,   100, 255),   # red-orange
    ALARM:      (0,     0, 255),   # red
    "RECOVERY": (255, 255,   0),   # yellow
}

# ── Fall logic + skeleton analyzer + alert server ─────────────
logic         = FallLogic()
pose_analyzer = PoseAnalyzer()

# Register logic with server so PUT /config can hot-update thresholds
register_fall_logic(logic)

print("[Main] Starting alert server...")
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()
print("[Main] Alert server running on port 8765")
print("[Main] Find your IP with: ipconfig getifaddr en0\n")

# Apply initial config so thresholds are set from server state
import time as _t
_t.sleep(1.5)
cfg = get_config()
logic.AR_FALL_THRESHOLD   = cfg["arThreshold"]
logic.MAX_TRANSITION_TIME = cfg["transitionTime"]
logic.DOWN_CONFIRM        = cfg["confirmSeconds"]
logic.FALL_VEL_THRESHOLD  = cfg["fallVelThreshold"]
logic.SLEEP_VEL_THRESHOLD = cfg["sleepVelThreshold"]
logic.POSE_SPINE_FALLEN   = cfg["poseSpineFallen"]
logic.RECOVERY_LABEL_TIME = cfg["recoveryLabelTime"]
logic.MOVEMENT_THRESHOLD  = cfg["movementThreshold"]

CAMERA_INDEX = get_config()["cameraIndex"]
cap = cv2.VideoCapture(CAMERA_INDEX)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

alerted_persons: set  = set()
last_heartbeat        = 0.0
last_broadcast_state  = STABLE   # track to fire state_update only on change

print("Starting webcam... Press Q to quit\n")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    h, w = frame.shape[:2]
    now  = time.time()

    # ── Run YOLO inference ────────────────────────────────────
    try:
        results = model(frame, conf=INFER_CONF, verbose=False)
        boxes   = results[0].boxes
        names   = results[0].names
        preds   = []
        if boxes is not None and len(boxes):
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                preds.append({
                    "x1":        int(x1),
                    "y1":        int(y1),
                    "x2":        int(x2),
                    "y2":        int(y2),
                    "class_name": names[int(box.cls[0])],
                    "confidence": float(box.conf[0]),
                })
    except Exception as exc:
        print(f"[Inference]  {exc}")
        preds = []

    # ── Build person bounding boxes for pose matching ─────────
    person_boxes = {}
    for i, pred in enumerate(preds):
        person_boxes[i] = (pred["x1"], pred["y1"], pred["x2"], pred["y2"])

    # ── Run MediaPipe pose analysis ───────────────────────────
    pose_signals = pose_analyzer.analyze(frame, person_boxes) if preds else {}

    # ── Read visualizer flags (live-toggleable from dashboard) ─
    viz = get_viz_flags()

    # ── Draw skeleton overlay (if enabled) ────────────────────
    if viz["skeleton"]:
        pose_analyzer.draw(frame)

    any_alarm     = False
    current_state = STABLE
    persons_count = len(preds)

    for i, pred in enumerate(preds):
        x1, y1, x2, y2 = person_boxes[i]

        label      = pred["class_name"]  # "up" | "bending" | "down"
        confidence = pred["confidence"]
        color      = COLORS.get(label, (255, 255, 255))
        pose       = pose_signals.get(i)

        # ── Run combined state machine ────────────────────────
        fall_result   = logic.update(i, label, (x1, y1, x2, y2), pose=pose)
        current_state = fall_result["state"]

        # ── Broadcast fall alert (once per person per incident)
        if fall_result["is_alarm"]:
            any_alarm = True
            if i not in alerted_persons:
                alerted_persons.add(i)
                broadcast_fall(
                    person_id     = i,
                    ar            = fall_result["aspect_ratio"],
                    down_duration = fall_result["down_duration"],
                )

        # ── Broadcast recovery ────────────────────────────────
        if fall_result["is_recovery"] and i in alerted_persons:
            alerted_persons.discard(i)
            broadcast_recovery(i, down_duration=fall_result["down_duration"])

        if current_state == STABLE and i in alerted_persons:
            # Fallback: person returned to STABLE without triggering is_recovery
            alerted_persons.discard(i)
            broadcast_recovery(i, down_duration=fall_result["down_duration"])

        # ── Draw bounding box + labels (if enabled) ──────────
        if viz["bbox"]:
            box_color = STATE_COLORS.get(current_state, color)
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)

            top_text = f"{label} {confidence:.0%}"
            if current_state == SLEEPING:
                top_text += "  [SLEEPING]"
            cv2.putText(frame, top_text,
                        (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, box_color, 2)
            cv2.putText(frame, f"AR:{fall_result['aspect_ratio']}",
                        (x1, y2 + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)

            # Pose signal readout beneath the box
            if pose and pose.get("visible"):
                spine = pose.get("spine_angle")
                vel   = pose.get("hip_velocity")
                head  = pose.get("head_below_waist")
                info  = (
                    f"spine:{spine:.0f}° vel:{vel:+.2f}/s"
                    if spine is not None and vel is not None else ""
                )
                if head:
                    info += " HEAD↓"
                cv2.putText(frame, info,
                            (x1, y2 + 42), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (100, 220, 255), 1)

    # ── Broadcast state change immediately ───────────────────
    if current_state != last_broadcast_state:
        broadcast_state(current_state, persons_count)
        last_broadcast_state = current_state

    # ── Heartbeat every 3 s (carries state as backup sync) ───
    if now - last_heartbeat > 3.0:
        last_heartbeat = now
        broadcast_heartbeat(persons_count, current_state)

    # ── Top status banner (if enabled) ────────────────────────
    if viz["status_bar"]:
        banner_color = STATE_COLORS.get(current_state, (50, 50, 50))
        cv2.rectangle(frame, (0, 0), (w, 70), banner_color, -1)

        if any_alarm:
            cv2.putText(frame, "FALL DETECTED",
                        (20, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 3)
        elif current_state == SLEEPING:
            cv2.putText(frame, "STATUS: SLEEPING",
                        (20, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
        else:
            cv2.putText(frame, f"STATUS: {current_state}",
                        (20, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)

    # ── Bottom debug bar (if enabled) ─────────────────────────
    if viz["status_bar"]:
        cv2.rectangle(frame, (0, h - 35), (w, h), (30, 30, 30), -1)
        if preds:
            reason = logic.states.get(0, {}).get("reason", "")
            cv2.putText(frame, f"reason: {reason}",
                        (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)

    # ── Push annotated frame to MJPEG stream ─────────────────
    _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    update_frame(jpeg.tobytes())

    cv2.imshow("Test Camera", frame)
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()

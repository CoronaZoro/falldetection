"""
tests/test_video.py — Hackathon Demo Version
Shows state machine + AR on screen.
Press Q to quit.
"""
import cv2
import time
import threading
from ultralytics import YOLO
from core.fall_logic import FallLogic, ALARM, RECOVERY, STABLE, TRANSITION, VALIDATION, INACTIVITY
from core.sos_gesture import SOSGestureDetector
from alerts.server import start_server, broadcast_fall, broadcast_sos, broadcast_recovery

model   = YOLO("models/best.pt")
logic   = FallLogic()
sos_det = SOSGestureDetector()

CLASSES = {0: "bending", 1: "down", 2: "up"}
COLORS  = {
    0: (0, 165, 255),   # orange  - bending
    1: (0, 0, 255),     # red     - down
    2: (0, 255, 0),     # green   - up
}

STATE_COLORS = {
    STABLE:     (0, 255, 0),
    TRANSITION: (0, 165, 255),
    
    VALIDATION: (0, 165, 255),
    INACTIVITY: (0, 100, 255),
    ALARM:      (0, 0, 255),
    RECOVERY:   (255, 255, 0),
}

# ── Start alert server in background ─────────────────────
print("[Main] Starting alert server...")
server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()
print("[Main] Alert server running on port 8765 ✅")
print("[Main] Find your IP with: ipconfig getifaddr en0")

print("\nStarting webcam... Press Q to quit\n")
CAMERA_INDEX = 0

cap = cv2.VideoCapture(CAMERA_INDEX)

# iPhone works better with these settings
if CAMERA_INDEX == 0:
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)
else:
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

sos_triggered   = False
sos_time        = 0
last_heartbeat  = 0
alerted_persons = set()   # track which persons already alerted

def on_sos(ts):
    # Handled in main loop with person_is_down check
    pass

sos_det.on_sos(on_sos)

frame_count = 0

while True:
    ret, frame = cap.read()
    if not ret:
        break

    frame_count += 1
    h, w        = frame.shape[:2]
    now         = time.time()

    results       = model(frame, verbose=False, conf=0.5)
    any_alarm     = False
    current_state = STABLE
    persons_count = 0

    for result in results:
        for i, box in enumerate(result.boxes):
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cls_id     = int(box.cls[0])
            confidence = float(box.conf[0])
            label      = CLASSES.get(cls_id, "unknown")
            color      = COLORS.get(cls_id, (255, 255, 255))
            persons_count += 1

            # Run state machine
            fall_result   = logic.update(i, label, (x1, y1, x2, y2))
            current_state = fall_result["state"]

            # ── Broadcast fall alert (only once per event) ─
            if fall_result["is_alarm"]:
                any_alarm = True
                if i not in alerted_persons:
                    alerted_persons.add(i)
                    broadcast_fall(
                        person_id     = i,
                        ar            = fall_result["aspect_ratio"],
                        down_duration = fall_result["down_duration"],
                    )

            # ── Broadcast recovery ─────────────────────────
            if fall_result["is_recovery"] and i in alerted_persons:
                alerted_persons.discard(i)
                broadcast_recovery(i)

            # Reset alerted state when person recovers
            if current_state == STABLE and i in alerted_persons:
                alerted_persons.discard(i)

            # Draw bounding box
            box_color = STATE_COLORS.get(current_state, color)
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)

            # Label + confidence
            cv2.putText(frame, f"{label} {confidence:.0%}",
                       (x1, y1 - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, box_color, 2)

            # AR value on box
            cv2.putText(frame,
                       f"AR:{fall_result['aspect_ratio']}",
                       (x1, y2 + 22),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                       (200, 200, 200), 1)

    # ── Heartbeat every 3 seconds ─────────────────────────
    if now - last_heartbeat > 3.0:
        last_heartbeat = now
        from alerts.server import broadcast_heartbeat
        broadcast_heartbeat(persons_count)

    # ── SOS check every 3rd frame ─────────────────────────
    if frame_count % 3 == 0:
        rgb        = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        sos_status = sos_det.process(rgb)

        # Only allow SOS when person is actually down
        person_is_down = current_state in [
            TRANSITION, VALIDATION, INACTIVITY, ALARM
        ]

        g_state    = sos_status["gesture_state"]
        g_progress = sos_status["progress"]

        # Show progress bars only when person is down
        if person_is_down:
            if g_state == "palm_seen":
                cv2.putText(frame, "Step 1: Hold palm...",
                           (w - 320, h - 60),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                           (0, 200, 255), 2)
                bar_w = int(200 * g_progress)
                cv2.rectangle(frame, (w - 320, h - 45),
                             (w - 320 + bar_w, h - 30),
                             (0, 200, 255), -1)

            elif g_state == "fist_seen":
                cv2.putText(frame, "Step 2: Close fist...",
                           (w - 320, h - 60),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                           (0, 140, 255), 2)
                bar_w = int(200 * g_progress)
                cv2.rectangle(frame, (w - 320, h - 45),
                             (w - 320 + bar_w, h - 30),
                             (0, 140, 255), -1)

            elif g_state == "triggered":
                sos_triggered = True
                sos_time      = time.time()
                broadcast_sos(sos_time)

    # ── Top status banner ─────────────────────────────────
    banner_color = STATE_COLORS.get(current_state, (50, 50, 50))

    if sos_triggered:
        banner_color = (0, 140, 255)

    cv2.rectangle(frame, (0, 0), (w, 70), banner_color, -1)

    if sos_triggered:
        # Auto reset after 10 seconds
        if now - sos_time > 10:
            sos_triggered = False
        else:
            cv2.putText(frame, "SOS GESTURE — MANUAL ALERT",
                       (20, 48), cv2.FONT_HERSHEY_SIMPLEX,
                       1.4, (255, 255, 255), 3)
    elif any_alarm:
        cv2.putText(frame, "FALL DETECTED — EMERGENCY",
                   (20, 48), cv2.FONT_HERSHEY_SIMPLEX,
                   1.4, (255, 255, 255), 3)
    else:
        cv2.putText(frame, f"STATUS: {current_state}",
                   (20, 48), cv2.FONT_HERSHEY_SIMPLEX,
                   1.2, (255, 255, 255), 2)

    # ── Bottom debug bar ──────────────────────────────────
    cv2.rectangle(frame, (0, h - 35), (w, h), (30, 30, 30), -1)
    if results and results[0].boxes:
        reason = logic.states.get(0, {}).get("reason", "")
        cv2.putText(frame, f"reason: {reason}",
                   (10, h - 10),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                   (180, 180, 180), 1)

    cv2.imshow("Fall Detection — Hackathon Demo", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
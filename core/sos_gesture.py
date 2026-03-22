"""
core/sos_gesture.py
Two-step SOS gesture: Open Palm → Closed Fist
Uses mediapipe.tasks (new API for mediapipe 0.10.30+)
"""
import time
import threading
import urllib.request
import os

IDLE      = "idle"
PALM_SEEN = "palm_seen"
FIST_SEEN = "fist_seen"

# Model will be downloaded automatically
MODEL_PATH = "models/hand_landmarker.task"
MODEL_URL  = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"


class SOSGestureDetector:

    PALM_HOLD_REQUIRED = 0.5
    FIST_HOLD_REQUIRED = 1.0
    STEP_TIMEOUT       = 3.0
    COOLDOWN           = 10.0

    def __init__(self):
        self.callbacks      = []
        self.last_triggered = 0
        self.hand_states    = {}
        self.detector       = None
        self.latest_result  = None

        # Download model if needed
        if not os.path.exists(MODEL_PATH):
            print("[SOS] Downloading hand landmarker model...")
            os.makedirs("models", exist_ok=True)
            urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
            print("[SOS] Model downloaded ✓")

        try:
            from mediapipe.tasks.python import vision
            from mediapipe.tasks.python.vision import HandLandmarker
            from mediapipe.tasks.python.vision import HandLandmarkerOptions
            from mediapipe.tasks.python.vision import RunningMode
            from mediapipe.tasks.python.core import base_options as bo

            def result_callback(result, output_image, timestamp_ms):
                self.latest_result = result

            options = HandLandmarkerOptions(
                base_options=bo.BaseOptions(model_asset_path=MODEL_PATH),
                running_mode=RunningMode.LIVE_STREAM,
                num_hands=2,
                min_hand_detection_confidence=0.5,
                min_hand_presence_confidence=0.5,
                min_tracking_confidence=0.5,
                result_callback=result_callback,
            )
            self.detector = HandLandmarker.create_from_options(options)
            print("[SOS] MediaPipe Tasks ready ✓")
            print("[SOS] Gesture: Open Palm (0.5s) → Fist (1.0s)")

        except Exception as e:
            print(f"[SOS] Error: {e}")
            self.detector = None

    def on_sos(self, cb):
        self.callbacks.append(cb)

    def process(self, frame_rgb, ts=None) -> dict:
        ts     = ts or time.time()
        status = {"gesture_state": IDLE, "progress": 0.0}

        if not self.detector:
            return status

        try:
            import mediapipe as mp
            mp_image   = mp.Image(
                image_format=mp.ImageFormat.SRGB,
                data=frame_rgb
            )
            ts_ms = int(ts * 1000)
            self.detector.detect_async(mp_image, ts_ms)
        except Exception as e:
            print(f"[SOS] Detection error: {e}")
            return status

        # Use latest result from callback
        result = self.latest_result
        if not result or not result.hand_landmarks:
            self.hand_states.clear()
            return status

        for i, hand_landmarks in enumerate(result.hand_landmarks):
            if i not in self.hand_states:
                self.hand_states[i] = {
                    "state":       IDLE,
                    "state_since": ts,
                }

            hand    = self.hand_states[i]
            is_open = self._is_open_palm(hand_landmarks)
            is_fist = self._is_fist(hand_landmarks)

            # Step timeout reset
            if ts - hand["state_since"] > self.STEP_TIMEOUT:
                hand["state"]       = IDLE
                hand["state_since"] = ts

            # State machine
            if hand["state"] == IDLE:
                if is_open:
                    hand["state"]       = PALM_SEEN
                    hand["state_since"] = ts
                    print("[SOS] Step 1: Open palm detected")

            elif hand["state"] == PALM_SEEN:
                if is_open:
                    held = ts - hand["state_since"]
                    status["gesture_state"] = PALM_SEEN
                    status["progress"]      = min(
                        held / self.PALM_HOLD_REQUIRED, 1.0
                    )
                    if held >= self.PALM_HOLD_REQUIRED:
                        hand["state"]       = FIST_SEEN
                        hand["state_since"] = ts
                        print("[SOS] Step 1 complete ✓ — now close fist")
                elif not is_fist:
                    hand["state"]       = IDLE
                    hand["state_since"] = ts

            elif hand["state"] == FIST_SEEN:
                if is_fist:
                    held = ts - hand["state_since"]
                    status["gesture_state"] = FIST_SEEN
                    status["progress"]      = min(
                        held / self.FIST_HOLD_REQUIRED, 1.0
                    )
                    if held >= self.FIST_HOLD_REQUIRED:
                        if ts - self.last_triggered > self.COOLDOWN:
                            self.last_triggered     = ts
                            hand["state"]           = IDLE
                            hand["state_since"]     = ts
                            status["gesture_state"] = "triggered"
                            print("[SOS] ✊ SOS TRIGGERED!")
                            for cb in self.callbacks:
                                threading.Thread(
                                    target=cb, args=(ts,), daemon=True
                                ).start()
                        else:
                            hand["state"]       = IDLE
                            hand["state_since"] = ts
                elif not is_open:
                    hand["state"]       = IDLE
                    hand["state_since"] = ts

        return status

    def _is_open_palm(self, landmarks) -> bool:
        """
        3+ fingers extended = open palm.
        Tip is ABOVE PIP joint (lower y value = higher on screen)
        """
        tips = [8,  12, 16, 20]
        pips = [6,  10, 14, 18]
        extended = sum(
            landmarks[t].y < landmarks[p].y
            for t, p in zip(tips, pips)
        )
        return extended >= 3

    def _is_fist(self, landmarks) -> bool:
        """
        3+ fingers curled = fist.
        Tip is BELOW MCP knuckle (higher y value = lower on screen)
        """
        tips = [8,  12, 16, 20]
        mcps = [5,   9, 13, 17]
        curled = sum(
            landmarks[t].y > landmarks[m].y
            for t, m in zip(tips, mcps)
        )
        return curled >= 3
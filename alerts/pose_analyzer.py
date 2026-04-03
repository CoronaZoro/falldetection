"""
alerts/pose_analyzer.py — MediaPipe Pose wrapper for skeleton-based fall signals.

Uses the MediaPipe Tasks PoseLandmarker API (mediapipe >= 0.10).
Model: pose_landmarker_lite.task  (downloaded to models/ directory)

Extracts three biomechanical signals per detected person:

  spine_angle      — degrees the spine is rotated from vertical.
                     0° = fully upright, 90° = lying flat.

  hip_velocity     — normalized screen units per second, positive = moving downward.
                     A fall produces a sharp spike; intentional lying-down is gradual.

  head_below_waist — True when the nose landmark is below the hip midpoint.
                     Simple, unambiguous horizontal-posture indicator.
"""

import math
import os
import time
from collections import deque

import cv2
import mediapipe as mp
from mediapipe.tasks.python        import vision, BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    PoseLandmarksConnections,
    RunningMode,
)

# ── MediaPipe landmark indices (BlazePose 33-point layout) ────────────────────
_NOSE        = 0
_L_SHOULDER  = 11
_R_SHOULDER  = 12
_L_HIP       = 23
_R_HIP       = 24
_L_ANKLE     = 27
_R_ANKLE     = 28

_MODEL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "models", "pose_landmarker_lite.task"
)

# Skeleton connections for manual OpenCV drawing
_CONNECTIONS = [(c.start, c.end) for c in PoseLandmarksConnections.POSE_LANDMARKS]


class PoseAnalyzer:
    """
    Usage
    -----
    analyzer = PoseAnalyzer()

    # each frame:
    boxes        = {person_id: (x1, y1, x2, y2), ...}
    pose_signals = analyzer.analyze(frame, boxes)   # {person_id: signals_dict}
    analyzer.draw(frame)                            # skeleton overlay (optional)

    # when a person leaves the scene:
    analyzer.remove_person(person_id)
    """

    VIS_THRESHOLD    = 0.5   # landmark visibility cutoff
    HIP_HISTORY_SECS = 0.5   # rolling window for hip velocity

    def __init__(self):
        options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=os.path.abspath(_MODEL_PATH)),
            running_mode=RunningMode.VIDEO,   # VIDEO mode enables temporal smoothing
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker  = PoseLandmarker.create_from_options(options)
        self._last_lm     = None          # stored for draw()
        self._hip_history: dict[int, deque] = {}
        self._frame_ts_ms = 0             # monotonic ms counter for VIDEO mode

    # ── Public API ────────────────────────────────────────────────────────────

    def analyze(self, frame, boxes: dict) -> dict:
        """
        Run pose analysis on `frame` and return signals per person.

        Parameters
        ----------
        frame : np.ndarray   BGR image (from cv2)
        boxes : dict         {person_id: (x1, y1, x2, y2)} pixel coords

        Returns
        -------
        dict  {person_id: {"spine_angle", "hip_velocity", "head_below_waist", "visible"}}
              Empty dict if no pose is detected or boxes is empty.
        """
        if not boxes:
            self._last_lm = None
            return {}

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # VIDEO mode requires a strictly increasing timestamp in ms
        self._frame_ts_ms += 33
        result = self._landmarker.detect_for_video(mp_image, self._frame_ts_ms)

        if not result.pose_landmarks:
            self._last_lm = None
            return {}

        h, w  = frame.shape[:2]
        lm    = result.pose_landmarks[0]   # first (and only) detected pose
        now   = time.time()
        self._last_lm = (lm, w, h)

        pid = self._match_person(lm, boxes, w, h)
        if pid is None:
            return {}

        return {pid: self._extract_signals(pid, lm, w, h, now)}

    def draw(self, frame) -> None:
        """Draw skeleton onto frame in-place using OpenCV."""
        if self._last_lm is None:
            return
        lm, w, h = self._last_lm

        # Draw connections
        for start, end in _CONNECTIONS:
            if start >= len(lm) or end >= len(lm):
                continue
            a, b = lm[start], lm[end]
            if a.visibility < self.VIS_THRESHOLD or b.visibility < self.VIS_THRESHOLD:
                continue
            ax, ay = int(a.x * w), int(a.y * h)
            bx, by = int(b.x * w), int(b.y * h)
            cv2.line(frame, (ax, ay), (bx, by), (0, 200, 160), 2, cv2.LINE_AA)

        # Draw landmark dots
        for point in lm:
            if point.visibility < self.VIS_THRESHOLD:
                continue
            cx, cy = int(point.x * w), int(point.y * h)
            cv2.circle(frame, (cx, cy), 3, (0, 255, 200), -1, cv2.LINE_AA)

    def remove_person(self, person_id: int) -> None:
        """Call when a tracked person leaves the frame to free history."""
        self._hip_history.pop(person_id, None)

    # ── Private ───────────────────────────────────────────────────────────────

    def _match_person(self, lm, boxes: dict, w: int, h: int) -> int | None:
        """
        Return the person_id whose bounding box contains the detected hip midpoint.
        Falls back to the only person when there is exactly one in frame.
        """
        lhip = lm[_L_HIP]
        rhip = lm[_R_HIP]

        if lhip.visibility < self.VIS_THRESHOLD and rhip.visibility < self.VIS_THRESHOLD:
            return None

        hip_px = ((lhip.x + rhip.x) / 2) * w
        hip_py = ((lhip.y + rhip.y) / 2) * h

        for pid, (x1, y1, x2, y2) in boxes.items():
            if x1 <= hip_px <= x2 and y1 <= hip_py <= y2:
                return pid

        # Single-person fallback
        if len(boxes) == 1:
            return next(iter(boxes))
        return None

    def _extract_signals(self, pid: int, lm, w: int, h: int, now: float) -> dict:
        lsh  = lm[_L_SHOULDER]
        rsh  = lm[_R_SHOULDER]
        lhip = lm[_L_HIP]
        rhip = lm[_R_HIP]
        nose = lm[_NOSE]

        core_visible = all(
            l.visibility >= self.VIS_THRESHOLD
            for l in (lsh, rsh, lhip, rhip)
        )

        # Midpoints (normalized 0–1)
        sh_x  = (lsh.x + rsh.x) / 2
        sh_y  = (lsh.y + rsh.y) / 2
        hip_x = (lhip.x + rhip.x) / 2
        hip_y = (lhip.y + rhip.y) / 2

        # ── 1. Spine angle from vertical ──────────────────────────────────
        # Vector shoulder-mid → hip-mid.
        # Standing: points mostly downward → small angle from vertical (~0°).
        # Lying:    points mostly sideways → ~90°.
        spine_angle = None
        if core_visible:
            dx = (hip_x - sh_x) * w
            dy = (hip_y - sh_y) * h
            spine_angle = math.degrees(math.atan2(abs(dx), max(abs(dy), 1e-6)))

        # ── 2. Head below waist ───────────────────────────────────────────
        # In image coords Y increases downward, so nose.y > hip_y → horizontal.
        head_below_waist = None
        if nose.visibility >= self.VIS_THRESHOLD and core_visible:
            head_below_waist = bool(nose.y > hip_y)

        # ── 3. Hip Y velocity (normalized/s, positive = moving downward) ──
        hist = self._hip_history.setdefault(pid, deque())
        hist.append((now, hip_y))
        while hist and now - hist[0][0] > self.HIP_HISTORY_SECS:
            hist.popleft()

        hip_velocity = None
        if len(hist) >= 2:
            dt = hist[-1][0] - hist[0][0]
            if dt >= 0.05:
                hip_velocity = (hist[-1][1] - hist[0][1]) / dt

        return {
            "spine_angle":      spine_angle,       # float degrees | None
            "hip_velocity":     hip_velocity,      # float norm/s  | None
            "head_below_waist": head_below_waist,  # bool          | None
            "visible":          core_visible,      # bool
        }

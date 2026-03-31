"""
alerts/fall_logic.py — per-person fall state processor.

Fall vs sleep discrimination: velocity-first
--------------------------------------------
Rather than measuring *how long* a transition took (fragile — depends on when
the model last saw "up", flickers with label noise), we measure *how fast the
hip actually moved* using the MediaPipe skeleton.

  hip_velocity > FALL_VEL_THRESHOLD  (0.50 /s)  →  fast drop  →  TRANSITION
  hip_velocity < SLEEP_VEL_THRESHOLD (0.20 /s)  →  slow drift →  ignored (sleep)
  between the two                               →  ambiguous zone:
      spine_angle > 45°  OR  head_below_waist   →  TRANSITION
      else                                       →  ignored

Fallback (no skeleton):
  Timing is still used when MediaPipe has no detection, giving graceful
  degradation to the original AR-only behaviour.

Confirmation gates (VALIDATION → ALARM):
  Person must have been "down" for DOWN_CONFIRM seconds, be still (no
  bounding-box movement), AND the skeleton (if available) must confirm
  horizontal posture (spine_angle > 45° or head below waist).
"""

import time

STABLE     = "STABLE"
SLEEPING   = "SLEEPING"    # intentional lie-down — monitored, no alarm
TRANSITION = "TRANSITION"
VALIDATION = "VALIDATION"
INACTIVITY = "INACTIVITY"
ALARM      = "ALARM"
RECOVERY   = "RECOVERY"


class FallLogic:
    def __init__(self):
        # ── AR threshold ──────────────────────────────────────────────────
        self.AR_FALL_THRESHOLD   = 1.5   # w/h; standing ≈ 0.9–1.3, fallen ≈ 2–3

        # ── Confirmation thresholds ───────────────────────────────────────
        self.DOWN_CONFIRM        = 1.5   # s person must stay "down" before alarm
        self.MOVEMENT_THRESHOLD  = 10    # px; bbox centre-delta = "still moving"
        self.RECOVERY_LABEL_TIME = 0.5   # s of "up"/"bending" to confirm recovery

        # ── Velocity thresholds (primary — skeleton) ──────────────────────
        self.FALL_VEL_THRESHOLD  = 0.30  # norm/s; above → fast fall
        self.SLEEP_VEL_THRESHOLD = 0.20  # norm/s; below → slow intentional descent

        # ── Posture threshold (tiebreaker in ambiguous velocity zone) ─────
        self.POSE_SPINE_FALLEN   = 45.0  # degrees from vertical; above → horizontal

        # ── Timing fallback (used when pose is unavailable) ───────────────
        self.MAX_TRANSITION_TIME = 1.5   # s; slow active drop = intentional

        self.states = {}

    # ── Public ────────────────────────────────────────────────────────────────

    def update(self, person_id: int, label: str, box: tuple,
               pose: dict | None = None) -> dict:
        """
        Parameters
        ----------
        person_id : int
        label     : str          "up" | "bending" | "down"
        box       : tuple        (x1, y1, x2, y2) pixel coords
        pose      : dict | None  from PoseAnalyzer — keys:
                                   spine_angle, hip_velocity,
                                   head_below_waist, visible
        """
        now = time.time()
        x1, y1, x2, y2 = box
        w  = x2 - x1
        h  = max(y2 - y1, 1)
        ar = w / h
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2

        if person_id not in self.states:
            self.states[person_id] = {
                "state":               STABLE,
                "reason":              "initialized",
                "down_since":          None,
                "alarm_since":         None,
                "up_since":            None,
                "last_active_time":    now,   # last frame that was "up" or "bending"
                "last_cx":             cx,
                "last_cy":             cy,
                "final_down_duration": 0.0,   # captured on RECOVERY before down_since clears
                "hip_velocity":        0.0,   # velocity at moment of fall classification
            }

        s          = self.states[person_id]
        prev_state = s["state"]

        is_active    = label in ("up", "bending")
        is_real_down = (label == "down" and ar > self.AR_FALL_THRESHOLD)

        if is_active:
            s["last_active_time"] = now

        # ── State machine ─────────────────────────────────────────────────

        if s["state"] == ALARM:
            if is_active:
                if s["up_since"] is None:
                    s["up_since"] = now
                elif now - s["up_since"] > self.RECOVERY_LABEL_TIME:
                    # Capture total time on ground before clearing the timer
                    s["final_down_duration"] = round(now - s["down_since"], 1) if s["down_since"] else 0.0
                    s["state"]      = RECOVERY   # one-frame signal for is_recovery
                    s["reason"]     = "person_recovered"
                    s["down_since"] = None
                    s["up_since"]   = None
                    print(f"[FallLogic] Person {person_id} recovered — down for {s['final_down_duration']}s")
            else:
                s["up_since"] = None

        elif s["state"] == RECOVERY:
            # Single-frame signal — settle immediately to STABLE
            s["state"]  = STABLE
            s["reason"] = "recovered"

        elif s["state"] == SLEEPING:
            # Stay sleeping until person is seen upright long enough
            if is_active:
                if s["up_since"] is None:
                    s["up_since"] = now
                elif now - s["up_since"] > self.RECOVERY_LABEL_TIME:
                    s["state"]   = STABLE
                    s["reason"]  = "woke_up"
                    s["up_since"] = None
                    print(f"[FallLogic] Person {person_id} woke up")
            else:
                s["up_since"] = None   # lay back down — stay sleeping

        elif is_real_down:
            s["up_since"] = None

            if s["down_since"] is None:
                # ── First "down" frame — velocity-first discrimination ─────
                s["down_since"] = now
                # Capture hip velocity at the moment of fall classification
                if pose and pose.get("visible") and pose.get("hip_velocity") is not None:
                    s["hip_velocity"] = round(abs(pose["hip_velocity"]), 3)
                verdict, reason = self._classify(pose, now, s)

                if verdict == "sleep":
                    s["state"]      = SLEEPING
                    s["reason"]     = reason
                    s["down_since"] = None
                    s["hip_velocity"] = 0.0
                    print(f"[FallLogic] Person {person_id} sleeping — {reason}")
                else:
                    s["state"]  = TRANSITION
                    s["reason"] = reason
                    print(f"[FallLogic] Person {person_id} fall candidate — {reason}")

            else:
                # ── Already down — confirm or escalate ────────────────────
                down_dur = now - s["down_since"]

                if down_dur < self.DOWN_CONFIRM:
                    s["state"]  = VALIDATION
                    s["reason"] = f"confirming_{down_dur:.1f}s"

                else:
                    dx     = abs(cx - s["last_cx"])
                    dy     = abs(cy - s["last_cy"])
                    moving = (dx + dy) > self.MOVEMENT_THRESHOLD
                    s["last_cx"] = cx
                    s["last_cy"] = cy

                    if moving:
                        s["state"]  = INACTIVITY
                        s["reason"] = "down_but_moving"
                    elif not self._pose_confirms_fall(pose):
                        # Skeleton visible but body not horizontal yet — wait
                        angle = pose.get("spine_angle", 0) if pose else 0
                        s["state"]  = VALIDATION
                        s["reason"] = f"pose_awaiting_spine={angle:.0f}°"
                    else:
                        s["state"]       = ALARM
                        s["reason"]      = "fall_confirmed"
                        s["alarm_since"] = now
                        print(f"[FallLogic] ALARM person={person_id} "
                              f"down={down_dur:.1f}s AR={ar:.2f}")

        elif is_active:
            if s["down_since"] is not None:
                print(f"[FallLogic] Person {person_id} stood up — resetting")
            s["down_since"] = None
            s["state"]      = STABLE
            s["reason"]     = "standing" if label == "up" else "bending"
            s["up_since"]   = now

        # ── Log state transitions ─────────────────────────────────────────
        if s["state"] != prev_state:
            print(f"[FallLogic] Person {person_id}: "
                  f"{prev_state} → {s['state']}  AR={ar:.2f}  label={label}")

        return self._result(person_id, s, label, ar, now)

    def reset_person(self, person_id: int):
        if person_id in self.states:
            del self.states[person_id]

    # ── Classification helpers ────────────────────────────────────────────────

    def _classify(self, pose: dict | None, now: float, s: dict) -> tuple[str, str]:
        """
        Decide whether this "down" event is a fall or an intentional lie-down.

        Returns ("fall" | "sleep", reason_string)

        Priority
        --------
        1. Skeleton hip velocity (fast / slow / ambiguous)
        2. Ambiguous zone → body geometry tiebreak (spine angle, head below waist)
        3. No skeleton → timing fallback
        """
        if pose and pose.get("visible"):
            vel = pose.get("hip_velocity")

            if vel is not None:
                if vel > self.FALL_VEL_THRESHOLD:
                    return "fall", f"fast_hip_vel={vel:.2f}/s"

                if vel < self.SLEEP_VEL_THRESHOLD:
                    return "sleep", f"slow_hip_vel={vel:.2f}/s"

                # ── Ambiguous zone: use body geometry ─────────────────────
                spine_ok = (
                    pose.get("spine_angle") is not None
                    and pose["spine_angle"] > self.POSE_SPINE_FALLEN
                )
                head_ok = bool(pose.get("head_below_waist"))

                if spine_ok or head_ok:
                    return "fall", (f"ambiguous_vel={vel:.2f}/s_body_horizontal"
                                    f"_spine={pose.get('spine_angle', 0):.0f}°")
                else:
                    return "sleep", (f"ambiguous_vel={vel:.2f}/s_body_not_flat"
                                     f"_spine={pose.get('spine_angle', 0):.0f}°")

            # Pose visible but no velocity data yet → fall through to timing

        # ── Timing fallback (no skeleton or no velocity data) ─────────────
        transition_time = now - s["last_active_time"]
        if transition_time > self.MAX_TRANSITION_TIME:
            return "sleep", f"slow_transition_{transition_time:.1f}s_no_pose"
        return "fall", f"fast_transition_{transition_time:.1f}s_no_pose"

    def _pose_confirms_fall(self, pose: dict | None) -> bool:
        """
        True when:
          • no skeleton available → trust AR/velocity decision already made, or
          • skeleton confirms horizontal posture (spine flat or head below waist).
        False only when skeleton IS visible but body is NOT horizontal.
        """
        if pose is None or not pose.get("visible"):
            return True  # no evidence to the contrary → trust earlier decision

        spine_fallen = (
            pose.get("spine_angle") is not None
            and pose["spine_angle"] > self.POSE_SPINE_FALLEN
        )
        return spine_fallen or bool(pose.get("head_below_waist"))

    # ── Result builder ────────────────────────────────────────────────────────

    def _result(self, person_id: int, s: dict, label: str, ar: float, now: float) -> dict:
        if s["state"] == RECOVERY:
            # Use the captured final duration — down_since is already None
            down_dur = s.get("final_down_duration", 0.0)
        elif s["down_since"]:
            # Live counter: time from first "down" frame to now
            down_dur = round(now - s["down_since"], 1)
        else:
            down_dur = 0.0
        return {
            "person_id":     person_id,
            "state":         s["state"],
            "reason":        s["reason"],
            "is_alarm":      s["state"] == ALARM,
            "is_recovery":   s["state"] == RECOVERY,
            "aspect_ratio":  round(ar, 2),
            "down_duration": down_dur,
            "hip_velocity":  s.get("hip_velocity", 0.0),
        }

"""
alerts/fall_logic.py — per-person fall state processor.
Fast transition + high AR triggers the alarm. Slow/intentional lie-downs are ignored.
"""
import time

STABLE     = "STABLE"
TRANSITION = "TRANSITION"
VALIDATION = "VALIDATION"
INACTIVITY = "INACTIVITY"
ALARM      = "ALARM"
RECOVERY   = "RECOVERY"


class FallLogic:
    def __init__(self):
        self.AR_FALL_THRESHOLD   = 1.5   # down AR 2-3, standing AR 0.9-1.3
        self.DOWN_CONFIRM        = 1.5   # seconds down before alarm
        self.MOVEMENT_THRESHOLD  = 10    # px; centre must shift by this to count as moving
        self.RECOVERY_LABEL_TIME = 0.5   # seconds of up to confirm recovery
        self.MAX_TRANSITION_TIME = 1.2   # slower than this = intentional

        self.states = {}

    def update(self, person_id: int, label: str, box: tuple) -> dict:
        now = time.time()
        x1, y1, x2, y2 = box
        w  = x2 - x1
        h  = max(y2 - y1, 1)
        ar = w / h
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2

        if person_id not in self.states:
            self.states[person_id] = {
                "state":          STABLE,
                "reason":         "initialized",
                "down_since":     None,
                "alarm_since":    None,
                "up_since":       None,
                "last_up_time":   now,
                "last_cx":        cx,
                "last_cy":        cy,
            }

        s          = self.states[person_id]
        prev_state = s["state"]

        is_real_down = (label == "down" and ar > self.AR_FALL_THRESHOLD)
        is_up        = label in ["up", "bending"]

        # keep last_up_time rolling so standing-still doesn't look like a faint
        if is_up:
            s["last_up_time"] = now



        if s["state"] == ALARM:
            if is_up:
                if s["up_since"] is None:
                    s["up_since"] = now
                elif now - s["up_since"] > self.RECOVERY_LABEL_TIME:
                    s["state"]      = STABLE
                    s["reason"]     = "person_recovered"
                    s["down_since"] = None
                    s["up_since"]   = None
                    print(f"[FallLogic] Person {person_id} recovered")
            else:
                s["up_since"] = None

        elif is_real_down:
            s["up_since"] = None

            if s["down_since"] is None:
                # First frame of going down
                s["down_since"] = now
                transition_time = now - s["last_up_time"]

                if transition_time > self.MAX_TRANSITION_TIME:
                    # Too slow = intentional lie down
                    s["state"]      = STABLE
                    s["reason"]     = f"slow_{transition_time:.1f}s_ignored"
                    s["down_since"] = None
                    print(f"[FallLogic] Person {person_id} slow transition "
                          f"{transition_time:.1f}s — ignored")
                else:
                    # Fast drop = fall candidate
                    s["state"]  = TRANSITION
                    s["reason"] = f"fast_drop_{transition_time:.1f}s_AR={ar:.2f}"
                    print(f"[FallLogic] Person {person_id} fast drop "
                          f"transition={transition_time:.1f}s AR={ar:.2f}")

            else:
                # Already been down — check duration
                down_dur = now - s["down_since"]

                if down_dur < self.DOWN_CONFIRM:
                    s["state"]  = VALIDATION
                    s["reason"] = f"confirming_{down_dur:.1f}s"

                else:
                    # Check micro-movements
                    dx     = abs(cx - s["last_cx"])
                    dy     = abs(cy - s["last_cy"])
                    moving = (dx + dy) > self.MOVEMENT_THRESHOLD

                    # update so next check compares against the most recent frame
                    s["last_cx"] = cx
                    s["last_cy"] = cy

                    if not moving:
                        s["state"]       = ALARM
                        s["reason"]      = "fall_confirmed"
                        s["alarm_since"] = now
                        print(f"[FallLogic] ALARM person={person_id} "
                              f"down={down_dur:.1f}s AR={ar:.2f}")
                    else:
                        s["state"]  = INACTIVITY
                        s["reason"] = "down_but_moving"

        elif is_up:
            # Person stood up — reset everything
            if s["down_since"] is not None:
                print(f"[FallLogic] Person {person_id} stood up — resetting")
            s["down_since"] = None
            s["state"]      = STABLE
            s["reason"]     = "standing"
            s["up_since"]   = now

        # Log state transitions
        if s["state"] != prev_state:
            print(f"[FallLogic] Person {person_id}: "
                  f"{prev_state} → {s['state']}  "
                  f"AR={ar:.2f}  label={label}")

        return self._result(person_id, s, label, ar, now)

    def reset_person(self, person_id: int):
        if person_id in self.states:
            del self.states[person_id]

    def _result(self, person_id, s, label, ar, now) -> dict:
        down_dur = 0
        if s["down_since"]:
            down_dur = round(now - s["down_since"], 1)
        return {
            "person_id":     person_id,
            "state":         s["state"],
            "reason":        s["reason"],
            "is_alarm":      s["state"] == ALARM,
            "is_recovery":   s["state"] == RECOVERY,
            "aspect_ratio":  round(ar, 2),
            "down_duration": down_dur,
        }

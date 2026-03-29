# GUARDIAN — Development Progress

## ✅ Completed

### Detection Engine
- [x] YOLO11 fine-tuned on custom fall dataset (`up` / `bending` / `down`)
- [x] Roboflow inference SDK — local on-device inference with Apple MPS support
- [x] Per-person fall state machine: `STABLE → TRANSITION → VALIDATION → INACTIVITY → ALARM → RECOVERY`
- [x] `SLEEPING` state — slow transitions don't trigger alarms (purple overlay, no broadcast)
- [x] Velocity-based classification — MediaPipe hip velocity as primary discriminator; spine angle + head position break ties; timing fallback when pose unavailable
- [x] MediaPipe Tasks API (`pose_landmarker_lite.task`) — spine angle, hip velocity, head-below-waist
- [x] Skeleton overlay drawn with OpenCV (MediaPipe 0.10+ removed legacy drawing utils)
- [x] Live down-duration counter — starts at first `down`, tracked through alarm, sent in recovery message
- [x] Per-frame visualizer flags — skeleton / bbox / status bar toggled via `PUT /visualization`
- [x] `SLEEPING` visual indicator — purple bounding box + banner in OpenCV output

### Alert Server (`alerts/server.py`)
- [x] FastAPI + Uvicorn — WebSocket, MJPEG, config API, viz flags, voice routes
- [x] `fall_alert` WS with `event_id`, `person_id`, `ar`, `down_duration`
- [x] `recovery` WS with `auto_resolved`, `down_duration` (total time on ground)
- [x] `state_update` WS fires immediately on every state change
- [x] `heartbeat` carries current `state` every 3s as sync backup
- [x] 15s escalation timer — fires if no ACK within window
- [x] LINE broadcast alert — sent directly from FastAPI on escalation; no Next.js involved
- [x] `line_notified` WS → dashboard shows "LINE alert sent" banner
- [x] `GET/PUT /config` — live detection thresholds applied without restart
- [x] Countdown stops and incident closes as "Self Recovered" if person gets up during 15s window

### Voice Assistant (`alerts/voice.py`)
- [x] WebRTC VAD — 30ms frame VAD, ring-buffer pre-roll, 4-level aggressiveness
- [x] Google STT → Claude → Edge TTS pipeline with streaming sentence-by-sentence TTS
- [x] Authorized / Unauthorized prompt tiers (clinical vs. bystander)
- [x] Incident context injection — person ID, AR, live down-duration, status
- [x] Multi-language — English / Thai / Japanese / Chinese; auto-detect mid-call
- [x] Speed control (0.5x–2x) changeable mid-call
- [x] 150ms afplay buffer delay syncs text display with audio onset
- [x] Mic mute/unmute — `POST /call/mute` / `POST /call/unmute`; resets on call end
- [x] `mic_status` WS: `"listening"` / `"speaking"` / `"muted"`

### Dashboard (`dashboard/`)
- [x] Next.js 14 App Router + TypeScript + Tailwind CSS v4
- [x] NextAuth v5 JWT — ADMIN / RESPONDER roles
- [x] Prisma + SQLite — incidents, transcripts, users, system config
- [x] Seed accounts: admin@guardian.com, responder@guardian.com, demo@guardian.com, demo2@guardian.com
- [x] Responder Dashboard — live feed, alert card, event log, voice panel
- [x] Event log — vertical timeline with colored connector lines + glow on latest entry
- [x] Countdown bar — 15-segment pip bar; disappears after escalation
- [x] Alert card — pulsing dot headline, live down-time as large metric, chip badges, prominent ACK button
- [x] StatusBadge — all detection states + incident statuses
- [x] FlowBtn — left accent border, active:scale, Resolved/False Alarm side-by-side
- [x] Incident status flow: UNACKNOWLEDGED → ACKNOWLEDGED → RESPONDING → ON_SCENE → RESOLVED / FALSE_ALARM
- [x] Self-recovery — countdown freezes green; auto-closes as RECOVERED
- [x] Live status badge — state_update WS for instant updates; heartbeat as 3s backup
- [x] LINE notified banner in alert card post-escalation
- [x] Chat panel — locked/idle/active states; typewriter synced to TTS; compact pre-call settings
- [x] Mic mute button — amber MicOff toggle in call bar; mic status pill
- [x] Natural waveform — 3-tier VAD animation (vad-sm/md/lg) with varied speeds
- [x] Live feed visualizer toggles — Skeleton / Box / Status
- [x] Incident history — timeline, transcript, AI report per incident
- [x] Admin settings — live config sync to FastAPI
- [x] User management — responders, authorization tier, LINE ID

---

## 🔄 Known Limitations

- LINE targeting is broadcast-only (all bot friends); per-responder push requires collecting individual LINE user IDs
- VAD waveform doesn't animate during muted capture (intentional)

---

## 📋 Backlog

- [ ] Multi-camera support
- [ ] Mobile-responsive layout
- [ ] Push/browser notifications on fall alert
- [ ] PDF incident export
- [ ] Alert sound on dashboard

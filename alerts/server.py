"""
alerts/server.py
WebSocket server — broadcasts fall events to dashboard.
Runs on your M4 Mac, dashboard connects from friend's Mac.
"""
import asyncio
import json
import os
import time
import threading
import subprocess
import uvicorn

# Load .env if present (so ANTHROPIC_API_KEY is available without exporting manually)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# How many seconds without an ACK before escalation fires
_ESCALATION_TIMEOUT_SECS = 15
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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

# Track pending acknowledgements — event_id → {"ts": float, "timer": threading.Timer}
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

    # Start escalation timer
    timer = threading.Timer(_ESCALATION_TIMEOUT_SECS, _escalate, args=(event_id,))
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

    # Start escalation timer for SOS as well
    timer = threading.Timer(_ESCALATION_TIMEOUT_SECS, _escalate, args=(event_id,))
    timer.daemon = True
    timer.start()
    pending[event_id] = {"ts": ts, "timer": timer}
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


class TranscriptPayload(BaseModel):
    speaker: str   # "user" or "assistant"
    text:    str


@app.post("/transcript")
async def post_transcript(payload: TranscriptPayload):
    """
    Push one voice-chatbot exchange line to all connected dashboards.
    Called by fall_detection_voice_app.py (or any client) after each
    speech-recognition / Claude reply cycle.

    Example (from voice script):
        import requests
        requests.post("http://localhost:8765/transcript",
                      json={"speaker": "user",      "text": user_text})
        requests.post("http://localhost:8765/transcript",
                      json={"speaker": "assistant", "text": reply_text})
    """
    _broadcast({
        "type":      "voice_alert",
        "speaker":   payload.speaker,   # forwarded to dashboard
        "message":   payload.text,
        "timestamp": time.time(),
    })
    return {"ok": True}


# ── Voice session ──────────────────────────────────────────
# All voice deps (speech_recognition, edge_tts, anthropic) are imported
# lazily inside _voice_loop so the server starts even if they're missing.

_LOCATION = "Rangsit University, Pathum Thani, Thailand"

_AUTHORIZED_PROMPT = """You are an emergency medical voice assistant integrated into a fall detection system.
Location of incident: {location}

ROLE: The user is an **authorized healthcare provider** on the scene.

BEHAVIOR:
1. If the user mentions any medical emergency keyword (stroke, heart attack, cardiac arrest,
   seizure, epilepsy, heatstroke, heat exhaustion, fatigue, fracture, head injury, concussion,
   choking, bleeding, unconscious, not breathing), respond with ONLY the most critical
   immediate actions in 2-3 short sentences. For example: what to do RIGHT NOW, what position
   to place the patient in, and whether to call EMS. Do NOT give full step-by-step procedures
   unless the user explicitly asks for more details, elaboration, or says something like
   "tell me more", "what else", "explain", or "go on".
2. If the user asks for more details or elaboration on a previous topic, THEN provide
   a fuller step-by-step procedure, still keeping it concise and actionable.
3. If the user asks something NOT related to healthcare or the emergency, reply EXACTLY:
   "My apologies. I'm only able to provide critical healthcare information.
    Your command could not be processed. Thank you."
4. Language: reply in **{language}** by default. If the user's message is in a
   different language, automatically detect it and reply in that language instead.
   Always match the language the user is currently speaking.
5. Keep initial responses under 50 words. Detailed follow-ups under 150 words.
6. Do NOT use markdown, bullet points, asterisks, or numbered lists.
   Write in plain flowing sentences — this will be spoken aloud."""

_UNAUTHORIZED_PROMPT = """You are an emergency voice assistant integrated into a fall detection system.
Location of incident: {location}

ROLE: The user is an **unauthorized bystander** (not a healthcare provider).

BEHAVIOR:
1. If the user reports any emergency or mentions a fall, injury, or medical situation:
   - First say: "Don't panic. Help is on the way."
   - Then provide the nearest hospital contact info:
     PatRangsit Hospital: 02-998-9999,
     Thammasat University Hospital: 02-926-9999,
     Rangsit Hospital: 02-150-0200.
   - Advise them NOT to move the patient unless in immediate danger.
   - Keep it short and reassuring.
2. If the user asks something NOT related to healthcare or the emergency, reply EXACTLY:
   "My apologies. I'm only able to provide critical healthcare information.
    Your command could not be processed. Thank you."
3. Language: reply in **{language}** by default. If the user's message is in a
   different language, automatically detect it and reply in **{language}** instead.
   Always match the language the user is currently speaking.
4. Keep responses under 100 words.
5. Do NOT use markdown, bullet points, asterisks, or numbered lists.
   Write in plain flowing sentences — this will be spoken aloud."""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION A: LANGUAGE & VOICE CONFIGURATION
# Maps language names (from the dashboard UI) to the correct Google STT locale
# codes and Microsoft Edge TTS neural voice names.
# ─────────────────────────────────────────────────────────────────────────────

_STT_LANG_MAP = {
    "English":  "en-US",
    "Thai":     "th-TH",
    "Japanese": "ja-JP",
    "Chinese":  "zh-CN",
}

_EDGE_VOICE_MAP = {
    "English":  "en-US-JennyNeural",
    "Thai":     "th-TH-PremwadeeNeural",
    "Japanese": "ja-JP-NanamiNeural",
    "Chinese":  "zh-CN-XiaoxiaoNeural",
}


# ─────────────────────────────────────────────────────────────────────────────
# SECTION B: SPEAKING SPEED MAP
# Maps dashboard speed labels to Edge TTS CSS rate values.
# Rate is a percentage relative to the neural voice's default speed:
#   "0%"   = default speed
#   "+50%" = 1.5× faster
#   "-50%" = 0.5× slower  (very slow — for accessibility or non-native speakers)
# ─────────────────────────────────────────────────────────────────────────────

_SPEED_RATE_MAP = {
    "0.5x":  "-50%",
    "0.75x": "-25%",
    "1x":    "+0%",   # edge-tts requires explicit +/- sign; "0%" is invalid
    "1.25x": "+25%",
    "1.5x":  "+50%",
    "2x":    "+100%",
}

_DEFAULT_RATE = "+15%"   # Slightly faster than 1× — sounds more natural for emergency use
_MAX_HISTORY  = 20       # Max conversation turns kept in memory (20 = 10 exchanges)


# ─────────────────────────────────────────────────────────────────────────────
# SECTION C: LIVE-ADJUSTABLE VOICE SESSION STATE
# These module-level globals are read by the voice loop on every iteration,
# so changes via /call/settings take effect immediately on the next
# listen/speak cycle — no need to restart the call.
# ─────────────────────────────────────────────────────────────────────────────

_voice_active     = False
_current_lang     = "English"
_current_voice    = _EDGE_VOICE_MAP["English"]
_current_stt_lang = _STT_LANG_MAP["English"]
_current_rate     = _DEFAULT_RATE

# ── Microphone detection tuning ───────────────────────────────────────────────
# energy_threshold : minimum audio energy level to count as speech (higher = needs
#   louder speech, fewer false triggers from ambient noise). speechrecognition
#   default is 300; we default to 400 for a slightly quieter environment.
# pause_threshold  : seconds of silence after speech before the phrase is
#   considered complete and sent to Google STT. Higher = waits longer, useful
#   when the responder takes short pauses mid-sentence. Default 0.8s in sr;
#   we default to 1.2s to avoid cutting off naturally-paced speech.
_current_energy_threshold: int   = 400
_current_pause_threshold:  float = 1.2


# ─────────────────────────────────────────────────────────────────────────────
# SECTION D: INTERRUPTIBLE TTS SPEAKER
# Wraps Edge TTS generation + afplay subprocess playback.
# A threading.Lock ensures the subprocess handle is never accessed from two
# threads simultaneously (the voice loop sets it, /call/stop kills it).
# ─────────────────────────────────────────────────────────────────────────────

class InterruptibleSpeaker:
    """Thread-safe TTS player. Generates audio via Edge TTS, plays via afplay.
    The afplay subprocess can be killed instantly mid-sentence via stop()."""

    def __init__(self):
        self._process: "subprocess.Popen | None" = None
        self._lock = threading.Lock()

    def speak(self, text: str, voice: str, rate: str = _DEFAULT_RATE,
              on_ready: "callable | None" = None) -> None:
        """Generate <text> as speech in <voice> at <rate> speed, then play it.
        Blocks the calling thread until playback finishes or stop() is called.

        on_ready — optional callback invoked the instant audio starts playing
        (after TTS generation, before afplay). Use this to broadcast the reply
        text to the dashboard exactly when the voice begins, so the typewriter
        animation is in sync with what the user hears.
        """
        try:
            import edge_tts as _edge_tts
        except ImportError:
            print("[Voice] ❌ edge-tts not installed. Run: pip install edge-tts")
            return

        output = "/tmp/guardian_voice_reply.mp3"

        # Generate the MP3 — edge_tts is async, asyncio.run() handles the loop
        async def _gen():
            comm = _edge_tts.Communicate(text, voice, rate=rate)
            await comm.save(output)

        try:
            asyncio.run(_gen())
        except Exception as exc:
            print(f"[Voice] ❌ TTS generation failed: {exc}")
            print(f"[Voice]    voice={voice!r}  rate={rate!r}  text[:60]={text[:60]!r}")
            return

        # Audio file is ready — fire on_ready so the dashboard shows the text
        # at the same moment the voice starts. Thinking dots clear, typewriter begins.
        if on_ready:
            try:
                on_ready()
            except Exception as exc:
                print(f"[Voice] ⚠️  on_ready callback failed: {exc}")

        # Play via afplay subprocess — handle stored under lock so stop() can kill it
        try:
            with self._lock:
                self._process = subprocess.Popen(
                    ["afplay", output],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            self._process.wait()   # blocks until done or killed
        except Exception as exc:
            print(f"[Voice] ❌ afplay failed: {exc}")
        finally:
            with self._lock:
                self._process = None

    def stop(self) -> None:
        """Kill audio playback immediately. Safe to call from any thread."""
        with self._lock:
            if self._process and self._process.poll() is None:
                self._process.kill()


_speaker = InterruptibleSpeaker()


class IncidentContext(BaseModel):
    type:          str   = ""      # "FALL" or "SOS"
    person_id:     int   = 0
    ar:            float = 0.0
    down_duration: float = 0.0
    status:        str   = "UNACKNOWLEDGED"


# ─────────────────────────────────────────────────────────────────────────────
# SECTION E: CALL CONTROL ENDPOINTS  (/call/start, /call/stop, /call/status,
#                                      /call/settings)
# All four are called by the dashboard's ChatPanel via HTTP POST/GET.
# ─────────────────────────────────────────────────────────────────────────────

class CallStartPayload(BaseModel):
    """Payload for POST /call/start — sent by the dashboard when the responder
    presses the green phone button.

    Fields:
        language      : Display language name ("English", "Thai", "Japanese", "Chinese").
                        Controls both Google STT locale and Edge TTS voice.
        is_authorized : Whether the responder is an authorized healthcare provider.
                        Selects the appropriate system prompt tier.
        speed         : TTS playback speed label ("0.5x" … "2x").
                        Maps to an Edge TTS rate string via _SPEED_RATE_MAP.
        incident      : Optional snapshot of the active incident at call time.
                        Injected into the system prompt so the bot knows what happened.
    """
    language:      str             = "English"
    is_authorized: bool            = False
    speed:         str             = "1x"
    incident:      IncidentContext = None
    sensitivity:   int             = 400   # energy_threshold (100–3000)
    pause_after:   float           = 1.2   # pause_threshold in seconds (0.5–3.0)


class CallSettingsPayload(BaseModel):
    """Payload for POST /call/settings — can be sent at any time during an
    active call to change language or speed without restarting.

    Only fields that are provided (non-None) are updated. Either or both
    can be changed independently.
    """
    language:    str   | None = None   # new language name, e.g. "Thai"
    speed:       str   | None = None   # new speed label, e.g. "1.5x"
    sensitivity: int   | None = None   # new energy_threshold, e.g. 800
    pause_after: float | None = None   # new pause_threshold in seconds, e.g. 2.0


@app.post("/call/start")
async def start_call(payload: CallStartPayload):
    """Start a voice assistant session.

    Initialises the live-adjustable globals (_current_lang etc.) from the
    payload, then spawns _voice_loop() as a daemon thread. The loop runs
    until _voice_active is set to False by /call/stop.

    Returns {"ok": False} if a call is already running.
    """
    global _voice_active, _current_lang, _current_voice, _current_stt_lang, _current_rate, \
           _current_energy_threshold, _current_pause_threshold
    if _voice_active:
        return {"ok": False, "error": "Call already active"}

    # Initialise live settings from payload so the loop starts with correct values
    _current_lang              = payload.language
    _current_voice             = _EDGE_VOICE_MAP.get(payload.language, "en-US-JennyNeural")
    _current_stt_lang          = _STT_LANG_MAP.get(payload.language, "en-US")
    _current_rate              = _SPEED_RATE_MAP.get(payload.speed, _DEFAULT_RATE)
    _current_energy_threshold  = payload.sensitivity
    _current_pause_threshold   = payload.pause_after

    _voice_active = True
    threading.Thread(
        target=_voice_loop,
        args=(payload.is_authorized, payload.incident),
        daemon=True,
    ).start()
    _broadcast({"type": "call_status", "callStatus": "active", "timestamp": time.time()})
    print(f"[Voice] 📞 Call started — lang={payload.language} speed={payload.speed} "
          f"authorized={payload.is_authorized}")
    return {"ok": True}


@app.post("/call/stop")
async def stop_call():
    """Stop the active voice session immediately.

    Sets _voice_active=False (the loop checks this flag every iteration) and
    calls _speaker.stop() to kill any in-progress afplay subprocess so audio
    cuts off instantly rather than waiting for the current sentence to finish.
    """
    global _voice_active
    _voice_active = False
    _speaker.stop()   # kills afplay subprocess immediately — no waiting
    _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
    print("[Voice] 📴 Call stopped")
    return {"ok": True}


@app.get("/call/status")
async def call_status():
    """Return whether a voice session is currently active.
    The dashboard fetches this on mount to sync button state after page refresh.
    """
    return {"active": _voice_active}


@app.post("/call/settings")
async def update_call_settings(payload: CallSettingsPayload):
    """Change language and/or speed mid-call without restarting.

    Updates the module-level globals that the voice loop reads on every
    iteration. The new settings take effect on the next listen/speak cycle
    (i.e. the next time the user finishes speaking).

    Can be called even when no call is active — settings are stored and will
    apply when the next call starts.
    """
    global _current_lang, _current_voice, _current_stt_lang, _current_rate, \
           _current_energy_threshold, _current_pause_threshold
    if payload.language:
        _current_lang     = payload.language
        _current_voice    = _EDGE_VOICE_MAP.get(payload.language, "en-US-JennyNeural")
        _current_stt_lang = _STT_LANG_MAP.get(payload.language, "en-US")
        print(f"[Voice] 🌐 Language → {payload.language}")
    if payload.speed:
        _current_rate = _SPEED_RATE_MAP.get(payload.speed, _DEFAULT_RATE)
        print(f"[Voice] ⏩ Speed → {payload.speed} ({_current_rate})")
    if payload.sensitivity is not None:
        _current_energy_threshold = payload.sensitivity
        print(f"[Voice] 🎚️ Sensitivity → {payload.sensitivity}")
    if payload.pause_after is not None:
        _current_pause_threshold = payload.pause_after
        print(f"[Voice] ⏳ Pause after → {payload.pause_after}s")
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# SECTION F: INCIDENT CONTEXT INJECTION
# Converts the active incident snapshot into plain prose that is prepended to
# the system prompt. Plain text (not markdown) because this will be spoken.
# ─────────────────────────────────────────────────────────────────────────────

def _build_incident_block(incident: "IncidentContext | None") -> str:
    """Build a plain-text incident context paragraph to prepend to the system prompt.

    The block is written so the bot can answer 'what happened?', 'how serious
    is it?', and 'what should I check?' without the responder needing to
    describe the situation themselves.

    AR (aspect ratio) interpretation:
        < 0.5  → person is nearly horizontal → HIGH collapse risk
        0.5–0.7 → partially down            → MODERATE
        > 0.7  → more upright               → LOW

    Down duration risk:
        ≥ 30s  → CRITICAL (prolonged immobility, check for loss of consciousness)
        ≥ 10s  → HIGH
        < 10s  → MODERATE

    Returns an empty string if no incident is provided, so the base prompt
    is used unchanged.
    """
    if not incident or not incident.type:
        return ""

    lines = ["CURRENT INCIDENT:"]
    if incident.type == "FALL":
        ar_risk  = "HIGH" if incident.ar < 0.5 else "MODERATE" if incident.ar < 0.7 else "LOW"
        dur_risk = "CRITICAL" if incident.down_duration >= 30 else "HIGH" if incident.down_duration >= 10 else "MODERATE"
        lines.append(f"- Type: FALL DETECTED")
        lines.append(f"- Person ID: {incident.person_id}")
        lines.append(f"- Aspect Ratio (AR): {incident.ar:.2f} — lower AR means more horizontal / likely collapsed. Risk: {ar_risk}")
        lines.append(f"- Time on ground: {incident.down_duration:.1f} seconds. Risk: {dur_risk}")
        lines.append(f"- Incident status: {incident.status}")
        lines.append("")
        lines.append("Use this data to answer questions like 'what happened?', 'how serious is it?', or 'what should I check first?'.")
        lines.append("Prioritise checking airway, breathing, circulation. If AR is very low the person is likely fully horizontal.")
    elif incident.type == "SOS":
        lines.append(f"- Type: MANUAL SOS GESTURE — person consciously triggered emergency signal")
        lines.append(f"- Incident status: {incident.status}")
        lines.append("")
        lines.append("Person is conscious enough to signal. Check for pain, injury, or inability to get up.")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# SECTION G: THE VOICE LOOP
# Runs in a daemon thread started by /call/start. Flow per iteration:
#
#   STEP A  Listen   — sr.Recognizer captures audio from microphone
#   STEP B  STT      — Google Speech-to-Text transcribes audio to text
#   STEP C  Claude   — Streaming call to Claude Haiku builds a reply
#   STEP D  Speak    — Edge TTS generates MP3, afplay plays it (interruptible)
#
# Language and speed are read from module globals (_current_*) on every
# iteration so /call/settings changes take effect immediately next cycle.
# ─────────────────────────────────────────────────────────────────────────────

def _voice_loop(is_authorized: bool, incident: "IncidentContext | None" = None) -> None:
    """Headless voice loop — daemon thread. Lazy-imports all voice dependencies
    so the FastAPI server starts and serves WS/video even if they are missing."""
    global _voice_active

    # ── STEP 0: Lazy-import voice dependencies ───────────────────────────────
    # These are not imported at module level so the server starts cleanly even
    # if SpeechRecognition / edge-tts / anthropic are not installed.
    try:
        import speech_recognition as sr
        import anthropic as _anthropic
    except ImportError as exc:
        print(f"[Voice] ❌ Missing dependency: {exc}")
        print("[Voice]    pip install SpeechRecognition pyaudio edge-tts anthropic")
        _voice_active = False
        _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
        return

    # ── Verify API key ───────────────────────────────────────────────────────
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[Voice] ❌ ANTHROPIC_API_KEY not set.")
        print("[Voice]    Run: export ANTHROPIC_API_KEY=sk-ant-... then restart.")
        # Broadcast an error message to the dashboard so the responder knows
        _mid_err = 0
        def _tx_err(speaker, text):
            nonlocal _mid_err
            _mid_err += 1
            _broadcast({"type": "voice_alert", "speaker": speaker,
                        "message": text, "mid": _mid_err, "timestamp": time.time()})
        _tx_err("assistant", "Error: API key not set. Ask admin to configure ANTHROPIC_API_KEY.")
        _voice_active = False
        _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
        return

    client  = _anthropic.Anthropic(api_key=api_key)
    history: list[dict] = []   # rolling conversation history (last _MAX_HISTORY messages)
    _mid    = 0                # monotonic message ID for client-side deduplication

    def _tx(speaker: str, text: str) -> None:
        """Broadcast one transcript line to all connected dashboards.
        'mid' is a unique integer so the client can discard duplicates that
        arrive from React StrictMode's double WS connections."""
        nonlocal _mid
        _mid += 1
        _broadcast({
            "type":      "voice_alert",
            "speaker":   speaker,
            "message":   text,
            "mid":       _mid,
            "timestamp": time.time(),
        })

    recognizer = sr.Recognizer()
    _tx("assistant", "Call started — listening...")

    with sr.Microphone() as source:
        # Calibrate mic noise floor once at call start
        recognizer.adjust_for_ambient_noise(source, duration=1)

        while _voice_active:
            try:
                # ── STEP A: Listen ───────────────────────────────────────────
                # Apply mic detection settings each iteration so mid-call
                # changes from /call/settings take effect immediately.
                # dynamic_energy_threshold=False keeps our manual value stable
                # instead of auto-adjusting based on ambient noise.
                recognizer.energy_threshold       = _current_energy_threshold
                recognizer.dynamic_energy_threshold = False
                recognizer.pause_threshold        = _current_pause_threshold

                # timeout=15  → give up listening after 15s of silence
                # phrase_time_limit=30 → cut audio capture at 30s maximum
                audio = recognizer.listen(source, timeout=15, phrase_time_limit=30)

                # ── STEP B: Speech-to-Text ───────────────────────────────────
                # Reads _current_stt_lang each time so mid-call language changes
                # are picked up here immediately.
                user_txt = recognizer.recognize_google(audio, language=_current_stt_lang)
                _tx("user", user_txt)

                # Add to history; trim to _MAX_HISTORY to avoid context overflow
                history.append({"role": "user", "content": user_txt})
                if len(history) > _MAX_HISTORY:
                    history = history[-_MAX_HISTORY:]

                # ── STEP C: Claude Haiku (streaming) ─────────────────────────
                # System prompt is rebuilt each iteration so that mid-call
                # language changes (from /call/settings) take effect immediately.
                # The language instruction also tells Claude to auto-detect the
                # user's spoken language and reply in it.
                _base = (
                    _AUTHORIZED_PROMPT if is_authorized else _UNAUTHORIZED_PROMPT
                ).format(location=_LOCATION, language=_current_lang)
                _inc_block = _build_incident_block(incident)
                system_prompt = f"{_base}\n\n{_inc_block}".strip() if _inc_block else _base

                # Streaming is used so the reply is available as fast as possible.
                # We break early if _voice_active is cleared (Stop Call pressed).
                chunks: list[str] = []
                with client.messages.stream(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=300,
                    system=system_prompt,
                    messages=history,
                ) as stream:
                    for chunk in stream.text_stream:
                        chunks.append(chunk)
                        if not _voice_active:
                            break

                reply = "".join(chunks).strip()
                if not _voice_active or not reply:
                    break

                history.append({"role": "assistant", "content": reply})

                # ── STEP D: Speak ─────────────────────────────────────────────
                # Strip markdown symbols (reply will be spoken aloud).
                # _current_voice / _current_rate are read here each iteration so
                # mid-call language/speed changes via /call/settings take effect.
                #
                # _tx("assistant", reply) is passed as on_ready so the text
                # appears on the dashboard at the exact moment audio starts —
                # thinking dots stay visible during TTS generation, then text
                # and voice arrive together.
                clean = reply.replace("*", "").replace("#", "")
                _speaker.speak(
                    clean, _current_voice, _current_rate,
                    on_ready=lambda: _tx("assistant", reply),
                )

            except sr.WaitTimeoutError:
                # No speech detected within timeout — loop again silently
                continue
            except sr.UnknownValueError:
                # Mic captured audio but STT could not decode it
                print("[Voice] ⚠️  Could not understand audio — please repeat.")
                continue
            except _anthropic.APIError as exc:
                print(f"[Voice] Claude error: {exc}")
                continue
            except Exception as exc:
                print(f"[Voice] Unexpected error: {exc}")
                continue

    _tx("assistant", "Call ended.")
    _voice_active = False
    _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
    print("[Voice] 📴 Voice loop exited")


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
    """Fires when no responder acknowledges within _ESCALATION_TIMEOUT_SECS."""
    if event_id in pending:
        del pending[event_id]
        print(f"[Server] ⏰ No ACK in {_ESCALATION_TIMEOUT_SECS}s — escalation triggered: {event_id}")


# ── Run server ────────────────────────────────────────────
def start_server(host="0.0.0.0", port=8765):
    """Run in background thread."""
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    print(f"[Server] Starting on port 8765...")
    print(f"[Server] Dashboard connects to: ws://YOUR_MAC_IP:8765/ws")
    start_server()
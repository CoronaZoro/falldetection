"""
alerts/voice.py — voice assistant: TTS, VAD capture, Claude loop, /call/* routes.
server.py calls init(broadcast_fn) at startup to inject the WS broadcast helper.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import threading
import time

from fastapi import APIRouter
from pydantic import BaseModel


# Injected by server.py at startup — avoids circular import
_broadcast_fn = None

def init(broadcast_fn) -> None:
    global _broadcast_fn
    _broadcast_fn = broadcast_fn

def _broadcast(payload: dict) -> None:
    if _broadcast_fn is not None:
        _broadcast_fn(payload)


router = APIRouter(tags=["voice"])

_LOCATION = "Rangsit University, Pathum Thani, Thailand"


# Two system prompt tiers: authorized healthcare provider vs. bystander
_AUTHORIZED_PROMPT = """You are an emergency medical voice assistant with live call integrated into a fall detection system.
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
3. If the user asks something NOT related to healthcare, incident or the emergency, reply EXACTLY:
   "My apologies. I'm only able to provide critical healthcare information. Thank you."
4. Language: reply in **{language}** by default. If the user's message is in a
   different language, automatically detect it and reply in that language instead.
   Always match the language the user is currently speaking.
5. Keep initial responses under 50 words. Detailed follow-ups under 150 words.
6. Do NOT use markdown, bullet points, asterisks, em dashes, or numbered lists.
   Write in plain flowing sentences — this will be spoken aloud.
7. If the user asks for emergency contact info, provide the nearest hospital contact infos in the area."""

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
2. If the user asks something NOT related to healthcare, incident or the emergency, reply EXACTLY:
   "My apologies. I'm only able to provide critical healthcare information. Thank you."
3. Language: reply in **{language}** by default. If the user's message is in a
   different language, automatically detect it and reply in **{language}** instead.
   Always match the language the user is currently speaking.
4. Keep responses under 100 words.
5. Do NOT use markdown, bullet points, asterisks, em dashes, or numbered lists.
   Write in plain flowing sentences — this will be spoken aloud.
7. If the user asks for emergency contact info, provide the nearest hospital contact infos in the area."""


# Language name -> Google STT locale and Edge TTS neural voice
_STT_LANG_MAP: dict[str, str] = {
    "English":  "en-US",
    "Thai":     "th-TH",
    "Japanese": "ja-JP",
    "Chinese":  "zh-CN",
}

_EDGE_VOICE_MAP: dict[str, str] = {
    "English":  "en-US-JennyNeural",
    "Thai":     "th-TH-PremwadeeNeural",
    "Japanese": "ja-JP-NanamiNeural",
    "Chinese":  "zh-CN-XiaoxiaoNeural",
}

# Dashboard speed label -> Edge TTS rate string
_SPEED_RATE_MAP: dict[str, str] = {
    "0.5x":  "-50%",
    "0.75x": "-25%",
    "1x":    "+0%",
    "1.25x": "+25%",
    "1.5x":  "+50%",
    "2x":    "+100%",
}

_DEFAULT_RATE = "+15%"  # slightly faster than 1x, sounds natural for emergency use
_MAX_HISTORY  = 20      # rolling window of messages kept in context (10 exchanges)


# These globals are read by _voice_loop every iteration so /call/settings
# changes take effect on the next listen/speak cycle without restarting.
_voice_active:             bool  = False
_mic_muted:                bool  = False
_current_lang:             str   = "English"
_current_voice:            str   = _EDGE_VOICE_MAP["English"]
_current_stt_lang:         str   = _STT_LANG_MAP["English"]
_current_rate:             str   = _DEFAULT_RATE
_current_speed_label:      str   = "1x"   # dashboard label — sent in voice_alert for typewriter sync
_current_energy_threshold: int   = 300    # maps to VAD aggressiveness; see _vad_aggressiveness()
_current_pause_threshold:  float = 1.2    # silence (seconds) after speech before sending


class InterruptibleSpeaker:
    """Generates audio with Edge TTS and plays it via afplay.
    stop() kills the subprocess immediately — safe from any thread.
    """

    def __init__(self):
        self._process: subprocess.Popen | None = None
        self._lock = threading.Lock()

    def speak(
        self,
        text: str,
        voice: str,
        rate: str = _DEFAULT_RATE,
        on_tts_ready: "callable | None" = None,
        on_play_start: "callable | None" = None,
    ) -> None:
        try:
            import edge_tts as _edge_tts
        except ImportError:
            print("[Voice] edge-tts not installed: pip install edge-tts")
            return

        output = "/tmp/guardian_voice_reply.mp3"

        async def _gen():
            await _edge_tts.Communicate(text, voice, rate=rate).save(output)

        try:
            asyncio.run(_gen())
        except Exception as exc:
            print(f"[Voice] TTS failed: {exc} | voice={voice!r} rate={rate!r}")
            return

        # TTS file is ready — signal dashboard to show "preparing audio" state
        if on_tts_ready:
            on_tts_ready()

        try:
            with self._lock:
                self._process = subprocess.Popen(
                    ["afplay", output],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            # Give afplay ~150 ms to buffer before broadcasting text so that
            # audio onset and text display land on the dashboard at the same time.
            time.sleep(0.15)
            if on_play_start:
                on_play_start()
            self._process.wait()
        except Exception as exc:
            print(f"[Voice] afplay failed: {exc}")
        finally:
            with self._lock:
                self._process = None

    def stop(self) -> None:
        with self._lock:
            if self._process and self._process.poll() is None:
                self._process.kill()


_speaker = InterruptibleSpeaker()


class IncidentContext(BaseModel):
    type:          str   = ""
    person_id:     int   = 0
    ar:            float = 0.0
    down_duration: float = 0.0
    status:        str   = "UNACKNOWLEDGED"


class CallStartPayload(BaseModel):
    language:      str             = "English"
    is_authorized: bool            = False
    speed:         str             = "1x"
    incident:      IncidentContext = None
    sensitivity:   int             = 300    # Sensitive=100 / Balanced=300 / Clear=600 / Strict=1200
    pause_after:   float           = 1.2


class CallSettingsPayload(BaseModel):
    language:    str   | None = None
    speed:       str   | None = None
    sensitivity: int   | None = None
    pause_after: float | None = None


def _build_incident_block(incident: IncidentContext | None) -> str:
    """Build a plain-text incident summary to prepend to the system prompt."""
    if not incident or incident.type != "FALL":
        return ""

    ar_risk  = "HIGH" if incident.ar < 0.5 else "MODERATE" if incident.ar < 0.7 else "LOW"
    dur_risk = "CRITICAL" if incident.down_duration >= 30 else "HIGH" if incident.down_duration >= 10 else "MODERATE"

    return "\n".join([
        "CURRENT INCIDENT:",
        "- Type: FALL DETECTED",
        f"- Person ID: {incident.person_id}",
        f"- Aspect Ratio (AR): {incident.ar:.2f} — lower means more horizontal. Risk: {ar_risk}",
        f"- Time on ground: {incident.down_duration:.1f}s. Risk: {dur_risk}",
        f"- Status: {incident.status}",
        "",
        "Use this to answer 'what happened?', 'how serious?', or 'what should I check first?'.",
        "Prioritise airway, breathing, circulation. Very low AR means person is likely fully flat.",
    ])


def _capture_utterance(
    stream,
    vad,
    sample_rate:       int      = 16_000,
    frame_ms:          int      = 30,
    silence_secs:      float    = 1.2,
    pre_roll_ms:       int      = 300,
    timeout_secs:      float    = 15.0,
    phrase_limit_secs: float    = 30.0,
    on_speech_start:   callable = None,
) -> bytes:
    """Capture one utterance via WebRTC VAD. Returns raw 16-bit mono PCM.

    Waits up to timeout_secs for speech to start, then accumulates until
    silence_secs of non-speech follows. A pre-roll buffer ensures the first
    syllable is never clipped. on_speech_start fires once on the first speech
    frame — used to push a "speaking" status to the dashboard. Raises
    TimeoutError if no speech is detected.
    """
    import collections as _collections

    frame_samples        = int(sample_rate * frame_ms / 1000)
    pre_roll_frames      = max(1, int(pre_roll_ms / frame_ms))
    silence_frames_limit = max(1, int(silence_secs * 1000 / frame_ms))

    ring_buf: _collections.deque = _collections.deque(maxlen=pre_roll_frames)
    utterance: list[bytes]       = []
    in_speech      = False
    silence_count  = 0
    deadline       = time.time() + timeout_secs
    phrase_deadline: float | None = None

    while True:
        now = time.time()
        if not in_speech and now > deadline:
            raise TimeoutError("no speech detected within timeout")
        if in_speech and phrase_deadline and now > phrase_deadline:
            break

        frame     = stream.read(frame_samples, exception_on_overflow=False)
        is_speech = vad.is_speech(frame, sample_rate)

        if not in_speech:
            ring_buf.append(frame)
            if is_speech:
                in_speech       = True
                phrase_deadline = now + phrase_limit_secs
                if on_speech_start:
                    on_speech_start()
                utterance.extend(ring_buf)
                ring_buf.clear()
        else:
            utterance.append(frame)
            if is_speech:
                silence_count = 0
            else:
                silence_count += 1
                if silence_count >= silence_frames_limit:
                    break

    return b"".join(utterance)


# Flush the TTS speak buffer when one of these characters is reached
_SENTENCE_ENDS = ('.', '!', '?', '。', '！', '？', '…', '\n')


def _voice_loop(is_authorized: bool, incident: IncidentContext | None = None) -> None:
    """Daemon thread: listen -> transcribe -> ask Claude -> speak, until stopped."""
    global _voice_active

    # Lazy imports so the server starts even if voice deps are missing
    try:
        import speech_recognition as sr
        import anthropic as _anthropic
        import pyaudio as _pyaudio
        import webrtcvad as _webrtcvad
    except ImportError as exc:
        print(f"[Voice] missing dependency: {exc}")
        print("[Voice] pip install SpeechRecognition pyaudio edge-tts anthropic webrtcvad-wheels")
        _voice_active = False
        _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[Voice] ANTHROPIC_API_KEY not set")
        _mid_err = 0

        def _tx_err(speaker, text):
            nonlocal _mid_err
            _mid_err += 1
            _broadcast({"type": "voice_alert", "speaker": speaker,
                        "message": text, "mid": _mid_err, "timestamp": time.time()})

        _tx_err("assistant", "Error: API key not configured. Contact admin.")
        _voice_active = False
        _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
        return

    client  = _anthropic.Anthropic(api_key=api_key)
    history: list[dict] = []
    _mid    = 0

    def _tx(speaker: str, text: str) -> None:
        # mid field lets the dashboard deduplicate React StrictMode double-sends
        # speed field lets the dashboard pace the typewriter to match audio playback
        nonlocal _mid
        _mid += 1
        _broadcast({"type": "voice_alert", "speaker": speaker,
                    "message": text, "mid": _mid, "timestamp": time.time(),
                    "speed": _current_speed_label})

    recognizer = sr.Recognizer()
    _tx("assistant", "Call started — listening...")

    # Open mic stream once for the whole call
    _SAMPLE_RATE = 16_000
    _FRAME_MS    = 30  # webrtcvad only accepts 10, 20, or 30 ms

    _pa     = _pyaudio.PyAudio()
    _stream = _pa.open(
        format            = _pyaudio.paInt16,
        channels          = 1,
        rate              = _SAMPLE_RATE,
        input             = True,
        frames_per_buffer = int(_SAMPLE_RATE * _FRAME_MS / 1000),
    )

    def _vad_aggressiveness() -> int:
        # Sensitive=100->0, Balanced=300->1, Clear=600->2, Strict=1200->3
        t = _current_energy_threshold
        if t < 200: return 0
        if t < 400: return 1
        if t < 800: return 2
        return 3

    try:
        while _voice_active:
            try:
                # listen
                status = "muted" if _mic_muted else "listening"
                _broadcast({"type": "mic_status", "status": status, "timestamp": time.time()})
                vad = _webrtcvad.Vad(_vad_aggressiveness())
                pcm_bytes = _capture_utterance(
                    stream            = _stream,
                    vad               = vad,
                    sample_rate       = _SAMPLE_RATE,
                    frame_ms          = _FRAME_MS,
                    silence_secs      = _current_pause_threshold,
                    timeout_secs      = 15.0,
                    phrase_limit_secs = 30.0,
                    on_speech_start   = None if _mic_muted else lambda: _broadcast(
                        {"type": "mic_status", "status": "speaking", "timestamp": time.time()}
                    ),
                )

                # Discard captured audio when muted — don't send to STT or Claude
                if _mic_muted:
                    continue

                audio = sr.AudioData(pcm_bytes, _SAMPLE_RATE, 2)

                # transcribe
                user_txt = recognizer.recognize_google(audio, language=_current_stt_lang)
                _tx("user", user_txt)

                history.append({"role": "user", "content": user_txt})
                if len(history) > _MAX_HISTORY:
                    history = history[-_MAX_HISTORY:]

                # ask claude, split reply into sentences for faster TTS start
                base = (
                    _AUTHORIZED_PROMPT if is_authorized else _UNAUTHORIZED_PROMPT
                ).format(location=_LOCATION, language=_current_lang)
                inc_block     = _build_incident_block(incident)
                system_prompt = f"{base}\n\n{inc_block}".strip() if inc_block else base

                full_reply   = ""
                speak_buffer = ""
                sentences: list[str] = []

                with client.messages.stream(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=300,
                    system=system_prompt,
                    messages=history,
                ) as stream:
                    for chunk in stream.text_stream:
                        if not _voice_active:
                            break
                        full_reply   += chunk
                        speak_buffer += chunk
                        if speak_buffer.rstrip().endswith(_SENTENCE_ENDS) and len(speak_buffer.strip()) > 6:
                            sentences.append(speak_buffer.strip())
                            speak_buffer = ""

                if speak_buffer.strip():
                    sentences.append(speak_buffer.strip())

                reply = full_reply.strip()
                if not _voice_active or not reply:
                    break

                history.append({"role": "assistant", "content": reply})

                # Two-phase sync: dashboard shows "preparing audio" when TTS is
                # done, then text appears together with audio after afplay buffers.
                first_tts = True
                first      = True

                def _on_tts_ready():
                    nonlocal first_tts
                    if first_tts:
                        first_tts = False
                        _broadcast({"type": "voice_tts_ready", "timestamp": time.time()})

                def _on_first_play():
                    nonlocal first
                    if first:
                        first = False
                        _tx("assistant", reply)

                for sentence in sentences:
                    if not _voice_active:
                        break
                    clean = sentence.replace("*", "").replace("#", "")
                    if clean:
                        tts_cb  = _on_tts_ready  if first_tts else None
                        play_cb = _on_first_play  if first     else None
                        _speaker.speak(clean, _current_voice, _current_rate,
                                       on_tts_ready=tts_cb, on_play_start=play_cb)

            except TimeoutError:
                continue
            except sr.UnknownValueError:
                print("[Voice] could not understand audio")
                continue
            except _anthropic.APIError as exc:
                print(f"[Voice] Claude error: {exc}")
                continue
            except Exception as exc:
                print(f"[Voice] unexpected error: {exc}")
                continue

    finally:
        try:
            _stream.stop_stream()
            _stream.close()
        except Exception:
            pass
        try:
            _pa.terminate()
        except Exception:
            pass

    _tx("assistant", "Call ended.")
    _voice_active = False
    _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
    print("[Voice] loop exited")


@router.post("/call/start")
async def start_call(payload: CallStartPayload):
    """Start a voice session. Returns {ok: false} if one is already running."""
    global _voice_active, _current_lang, _current_voice, _current_stt_lang, \
           _current_rate, _current_speed_label, _current_energy_threshold, _current_pause_threshold

    if _voice_active:
        return {"ok": False, "error": "call already active"}

    _current_lang             = payload.language
    _current_voice            = _EDGE_VOICE_MAP.get(payload.language, "en-US-JennyNeural")
    _current_stt_lang         = _STT_LANG_MAP.get(payload.language, "en-US")
    _current_rate             = _SPEED_RATE_MAP.get(payload.speed, _DEFAULT_RATE)
    _current_speed_label      = payload.speed
    _current_energy_threshold = payload.sensitivity
    _current_pause_threshold  = payload.pause_after

    _voice_active = True
    threading.Thread(target=_voice_loop, args=(payload.is_authorized, payload.incident), daemon=True).start()
    _broadcast({"type": "call_status", "callStatus": "active", "timestamp": time.time()})
    print(f"[Voice] call started — lang={payload.language} speed={payload.speed} authorized={payload.is_authorized}")
    return {"ok": True}


@router.post("/call/stop")
async def stop_call():
    """Stop the active session and kill any in-progress audio immediately."""
    global _voice_active, _mic_muted
    _voice_active = False
    _mic_muted    = False
    _speaker.stop()
    _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
    print("[Voice] call stopped")
    return {"ok": True}


@router.post("/call/mute")
async def mute_mic():
    """Mute the microphone — audio is still captured but discarded."""
    global _mic_muted
    _mic_muted = True
    _broadcast({"type": "mic_status", "status": "muted", "timestamp": time.time()})
    return {"muted": True}


@router.post("/call/unmute")
async def unmute_mic():
    """Unmute the microphone — resume normal STT processing."""
    global _mic_muted
    _mic_muted = False
    _broadcast({"type": "mic_status", "status": "listening", "timestamp": time.time()})
    return {"muted": False}


@router.get("/call/status")
async def call_status():
    """Check if a voice session is active. Used by the dashboard on mount."""
    return {"active": _voice_active, "muted": _mic_muted}


@router.post("/call/settings")
async def update_call_settings(payload: CallSettingsPayload):
    """Update language, speed, or VAD settings mid-call. Takes effect next cycle."""
    global _current_lang, _current_voice, _current_stt_lang, _current_rate, \
           _current_speed_label, _current_energy_threshold, _current_pause_threshold

    if payload.language:
        _current_lang     = payload.language
        _current_voice    = _EDGE_VOICE_MAP.get(payload.language, "en-US-JennyNeural")
        _current_stt_lang = _STT_LANG_MAP.get(payload.language, "en-US")
        print(f"[Voice] language -> {payload.language}")
    if payload.speed:
        _current_rate        = _SPEED_RATE_MAP.get(payload.speed, _DEFAULT_RATE)
        _current_speed_label = payload.speed
        print(f"[Voice] speed -> {payload.speed} ({_current_rate})")
    if payload.sensitivity is not None:
        _current_energy_threshold = payload.sensitivity
        print(f"[Voice] sensitivity -> {payload.sensitivity}")
    if payload.pause_after is not None:
        _current_pause_threshold = payload.pause_after
        print(f"[Voice] pause -> {payload.pause_after}s")
    return {"ok": True}

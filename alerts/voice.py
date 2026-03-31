"""
alerts/voice.py — voice assistant: TTS, VAD capture, Claude loop, /call/* routes.
server.py calls init(broadcast_fn) at startup to inject the WS broadcast helper.
"""

from __future__ import annotations

import asyncio
import os
import queue
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
_AUTHORIZED_PROMPT = """You are an emergency medical voice assistant with live call integrated into a fall detection system. Your name is PALADIN.
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
7. If the user asks for emergency contact info, provide the nearest hospital contact infos 
        PatRangsit Hospital: 02-998-9999,
        Thammasat University Hospital: 02-926-9999,
        Rangsit Hospital: 02-150-0200. When pronouncing emergency numbers, speak the numbers one by one but write them out in numerals without spaces."""

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
7. If the user asks for emergency contact info, provide the nearest hospital contact infos in the area. When pronouncing emergency numbers, speak the numbers one by one but write them out in numerals without spaces."""


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


# Session globals — read each loop iteration; changes take effect next cycle
_voice_active:             bool  = False
_mic_muted:                bool  = False
_call_generation:          int   = 0   # incremented each start; old threads exit when mismatched
_current_lang:             str   = "English"
_current_voice:            str   = _EDGE_VOICE_MAP["English"]
_current_stt_lang:         str   = _STT_LANG_MAP["English"]
_current_rate:             str   = _DEFAULT_RATE
_current_speed_label:      str   = "1x"
_current_energy_threshold: int   = 1200
_current_pause_threshold:  float = 1.2


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

        if on_tts_ready:
            on_tts_ready()

        try:
            with self._lock:
                self._process = subprocess.Popen(
                    ["afplay", output],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            # 150ms buffer so audio onset and text land simultaneously
            time.sleep(0.15)
            if on_play_start:
                on_play_start()
            self._process.wait()
        except Exception as exc:
            print(f"[Voice] afplay failed: {exc}")
        finally:
            with self._lock:
                self._process = None

    def speak_file(self, path: str) -> None:
        """Play a pre-generated audio file. Blocks until done or stopped."""
        try:
            with self._lock:
                self._process = subprocess.Popen(
                    ["afplay", path],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
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


class IncidentLogEntry(BaseModel):
    type:      str = ""
    message:   str = ""
    timestamp: str = ""


class IncidentTranscriptEntry(BaseModel):
    speaker:   str = ""
    text:      str = ""


class IncidentContext(BaseModel):
    type:             str                          = ""
    person_id:        int                          = 0
    ar:               float                        = 0.0
    down_duration:    float                        = 0.0
    status:           str                          = "UNACKNOWLEDGED"
    notes:            str                          = ""
    detected_at:      str                          = ""   # ISO / Unix timestamp string from WS
    fall_velocity:    float                        = 0.0  # hip velocity at fall moment (norm/s)
    logs:             list[IncidentLogEntry]       = []
    prev_transcripts: list[IncidentTranscriptEntry] = []


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
    """Build a full incident context block to prepend to the system prompt."""
    if not incident or incident.type != "FALL":
        return ""

    import datetime as _dt

    ar_risk  = "HIGH"     if incident.ar < 0.5            else "MODERATE" if incident.ar < 0.7            else "LOW"
    dur_risk = "CRITICAL" if incident.down_duration >= 30 else "HIGH"     if incident.down_duration >= 10 else "MODERATE"

    # Resolve detected_at → human-readable local time
    detected_at_str = "unknown"
    if incident.detected_at:
        try:
            ts_val = float(incident.detected_at)
            detected_at_str = _dt.datetime.fromtimestamp(ts_val).strftime("%Y-%m-%d %H:%M:%S")
        except (ValueError, OSError):
            # Already an ISO string or other format — use as-is
            detected_at_str = incident.detected_at[:19].replace("T", " ")

    # Velocity severity label
    vel = incident.fall_velocity
    if vel >= 0.8:
        vel_risk = "SEVERE — very fast impact, high injury risk"
    elif vel >= 0.5:
        vel_risk = "HIGH — fast fall, possible injury"
    elif vel >= 0.3:
        vel_risk = "MODERATE — clear fall motion"
    elif vel > 0.0:
        vel_risk = "LOW — slow descent"
    else:
        vel_risk = "unknown (no skeleton data)"

    lines = [
        "━━━ INCIDENT CONTEXT ━━━",
        f"Type:             FALL DETECTED",
        f"Person ID:        {incident.person_id}",
        f"Detected at:      {detected_at_str}",
        f"Aspect Ratio:     {incident.ar:.2f}  (lower = more horizontal — risk: {ar_risk})",
        f"Time on ground:   {incident.down_duration:.1f}s  (risk: {dur_risk})",
        f"Fall velocity:    {vel:.3f} norm/s — {vel_risk}",
        f"Current status:   {incident.status}",
    ]

    if incident.notes:
        lines.append(f"Responder notes:  {incident.notes}")

    if incident.logs:
        lines.append("")
        lines.append("━━━ INCIDENT TIMELINE ━━━")
        for log in incident.logs[-25:]:
            ts = log.timestamp[:19].replace("T", " ") if log.timestamp else ""
            lines.append(f"  [{ts}]  {log.message}")

    if incident.prev_transcripts:
        lines.append("")
        lines.append("━━━ PREVIOUS VOICE EXCHANGES ━━━")
        for t in incident.prev_transcripts[-40:]:
            speaker = "Assistant" if t.speaker == "assistant" else "Responder"
            lines.append(f"  {speaker}: {t.text}")

    lines += [
        "",
        "Use all of the above to answer questions accurately.",
        "Prioritise airway, breathing, circulation. Very low AR means person is likely fully flat.",
        "High fall velocity (≥0.5) suggests rapid impact — flag potential physical injury.",
    ]

    return "\n".join(lines)


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
    should_stop:       callable = None,
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
        if should_stop and should_stop():
            raise StopIteration("call stopped")
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


def _voice_loop(is_authorized: bool, incident: IncidentContext | None = None, generation: int = 0) -> None:
    """Daemon thread: listen -> transcribe -> ask Claude -> speak, until stopped."""
    global _voice_active

    def _active() -> bool:
        return _voice_active and _call_generation == generation

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
        while _active():
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
                    should_stop       = lambda: not _active(),
                )

                # Discard captured audio when muted — don't send to STT or Claude
                if _mic_muted:
                    continue

                if not _active():
                    break

                audio = sr.AudioData(pcm_bytes, _SAMPLE_RATE, 2)

                # transcribe
                user_txt = recognizer.recognize_google(audio, language=_current_stt_lang)
                _tx("user", user_txt)

                if not _active():
                    break

                history.append({"role": "user", "content": user_txt})
                if len(history) > _MAX_HISTORY:
                    history = history[-_MAX_HISTORY:]

                # Parallel TTS pipeline:
                # As Claude streams each sentence, kick off TTS generation
                # immediately in a background thread. Playback starts as soon
                # as sentence 1's audio is ready — no waiting for later sentences.
                try:
                    import edge_tts as _edge_tts
                except ImportError:
                    print("[Voice] edge-tts not installed")
                    continue

                base = (
                    _AUTHORIZED_PROMPT if is_authorized else _UNAUTHORIZED_PROMPT
                ).format(location=_LOCATION, language=_current_lang)
                inc_block     = _build_incident_block(incident)
                system_prompt = f"{base}\n\n{inc_block}".strip() if inc_block else base

                full_reply   = ""
                speak_buffer = ""
                tts_q:        queue.Queue = queue.Queue()
                tts_failed:   set         = set()
                s_idx        = 0

                def _gen_tts(idx: int, text: str, path: str, ev: threading.Event):
                    async def _inner():
                        await _edge_tts.Communicate(
                            text, _current_voice, rate=_current_rate
                        ).save(path)
                    try:
                        asyncio.run(_inner())
                    except Exception as exc:
                        print(f"[Voice] TTS failed sentence {idx}: {exc}")
                        tts_failed.add(idx)
                    finally:
                        ev.set()

                def _queue_sentence(text: str):
                    nonlocal s_idx
                    clean = text.replace("*", "").replace("#", "").strip()
                    if not clean:
                        return
                    path = f"/tmp/guardian_tts_{generation}_{s_idx}.mp3"
                    ev   = threading.Event()
                    threading.Thread(
                        target=_gen_tts, args=(s_idx, clean, path, ev), daemon=True
                    ).start()
                    tts_q.put((s_idx, ev, path))
                    s_idx += 1

                # Stream Claude — dispatch TTS per sentence as it arrives
                with client.messages.stream(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=300,
                    system=system_prompt,
                    messages=history,
                ) as stream:
                    for chunk in stream.text_stream:
                        if not _active():
                            break
                        full_reply   += chunk
                        speak_buffer += chunk
                        if (
                            speak_buffer.rstrip().endswith(_SENTENCE_ENDS)
                            and len(speak_buffer.strip()) > 6
                        ):
                            _queue_sentence(speak_buffer)
                            speak_buffer = ""

                # Queue any trailing fragment (no trailing punctuation)
                if speak_buffer.strip():
                    _queue_sentence(speak_buffer)

                reply = full_reply.strip()
                if not reply:
                    continue

                if not _active():
                    # Drain and clean up any queued TTS jobs
                    while not tts_q.empty():
                        _, ev, path = tts_q.get_nowait()
                        ev.wait(timeout=3.0)
                        try: os.unlink(path)
                        except: pass
                    break

                history.append({"role": "assistant", "content": reply})

                # Playback loop: dequeue in order, wait for each TTS, play
                all_paths:    list[str] = []
                first_played: bool      = False

                for _ in range(s_idx):
                    idx, ev, path = tts_q.get()
                    all_paths.append(path)

                    # Wait for this sentence's audio, bail fast if stopped
                    while not ev.wait(timeout=0.05):
                        if not _active():
                            break

                    if not _active():
                        break

                    if idx in tts_failed:
                        continue

                    if not first_played:
                        first_played = True
                        # Text and audio onset are simultaneous
                        _broadcast({"type": "voice_tts_ready", "timestamp": time.time()})
                        _tx("assistant", reply)

                    _speaker.speak_file(path)

                for p in all_paths:
                    try: os.unlink(p)
                    except: pass

            except StopIteration:
                break  # call was stopped mid-capture — exit cleanly
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

    # Only broadcast "Call ended" if this is still the active generation
    if _call_generation == generation:
        _tx("assistant", "Call ended.")
        _voice_active = False
        _broadcast({"type": "call_status", "callStatus": "idle", "timestamp": time.time()})
    print(f"[Voice] loop exited (gen={generation})")


@router.post("/call/start")
async def start_call(payload: CallStartPayload):
    """Start a voice session. Returns {ok: false} if one is already running."""
    global _voice_active, _call_generation, _current_lang, _current_voice, _current_stt_lang, \
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

    _call_generation += 1
    _voice_active = True
    threading.Thread(target=_voice_loop, args=(payload.is_authorized, payload.incident, _call_generation), daemon=True).start()
    _broadcast({"type": "call_status", "callStatus": "active", "timestamp": time.time()})
    print(f"[Voice] call started — gen={_call_generation} lang={payload.language} speed={payload.speed} authorized={payload.is_authorized}")
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


@router.post("/call/interrupt")
async def interrupt_speech():
    """Kill current audio playback immediately — call stays active, mic resumes next cycle."""
    _speaker.stop()
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

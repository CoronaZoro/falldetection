"""
=============================================================================
Fall Detection Voice Chatbot — Claude API + Edge TTS (Fast & Interruptible)
=============================================================================
- Uses Claude Haiku (fastest model) with streaming for near-instant replies.
- TTS runs as a killable subprocess — interrupted when user speaks or stops.
- Transcript persists after call ends.

Requires: pip install anthropic SpeechRecognition pyaudio edge-tts
Run:      export ANTHROPIC_API_KEY="sk-ant-..." && python3 fall_detection_voice_app.py
=============================================================================
"""

import os
import asyncio
import subprocess
import threading
import tkinter as tk
from tkinter import ttk

import speech_recognition as sr
import edge_tts
import anthropic


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1: SYSTEM PROMPTS
# ─────────────────────────────────────────────────────────────────────────────

LOCATION = "Rangsit University, Pathum Thani, Thailand"

AUTHORIZED_PROMPT = """You are an emergency medical voice assistant integrated into a fall detection system.
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

4. Always reply in **{language}**.
5. Keep initial responses under 50 words. Detailed follow-ups under 150 words.
6. Do NOT use markdown, bullet points, asterisks, or numbered lists.
   Write in plain flowing sentences — this will be spoken aloud.
"""

UNAUTHORIZED_PROMPT = """You are an emergency voice assistant integrated into a fall detection system.
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

3. Always reply in **{language}**.
4. Keep responses under 100 words.
5. Do NOT use markdown, bullet points, asterisks, or numbered lists.
   Write in plain flowing sentences — this will be spoken aloud.
"""


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2: LANGUAGE & VOICE MAPS
# ─────────────────────────────────────────────────────────────────────────────

STT_LANG_MAP = {
    "English":  "en-US",
    "Thai":     "th-TH",
    "Japanese": "ja-JP",
    "Chinese":  "zh-CN",
}

EDGE_VOICE_MAP = {
    "English":  "en-US-JennyNeural",
    "Thai":     "th-TH-PremwadeeNeural",
    "Japanese": "ja-JP-NanamiNeural",
    "Chinese":  "zh-CN-XiaoxiaoNeural",
}

EDGE_RATE = "+15%"


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3: INTERRUPTIBLE TTS
# ─────────────────────────────────────────────────────────────────────────────
# Edge TTS generates the audio file, then we play it with `afplay` in a
# subprocess. The subprocess PID is stored so it can be killed instantly
# when the user speaks again or presses Stop Call.
# ─────────────────────────────────────────────────────────────────────────────

class InterruptibleSpeaker:
    """Manages TTS playback that can be killed mid-sentence."""

    def __init__(self):
        self._process = None  # The afplay subprocess
        self._lock = threading.Lock()

    def speak(self, text, voice, rate=EDGE_RATE):
        """Generate audio with Edge TTS and play it. Returns when done or killed."""
        output_path = "/tmp/fall_detect_reply.mp3"

        # Generate the audio file
        async def _generate():
            communicate = edge_tts.Communicate(text, voice, rate=rate)
            await communicate.save(output_path)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_generate())
        loop.close()

        # Play via subprocess (killable)
        with self._lock:
            self._process = subprocess.Popen(
                ["afplay", output_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )

        # Wait for playback to finish (or be killed)
        self._process.wait()

        with self._lock:
            self._process = None

    def stop(self):
        """Kill audio playback immediately."""
        with self._lock:
            if self._process and self._process.poll() is None:
                self._process.kill()


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4: THE APP CLASS
# ─────────────────────────────────────────────────────────────────────────────

class FallDetectionApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Fall Detection — Voice Assistant")
        self.root.geometry("580x650")
        self.root.resizable(False, False)

        self.client = anthropic.Anthropic()
        self.is_listening = False
        self.conversation_history = []
        self.speaker = InterruptibleSpeaker()

        # ── GUI ──────────────────────────────────────────────────────────

        ttk.Label(root, text="🚨 Fall Detection Voice Assistant",
                  font=("Arial", 16, "bold")).pack(pady=(15, 5))

        frame_lang = ttk.LabelFrame(root, text="Language", padding=10)
        frame_lang.pack(fill="x", padx=20, pady=5)
        self.lang_var = tk.StringVar(value="English")
        self.lang_dropdown = ttk.Combobox(
            frame_lang, textvariable=self.lang_var,
            values=["English", "Thai", "Japanese", "Chinese"],
            state="readonly", width=30
        )
        self.lang_dropdown.pack()

        frame_role = ttk.LabelFrame(root, text="User Authorization", padding=10)
        frame_role.pack(fill="x", padx=20, pady=5)
        self.role_var = tk.StringVar(value="Unauthorized")
        ttk.Radiobutton(frame_role, text="✅ Authorized Healthcare Provider",
                        variable=self.role_var, value="Authorized").pack(anchor="w")
        ttk.Radiobutton(frame_role, text="❌ Unauthorized Bystander",
                        variable=self.role_var, value="Unauthorized").pack(anchor="w")

        self.call_btn = tk.Button(
            root, text="🟢 Start Call", font=("Arial", 14),
            bg="#a8e6cf", width=20, command=self.toggle_call
        )
        self.call_btn.pack(pady=15)

        ttk.Label(root, text="Live Call Transcript:",
                  font=("Arial", 10, "bold")).pack(pady=(10, 3))
        self.log_area = tk.Text(
            root, height=14, width=65, state="disabled",
            wrap="word", bg="#1e1e1e", fg="#e0e0e0",
            insertbackground="white", font=("Courier", 11)
        )
        self.log_area.pack(padx=20)

        self.status_var = tk.StringVar(value="Ready — press Start Call")
        ttk.Label(root, textvariable=self.status_var,
                  font=("Arial", 9), foreground="gray").pack(pady=(5, 10))

    def log(self, message):
        def _update():
            self.log_area.config(state="normal")
            self.log_area.insert(tk.END, message + "\n\n")
            self.log_area.see(tk.END)
            self.log_area.config(state="disabled")
        self.root.after(0, _update)

    def set_status(self, text):
        self.root.after(0, lambda: self.status_var.set(text))

    def toggle_call(self):
        if self.is_listening:
            # ── STOP CALL: kill audio immediately, keep transcript ──
            self.is_listening = False
            self.speaker.stop()
            self.call_btn.config(text="🟢 Start Call", bg="#a8e6cf")
            self.lang_dropdown.config(state="readonly")
            self.log("━━━ Call Ended ━━━")
            self.set_status("Ready — press Start Call")
        else:
            # ── START CALL ──
            self.is_listening = True
            self.conversation_history = []
            self.call_btn.config(text="🔴 Stop Call", bg="#ffb3ba")
            self.lang_dropdown.config(state="disabled")
            self.log("━━━ Call Started ━━━")
            self.set_status("Call active — listening...")
            threading.Thread(target=self.voice_loop, daemon=True).start()

    # ── SECTION 5: THE VOICE LOOP (streaming, stop button kills audio) ──
    #
    # Simple flow: Listen → Claude → Speak → repeat.
    # Stop button kills TTS audio instantly via speaker.stop().
    # ────────────────────────────────────────────────────────────────────

    def voice_loop(self):
        lang = self.lang_var.get()
        role = self.role_var.get()

        if role == "Authorized":
            system_prompt = AUTHORIZED_PROMPT.format(location=LOCATION, language=lang)
        else:
            system_prompt = UNAUTHORIZED_PROMPT.format(location=LOCATION, language=lang)

        voice = EDGE_VOICE_MAP.get(lang, "en-US-JennyNeural")
        stt_lang = STT_LANG_MAP.get(lang, "en-US")
        recognizer = sr.Recognizer()

        with sr.Microphone() as source:
            recognizer.adjust_for_ambient_noise(source, duration=1)

            while self.is_listening:
                try:
                    # ── STEP A: Listen ──
                    audio = recognizer.listen(source, timeout=7, phrase_time_limit=15)

                    # ── STEP B: Speech-to-Text ──
                    self.set_status("🎙️ Listening...")
                    user_text = recognizer.recognize_google(audio, language=stt_lang)
                    self.log(f"🗣️ You: {user_text}")

                    # ── STEP C: Claude API (streaming) ──
                    self.conversation_history.append({
                        "role": "user",
                        "content": user_text
                    })

                    # Keep only the last 10 exchanges (20 messages) to prevent
                    # context overflow and crashes on long calls
                    MAX_HISTORY = 20
                    if len(self.conversation_history) > MAX_HISTORY:
                        self.conversation_history = self.conversation_history[-MAX_HISTORY:]

                    reply_chunks = []
                    with self.client.messages.stream(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=300,
                        system=system_prompt,
                        messages=self.conversation_history
                    ) as stream:
                        for text in stream.text_stream:
                            reply_chunks.append(text)
                            if not self.is_listening:
                                break

                    reply_text = "".join(reply_chunks)

                    if not self.is_listening:
                        break

                    self.conversation_history.append({
                        "role": "assistant",
                        "content": reply_text
                    })
                    self.log(f"🤖 AI: {reply_text}")

                    # ── STEP D: Speak (stop button kills this) ──
                    clean_reply = reply_text.replace("*", "").replace("#", "")
                    self.speaker.speak(clean_reply, voice)
                    self.set_status("Call active — waiting...")

                except sr.WaitTimeoutError:
                    continue
                except sr.UnknownValueError:
                    self.log("⚠️ Could not understand audio — please repeat.")
                    continue
                except anthropic.APIError as e:
                    self.log(f"❌ Claude API error: {e.message}")
                    continue
                except Exception as e:
                    self.log(f"⚠️ Error: {str(e)}")
                    continue


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6: ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("=" * 50)
        print("ERROR: ANTHROPIC_API_KEY not set!")
        print("Run:  export ANTHROPIC_API_KEY='sk-ant-...'")
        print("=" * 50)
        exit(1)

    root = tk.Tk()
    app = FallDetectionApp(root)
    root.mainloop()
"use client";

import { useRef, useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Bot,
  User,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  Lock,
} from "lucide-react";
import type { VoiceEntry } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// consts
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGES = ["English", "Thai", "Japanese", "Chinese"] as const;
type Language = (typeof LANGUAGES)[number];

const SPEEDS = ["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x"] as const;
type Speed = (typeof SPEEDS)[number];

// Sensitivity → energy_threshold, which the backend maps to webrtcvad aggressiveness (0–3).
// Higher aggressiveness = more filtering = only clear speech triggers capture.
//   Sensitive   → threshold  100 → aggressiveness 0  (soft voices, quiet rooms)
//   Balanced    → threshold  300 → aggressiveness 1  (normal indoor speech, default)
//   Clear       → threshold  600 → aggressiveness 2  (clear/normal speech, some noise)
//   Strict      → threshold 1200 → aggressiveness 3  (crisp/loud speech, noisy rooms)
const SENSITIVITIES = ["Sensitive", "Balanced", "Clear", "Strict"] as const;
type Sensitivity = (typeof SENSITIVITIES)[number];
const SENSITIVITY_MAP: Record<Sensitivity, number> = {
  Sensitive: 100, // VAD level 0 — picks up whispers; most susceptible to noise
  Balanced: 300, // VAD level 1 — default; works for most indoor environments
  Clear: 600, // VAD level 2 — requires clear speech; fewer false triggers
  Strict: 1200, // VAD level 3 — noisy room / loud environment
};
const SENSITIVITY_HINT: Record<Sensitivity, string> = {
  Sensitive: "Soft voices · quiet room",
  Balanced: "Normal speech · indoors",
  Clear: "Clear speech · some noise",
  Strict: "Loud speech · noisy room",
};

// Pause-after-speech → pause_threshold (silence before phrase is sent)
const PAUSES = ["0.5s", "0.8s", "1.2s", "1.5s", "2s", "3s"] as const;
type Pause = (typeof PAUSES)[number];
const PAUSE_MAP: Record<Pause, number> = {
  "0.5s": 0.5,
  "0.8s": 0.8,
  "1.2s": 1.2,
  "1.5s": 1.5,
  "2s": 2.0,
  "3s": 3.0,
};

/** Typewriter delay for AI messages — paced to feel deliberate */
const CHAR_DELAY_MS = 22;
/** Typewriter delay for user messages — faster, feels like live dictation */
const USER_CHAR_DELAY_MS = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ActiveIncident {
  type: "fall";
  personId?: number;
  ar?: number;
  downDuration?: number;
}

interface Props {
  isAuthorized: boolean;
  transcript: VoiceEntry[]; // all entries (user + AI), already committed
  callActive: boolean;
  onCallStart: (
    lang: Language,
    speed: Speed,
    sensitivity: number,
    pauseAfter: number,
  ) => Promise<void>;
  onCallStop: () => Promise<void>;
  language: Language;
  speed: Speed;
  onCallSettings: (
    lang: Language,
    speed: Speed,
    sensitivity: number,
    pauseAfter: number,
  ) => Promise<void>;
  activeIncident: ActiveIncident | null;
  incidentUnlocked: boolean; // true once first incident fires this session
  isThinking: boolean; // AI is generating → show "..." dots
  micListening: boolean; // mic is open (waiting or capturing)
  micSpeaking: boolean; // VAD has detected speech — user is talking
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatPanel({
  isAuthorized,
  transcript,
  callActive,
  onCallStart,
  onCallStop,
  language,
  speed,
  onCallSettings,
  activeIncident,
  incidentUnlocked,
  isThinking,
  micListening,
  micSpeaking,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Local picker state — synced from props but editable locally before confirming
  const [localLang, setLocalLang] = useState<Language>(language);
  const [localSpeed, setLocalSpeed] = useState<Speed>(speed);
  const [localSens, setLocalSens] = useState<Sensitivity>("Balanced");
  const [localPause, setLocalPause] = useState<Pause>("1.2s");

  // ── In-place typewriter state ─────────────────────────────────────────────
  // Tracks the timestamp of the entry currently being animated + how many
  // chars have been revealed. Works for both user and assistant messages.
  const [animatingTs, setAnimatingTs] = useState<number | null>(null);
  const [displayedLen, setDisplayedLen] = useState(0);
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLastTs = useRef<number | null>(null);

  // ── Sync pickers when parent changes ─────────────────────────────────────
  useEffect(() => setLocalLang(language), [language]);
  useEffect(() => setLocalSpeed(speed), [speed]);

  // ── Typewriter: animate every new message (user = fast, AI = paced) ──────
  useEffect(() => {
    const lastEntry = transcript[transcript.length - 1];
    if (!lastEntry) return;
    if (lastEntry.timestamp === prevLastTs.current) return;
    prevLastTs.current = lastEntry.timestamp;

    if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    setAnimatingTs(lastEntry.timestamp);
    setDisplayedLen(0);

    let len = 0;
    const totalLen = lastEntry.text.length;
    const delay =
      lastEntry.speaker === "user" ? USER_CHAR_DELAY_MS : CHAR_DELAY_MS;

    animIntervalRef.current = setInterval(() => {
      len++;
      setDisplayedLen(len);
      if (len >= totalLen) {
        clearInterval(animIntervalRef.current!);
        animIntervalRef.current = null;
        setAnimatingTs(null);
      }
    }, delay);

    return () => {
      if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, isThinking, micListening, displayedLen]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleLangChange(lang: Language) {
    setLocalLang(lang);
    onCallSettings(
      lang,
      localSpeed,
      SENSITIVITY_MAP[localSens],
      PAUSE_MAP[localPause],
    );
  }

  function handleSpeedChange(spd: Speed) {
    setLocalSpeed(spd);
    onCallSettings(
      localLang,
      spd,
      SENSITIVITY_MAP[localSens],
      PAUSE_MAP[localPause],
    );
  }

  function handleSensChange(sens: Sensitivity) {
    setLocalSens(sens);
    onCallSettings(
      localLang,
      localSpeed,
      SENSITIVITY_MAP[sens],
      PAUSE_MAP[localPause],
    );
  }

  function handlePauseChange(pause: Pause) {
    setLocalPause(pause);
    onCallSettings(
      localLang,
      localSpeed,
      SENSITIVITY_MAP[localSens],
      PAUSE_MAP[pause],
    );
  }

  const hasTranscript = transcript.length > 0 || isThinking;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className='bg-surface border border-line rounded flex flex-col h-full overflow-hidden'>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className='shrink-0 flex items-center justify-between px-3 py-2 border-b border-line'>
        <div className='flex items-center gap-1.5'>
          <Mic size={11} className='text-accent' />
          <span className='section-label'>Paladin</span>
        </div>
        <div className='flex items-center gap-2'>
          {callActive && (
            <span className='flex items-center gap-1'>
              <span className='w-1.5 h-1.5 rounded-full bg-danger animate-pulse' />
              <span className='section-label text-danger'>live</span>
            </span>
          )}
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
              isAuthorized ? "bg-success/10" : "bg-warning/10"
            }`}
          >
            {isAuthorized ? (
              <ShieldCheck size={10} className='text-success' />
            ) : (
              <ShieldOff size={10} className='text-warning' />
            )}
            <span
              className={`section-label ${isAuthorized ? "text-success" : "text-warning"}`}
            >
              {isAuthorized ? "authorized" : "unauthorized"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {!incidentUnlocked ? (
        /* ── LOCKED: no incident has fired yet ─────────────────────────── */
        <div className='flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center'>
          <div className='w-10 h-10 rounded-full bg-line flex items-center justify-center'>
            <Lock size={16} className='text-fg-muted' />
          </div>
          <div>
            <p className='text-xs font-medium text-fg'>Waiting for emergency</p>
            <p className='text-[10px] text-fg-muted mt-0.5'>
              Paladin voice assistant will automatically activate when an
              incident is detected.
            </p>
          </div>
        </div>
      ) : !callActive && !hasTranscript ? (
        /* ── IDLE: incident unlocked, call not yet started ──────────────── */
        <div className='flex-1 flex flex-col items-center justify-center gap-3 px-4'>
          {/* Incident badge */}
          {activeIncident && (
            <div
              className={`w-full rounded border px-3 py-2 flex flex-col gap-1 ${
                activeIncident.type === "fall"
                  ? "bg-danger/5 border-danger/20"
                  : "bg-warning/5 border-warning/20"
              }`}
            >
              <div className='flex items-center gap-1.5'>
                <AlertTriangle size={11} className='text-danger shrink-0' />
                <span className='text-[10px] font-semibold uppercase tracking-wide text-danger'>
                  Fall detected
                </span>
              </div>
              {
                <div className='flex items-center gap-3 pl-0.5'>
                  {activeIncident.personId !== undefined && (
                    <span className='font-mono text-[10px] text-fg-muted'>
                      Person{" "}
                      <span className='text-fg'>{activeIncident.personId}</span>
                    </span>
                  )}
                  {activeIncident.ar !== undefined && (
                    <span className='font-mono text-[10px] text-fg-muted'>
                      AR{" "}
                      <span className='text-fg'>
                        {activeIncident.ar.toFixed(2)}
                      </span>
                    </span>
                  )}
                  {activeIncident.downDuration !== undefined && (
                    <span className='font-mono text-[10px] text-fg-muted'>
                      Down{" "}
                      <span className='text-fg'>
                        {activeIncident.downDuration.toFixed(1)}s
                      </span>
                    </span>
                  )}
                </div>
              }
              <p className='text-[10px] text-fg-muted pl-0.5'>
                Bot will be briefed on this incident
              </p>
            </div>
          )}

          {/* Language picker */}
          <select
            value={localLang}
            onChange={(e) => setLocalLang(e.target.value as Language)}
            className='bg-page border border-line rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-info transition-colors cursor-pointer'
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          {/* Speed selector */}
          <div className='flex items-center gap-1.5 flex-wrap justify-center'>
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setLocalSpeed(s)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                  localSpeed === s
                    ? "bg-accent/15 border-accent/40 text-accent"
                    : "bg-transparent border-line text-fg-muted hover:text-fg hover:border-line-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Voice Detection (WebRTC VAD) settings */}
          <div className='w-full border-t border-line/50 pt-2.5 flex flex-col gap-2'>
            <div className='flex items-center justify-center gap-1.5'>
              <p className='text-[10px] text-fg-muted uppercase tracking-wide'>
                Voice Detection Threshold
              </p>
              <span className='text-[9px] font-mono text-fg-muted/60 bg-line/60 px-1 py-0.5 rounded'>
                WebRTC VAD
              </span>
            </div>

            {/* VAD aggressiveness / sensitivity */}
            <div className='flex flex-col gap-1'>
              <p className='text-[10px] text-fg-muted pl-0.5'>Sensitivity</p>
              <div className='grid grid-cols-2 gap-1'>
                {SENSITIVITIES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setLocalSens(s)}
                    className={`flex flex-col items-start px-2 py-1 rounded border cursor-pointer transition-colors ${
                      localSens === s
                        ? "bg-info/15 border-info/40 text-info"
                        : "bg-transparent border-line text-fg-muted hover:text-fg hover:border-line-muted"
                    }`}
                  >
                    <span className='text-[10px] font-medium'>{s}</span>
                    <span
                      className={`text-[9px] leading-tight ${localSens === s ? "text-info/70" : "text-fg-muted/60"}`}
                    >
                      {SENSITIVITY_HINT[s]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pause after speech — maps to VAD silence_secs */}
            <div className='flex flex-col gap-1'>
              <p className='text-[10px] text-fg-muted pl-0.5'>
                Silence before send
              </p>
              <div className='flex items-center gap-1 flex-wrap'>
                {PAUSES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setLocalPause(p)}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
                      localPause === p
                        ? "bg-info/15 border-info/40 text-info"
                        : "bg-transparent border-line text-fg-muted hover:text-fg"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <p className='text-[9px] text-fg-muted/60 pl-0.5'>
                Silence duration after your voice stops before sending
              </p>
            </div>
          </div>

          {/* Call button */}
          <button
            onClick={() =>
              onCallStart(
                localLang,
                localSpeed,
                SENSITIVITY_MAP[localSens],
                PAUSE_MAP[localPause],
              )
            }
            className={`relative flex items-center justify-center w-14 h-14 rounded-full cursor-pointer transition-all hover:scale-105 active:scale-95 ${
              activeIncident
                ? "bg-danger/15 border border-danger/30 hover:bg-danger/25"
                : "bg-success/15 border border-success/30 hover:bg-success/25"
            }`}
          >
            <span
              className={`absolute inset-0 rounded-full animate-ping opacity-40 ${
                activeIncident ? "bg-danger/20" : "bg-success/20"
              }`}
            />
            <Phone
              size={22}
              className={
                activeIncident ? "text-danger z-10" : "text-success z-10"
              }
            />
          </button>

          <div className='text-center'>
            <p className='text-xs font-medium text-fg'>
              {activeIncident ? "Brief AI on incident" : "Start voice call"}
            </p>
            <p className='text-[10px] text-fg-muted mt-0.5'>
              {activeIncident
                ? isAuthorized
                  ? "Clinical guidance · incident aware"
                  : "Emergency guidance · incident aware"
                : isAuthorized
                  ? "Clinical guidance enabled"
                  : "Emergency contacts mode"}
            </p>
          </div>
        </div>
      ) : (
        /* ── ACTIVE / HAS HISTORY: transcript area ──────────────────────── */
        <div
          ref={scrollRef}
          className='flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 px-2.5 py-2'
        >
          {transcript.map((entry, i) => {
            // Latest entry (user or AI) gets the typewriter treatment
            const isAnimating = entry.timestamp === animatingTs;
            const text = isAnimating
              ? entry.text.slice(0, displayedLen)
              : entry.text;

            return (
              <div
                key={i}
                className={`flex gap-1 items-start ${entry.speaker === "user" ? "justify-end" : ""}`}
              >
                {entry.speaker === "assistant" && (
                  <Bot size={11} className='text-accent shrink-0 mt-0.5' />
                )}
                <p
                  className={`text-[11px] leading-snug text-fg px-2 py-1 rounded-lg max-w-[88%] ${
                    entry.speaker === "user"
                      ? "bg-info/15 rounded-br-none"
                      : "bg-accent/10 rounded-bl-none"
                  }`}
                >
                  {text}
                  {isAnimating && (
                    <span
                      className='inline-block w-0.5 h-3 ml-0.5 animate-pulse align-middle'
                      style={{
                        background:
                          entry.speaker === "user"
                            ? "var(--color-info)"
                            : "var(--color-accent)",
                      }}
                    />
                  )}
                </p>
                {entry.speaker === "user" && (
                  <User size={11} className='text-info shrink-0 mt-0.5' />
                )}
              </div>
            );
          })}

          {/* Thinking dots — shown while AI is generating */}
          {isThinking && (
            <div className='flex gap-1 items-start'>
              <Bot size={11} className='text-accent shrink-0 mt-0.5' />
              <div className='bg-accent/10 rounded-lg rounded-bl-none px-3 py-2'>
                <ThinkingDots />
              </div>
            </div>
          )}

          {/* Mic indicator — static dot while waiting, waveform only when speech is detected */}
          {micListening && !isThinking && (
            <div className='flex gap-2 items-center justify-end'>
              {micSpeaking ? (
                <ListeningWaveform />
              ) : (
                <>
                  <span className='text-[10px] text-fg-muted/60 italic'>
                    listening…
                  </span>
                  <span className='w-1.5 h-1.5 rounded-full bg-fg-muted/40 animate-pulse' />
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom bar ───────────────────────────────────────────────────── */}
      {incidentUnlocked && (
        <div className='shrink-0 border-t border-line px-3 py-2'>
          {callActive ? (
            /* ── Active call controls ──────────────────────────────────── */
            <div className='flex flex-col gap-1.5'>
              {/* Row 1: mic indicator + language + speed + end */}
              <div className='flex items-center justify-between gap-2'>
                <div className='flex items-center gap-1.5'>
                  <div className='relative w-7 h-7 flex items-center justify-center'>
                    <span className='absolute inset-0 rounded-full bg-danger/10 animate-ping' />
                    <Mic size={13} className='text-danger z-10' />
                  </div>
                  <span className='text-[10px] text-fg-muted'>Listening…</span>
                </div>
                <select
                  value={localLang}
                  onChange={(e) => handleLangChange(e.target.value as Language)}
                  className='bg-page border border-line rounded px-1.5 py-1 text-[10px] text-fg outline-none focus:border-info transition-colors cursor-pointer'
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <select
                  value={localSpeed}
                  onChange={(e) => handleSpeedChange(e.target.value as Speed)}
                  className='bg-page border border-line rounded px-1.5 py-1 text-[10px] font-mono text-fg outline-none focus:border-info transition-colors cursor-pointer'
                >
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  onClick={onCallStop}
                  className='flex items-center gap-1 bg-danger/15 hover:bg-danger/25 border border-danger/30 rounded-full px-2.5 py-1.5 cursor-pointer transition-all active:scale-95'
                >
                  <PhoneOff size={11} className='text-danger' />
                  <span className='text-[10px] font-semibold text-danger'>
                    End
                  </span>
                </button>
              </div>
              {/* Row 2: VAD sensitivity + silence threshold */}
              <div className='flex items-center gap-1.5'>
                <span className='text-[9px] font-mono text-fg-muted/60 shrink-0 bg-line/60 px-1 py-0.5 rounded'>
                  VAD
                </span>
                <select
                  value={localSens}
                  onChange={(e) =>
                    handleSensChange(e.target.value as Sensitivity)
                  }
                  className='bg-page border border-line rounded px-1.5 py-1 text-[10px] text-fg outline-none focus:border-info transition-colors cursor-pointer flex-1'
                >
                  {SENSITIVITIES.map((s) => (
                    <option key={s} value={s}>
                      {s} — {SENSITIVITY_HINT[s]}
                    </option>
                  ))}
                </select>
                <select
                  value={localPause}
                  onChange={(e) => handlePauseChange(e.target.value as Pause)}
                  className='bg-page border border-line rounded px-1.5 py-1 text-[10px] font-mono text-fg outline-none focus:border-info transition-colors cursor-pointer'
                >
                  {PAUSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : hasTranscript ? (
            /* ── Idle with history: compact restart row ────────────────── */
            <div className='flex items-center justify-between gap-2'>
              <select
                value={localLang}
                onChange={(e) => setLocalLang(e.target.value as Language)}
                className='bg-page border border-line rounded px-2 py-1 text-[10px] text-fg outline-none focus:border-info transition-colors cursor-pointer'
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={localSpeed}
                onChange={(e) => setLocalSpeed(e.target.value as Speed)}
                className='bg-page border border-line rounded px-2 py-1 text-[10px] font-mono text-fg outline-none focus:border-info transition-colors cursor-pointer'
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  onCallStart(
                    localLang,
                    localSpeed,
                    SENSITIVITY_MAP[localSens],
                    PAUSE_MAP[localPause],
                  )
                }
                className='flex items-center gap-1.5 bg-success/15 hover:bg-success/25 border border-success/30 rounded-full px-3 py-1.5 cursor-pointer transition-all active:scale-95'
              >
                <Phone size={11} className='text-success' />
                <span className='text-[10px] font-semibold text-success'>
                  New Call
                </span>
              </button>
            </div>
          ) : (
            /* ── Idle, no history ──────────────────────────────────────── */
            <div className='flex items-center gap-1.5'>
              <MicOff size={10} className='text-fg-muted' />
              <span className='text-[10px] text-fg-muted'>
                {isAuthorized
                  ? "Voice only · clinical guidance"
                  : "Voice only · emergency contacts"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ThinkingDots — animated "..." while AI is generating a reply
// ─────────────────────────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <span className='flex items-center gap-1 h-3'>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className='w-1.5 h-1.5 rounded-full bg-accent/60'
          style={{
            animation: "thinking-dot 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ListeningWaveform — animated audio-bar visualiser shown while WebRTC VAD
// is actively monitoring the microphone between AI turns.
//
// 7 bars with staggered vad-bar keyframe delays produce an equaliser-style
// animation that communicates "mic is open and processing audio frames"
// without requiring any real audio level data from the backend.
// ─────────────────────────────────────────────────────────────────────────────
function ListeningWaveform() {
  // Stagger amounts chosen so bars reach their peak height at different times,
  // giving the impression of a live audio signal rather than a synchronized pulse.
  const delays = [0, 0.13, 0.26, 0.1, 0.22, 0.05, 0.18];

  return (
    <div
      className='flex items-end gap-[2.5px]'
      style={{ height: 14 }}
      aria-label='Listening'
    >
      {delays.map((delay, i) => (
        <span
          key={i}
          className='w-[2.5px] rounded-full bg-danger/75'
          style={{
            animation: "vad-bar 0.85s ease-in-out infinite",
            animationDelay: `${delay}s`,
            // Starting height ensures bars are visible before animation kicks in
            height: 4,
          }}
        />
      ))}
    </div>
  );
}

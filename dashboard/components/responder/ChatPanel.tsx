"use client";

import { useRef, useEffect, useState } from "react";
import {
  Mic, MicOff, Phone, PhoneOff, Bot, User,
  ShieldCheck, ShieldOff, AlertTriangle, Siren, Lock,
} from "lucide-react";
import type { VoiceEntry } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGES = ["English", "Thai", "Japanese", "Chinese"] as const;
type  Language  = (typeof LANGUAGES)[number];

const SPEEDS = ["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x"] as const;
type  Speed  = (typeof SPEEDS)[number];

/** Typewriter delay (ms per character). Fixed — keeps text readable regardless of TTS speed. */
const CHAR_DELAY_MS = 22;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ActiveIncident {
  type:          "fall" | "sos";
  personId?:     number;
  ar?:           number;
  downDuration?: number;
}

interface Props {
  isAuthorized:     boolean;
  transcript:       VoiceEntry[];   // all entries (user + AI), already committed
  callActive:       boolean;
  onCallStart:      (lang: Language, speed: Speed) => Promise<void>;
  onCallStop:       () => Promise<void>;
  language:         Language;
  speed:            Speed;
  onCallSettings:   (lang: Language, speed: Speed) => Promise<void>;
  activeIncident:   ActiveIncident | null;
  incidentUnlocked: boolean;        // true once first incident fires this session
  isThinking:       boolean;        // AI is generating → show "..." dots
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
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Local picker state — synced from props but editable locally before confirming
  const [localLang,  setLocalLang]  = useState<Language>(language);
  const [localSpeed, setLocalSpeed] = useState<Speed>(speed);

  // ── In-place typewriter state ─────────────────────────────────────────────
  // We track the timestamp of the AI entry currently being animated and how
  // many characters have been revealed. When the latest AI message changes
  // (new timestamp), we restart the animation for that entry only.
  const [animatingTs,  setAnimatingTs]  = useState<number | null>(null);
  const [displayedLen, setDisplayedLen] = useState(0);
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLastAITs    = useRef<number | null>(null);

  // ── Sync pickers when parent changes ─────────────────────────────────────
  useEffect(() => setLocalLang(language),  [language]);
  useEffect(() => setLocalSpeed(speed), [speed]);

  // ── Start typewriter when a new AI entry lands in transcript ─────────────
  useEffect(() => {
    // Find the most-recent assistant entry
    const lastAI = [...transcript].reverse().find((e) => e.speaker === "assistant");
    if (!lastAI) return;
    // Skip if it's the same entry we already animated
    if (lastAI.timestamp === prevLastAITs.current) return;
    prevLastAITs.current = lastAI.timestamp;

    // Clear any previous animation
    if (animIntervalRef.current) clearInterval(animIntervalRef.current);

    setAnimatingTs(lastAI.timestamp);
    setDisplayedLen(0);

    let len = 0;
    const totalLen = lastAI.text.length;

    animIntervalRef.current = setInterval(() => {
      len++;
      setDisplayedLen(len);
      if (len >= totalLen) {
        clearInterval(animIntervalRef.current!);
        animIntervalRef.current = null;
        setAnimatingTs(null); // animation complete — render full text normally
      }
    }, CHAR_DELAY_MS);

    return () => {
      if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, isThinking, displayedLen]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleLangChange(lang: Language) {
    setLocalLang(lang);
    onCallSettings(lang, localSpeed);
  }

  function handleSpeedChange(spd: Speed) {
    setLocalSpeed(spd);
    onCallSettings(localLang, spd);
  }

  const hasTranscript = transcript.length > 0 || isThinking;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-surface border border-line rounded flex flex-col h-full overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-line">
        <div className="flex items-center gap-1.5">
          <Mic size={11} className="text-accent" />
          <span className="section-label">Voice Assistant</span>
        </div>
        <div className="flex items-center gap-2">
          {callActive && (
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
              <span className="section-label text-danger">live</span>
            </span>
          )}
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
            isAuthorized ? "bg-success/10" : "bg-warning/10"
          }`}>
            {isAuthorized
              ? <ShieldCheck size={10} className="text-success" />
              : <ShieldOff   size={10} className="text-warning" />}
            <span className={`section-label ${isAuthorized ? "text-success" : "text-warning"}`}>
              {isAuthorized ? "authorized" : "unauthorized"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {!incidentUnlocked ? (

        /* ── LOCKED: no incident has fired yet ─────────────────────────── */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <div className="w-10 h-10 rounded-full bg-line flex items-center justify-center">
            <Lock size={16} className="text-fg-muted" />
          </div>
          <div>
            <p className="text-xs font-medium text-fg">Waiting for emergency</p>
            <p className="text-[10px] text-fg-muted mt-0.5">
              Voice assistant activates when a fall or SOS is detected
            </p>
          </div>
        </div>

      ) : !callActive && !hasTranscript ? (

        /* ── IDLE: incident unlocked, call not yet started ──────────────── */
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">

          {/* Incident badge */}
          {activeIncident && (
            <div className={`w-full rounded border px-3 py-2 flex flex-col gap-1 ${
              activeIncident.type === "fall"
                ? "bg-danger/5 border-danger/20"
                : "bg-warning/5 border-warning/20"
            }`}>
              <div className="flex items-center gap-1.5">
                {activeIncident.type === "fall"
                  ? <AlertTriangle size={11} className="text-danger shrink-0" />
                  : <Siren         size={11} className="text-warning shrink-0" />}
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                  activeIncident.type === "fall" ? "text-danger" : "text-warning"
                }`}>
                  {activeIncident.type === "fall" ? "Fall detected" : "SOS alert"}
                </span>
              </div>
              {activeIncident.type === "fall" && (
                <div className="flex items-center gap-3 pl-0.5">
                  {activeIncident.personId !== undefined && (
                    <span className="font-mono text-[10px] text-fg-muted">
                      Person <span className="text-fg">{activeIncident.personId}</span>
                    </span>
                  )}
                  {activeIncident.ar !== undefined && (
                    <span className="font-mono text-[10px] text-fg-muted">
                      AR <span className="text-fg">{activeIncident.ar.toFixed(2)}</span>
                    </span>
                  )}
                  {activeIncident.downDuration !== undefined && (
                    <span className="font-mono text-[10px] text-fg-muted">
                      Down <span className="text-fg">{activeIncident.downDuration.toFixed(1)}s</span>
                    </span>
                  )}
                </div>
              )}
              <p className="text-[10px] text-fg-muted pl-0.5">Bot will be briefed on this incident</p>
            </div>
          )}

          {/* Language picker */}
          <select
            value={localLang}
            onChange={(e) => setLocalLang(e.target.value as Language)}
            className="bg-page border border-line rounded px-2.5 py-1.5 text-xs text-fg outline-none focus:border-info transition-colors cursor-pointer"
          >
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>

          {/* Speed selector */}
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
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

          {/* Call button */}
          <button
            onClick={() => onCallStart(localLang, localSpeed)}
            className={`relative flex items-center justify-center w-14 h-14 rounded-full cursor-pointer transition-all hover:scale-105 active:scale-95 ${
              activeIncident
                ? "bg-danger/15 border border-danger/30 hover:bg-danger/25"
                : "bg-success/15 border border-success/30 hover:bg-success/25"
            }`}
          >
            <span className={`absolute inset-0 rounded-full animate-ping opacity-40 ${
              activeIncident ? "bg-danger/20" : "bg-success/20"
            }`} />
            <Phone size={22} className={activeIncident ? "text-danger z-10" : "text-success z-10"} />
          </button>

          <div className="text-center">
            <p className="text-xs font-medium text-fg">
              {activeIncident ? "Brief AI on incident" : "Start voice call"}
            </p>
            <p className="text-[10px] text-fg-muted mt-0.5">
              {activeIncident
                ? isAuthorized ? "Clinical guidance · incident aware" : "Emergency guidance · incident aware"
                : isAuthorized ? "Clinical guidance enabled" : "Emergency contacts mode"}
            </p>
          </div>
        </div>

      ) : (

        /* ── ACTIVE / HAS HISTORY: transcript area ──────────────────────── */
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 px-2.5 py-2"
        >
          {transcript.map((entry, i) => {
            // Latest AI entry gets the typewriter treatment
            const isAnimating =
              entry.speaker === "assistant" &&
              entry.timestamp === animatingTs;
            const text = isAnimating
              ? entry.text.slice(0, displayedLen)
              : entry.text;

            return (
              <div
                key={i}
                className={`flex gap-1 items-start ${entry.speaker === "user" ? "justify-end" : ""}`}
              >
                {entry.speaker === "assistant" && (
                  <Bot size={11} className="text-accent shrink-0 mt-0.5" />
                )}
                <p className={`text-[11px] leading-snug text-fg px-2 py-1 rounded-lg max-w-[88%] ${
                  entry.speaker === "user"
                    ? "bg-info/15 rounded-br-none"
                    : "bg-accent/10 rounded-bl-none"
                }`}>
                  {text}
                  {isAnimating && (
                    <span className="inline-block w-0.5 h-3 bg-accent ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
                {entry.speaker === "user" && (
                  <User size={11} className="text-info shrink-0 mt-0.5" />
                )}
              </div>
            );
          })}

          {/* Thinking dots — shown while AI is generating */}
          {isThinking && (
            <div className="flex gap-1 items-start">
              <Bot size={11} className="text-accent shrink-0 mt-0.5" />
              <div className="bg-accent/10 rounded-lg rounded-bl-none px-3 py-2">
                <ThinkingDots />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom bar ───────────────────────────────────────────────────── */}
      {incidentUnlocked && (
        <div className="shrink-0 border-t border-line px-3 py-2">
          {callActive ? (

            /* ── Active call controls ──────────────────────────────────── */
            <div className="flex items-center justify-between gap-2">

              {/* Pulsing mic indicator */}
              <div className="flex items-center gap-1.5">
                <div className="relative w-7 h-7 flex items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-danger/10 animate-ping" />
                  <Mic size={13} className="text-danger z-10" />
                </div>
                <span className="text-[10px] text-fg-muted">Listening…</span>
              </div>

              {/* Mid-call language selector */}
              <select
                value={localLang}
                onChange={(e) => handleLangChange(e.target.value as Language)}
                className="bg-page border border-line rounded px-1.5 py-1 text-[10px] text-fg outline-none focus:border-info transition-colors cursor-pointer"
              >
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>

              {/* Mid-call speed selector */}
              <select
                value={localSpeed}
                onChange={(e) => handleSpeedChange(e.target.value as Speed)}
                className="bg-page border border-line rounded px-1.5 py-1 text-[10px] font-mono text-fg outline-none focus:border-info transition-colors cursor-pointer"
              >
                {SPEEDS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>

              {/* End call button */}
              <button
                onClick={onCallStop}
                className="flex items-center gap-1 bg-danger/15 hover:bg-danger/25 border border-danger/30 rounded-full px-2.5 py-1.5 cursor-pointer transition-all active:scale-95"
              >
                <PhoneOff size={11} className="text-danger" />
                <span className="text-[10px] font-semibold text-danger">End</span>
              </button>
            </div>

          ) : hasTranscript ? (

            /* ── Idle with history: compact restart row ────────────────── */
            <div className="flex items-center justify-between gap-2">
              <select
                value={localLang}
                onChange={(e) => setLocalLang(e.target.value as Language)}
                className="bg-page border border-line rounded px-2 py-1 text-[10px] text-fg outline-none focus:border-info transition-colors cursor-pointer"
              >
                {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select
                value={localSpeed}
                onChange={(e) => setLocalSpeed(e.target.value as Speed)}
                className="bg-page border border-line rounded px-2 py-1 text-[10px] font-mono text-fg outline-none focus:border-info transition-colors cursor-pointer"
              >
                {SPEEDS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={() => onCallStart(localLang, localSpeed)}
                className="flex items-center gap-1.5 bg-success/15 hover:bg-success/25 border border-success/30 rounded-full px-3 py-1.5 cursor-pointer transition-all active:scale-95"
              >
                <Phone size={11} className="text-success" />
                <span className="text-[10px] font-semibold text-success">New Call</span>
              </button>
            </div>

          ) : (

            /* ── Idle, no history ──────────────────────────────────────── */
            <div className="flex items-center gap-1.5">
              <MicOff size={10} className="text-fg-muted" />
              <span className="text-[10px] text-fg-muted">
                {isAuthorized ? "Voice only · clinical guidance" : "Voice only · emergency contacts"}
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
    <span className="flex items-center gap-1 h-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-accent/60"
          style={{
            animation:      "thinking-dot 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  );
}

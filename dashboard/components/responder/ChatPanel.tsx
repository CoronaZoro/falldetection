"use client";

import { useRef, useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  User,
  ShieldCheck,
  ShieldOff,
  AlertTriangle,
  Lock,
  Volume2,
  Square,
} from "lucide-react";

function ChessKnight({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      stroke-width='1'
      stroke-linecap='round'
      stroke-linejoin='round'
      className='lucide lucide-chess-knight-icon lucide-chess-knight text-accent'
    >
      <path d='M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z' />
      <path d='M16.5 18c1-2 2.5-5 2.5-9a7 7 0 0 0-7-7H6.635a1 1 0 0 0-.768 1.64L7 5l-2.32 5.802a2 2 0 0 0 .95 2.526l2.87 1.456' />
      <path d='m15 5 1.425-1.425' />
      <path d='m17 8 1.53-1.53' />
      <path d='M9.713 12.185 7 18' />
    </svg>
  );
}
import type { VoiceEntry } from "@/types";

const LANGUAGES = ["English", "Thai", "Japanese", "Chinese"] as const;
type Language = (typeof LANGUAGES)[number];

const SPEEDS = ["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x"] as const;
type Speed = (typeof SPEEDS)[number];

const SENSITIVITIES = ["Sensitive", "Balanced", "Clear", "Strict"] as const;
type Sensitivity = (typeof SENSITIVITIES)[number];
const SENSITIVITY_MAP: Record<Sensitivity, number> = {
  Sensitive: 100,
  Balanced: 300,
  Clear: 600,
  Strict: 1200,
};
const SENSITIVITY_HINT: Record<Sensitivity, string> = {
  Sensitive: "Soft voices · quiet room",
  Balanced: "Normal speech · indoors",
  Clear: "Clear speech · some noise",
  Strict: "Loud speech · noisy room",
};

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

const USER_CHAR_DELAY_MS = 12;

const SPEED_CHAR_DELAY_MS: Record<string, number> = {
  "0.5x": 135,
  "0.75x": 90,
  "1x": 60,
  "1.25x": 40,
  "1.5x": 20,
  "2x": 10,
};
const DEFAULT_CHAR_DELAY_MS = 44;

interface ActiveIncident {
  type: "fall";
  personId?: number;
  ar?: number;
  downDuration?: number;
}

interface Props {
  isAuthorized: boolean;
  transcript: VoiceEntry[];
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
  incidentUnlocked: boolean;
  isThinking: boolean;
  isPreparingAudio: boolean;
  micListening: boolean;
  micSpeaking: boolean;
  micMuted: boolean;
  onToggleMute: () => Promise<void>;
  isSpeakingAudio: boolean;
  onStopSpeech: () => Promise<void>;
}

const Chevron = () => (
  <svg
    className='pointer-events-none absolute right-3 top-4/7 -translate-y-1/2 opacity-60'
    width='10'
    height='6'
    viewBox='0 0 10 6'
    fill='none'
  >
    <path
      d='M1 1l4 4 4-4'
      stroke='currentColor'
      strokeWidth='1.2'
      strokeLinecap='round'
      strokeLinejoin='round'
    />
  </svg>
);

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
  isPreparingAudio,
  micListening,
  micSpeaking,
  micMuted,
  onToggleMute,
  isSpeakingAudio,
  onStopSpeech,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [localLang, setLocalLang] = useState<Language>(language);
  const [localSpeed, setLocalSpeed] = useState<Speed>(speed);
  const [localSens, setLocalSens] = useState<Sensitivity>("Balanced");
  const [localPause, setLocalPause] = useState<Pause>("1.2s");

  const [animatingTs, setAnimatingTs] = useState<number | null>(null);
  const [displayedLen, setDisplayedLen] = useState(0);
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLastTs = useRef<number | null>(null);

  useEffect(() => setLocalLang(language), [language]);
  useEffect(() => setLocalSpeed(speed), [speed]);

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
      lastEntry.speaker === "user"
        ? USER_CHAR_DELAY_MS
        : (SPEED_CHAR_DELAY_MS[lastEntry.speed ?? ""] ?? DEFAULT_CHAR_DELAY_MS);

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

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, isThinking, isPreparingAudio, micListening, displayedLen]);

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

  const hasTranscript = transcript.length > 0 || isThinking || isPreparingAudio;

  return (
    <div className='bg-surface border border-line rounded flex flex-col h-full overflow-hidden'>
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className='shrink-0 flex items-center justify-between px-3 py-2 border-b border-line bg-elevated/40'>
        <div className='flex items-center gap-3 py-1 rounded-md'>
          <div className='w-6 h-6 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center'>
            <ChessKnight size={16} />
          </div>
          <span className='text-[16px] font-semibold text-fg/70 tracking-wide uppercase'>
            Paladin
            <br />
            <span className='text-[10px] font-light text-fg-muted/70 tracking-wide uppercase'>
              Emergency Assistant
            </span>
          </span>
        </div>
        <div className='flex items-center gap-1.5'>
          {callActive && (
            <span className='flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-danger/10 border border-danger/20 hidden'>
              <span className='w-1.5 h-1.5 rounded-full bg-danger animate-pulse' />
              <span className='text-[9px] font-semibold text-danger uppercase tracking-wide'>
                live
              </span>
            </span>
          )}
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
              isAuthorized
                ? "bg-success/10 border border-success/20"
                : "bg-warning/10 border border-warning/20"
            }`}
          >
            {isAuthorized ? (
              <ShieldCheck size={9} className='text-success' />
            ) : (
              <ShieldOff size={9} className='text-warning' />
            )}
            <span
              className={`text-[9px] font-semibold uppercase tracking-wide ${isAuthorized ? "text-success" : "text-warning"}`}
            >
              {isAuthorized ? "authorized personnel" : "unauthorized personnel"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {!incidentUnlocked ? (
        <div className='flex-1 flex flex-col items-center justify-center gap-3 px-5 text-center bg-page'>
          <div className='w-11 h-11 rounded-full flex items-center justify-center border-1 border-line/50 bg-line/30'>
            <ChessKnight size={20} />
          </div>
          <div>
            <p className='text-xs font-semibold text-fg/70'>
              Standby : Actively Monitoring
            </p>
            <p className='text-[10px] text-fg-muted/60 mt-1 leading-relaxed'>
              Paladin activates automatically
              <br />
              when an incident is detected.
            </p>
          </div>
        </div>
      ) : !callActive && !hasTranscript ? (
        <div className='flex-1 flex flex-col justify-between px-3 py-3 gap-3 overflow-y-auto bg-page'>
          {/* ── Incident context badge ── */}
          {activeIncident ? (
            <div className='rounded-lg px-3 py-2.5 flex items-start gap-2.5 bg-danger/[0.07] border border-danger/20'>
              <div className='w-6 h-6 rounded-full bg-danger/15 flex items-center justify-center shrink-0 mt-0.5'>
                <AlertTriangle size={11} className='text-danger' />
              </div>
              <div className='flex-1 min-w-0'>
                <p className='text-[10px] font-semibold uppercase tracking-wider text-danger mb-1'>
                  Active incident
                </p>
                <div className='flex flex-wrap gap-x-3 gap-y-0.5'>
                  {activeIncident.personId !== undefined && (
                    <span className='font-mono text-[10px] text-fg-muted'>
                      Person{" "}
                      <span className='text-fg font-semibold'>
                        {activeIncident.personId}
                      </span>
                    </span>
                  )}
                  {activeIncident.ar !== undefined && (
                    <span className='font-mono text-[10px] text-fg-muted'>
                      AR{" "}
                      <span className='text-fg font-semibold'>
                        {activeIncident.ar.toFixed(2)}
                      </span>
                    </span>
                  )}
                  {activeIncident.downDuration !== undefined && (
                    <span className='font-mono text-[10px] text-fg-muted'>
                      Down{" "}
                      <span className='text-fg font-semibold'>
                        {activeIncident.downDuration.toFixed(1)}s
                      </span>
                    </span>
                  )}
                </div>
                <p className='text-[9px] text-fg-muted/60 mt-1'>
                  PALADIN is aware of the incident and will provide real-time
                  assistance.
                </p>
              </div>
            </div>
          ) : (
            <div className='rounded-lg px-3 py-2.5 flex items-center gap-2.5 bg-success/[0.05] border border-success/15'>
              <div className='w-6 h-6 rounded-full bg-success/10 flex items-center justify-center shrink-0'>
                <Phone size={11} className='text-success' />
              </div>
              <div>
                <p className='text-[10px] font-semibold text-fg'>
                  Voice assistant ready
                </p>
                <p className='text-[9px] text-fg-muted/70 mt-0.5'>
                  {isAuthorized
                    ? "Clinical guidance enabled"
                    : "Emergency contacts mode"}
                </p>
              </div>
            </div>
          )}

          {/* ── Call button ── */}
          <div className='flex flex-col items-center gap-2'>
            <button
              onClick={() =>
                onCallStart(
                  localLang,
                  localSpeed,
                  SENSITIVITY_MAP[localSens],
                  PAUSE_MAP[localPause],
                )
              }
              className={`relative flex items-center justify-center w-12 h-12 rounded-full cursor-pointer transition-all hover:scale-105 active:scale-95 ${
                activeIncident
                  ? "bg-danger/15 border border-danger/30 hover:bg-danger/25"
                  : "bg-success/15 border border-success/30 hover:bg-success/25"
              }`}
            >
              <span
                className={`absolute inset-0 rounded-full animate-ping opacity-30 ${activeIncident ? "bg-danger/20" : "bg-success/20"}`}
              />
              <Phone
                size={18}
                className={
                  activeIncident ? "text-danger z-10" : "text-success z-10"
                }
              />
            </button>
            <p className='text-[10px] text-fg-muted'>
              {activeIncident
                ? "Brief AI on incident and ask for emergency assistance"
                : "Start voice call"}
            </p>
          </div>

          {/* ── Settings panel ── */}
          <div className='flex flex-col gap-0 w-full mx-auto overflow-hidden bg-surface rounded-lg'>
            {/* Header */}

            {/* Transcription */}
            <div className='px-3.5 py-2 flex flex-col gap-1.5'>
              <div className='flex gap-1.5 justify-evenly'>
                <div className='max-w-[75px] flex-1 flex flex-col gap-1 '>
                  <label className='text-[10px] text-fg/60 pl-2'>
                    Language
                  </label>
                  <div className='relative'>
                    <select
                      value={localLang}
                      onChange={(e) => setLocalLang(e.target.value as Language)}
                      className='w-full appearance-none rounded-md pl-2 pr-6 py-1.5 text-[11px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                    >
                      {LANGUAGES.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <Chevron />
                  </div>
                </div>
                <div className='max-w-[70px] flex-1 flex flex-col gap-1 '>
                  <label className='text-[10px] text-fg/60 pl-2'>Speed</label>
                  <div className='relative'>
                    <select
                      value={localSpeed}
                      onChange={(e) => setLocalSpeed(e.target.value as Speed)}
                      className='w-full appearance-none rounded-md pl-2 pr-6 py-1.5 text-[11px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                    >
                      {SPEEDS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <Chevron />
                  </div>
                </div>
                {/* webcrtvad settings */}
                <div className='flex-1 flex flex-col gap-1 max-w-[220px]'>
                  <label className='text-[10px] text-fg/60 pl-2'>
                    VAD Sensitivity
                  </label>
                  <div className='relative'>
                    <select
                      value={localSens}
                      onChange={(e) =>
                        setLocalSens(e.target.value as Sensitivity)
                      }
                      className='w-full appearance-none rounded-md pl-2 pr-6 py-1.5 text-[11px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                    >
                      {SENSITIVITIES.map((s) => (
                        <option key={s} value={s}>
                          <em>{s}</em> : {SENSITIVITY_HINT[s]}
                        </option>
                      ))}
                    </select>
                    <Chevron />
                  </div>
                </div>
                <div className='max-w-[70px] flex-1 flex flex-col gap-1 '>
                  <label className='text-[10px] text-fg/60 pl-2'>Pause</label>
                  <div className='relative'>
                    <select
                      value={localPause}
                      onChange={(e) => setLocalPause(e.target.value as Pause)}
                      className='w-full appearance-none rounded-md pl-2 pr-6 py-1.5 text-[11px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                    >
                      {PAUSES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <Chevron />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── ACTIVE / HAS HISTORY: transcript area ──────────────────────── */
        <div
          ref={scrollRef}
          className='flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5 px-2.5 py-2 bg-page'
        >
          {transcript.map((entry, i) => {
            const isAnimating = entry.timestamp === animatingTs;
            const text = isAnimating
              ? entry.text.slice(0, displayedLen)
              : entry.text;
            const isUser = entry.speaker === "user";
            const isLastAssistantSpeaking =
              !isUser && i === transcript.length - 1 && isSpeakingAudio;

            return (
              <div
                key={i}
                className={`flex gap-1.5 ${isUser ? "items-end justify-end" : "items-start"}`}
              >
                {!isUser && (
                  <div className='w-5 h-5 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0 mt-0.5'>
                    <ChessKnight size={9} />
                  </div>
                )}
                <div className='flex flex-col gap-1 max-w-[85%]'>
                  <div
                    className={`text-[11px] leading-relaxed text-fg px-2.5 py-1.5 ${
                      isUser
                        ? "bg-info/15 border border-info/20 rounded-2xl rounded-br-sm"
                        : "bg-elevated border border-line rounded-2xl rounded-bl-sm"
                    }`}
                  >
                    {text}
                    {isAnimating && (
                      <span
                        className='inline-block w-[2px] h-3 ml-0.5 rounded-full animate-pulse align-middle'
                        style={{
                          background: isUser
                            ? "var(--color-info)"
                            : "var(--color-accent)",
                        }}
                      />
                    )}
                  </div>
                  {isLastAssistantSpeaking && (
                    <button
                      onClick={onStopSpeech}
                      className='self-start flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] text-fg-muted/50 hover:text-danger/80 hover:bg-danger/8 border border-transparent hover:border-danger/20 transition-all cursor-pointer'
                    >
                      <Square size={7} fill='currentColor' />
                      stop
                    </button>
                  )}
                </div>
                {isUser && (
                  <div className='w-5 h-5 rounded-full bg-info/15 border border-info/25 flex items-center justify-center shrink-0 mb-0.5'>
                    <User size={9} className='text-info' />
                  </div>
                )}
              </div>
            );
          })}

          {isThinking && (
            <div className='flex gap-1.5 items-end'>
              <div className='w-5 h-5 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0'>
                <ChessKnight size={9} />
              </div>
              <div className='bg-elevated border border-line rounded-2xl rounded-bl-sm px-3 py-2'>
                <ThinkingDots />
              </div>
            </div>
          )}

          {isPreparingAudio && !isThinking && (
            <div className='flex gap-1.5 items-end'>
              <div className='w-5 h-5 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0'>
                <ChessKnight size={9} />
              </div>
              <div className='bg-elevated border border-line rounded-2xl rounded-bl-sm px-2.5 py-1.5 flex items-center gap-1.5'>
                <Volume2 size={10} className='text-accent animate-pulse' />
                <span className='text-[10px] text-accent/80 italic'>
                  starting audio…
                </span>
              </div>
            </div>
          )}

          {micListening && !isThinking && (
            <div className='flex gap-1.5 items-center justify-end py-0.5'>
              {micSpeaking ? (
                <ListeningWaveform />
              ) : (
                <div className='flex items-center gap-1.5 px-2 py-1 rounded-full bg-page border border-line/60'>
                  <span className='w-1.5 h-1.5 rounded-full bg-danger/60 animate-pulse' />
                  <span className='text-[9px] text-fg-muted/70 italic'>
                    listening…
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom bar ───────────────────────────────────────────────────── */}
      {incidentUnlocked && (
        <div className='shrink-0 border-t border-line px-3 py-1 bg-surface'>
          {callActive ? (
            /* ── Active call controls ──────────────────────────────────── */
            <div className='flex flex-col gap-2 px-3 py-3.5'>
              {/* Row 1: mic status + mute + end */}
              <div className='flex items-center gap-1.5'>
                {/* Mic status pill */}
                <div
                  className={`flex min-w-[70px] items-center gap-1 px-2 py-1 rounded-full mt-3 border ${
                    micMuted
                      ? "bg-warning/10 border-warning/25"
                      : "bg-danger/8 border-danger/20"
                  }`}
                >
                  <div className='relative flex items-center text-center justify-center w-3 h-3'>
                    {!micMuted && (
                      <span className='absolute inset-0 rounded-full bg-danger/30 animate-ping' />
                    )}
                    {micMuted ? (
                      <MicOff size={9} className='text-warning' />
                    ) : (
                      <Mic size={9} className='text-danger z-10' />
                    )}
                  </div>
                  <span
                    className={`text-[9px] font-medium ${micMuted ? "text-warning" : "text-danger"}`}
                  >
                    {micMuted ? "Muted" : "Live"}
                  </span>
                </div>

                <div className='flex gap-3 items-center w-full max-w-sm justify-evenly mx-auto'>
                  <div className='max-w-xs flex flex-col gap-0.5'>
                    <label className='text-[9px] text-fg/40 pl-2'>
                      Language
                    </label>
                    <div className='flex max-w-xs relative'>
                      <select
                        value={localLang}
                        onChange={(e) =>
                          handleLangChange(e.target.value as Language)
                        }
                        className='w-full appearance-none  rounded-md pl-2 pr-6 py-1 text-[10px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <Chevron />
                    </div>
                  </div>

                  <div className=' max-w-xs shrink-0 flex flex-col gap-0.5'>
                    <label className='text-[9px] text-fg/40 pl-2'>Speed</label>
                    <div className='flex max-w-xs relative'>
                      <select
                        value={localSpeed}
                        onChange={(e) =>
                          handleSpeedChange(e.target.value as Speed)
                        }
                        className='w-full appearance-none  rounded-md pl-2 pr-6 py-1 text-[10px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                      >
                        {SPEEDS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <Chevron />
                    </div>
                  </div>

                  <div className=' max-w-xs shrink-0 flex flex-col gap-0.5'>
                    <label className='text-[9px] text-fg/40 pl-2'>
                      Sensitivity
                    </label>
                    <div className='flex max-w-xs relative'>
                      <select
                        value={localSens}
                        onChange={(e) =>
                          handleSensChange(e.target.value as Sensitivity)
                        }
                        className='w-full appearance-none  rounded-md pl-2 pr-6 py-1 text-[10px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                      >
                        {SENSITIVITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <Chevron />
                    </div>
                  </div>

                  <div className=' max-w-xs shrink-0 flex flex-col gap-0.5'>
                    <label className='text-[9px] text-fg/40 pl-2'>Pause</label>
                    <div className='flex max-w-xs relative'>
                      <select
                        value={localPause}
                        onChange={(e) =>
                          handlePauseChange(e.target.value as Pause)
                        }
                        className='w-full appearance-none  rounded-md pl-2 pr-6 py-1 text-[10px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                      >
                        {PAUSES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <Chevron />
                    </div>
                  </div>
                </div>

                {/* Mute toggle */}
                <button
                  onClick={onToggleMute}
                  title={micMuted ? "Unmute" : "Mute"}
                  className={`w-7 h-7 flex items-center justify-center rounded-full border cursor-pointer mt-3  transition-all active:scale-95 ${
                    micMuted
                      ? "bg-warning/15 border-warning/35 hover:bg-warning/25"
                      : "bg-fg/10 border-fg/35 hover:bg-fg/25"
                  }`}
                >
                  {micMuted ? (
                    <MicOff size={10} className='text-warning' />
                  ) : (
                    <Mic size={10} className='text-fg' />
                  )}
                </button>

                {/* End call */}
                <button
                  onClick={onCallStop}
                  className='flex items-center gap-1 bg-danger/12 hover:bg-danger/22 border border-danger/30 rounded-full px-2.5 py-1.5 mt-3 cursor-pointer transition-all active:scale-95'
                >
                  <PhoneOff size={10} className='text-danger' />
                  <span className='text-[10px] font-semibold text-danger'>
                    End
                  </span>
                </button>
              </div>

              {/* Row 2: language + speed + sensitivity + pause */}
            </div>
          ) : hasTranscript ? (
            /* ── Idle with history: full settings + new call ───────────── */
            <div className='flex gap-1.5 items-end py-1'>
              <div className='flex-1 flex justify-between gap-0 overflow-hidden bg-surface rounded-lg'>
                <div className='flex gap-1.5 justify-evenly w-full max-w-lg mx-auto'>
                  <div className='max-w-[75px] flex-1 flex flex-col gap-1'>
                    <label className='text-[10px] text-fg/60 pl-2'>
                      Language
                    </label>
                    <div className='relative'>
                      <select
                        value={localLang}
                        onChange={(e) =>
                          setLocalLang(e.target.value as Language)
                        }
                        className='w-full appearance-none rounded-md pl-2 pr-6 py-1.5 text-[11px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <Chevron />
                    </div>
                  </div>
                  <div className='max-w-[70px] flex-1 flex flex-col gap-1'>
                    <label className='text-[10px] text-fg/60 pl-2'>Speed</label>
                    <div className='relative'>
                      <select
                        value={localSpeed}
                        onChange={(e) => setLocalSpeed(e.target.value as Speed)}
                        className='w-full appearance-none rounded-md pl-2 pr-6 py-1.5 text-[11px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                      >
                        {SPEEDS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <Chevron />
                    </div>
                  </div>
                  <div className='flex-1 flex flex-col gap-1 max-w-[220px]'>
                    <label className='text-[10px] text-fg/60 pl-2'>
                      VAD Sensitivity
                    </label>
                    <div className='relative'>
                      <select
                        value={localSens}
                        onChange={(e) =>
                          setLocalSens(e.target.value as Sensitivity)
                        }
                        className='w-full appearance-none rounded-md pl-2 pr-6 py-1.5 text-[11px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                      >
                        {SENSITIVITIES.map((s) => (
                          <option key={s} value={s}>
                            <em>{s}</em> : {SENSITIVITY_HINT[s]}
                          </option>
                        ))}
                      </select>
                      <Chevron />
                    </div>
                  </div>
                  <div className='max-w-[70px] flex-1 flex flex-col gap-1'>
                    <label className='text-[10px] text-fg/60 pl-2'>Pause</label>
                    <div className='relative'>
                      <select
                        value={localPause}
                        onChange={(e) => setLocalPause(e.target.value as Pause)}
                        className='w-full appearance-none rounded-md pl-2 pr-6 py-1.5 text-[11px] text-fg hover:bg-page outline-none focus:border-info transition-colors cursor-pointer'
                      >
                        {PAUSES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <Chevron />
                    </div>
                  </div>
                </div>
                <div className='flex items-center justify-center mt-3'>
                  <button
                    onClick={() =>
                      onCallStart(
                        localLang,
                        localSpeed,
                        SENSITIVITY_MAP[localSens],
                        PAUSE_MAP[localPause],
                      )
                    }
                    className='shrink-0 flex items-center gap-1.5 bg-success/12 hover:bg-success/22 border border-success/30 rounded-full px-3 py-1 cursor-pointer transition-all active:scale-95'
                  >
                    <Phone size={10} className='text-success' />
                    <span className='text-[10px] font-semibold text-success'>
                      New Call
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Idle, no history ──────────────────────────────────────── */
            <div className='flex items-center gap-1.5'>
              <MicOff size={10} className='text-fg-muted/50' />
              <span className='text-[10px] text-fg-muted/60'>
                {isAuthorized
                  ? "Clinical guidance ready"
                  : "Emergency contacts ready"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ThinkingDots

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

// ListeningWaveform

function ListeningWaveform() {
  const bars: { anim: string; dur: number; delay: number }[] = [
    { anim: "vad-sm", dur: 0.9, delay: 0.0 },
    { anim: "vad-md", dur: 0.75, delay: 0.18 },
    { anim: "vad-md", dur: 1.05, delay: 0.07 },
    { anim: "vad-lg", dur: 0.8, delay: 0.28 },
    { anim: "vad-md", dur: 0.95, delay: 0.12 },
    { anim: "vad-md", dur: 0.68, delay: 0.35 },
    { anim: "vad-sm", dur: 1.1, delay: 0.05 },
  ];

  return (
    <div
      className='flex items-end gap-[3px]'
      style={{ height: 20 }}
      aria-label='Listening'
    >
      {bars.map((b, i) => (
        <span
          key={i}
          className='w-[2.5px] rounded-full bg-danger/70'
          style={{
            animation: `${b.anim} ${b.dur}s ease-in-out infinite`,
            animationDelay: `${b.delay}s`,
            height: 3,
          }}
        />
      ))}
    </div>
  );
}

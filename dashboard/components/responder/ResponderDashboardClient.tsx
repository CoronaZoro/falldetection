"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import LiveFeed from "@/components/LiveFeed";
import EventLog from "@/components/EventLog";
import CountdownBar from "@/components/CountdownBar";
import StatusBadge from "@/components/StatusBadge";
import ChatPanel from "@/components/responder/ChatPanel";
import { useIncidentContext } from "@/components/responder/IncidentContext";
import {
  Wifi,
  WifiOff,
  Activity,
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Navigation,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { colors, rgba } from "@/lib/colors";
import type {
  WSMessage,
  EventLogEntry,
  IncidentStatus,
  VoiceEntry,
} from "@/types";

interface Alert {
  eventId: string;
  type: "fall";
  personId?: number;
  ar?: number;
  downDuration?: number;
  timestamp: number;
  velocity?: number;
}

type ChatLanguage = "English" | "Thai" | "Japanese" | "Chinese";
type ChatSpeed = "0.5x" | "0.75x" | "1x" | "1.25x" | "1.5x" | "2x";

interface Props {
  userId: string;
  userName: string;
  isAuthorized: boolean;
}

let eventCounter = 0;

export default function ResponderDashboardClient({
  userId,
  userName,
  isAuthorized,
}: Props) {
  const seenMids = useRef<Set<number>>(new Set());
  // Dedup non-voice WS events — prevents React 18 StrictMode double-invoke firing twice
  const seenEventKeys = useRef<Set<string>>(new Set());
  const incidentIdRef = useRef<string | null>(null);
  const incidentEverFired = useRef(false);
  const { setHasActiveIncident } = useIncidentContext();

  const [systemState, setSystemState] = useState("STABLE");
  const [personsDetected, setPersons] = useState(0);
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [alertIncidentId, setIncidentId] = useState<string | null>(null);
  const [incidentStatus, setStatus] =
    useState<IncidentStatus>("UNACKNOWLEDGED");
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [transcript, setTranscript] = useState<VoiceEntry[]>([]);
  const [callActive, setCallActive] = useState(false);
  const [language, setLanguage] = useState<ChatLanguage>("English");
  const [speed, setSpeed] = useState<ChatSpeed>("1x");
  const [isThinking, setIsThinking] = useState(false);
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
  const [isSpeakingAudio, setIsSpeakingAudio] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const [micSpeaking, setMicSpeaking] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  // true while person is in self-recovery grace period (shows green card before auto-dismiss)
  const [selfRecovered, setSelfRecovered] = useState(false);
  // true once the 15 s escalation timer fires — recovery no longer auto-closes the incident
  const [escalated, setEscalated] = useState(false);
  // true once the LINE broadcast confirmation arrives from the server
  const [lineNotified, setLineNotified] = useState(false);
  // Pending resolve — set when user clicks Resolved/False Alarm, cleared on confirm/cancel
  const [pendingResolve, setPendingResolve] = useState<IncidentStatus | null>(
    null,
  );
  // Live "time on ground" counter — ticks up from 0 when alert arrives
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Final duration received in the recovery WS message (null while incident is active)
  const [finalDownDuration, setFinalDownDuration] = useState<number | null>(
    null,
  );
  // Ref so onCallStart can read the live value without being recreated every second
  const totalDownRef = useRef(0);

  const API_URL = (
    process.env.NEXT_PUBLIC_DETECTION_WS_URL ?? "ws://localhost:8765/ws"
  )
    .replace("ws://", "http://")
    .replace("/ws", "");

  // Sync initial call state on mount
  useEffect(() => {
    fetch(`${API_URL}/call/status`)
      .then((r) => r.json())
      .then((d) => setCallActive(d.active === true))
      .catch(() => {});
  }, [API_URL]);

  // Keep ref in sync with state so async callbacks always see the latest value
  useEffect(() => {
    incidentIdRef.current = alertIncidentId;
  }, [alertIncidentId]);

  // Live "time on ground" counter — starts when an alert arrives, resets on dismiss
  useEffect(() => {
    if (!activeAlert) {
      setElapsedSeconds(0);
      setFinalDownDuration(null);
      totalDownRef.current = 0;
      return;
    }
    // initialDownDuration = time person was already "down" before the alarm fired
    const initialDown = activeAlert.downDuration ?? 0;
    setElapsedSeconds(0);
    totalDownRef.current = initialDown;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => {
        const next = s + 1;
        totalDownRef.current = initialDown + next;
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlert?.eventId]);

  // Persist a log entry to DB — fire-and-forget, non-critical
  const persistLog = useCallback(
    (type: string, message: string, iid?: string | null) => {
      const id = iid ?? incidentIdRef.current;
      if (!id) return;
      fetch(`/api/incidents/${id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message }),
      }).catch(() => {});
    },
    [],
  );

  // Persist a transcript entry to DB — fire-and-forget
  const persistTranscript = useCallback((speaker: string, text: string) => {
    const id = incidentIdRef.current;
    if (!id) return;
    fetch(`/api/incidents/${id}/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ speaker, text }),
    }).catch(() => {});
  }, []);

  const addEvent = useCallback(
    (
      type: EventLogEntry["type"],
      message: string,
      timestamp: number,
      persistToDb = true,
      iid?: string | null,
    ) => {
      setEventLog((prev) => [
        { id: String(++eventCounter), type, message, timestamp },
        ...prev.slice(0, 49),
      ]);
      if (persistToDb) persistLog(type, message, iid);
    },
    [persistLog],
  );

  const handleMessage = useCallback(
    async (msg: WSMessage) => {
      if (msg.type === "heartbeat") {
        setSystemState(msg.state ?? "STABLE");
        setPersons(msg.persons_detected ?? 0);
        return;
      }

      if (msg.type === "state_update") {
        setSystemState(msg.state ?? "STABLE");
        setPersons(msg.persons_detected ?? 0);
        return;
      }

      // mic_status is a transient UI signal — handle immediately, no dedup needed
      if (msg.type === "mic_status") {
        const muted = msg.status === "muted";
        setMicMuted(muted);
        setMicListening(
          !muted && (msg.status === "listening" || msg.status === "speaking"),
        );
        setMicSpeaking(msg.status === "speaking");
        // mic_status fires at the start of each listen cycle — AI is no longer speaking
        setIsSpeakingAudio(false);
        return;
      }

      // ── Dedup: build a unique key per event and skip if already seen ──
      // Prevents React 18 StrictMode double-invoke from firing handlers twice.
      if (msg.type !== "voice_alert") {
        const key = msg.event_id
          ? `${msg.type}_${msg.event_id}`
          : `${msg.type}_${msg.person_id ?? ""}_${Math.floor(msg.timestamp)}`;
        if (seenEventKeys.current.has(key)) return;
        seenEventKeys.current.add(key);
        if (seenEventKeys.current.size > 200) seenEventKeys.current.clear();
      }

      if (msg.type === "fall_alert" && msg.event_id) {
        incidentEverFired.current = true;
        setHasActiveIncident(true);
        setEventLog([]);
        setTranscript([]);
        setIsThinking(false);
        setPendingResolve(null);
        setSelfRecovered(false);
        setEscalated(false);
        setLineNotified(false);
        seenEventKeys.current.clear();
        // Re-anchor the current event so StrictMode's second invocation is still deduplicated
        seenEventKeys.current.add(`fall_alert_${msg.event_id}`);
        incidentIdRef.current = null;
        setStatus("UNACKNOWLEDGED");
        setIncidentId(null);
        setSystemState("ALARM");
        setActiveAlert({
          eventId: msg.event_id,
          type: "fall",
          personId: msg.person_id ?? 0,
          ar: msg.ar,
          downDuration: msg.down_duration,
          timestamp: msg.timestamp,
          velocity: msg.velocity ?? 0,
        });
        try {
          const res = await fetch("/api/incidents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId: msg.event_id,
              type: "FALL",
              personId: msg.person_id ?? 0,
              ar: msg.ar ?? 0,
              downDuration: msg.down_duration ?? 0,
              velocity: msg.velocity ?? 0,
            }),
          });
          if (res.ok) {
            const newId = (await res.json()).id;
            incidentIdRef.current = newId;
            setIncidentId(newId);
            // First log entry — pass newId directly since ref/state won't be set yet
            addEvent(
              "fall",
              `Fall — Person ${msg.person_id ?? 0} (AR: ${msg.ar?.toFixed(2)})`,
              msg.timestamp,
              true,
              newId,
            );
          }
        } catch {
          /* non-critical */
        }
      }
      if (msg.type === "recovery") {
        if (msg.auto_resolved) {
          // Person got up before the 15 s timer fired — self-recovered
          addEvent(
            "recovery",
            `Person ${msg.person_id ?? 0} self-recovered before escalation — closing as Fall (Recovered)`,
            msg.timestamp,
          );
          setSelfRecovered(true);
          incidentEverFired.current = false; // self-recovery — chatbot stays locked
          setSystemState("STABLE");
          setStatus("RECOVERED");
          // Freeze the counter at the authoritative server-reported final duration
          if (msg.down_duration !== undefined) {
            setFinalDownDuration(msg.down_duration);
            totalDownRef.current = msg.down_duration;
          }
          // Stop any active call immediately
          setCallActive(false);
          setIsThinking(false);
          setIsPreparingAudio(false);
          setMicListening(false);
          setMicSpeaking(false);
          fetch(`${API_URL}/call/stop`, { method: "POST" }).catch(() => {});
          // Update DB incident to RECOVERED then auto-dismiss after 4 s
          if (incidentIdRef.current) {
            fetch(`/api/incidents/${incidentIdRef.current}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "RECOVERED" }),
            }).catch(() => {});
          }
          setTimeout(() => {
            setActiveAlert(null);
            setEventLog([]);
            setTranscript([]);
            setIsThinking(false);
            setSelfRecovered(false);
            setEscalated(false);
            setIncidentId(null);
            setStatus("UNACKNOWLEDGED");
            setElapsedSeconds(0);
            setFinalDownDuration(null);
            incidentIdRef.current = null;
            seenMids.current.clear();
            setHasActiveIncident(false);
          }, 4000);
        } else {
          // Recovery happened after escalation — log it but keep incident open
          addEvent(
            "recovery",
            `Person ${msg.person_id ?? 0} got up — verify condition on scene`,
            msg.timestamp,
          );
          setSystemState("STABLE");
        }
      }
      if (msg.type === "escalation") {
        // 15 s elapsed with no ACK — lock in as active incident
        setEscalated(true);
        addEvent(
          "ack",
          "No response — incident escalated to active",
          msg.timestamp,
          true,
        );
      }
      if (msg.type === "line_notified") {
        setLineNotified(true);
      }
      if (msg.type === "voice_tts_ready") {
        // TTS file is ready, afplay is about to start — show "preparing audio" state
        setIsThinking(false);
        setIsPreparingAudio(true);
        return;
      }
      if (msg.type === "voice_alert" && msg.message) {
        // Deduplicate: two WS connections (React StrictMode) can deliver the same message twice
        if (msg.mid !== undefined) {
          if (seenMids.current.has(msg.mid)) return;
          seenMids.current.add(msg.mid);
          if (seenMids.current.size > 200) seenMids.current.clear();
        }
        const speaker = (msg.speaker ?? "assistant") as "user" | "assistant";
        // Save to DB immediately regardless of display state
        persistTranscript(speaker, msg.message!);

        // Both user and AI messages go straight to transcript.
        // ChatPanel animates the latest AI entry in-place — no callback needed.
        setTranscript((prev) => [
          ...prev.slice(-29),
          {
            speaker,
            text: msg.message!,
            timestamp: msg.timestamp,
            speed: msg.speed,
          },
        ]);
        if (speaker === "user") {
          setMicListening(false);
          setMicSpeaking(false);
          setIsThinking(true);
        } else {
          setIsThinking(false);
          setIsPreparingAudio(false); // audio is now playing, text revealed
          setIsSpeakingAudio(true);
        }
      }
      if (msg.type === "call_status") {
        setCallActive(msg.callStatus === "active");
      }
    },
    [addEvent, persistTranscript, setIsThinking, API_URL],
  );

  const { status: wsStatus, send } = useWebSocket(handleMessage);

  const onCallStart = useCallback(
    async (
      lang: string,
      spd: string,
      sensitivity: number,
      pauseAfter: number,
    ) => {
      // Clear dedup set so this call's MIDs (which restart from 1) aren't
      // mistakenly dropped as duplicates of the previous call's messages.
      seenMids.current.clear();
      setCallActive(true);
      setTranscript([]);
      setIsThinking(false);
      try {
        // Fetch full incident context (logs, transcripts, notes) if we have an incident ID
        let fullIncident: {
          logs: { type: string; message: string; timestamp: string }[];
          transcripts: { speaker: string; text: string }[];
          notes: string | null;
        } | null = null;

        if (activeAlert && incidentIdRef.current) {
          try {
            const res = await fetch(`/api/incidents/${incidentIdRef.current}`);
            if (res.ok) {
              fullIncident = await res.json();
            }
          } catch {
            /* non-critical — fall back to basic context */
          }
        }

        await fetch(`${API_URL}/call/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: lang,
            speed: spd,
            sensitivity,
            pause_after: pauseAfter,
            is_authorized: isAuthorized,
            incident: activeAlert
              ? {
                  type: activeAlert.type.toUpperCase(),
                  person_id: activeAlert.personId ?? 0,
                  ar: activeAlert.ar ?? 0,
                  // Live total — initial downDuration + seconds elapsed since alarm
                  down_duration: totalDownRef.current,
                  status: incidentStatus,
                  // Exact detection timestamp from the FastAPI heartbeat WS message
                  detected_at: String(activeAlert.timestamp),
                  // Hip velocity at fall moment from pose estimation
                  fall_velocity: activeAlert.velocity ?? 0,
                  notes: fullIncident?.notes ?? "",
                  logs: (fullIncident?.logs ?? []).map((l) => ({
                    type: l.type,
                    message: l.message,
                    timestamp: l.timestamp,
                  })),
                  prev_transcripts: (fullIncident?.transcripts ?? []).map(
                    (t) => ({
                      speaker: t.speaker,
                      text: t.text,
                    }),
                  ),
                }
              : null,
          }),
        });
      } catch {
        setCallActive(false);
      }
    },
    [API_URL, isAuthorized, activeAlert, incidentStatus],
  );

  const onCallStop = useCallback(async () => {
    setCallActive(false);
    setIsThinking(false);
    setIsPreparingAudio(false);
    setMicListening(false);
    setMicSpeaking(false);
    setMicMuted(false);
    try {
      await fetch(`${API_URL}/call/stop`, { method: "POST" });
    } catch {
      /* non-critical */
    }
  }, [API_URL]);

  const onToggleMute = useCallback(async () => {
    const endpoint = micMuted ? "/call/unmute" : "/call/mute";
    try {
      await fetch(`${API_URL}${endpoint}`, { method: "POST" });
    } catch {
      /* non-critical */
    }
  }, [API_URL, micMuted]);

  const onStopSpeech = useCallback(async () => {
    try {
      await fetch(`${API_URL}/call/interrupt`, { method: "POST" });
      setIsSpeakingAudio(false);
    } catch {
      /* non-critical */
    }
  }, [API_URL]);

  // Mid-call language / speed / mic change — updates server globals live
  const onCallSettings = useCallback(
    async (
      lang: ChatLanguage,
      spd: ChatSpeed,
      sensitivity: number,
      pauseAfter: number,
    ) => {
      setLanguage(lang);
      setSpeed(spd);
      try {
        await fetch(`${API_URL}/call/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: lang,
            speed: spd,
            sensitivity,
            pause_after: pauseAfter,
          }),
        });
      } catch {}
    },
    [API_URL],
  );

  const acknowledge = useCallback(async () => {
    if (!activeAlert) return;
    send({ type: "acknowledge", event_id: activeAlert.eventId });
    setStatus("ACKNOWLEDGED");
    addEvent("ack", `Acknowledged by ${userName}`, Date.now() / 1000);
    // Use ref (set synchronously) instead of state to avoid race condition
    // where the user clicks before the state update has propagated.
    const iid = incidentIdRef.current;
    if (iid) {
      await fetch(`/api/incidents/${iid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ACKNOWLEDGED",
          acknowledgedBy: userId,
        }),
      });
    }
  }, [activeAlert, send, addEvent, userId, userName]);

  const updateStatus = useCallback(
    async (newStatus: IncidentStatus) => {
      setStatus(newStatus);
      const label: Record<string, string> = {
        RESPONDING: "Status → Responding",
        ON_SCENE: "Status → On Scene",
        RESOLVED: "Incident resolved",
        FALSE_ALARM: "Marked as false alarm",
      };
      addEvent("ack", label[newStatus] ?? newStatus, Date.now() / 1000);
      const iid = incidentIdRef.current;
      if (iid) {
        await fetch(`/api/incidents/${iid}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
      }
      if (newStatus === "RESOLVED" || newStatus === "FALSE_ALARM") {
        // Stop any active call before full reset
        if (callActive) {
          setCallActive(false);
          fetch(`${API_URL}/call/stop`, { method: "POST" }).catch(() => {});
        }
        // Brief delay so "Incident closed" flash is visible, then full reset
        setTimeout(() => {
          setActiveAlert(null);
          setEventLog([]);
          setTranscript([]);
          setIsThinking(false);
          setSelfRecovered(false);
          setEscalated(false);
          setIncidentId(null);
          setStatus("UNACKNOWLEDGED");
          setSystemState("STABLE");
          setPendingResolve(null);
          setElapsedSeconds(0);
          setFinalDownDuration(null);
          incidentEverFired.current = false;
          incidentIdRef.current = null;
          seenMids.current.clear();
          seenEventKeys.current.clear();
          setHasActiveIncident(false);
        }, 1500);
      }
    },
    [addEvent, callActive, API_URL, setHasActiveIncident],
  );

  const isAlarming = activeAlert !== null;
  const alertColor = colors.danger;

  return (
    <div className='h-full flex flex-col gap-2'>
      {/* ── Status bar ─────────────────────────────────────────────── */}
      <div className='shrink-0 flex items-center justify-between px-3 h-9 bg-surface border border-line rounded'>
        <div className='flex items-center gap-2.5'>
          <StatusBadge
            status={selfRecovered ? "RECOVERED" : systemState}
            size='sm'
            pulse={isAlarming}
          />
          <span className='text-[11px] text-fg hidden sm:block'>
            {isAlarming
              ? `Person ${activeAlert.personId} · AR ${activeAlert.ar?.toFixed(2)} · ${(finalDownDuration ?? totalDownRef.current).toFixed(0)}s down`
              : "Normal"}
          </span>
        </div>
        <div className='flex items-center gap-3 text-[11px]'>
          <span className='flex items-center gap-1 text-fg'>
            <Users size={11} />
            <span className='font-mono'>{personsDetected}</span>
          </span>
          <span className='text-fg font-mono hidden sm:block'>{userName}</span>
          {wsStatus === "connected" && (
            <span className='flex items-center gap-1 text-success'>
              <Wifi size={11} />
              <span className='hidden sm:inline ml-1'>Live</span>
            </span>
          )}
          {wsStatus === "connecting" && (
            <span className='flex items-center gap-1 text-warning'>
              <Activity size={11} />
              <span className='hidden sm:inline ml-1'>Connecting…</span>
            </span>
          )}
          {wsStatus === "disconnected" && (
            <span className='flex items-center gap-1 text-danger'>
              <WifiOff size={11} />
              <span className='hidden sm:inline ml-1'>Offline</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Main 2-col grid ────────────────────────────────────────── */}
      <div className='flex-1 min-h-0 grid gap-2 grid-cols-1 md:grid-cols-2'>
        {/* ── LEFT: Feed + Event Log ──────────────────────────────── */}
        <div className='flex flex-col gap-2 min-h-0 order-2 md:order-1'>
          {/* Live feed */}
          <div className='shrink-0 bg-surface border border-line rounded overflow-hidden py-2.5'>
            <LiveFeed online={wsStatus === "connected"} />
          </div>

          {/* Event log — fills remaining left column height */}
          <div className='flex-1 min-h-[120px] md:min-h-0 bg-surface border border-line rounded-lg overflow-hidden flex flex-col'>
            <div className='shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-line bg-elevated/30'>
              <Activity size={11} className='text-fg/60' />
              <p className='section-label'>Event Log</p>
              {eventLog.length > 0 && (
                <span className='ml-auto font-mono text-[9px] text-fg/40 bg-line/60 px-1.5 py-0.5 rounded-full'>
                  {eventLog.length}
                </span>
              )}
            </div>
            <div className='flex-1 min-h-0 p-2'>
              <EventLog entries={eventLog} />
            </div>
          </div>
        </div>

        {/* ── RIGHT: Alert card + ChatPanel ──────────────────────── */}
        <div className='flex flex-col gap-2 min-h-0 order-1 md:order-2'>
          {/* Alert card — compact idle, grows on alarm, capped at ~264px */}
          <div
            className='shrink-0 min-h-[250px] bg-surface rounded border overflow-hidden transition-colors duration-300'
            style={{
              borderColor: selfRecovered
                ? rgba(colors.success, 0.45)
                : isAlarming
                  ? rgba(alertColor, 0.45)
                  : rgba(colors.line, 1),
            }}
          >
            <div className='max-h-full overflow-y-auto my-auto p-3'>
              {selfRecovered ? (
                /* ── Self-recovery ── */
                <div className='flex items-center justify-center my-auto min-h-[250px]'>
                  <div className='flex flex-col items-center gap-1.5'>
                    <div
                      className='w-9 h-9 rounded-full flex items-center justify-center shrink-0'
                      style={{
                        background: rgba(colors.success, 0.15),
                        border: `1px solid ${rgba(colors.success, 0.3)}`,
                      }}
                    >
                      <CheckCircle size={15} className='text-success' />
                    </div>
                    <p className='text-xs font-semibold text-success'>
                      Fall · Self Recovered
                    </p>
                    <p
                      className='text-[10px] mt-0.5'
                      style={{ color: rgba(colors.success, 0.7) }}
                    >
                      Person got up — recovery detected.
                    </p>
                  </div>
                </div>
              ) : !isAlarming ? (
                /* ── Idle ── */
                <div className='flex items-center justify-center my-auto min-h-[250px] bg-page'>
                  <div className='flex flex-col items-center gap-1.5'>
                    <div className='w-9 h-9 rounded-full bg-line/60 flex items-center justify-center shrink-0'>
                      <CheckCircle size={15} className='text-fg/40' />
                    </div>
                    <p className='text-xs font-medium text-fg/70'>
                      No active alerts
                    </p>
                    <p className='text-[10px] text-fg/50 mt-0.5'>
                      System monitoring
                    </p>
                  </div>
                </div>
              ) : (
                /* ── Alarm ── */
                <div className='flex flex-col gap-3'>
                  {/* Headline row */}
                  {/* Headline row */}
                  <div className='flex items-center justify-between gap-2'>
                    <div>
                      <div className='flex items-center gap-1.5 mb-0.5'>
                        <span
                          className='w-1.5 h-1.5 rounded-full animate-pulse'
                          style={{ background: alertColor }}
                        />
                        <p
                          className='text-[10px] font-semibold uppercase tracking-widest'
                          style={{ color: alertColor }}
                        >
                          Fall Detected
                        </p>
                      </div>
                      <p className='text-base font-bold text-fg leading-tight'>
                        Person {activeAlert.personId}
                      </p>
                      <div className='flex items-center gap-1.5 mt-1'>
                        <span
                          className='font-mono text-[10px] px-2 py-0.5 rounded-full'
                          style={{
                            color: alertColor,
                            border: `1px solid ${alertColor}40`,
                          }}
                        >
                          AR {activeAlert.ar?.toFixed(2)}
                        </span>
                        <span className='font-mono text-[10px] text-fg-muted/50'>
                          ID #{activeAlert.personId}
                        </span>
                      </div>
                    </div>
                    {/* Down time */}
                    <div className='text-right shrink-0'>
                      <p
                        className='font-mono font-bold text-xl leading-none'
                        style={{ color: alertColor }}
                      >
                        {finalDownDuration !== null
                          ? `${finalDownDuration.toFixed(0)}`
                          : `${((activeAlert.downDuration ?? 0) + elapsedSeconds).toFixed(0)}`}
                        <span className='text-xs font-normal ml-0.5 opacity-60'>
                          s
                        </span>
                      </p>
                      <p className='text-[9px] text-fg-muted/60 uppercase tracking-wide mt-0.5'>
                        Down
                      </p>
                    </div>
                  </div>

                  <div className='h-px bg-line/40' />

                  {/* Unacknowledged */}
                  {incidentStatus === "UNACKNOWLEDGED" && (
                    <>
                      {!escalated && (
                        <CountdownBar
                          seconds={15}
                          color={alertColor}
                          stopped={selfRecovered}
                        />
                      )}
                      {escalated && (
                        <div
                          className='flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold'
                          style={{
                            color: colors.danger,
                            border: `1px solid ${rgba(colors.danger, 0.35)}`,
                          }}
                        >
                          <span className='w-1.5 h-1.5 rounded-full bg-danger animate-pulse shrink-0' />
                          Active incident — responder action required
                        </div>
                      )}
                      {lineNotified && (
                        <div className='flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-success border border-success/35 hidden'>
                          <CheckCircle size={11} className='shrink-0' />
                          LINE alert sent to all responders
                        </div>
                      )}
                      {/* Acknowledge CTA */}
                      <button
                        onClick={acknowledge}
                        className='w-full py-2.5 rounded-lg font-semibold text-xs cursor-pointer transition-all active:scale-[0.98] flex items-center justify-center gap-1.5'
                        style={{
                          background: rgba(alertColor, 0.13),
                          color: alertColor,
                          border: `1px solid ${rgba(alertColor, 0.3)}`,
                        }}
                        onMouseEnter={(e) => {
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.background = rgba(alertColor, 0.2);
                        }}
                        onMouseLeave={(e) => {
                          (
                            e.currentTarget as HTMLButtonElement
                          ).style.background = rgba(alertColor, 0.13);
                        }}
                      >
                        <CheckCircle size={13} />
                        Acknowledge Incident
                      </button>
                    </>
                  )}

                  {/* Post-ack status flow */}
                  {incidentStatus !== "UNACKNOWLEDGED" && (
                    <div className='flex flex-col gap-2'>
                      {/* Current status block */}
                      {(() => {
                        const cfg: Record<
                          string,
                          {
                            label: string;
                            color: string;
                            icon: React.ReactNode;
                          }
                        > = {
                          ACKNOWLEDGED: {
                            label: "Acknowledged",
                            color: colors.warning,
                            icon: <CheckCircle size={13} />,
                          },
                          RESPONDING: {
                            label: "Responding",
                            color: colors.warning,
                            icon: <Navigation size={13} />,
                          },
                          ON_SCENE: {
                            label: "On Scene",
                            color: colors.accent,
                            icon: <MapPin size={13} />,
                          },
                          RESOLVED: {
                            label: "Resolved",
                            color: colors.success,
                            icon: <CheckCircle size={13} />,
                          },
                          FALSE_ALARM: {
                            label: "False Alarm",
                            color: colors.fg,
                            icon: <XCircle size={13} />,
                          },
                          RECOVERED: {
                            label: "Recovered",
                            color: colors.success,
                            icon: <CheckCircle size={13} />,
                          },
                        };
                        const s = cfg[incidentStatus];
                        if (!s) return null;
                        return (
                          <div
                            className='flex items-center gap-2.5 px-2.5 py-2 rounded-lg'
                            style={{
                              border: `1px solid ${rgba(s.color, 0.3)}`,
                            }}
                          >
                            <div
                              className='w-7 h-7 rounded-full flex items-center justify-center shrink-0'
                              style={{ background: rgba(s.color, 0.12) }}
                            >
                              <span style={{ color: s.color }}>{s.icon}</span>
                            </div>
                            <div>
                              <p className='text-[9px] uppercase tracking-widest text-fg/50'>
                                Current Status
                              </p>
                              <p
                                className='text-sm font-bold leading-tight'
                                style={{ color: s.color }}
                              >
                                {s.label}
                              </p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Step: en route */}
                      {incidentStatus === "ACKNOWLEDGED" && (
                        <FlowBtn
                          label="I'm Responding"
                          description='En route to the incident location'
                          icon={<Navigation size={11} />}
                          color={colors.warning}
                          onClick={() => updateStatus("RESPONDING")}
                        />
                      )}

                      {/* Step: on scene */}
                      {incidentStatus === "RESPONDING" && (
                        <FlowBtn
                          label='Arrived on Scene'
                          description='I have reached the location'
                          icon={<MapPin size={11} />}
                          color={colors.accent}
                          onClick={() => updateStatus("ON_SCENE")}
                        />
                      )}

                      {/* Close buttons */}
                      {(incidentStatus === "ON_SCENE" ||
                        incidentStatus === "RESPONDING") &&
                        !pendingResolve && (
                          <div className='flex flex-col gap-1.5 pt-0.5'>
                            <p className='text-[9px] text-fg/50 uppercase tracking-wider pl-0.5'>
                              Close incident
                            </p>
                            <div className='flex gap-1.5'>
                              <FlowBtn
                                label='Resolved'
                                description='Emergency handled'
                                icon={<CheckCircle size={11} />}
                                color={colors.success}
                                onClick={() => setPendingResolve("RESOLVED")}
                                flex
                              />
                              <FlowBtn
                                label='False Alarm'
                                description='No emergency found'
                                icon={<XCircle size={11} />}
                                color={colors.fg}
                                onClick={() => setPendingResolve("FALSE_ALARM")}
                                flex
                              />
                            </div>
                          </div>
                        )}

                      {/* Confirmation prompt */}
                      {pendingResolve && (
                        <div
                          className='rounded-lg border p-3 flex flex-col gap-2.5'
                          style={{
                            background: rgba(
                              pendingResolve === "RESOLVED"
                                ? colors.success
                                : colors.fg,
                              0.07,
                            ),
                            borderColor: rgba(
                              pendingResolve === "RESOLVED"
                                ? colors.success
                                : colors.fg,
                              0.2,
                            ),
                          }}
                        >
                          <div className='flex items-start gap-2'>
                            <div
                              className='w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5'
                              style={{
                                background: rgba(
                                  pendingResolve === "RESOLVED"
                                    ? colors.success
                                    : colors.fg,
                                  0.15,
                                ),
                              }}
                            >
                              {pendingResolve === "RESOLVED" ? (
                                <CheckCircle
                                  size={11}
                                  style={{ color: colors.success }}
                                />
                              ) : (
                                <XCircle
                                  size={11}
                                  style={{ color: colors.fg }}
                                />
                              )}
                            </div>
                            <div>
                              <p className='text-[11px] font-semibold text-fg'>
                                {pendingResolve === "RESOLVED"
                                  ? "Mark as Resolved?"
                                  : "Mark as False Alarm?"}
                              </p>
                              <p className='text-[10px] text-fg/70 mt-0.5'>
                                {pendingResolve === "RESOLVED"
                                  ? "This will close and archive the incident."
                                  : "This will dismiss the alert as a false detection."}
                              </p>
                            </div>
                          </div>
                          <div className='flex gap-1.5'>
                            <button
                              onClick={() => updateStatus(pendingResolve)}
                              className='flex-1 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer transition-all active:scale-[0.98]'
                              style={{
                                background: rgba(
                                  pendingResolve === "RESOLVED"
                                    ? colors.success
                                    : colors.fg,
                                  0.15,
                                ),
                                color:
                                  pendingResolve === "RESOLVED"
                                    ? colors.success
                                    : colors.fg,
                                border: `1px solid ${rgba(
                                  pendingResolve === "RESOLVED"
                                    ? colors.success
                                    : colors.fg,
                                  0.3,
                                )}`,
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setPendingResolve(null)}
                              className='px-3 py-1.5 rounded-md text-[11px] text-fg/70 border border-line/60 bg-transparent cursor-pointer hover:text-fg hover:border-line transition-colors'
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {(incidentStatus === "RESOLVED" ||
                        incidentStatus === "RECOVERED" ||
                        incidentStatus === "FALSE_ALARM") && (
                        <div className='flex items-center gap-2 px-2.5 py-2 rounded-lg border border-success/35 text-[11px] text-success font-semibold'>
                          <CheckCircle size={12} />
                          Closing Incident…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Voice Assistant panel — fills remaining right column */}
          <div className='h-64 md:flex-1 md:min-h-0'>
            <ChatPanel
              isAuthorized={isAuthorized}
              transcript={transcript}
              callActive={callActive}
              onCallStart={onCallStart}
              onCallStop={onCallStop}
              language={language}
              speed={speed}
              onCallSettings={onCallSettings}
              activeIncident={activeAlert}
              incidentUnlocked={incidentEverFired.current}
              isThinking={isThinking}
              isPreparingAudio={isPreparingAudio}
              micListening={micListening}
              micSpeaking={micSpeaking}
              micMuted={micMuted}
              onToggleMute={onToggleMute}
              isSpeakingAudio={isSpeakingAudio}
              onStopSpeech={onStopSpeech}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function FlowBtn({
  label,
  description,
  icon,
  color,
  onClick,
  flex = false,
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  color: string;
  onClick: () => void;
  flex?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`${flex ? "flex-1" : "w-full"} rounded-lg px-2.5 py-2 text-left cursor-pointer flex items-center gap-2.5 transition-all active:scale-[0.98] border`}
      style={{
        background: rgba(color, 0.07),
        color,
        borderColor: rgba(color, 0.2),
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = rgba(
          color,
          0.14,
        );
        (e.currentTarget as HTMLButtonElement).style.borderColor = rgba(
          color,
          0.35,
        );
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = rgba(
          color,
          0.07,
        );
        (e.currentTarget as HTMLButtonElement).style.borderColor = rgba(
          color,
          0.2,
        );
      }}
    >
      {icon && (
        <div
          className='w-6 h-6 rounded-full flex items-center justify-center shrink-0'
          style={{ background: rgba(color, 0.15) }}
        >
          {icon}
        </div>
      )}
      <div className='flex-1 min-w-0'>
        <div className='text-[11px] font-semibold leading-tight'>{label}</div>
        {description && !flex && (
          <div
            className='text-[9px] mt-0.5 leading-tight'
            style={{ color: rgba(color, 0.65) }}
          >
            {description}
          </div>
        )}
      </div>
      <ArrowRight size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
    </button>
  );
}

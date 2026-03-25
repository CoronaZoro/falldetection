"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import LiveFeed from "@/components/LiveFeed";
import EventLog from "@/components/EventLog";
import CountdownBar from "@/components/CountdownBar";
import StatusBadge from "@/components/StatusBadge";
import ChatPanel from "@/components/responder/ChatPanel";
import { useIncidentContext } from "@/components/responder/IncidentContext";
import {
  Wifi, WifiOff, Activity, Users, CheckCircle, ChevronRight, AlertTriangle,
} from "lucide-react";
import { colors, rgba } from "@/lib/colors";
import type { WSMessage, EventLogEntry, IncidentStatus, VoiceEntry } from "@/types";

interface Alert {
  eventId: string;
  type: "fall" | "sos";
  personId?: number;
  ar?: number;
  downDuration?: number;
  timestamp: number;
}

type ChatLanguage = "English" | "Thai" | "Japanese" | "Chinese";
type ChatSpeed    = "0.5x" | "0.75x" | "1x" | "1.25x" | "1.5x" | "2x";

interface Props {
  userId: string;
  userName: string;
  isAuthorized: boolean;
}

let eventCounter = 0;

export default function ResponderDashboardClient({ userId, userName, isAuthorized }: Props) {
  const seenMids          = useRef<Set<number>>(new Set());
  const incidentIdRef     = useRef<string | null>(null);
  const incidentEverFired = useRef(false);
  const { setHasActiveIncident } = useIncidentContext();

  const [systemState, setSystemState] = useState("STABLE");
  const [personsDetected, setPersons] = useState(0);
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [alertIncidentId, setIncidentId] = useState<string | null>(null);
  const [incidentStatus, setStatus] = useState<IncidentStatus>("UNACKNOWLEDGED");
  const [eventLog,    setEventLog]   = useState<EventLogEntry[]>([]);
  const [transcript,  setTranscript] = useState<VoiceEntry[]>([]);
  const [callActive,  setCallActive] = useState(false);
  const [language,    setLanguage]   = useState<ChatLanguage>("English");
  const [speed,       setSpeed]      = useState<ChatSpeed>("1x");
  const [isThinking,  setIsThinking] = useState(false);
  // Pending resolve — set when user clicks Resolved/False Alarm, cleared on confirm/cancel
  const [pendingResolve, setPendingResolve] = useState<IncidentStatus | null>(null);

  const API_URL = (process.env.NEXT_PUBLIC_DETECTION_WS_URL ?? "ws://localhost:8765/ws")
    .replace("ws://", "http://").replace("/ws", "");

  // Sync initial call state on mount
  useEffect(() => {
    fetch(`${API_URL}/call/status`)
      .then((r) => r.json())
      .then((d) => setCallActive(d.active === true))
      .catch(() => {});
  }, [API_URL]);

  // Keep ref in sync with state so async callbacks always see the latest value
  useEffect(() => { incidentIdRef.current = alertIncidentId; }, [alertIncidentId]);

  // Persist a log entry to DB — fire-and-forget, non-critical
  const persistLog = useCallback((type: string, message: string, iid?: string | null) => {
    const id = iid ?? incidentIdRef.current;
    if (!id) return;
    fetch(`/api/incidents/${id}/log`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ type, message }),
    }).catch(() => {});
  }, []);

  // Persist a transcript entry to DB — fire-and-forget
  const persistTranscript = useCallback((speaker: string, text: string) => {
    const id = incidentIdRef.current;
    if (!id) return;
    fetch(`/api/incidents/${id}/transcript`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ speaker, text }),
    }).catch(() => {});
  }, []);

  const addEvent = useCallback(
    (type: EventLogEntry["type"], message: string, timestamp: number, persistToDb = true, iid?: string | null) => {
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
        setSystemState("STABLE");
        setPersons(msg.persons_detected ?? 0);
        return;
      }
      if (msg.type === "fall_alert" && msg.event_id) {
        incidentEverFired.current = true;
        setHasActiveIncident(true);
        setEventLog([]);
        setTranscript([]);
        setIsThinking(false);
        setPendingResolve(null);
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
        } catch { /* non-critical */ }
      }
      if (msg.type === "sos_alert" && msg.event_id) {
        incidentEverFired.current = true;
        setHasActiveIncident(true);
        setEventLog([]);
        setTranscript([]);
        setIsThinking(false);
        setPendingResolve(null);
        incidentIdRef.current = null;
        setStatus("UNACKNOWLEDGED");
        setIncidentId(null);
        setSystemState("SOS");
        setActiveAlert({
          eventId: msg.event_id,
          type: "sos",
          timestamp: msg.timestamp,
        });
        try {
          const res = await fetch("/api/incidents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              eventId: msg.event_id,
              type: "SOS",
              personId: 0,
              ar: 0,
              downDuration: 0,
            }),
          });
          if (res.ok) {
            const newId = (await res.json()).id;
            incidentIdRef.current = newId;
            setIncidentId(newId);
            addEvent("sos", "SOS gesture — manual emergency", msg.timestamp, true, newId);
          }
        } catch { /* non-critical */ }
      }
      if (msg.type === "recovery") {
        addEvent("recovery", `Person ${msg.person_id ?? 0} recovered`, msg.timestamp);
        setSystemState("STABLE");
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
          { speaker, text: msg.message!, timestamp: msg.timestamp },
        ]);
        if (speaker === "user") {
          setIsThinking(true);
        } else {
          setIsThinking(false);  // AI replied → clear thinking dots
        }
      }
      if (msg.type === "call_status") {
        setCallActive(msg.callStatus === "active");
      }
    },
    [addEvent, persistTranscript, setIsThinking],
  );

  const { status: wsStatus, send } = useWebSocket(handleMessage);

  const onCallStart = useCallback(async (lang: string, spd: string, sensitivity: number, pauseAfter: number) => {
    // Clear dedup set so this call's MIDs (which restart from 1) aren't
    // mistakenly dropped as duplicates of the previous call's messages.
    seenMids.current.clear();
    setCallActive(true);
    setTranscript([]);
    setIsThinking(false);
    try {
      await fetch(`${API_URL}/call/start`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          language:      lang,
          speed:         spd,
          sensitivity,
          pause_after:   pauseAfter,
          is_authorized: isAuthorized,
          incident:      activeAlert
            ? {
                type:          activeAlert.type.toUpperCase(),
                person_id:     activeAlert.personId ?? 0,
                ar:            activeAlert.ar         ?? 0,
                down_duration: activeAlert.downDuration ?? 0,
                status:        incidentStatus,
              }
            : null,
        }),
      });
    } catch { setCallActive(false); }
  }, [API_URL, isAuthorized, activeAlert, incidentStatus]);

  const onCallStop = useCallback(async () => {
    setCallActive(false);
    setIsThinking(false);
    try { await fetch(`${API_URL}/call/stop`, { method: "POST" }); } catch { /* non-critical */ }
  }, [API_URL]);

  // Mid-call language / speed / mic change — updates server globals live
  const onCallSettings = useCallback(async (lang: ChatLanguage, spd: ChatSpeed, sensitivity: number, pauseAfter: number) => {
    setLanguage(lang);
    setSpeed(spd);
    try {
      await fetch(`${API_URL}/call/settings`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ language: lang, speed: spd, sensitivity, pause_after: pauseAfter }),
      });
    } catch {}
  }, [API_URL]);

  const acknowledge = useCallback(async () => {
    if (!activeAlert) return;
    send({ type: "acknowledge", event_id: activeAlert.eventId });
    setStatus("ACKNOWLEDGED");
    addEvent("ack", `Acknowledged by ${userName}`, Date.now() / 1000);
    if (alertIncidentId) {
      await fetch(`/api/incidents/${alertIncidentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACKNOWLEDGED", acknowledgedBy: userId }),
      });
    }
  }, [activeAlert, send, addEvent, alertIncidentId, userId, userName]);

  const updateStatus = useCallback(async (newStatus: IncidentStatus) => {
    setStatus(newStatus);
    const label: Record<string, string> = {
      RESPONDING:  "Status → Responding",
      ON_SCENE:    "Status → On Scene",
      RESOLVED:    "Incident resolved",
      FALSE_ALARM: "Marked as false alarm",
    };
    addEvent("ack", label[newStatus] ?? newStatus, Date.now() / 1000);
    if (alertIncidentId) {
      await fetch(`/api/incidents/${alertIncidentId}`, {
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
        setIncidentId(null);
        setStatus("UNACKNOWLEDGED");
        setSystemState("STABLE");
        setPendingResolve(null);
        incidentEverFired.current = false;
        incidentIdRef.current = null;
        seenMids.current.clear();
        setHasActiveIncident(false);
      }, 1500);
    }
  }, [alertIncidentId, addEvent, callActive, API_URL, setHasActiveIncident]);

  const isAlarming = activeAlert !== null;
  const isFall     = activeAlert?.type === "fall";
  const alertColor = isFall ? colors.danger : colors.warning;

  return (
    <div className='h-full flex flex-col gap-2'>

      {/* ── Status bar ─────────────────────────────────────────────── */}
      <div className='shrink-0 flex items-center justify-between px-3 h-9 bg-surface border border-line rounded'>
        <div className='flex items-center gap-2.5'>
          <StatusBadge
            status={systemState === "SOS" ? "SOS" : systemState}
            size='sm'
            pulse={isAlarming}
          />
          <span className='text-[11px] text-fg-muted hidden sm:block'>
            {isAlarming
              ? isFall
                ? `Person ${activeAlert.personId} · AR ${activeAlert.ar?.toFixed(2)} · ${activeAlert.downDuration?.toFixed(1)}s`
                : "Manual SOS gesture detected"
              : "Normal"}
          </span>
        </div>
        <div className='flex items-center gap-3 text-[11px]'>
          <span className='flex items-center gap-1 text-fg-muted'>
            <Users size={11} />
            <span className='font-mono'>{personsDetected}</span>
          </span>
          <span className='text-fg-muted font-mono hidden sm:block'>{userName}</span>
          {wsStatus === "connected"    && <span className='flex items-center gap-1 text-success'><Wifi size={11} /><span className='hidden sm:inline ml-1'>Live</span></span>}
          {wsStatus === "connecting"   && <span className='flex items-center gap-1 text-warning'><Activity size={11} /><span className='hidden sm:inline ml-1'>Connecting…</span></span>}
          {wsStatus === "disconnected" && <span className='flex items-center gap-1 text-danger'><WifiOff size={11} /><span className='hidden sm:inline ml-1'>Offline</span></span>}
        </div>
      </div>

      {/* ── Main 2-col grid ────────────────────────────────────────── */}
      <div className='flex-1 min-h-0 grid gap-2 grid-cols-1 md:grid-cols-2'>

        {/* ── LEFT: Feed + Event Log ──────────────────────────────── */}
        <div className='flex flex-col gap-2 min-h-0 order-2 md:order-1'>

          {/* Live feed */}
          <div className='shrink-0 bg-surface border border-line rounded overflow-hidden'>
            <LiveFeed online={wsStatus === "connected"} />
          </div>

          {/* Event log — fills remaining left column height */}
          <div className='flex-1 min-h-[120px] md:min-h-0 bg-surface border border-line rounded p-2.5 flex flex-col gap-1.5'>
            <p className='section-label shrink-0'>Event Log</p>
            <div className='flex-1 min-h-0'>
              <EventLog entries={eventLog} />
            </div>
          </div>
        </div>

        {/* ── RIGHT: Alert card + ChatPanel ──────────────────────── */}
        <div className='flex flex-col gap-2 min-h-0 order-1 md:order-2'>

          {/* Alert card — compact idle, grows on alarm, capped at ~264px */}
          <div
            className='shrink-0 rounded border overflow-hidden transition-colors duration-300'
            style={{
              background:  isAlarming ? rgba(alertColor, 0.05) : colors.surface,
              borderColor: isAlarming ? rgba(alertColor, 0.22) : colors.line,
            }}
          >
            <div className='p-3 max-h-[264px] overflow-y-auto'>
              {!isAlarming ? (

                /* ── Idle state: compact single-line strip ─────────── */
                <div className='flex items-center gap-2.5'>
                  <CheckCircle size={15} className='text-fg-muted shrink-0' />
                  <div>
                    <p className='text-xs font-medium text-fg'>No active alerts</p>
                    <p className='section-label mt-0'>system monitoring</p>
                  </div>
                </div>

              ) : (

                /* ── Alarm state ──────────────────────────────────── */
                <div className='flex flex-col gap-3'>

                  {/* Headline */}
                  <div>
                    <p className='section-label mb-0.5' style={{ color: alertColor }}>
                      {isFall ? "fall detected" : "sos alert"}
                    </p>
                    <p className='text-xl font-bold text-fg leading-tight'>
                      {isFall ? `Person ${activeAlert.personId}` : "Manual SOS"}
                    </p>
                    {isFall && (
                      <div className='flex items-center gap-3 mt-1'>
                        <span className='font-mono text-[11px] text-fg-muted'>
                          AR <span className='text-fg'>{activeAlert.ar?.toFixed(2)}</span>
                        </span>
                        <span className='font-mono text-[11px] text-fg-muted'>
                          DOWN <span className='text-fg'>{activeAlert.downDuration?.toFixed(1)}s</span>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className='h-px bg-line' />

                  {/* Unacknowledged: countdown + ACK button */}
                  {incidentStatus === "UNACKNOWLEDGED" && (
                    <>
                      <CountdownBar seconds={15} color={alertColor} />
                      <button
                        onClick={acknowledge}
                        className='w-full py-2.5 rounded font-semibold text-xs border-none cursor-pointer transition-opacity hover:opacity-90 active:opacity-75'
                        style={{ background: alertColor, color: colors.page }}
                      >
                        Acknowledge
                      </button>
                    </>
                  )}

                  {/* Post-ack status flow */}
                  {incidentStatus !== "UNACKNOWLEDGED" && (
                    <div className='flex flex-col gap-2'>
                      <StatusBadge status={incidentStatus} size='sm' />
                      <div className='flex flex-col gap-1 mt-0.5'>
                        {incidentStatus === "ACKNOWLEDGED" && (
                          <FlowBtn label='Responding' color={colors.warning} onClick={() => updateStatus("RESPONDING")} />
                        )}
                        {incidentStatus === "RESPONDING" && (
                          <FlowBtn label='On Scene' color={colors.accent} onClick={() => updateStatus("ON_SCENE")} />
                        )}

                        {/* Resolve / False Alarm — show confirmation step first */}
                        {(incidentStatus === "ON_SCENE" || incidentStatus === "RESPONDING") && !pendingResolve && (
                          <>
                            <FlowBtn label='Resolved'    color={colors.success} onClick={() => setPendingResolve("RESOLVED")} />
                            <FlowBtn label='False Alarm' color={colors.fgMuted} onClick={() => setPendingResolve("FALSE_ALARM")} />
                          </>
                        )}

                        {/* Confirmation prompt */}
                        {pendingResolve && (
                          <div
                            className='rounded border p-2.5 flex flex-col gap-2'
                            style={{
                              background: rgba(pendingResolve === "RESOLVED" ? colors.success : colors.fgMuted, 0.06),
                              borderColor: rgba(pendingResolve === "RESOLVED" ? colors.success : colors.fgMuted, 0.2),
                            }}
                          >
                            <div className='flex items-start gap-1.5'>
                              <AlertTriangle size={11} className='text-fg-muted shrink-0 mt-0.5' />
                              <p className='text-[11px] text-fg leading-snug'>
                                {pendingResolve === "RESOLVED"
                                  ? "Confirm this incident is fully resolved? This will reset the dashboard."
                                  : "Confirm this was a false alarm? This will reset the dashboard."}
                              </p>
                            </div>
                            <div className='flex gap-1.5'>
                              <button
                                onClick={() => { updateStatus(pendingResolve); }}
                                className='flex-1 py-1.5 rounded text-[11px] font-semibold cursor-pointer transition-opacity hover:opacity-90 border-none'
                                style={{
                                  background: pendingResolve === "RESOLVED" ? colors.success : colors.fgMuted,
                                  color: colors.page,
                                }}
                              >
                                {pendingResolve === "RESOLVED" ? "Confirm Resolved" : "Confirm False Alarm"}
                              </button>
                              <button
                                onClick={() => setPendingResolve(null)}
                                className='px-3 py-1.5 rounded text-[11px] text-fg-muted border border-line bg-transparent cursor-pointer hover:text-fg transition-colors'
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {(incidentStatus === "RESOLVED" || incidentStatus === "FALSE_ALARM") && (
                          <div className='flex items-center gap-1.5 text-[11px] text-success pt-1'>
                            <CheckCircle size={12} /> Incident closed — resetting…
                          </div>
                        )}
                      </div>
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
            />
          </div>

        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */

function FlowBtn({ label, color, onClick }: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className='w-full bg-transparent rounded px-3 py-1.5 text-xs font-medium cursor-pointer flex items-center justify-between transition-colors border'
      style={{ color, borderColor: rgba(color, 0.2) }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = rgba(color, 0.08); }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      {label} <ChevronRight size={11} />
    </button>
  );
}

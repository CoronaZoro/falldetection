"use client";

import { useState, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import LiveFeed from "@/components/LiveFeed";
import EventLog from "@/components/EventLog";
import CountdownBar from "@/components/CountdownBar";
import StatusBadge from "@/components/StatusBadge";
import ChatPanel from "@/components/responder/ChatPanel";
// import VoiceLog from "@/components/responder/VoiceLog";
import {
  Wifi, WifiOff, Activity, Users, CheckCircle, ChevronRight,
} from "lucide-react";
import { colors, rgba } from "@/lib/colors";
import type { WSMessage, EventLogEntry, IncidentStatus } from "@/types";

interface Alert {
  eventId: string;
  type: "fall" | "sos";
  personId?: number;
  ar?: number;
  downDuration?: number;
  timestamp: number;
}

interface Props {
  userId: string;
  userName: string;
}

let eventCounter = 0;

export default function ResponderDashboardClient({ userId, userName }: Props) {
  const [systemState, setSystemState] = useState("STABLE");
  const [personsDetected, setPersons] = useState(0);
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [alertIncidentId, setIncidentId] = useState<string | null>(null);
  const [incidentStatus, setStatus] = useState<IncidentStatus>("UNACKNOWLEDGED");
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  // const [voiceLog, setVoiceLog] = useState<string[]>([]);

  const addEvent = useCallback(
    (type: EventLogEntry["type"], message: string, timestamp: number) => {
      setEventLog((prev) => [
        { id: String(++eventCounter), type, message, timestamp },
        ...prev.slice(0, 49),
      ]);
    },
    [],
  );

  const handleMessage = useCallback(
    async (msg: WSMessage) => {
      if (msg.type === "heartbeat") {
        setSystemState("STABLE");
        setPersons(msg.persons_detected ?? 0);
        return;
      }
      if (msg.type === "fall_alert" && msg.event_id) {
        addEvent(
          "fall",
          `Fall — Person ${msg.person_id ?? 0} (AR: ${msg.ar?.toFixed(2)})`,
          msg.timestamp,
        );
        setSystemState("ALARM");
        setActiveAlert({
          eventId: msg.event_id,
          type: "fall",
          personId: msg.person_id ?? 0,
          ar: msg.ar,
          downDuration: msg.down_duration,
          timestamp: msg.timestamp,
        });
        setStatus("UNACKNOWLEDGED");
        setIncidentId(null);
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
          if (res.ok) setIncidentId((await res.json()).id);
        } catch { /* non-critical */ }
      }
      if (msg.type === "sos_alert" && msg.event_id) {
        addEvent("sos", "SOS gesture — manual emergency", msg.timestamp);
        setSystemState("SOS");
        setActiveAlert({
          eventId: msg.event_id,
          type: "sos",
          timestamp: msg.timestamp,
        });
        setStatus("UNACKNOWLEDGED");
        setIncidentId(null);
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
          if (res.ok) setIncidentId((await res.json()).id);
        } catch { /* non-critical */ }
      }
      if (msg.type === "recovery") {
        addEvent("recovery", `Person ${msg.person_id ?? 0} recovered`, msg.timestamp);
        setSystemState("STABLE");
      }
      if (msg.type === "voice_alert" && msg.message) {
        addEvent("voice", `"${msg.message}"`, msg.timestamp);
        // setVoiceLog((prev) => [msg.message!, ...prev.slice(0, 19)]);
      }
    },
    [addEvent],
  );

  const { status: wsStatus, send } = useWebSocket(handleMessage);

  const acknowledge = useCallback(async () => {
    if (!activeAlert) return;
    send({ type: "acknowledge", event_id: activeAlert.eventId });
    setStatus("ACKNOWLEDGED");
    addEvent("ack", "Alert acknowledged", Date.now() / 1000);
    if (alertIncidentId) {
      await fetch(`/api/incidents/${alertIncidentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACKNOWLEDGED", acknowledgedBy: userId }),
      });
    }
  }, [activeAlert, send, addEvent, alertIncidentId, userId]);

  const updateStatus = useCallback(async (newStatus: IncidentStatus) => {
    setStatus(newStatus);
    if (alertIncidentId) {
      await fetch(`/api/incidents/${alertIncidentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    }
    if (newStatus === "RESOLVED" || newStatus === "FALSE_ALARM")
      setTimeout(() => setActiveAlert(null), 800);
  }, [alertIncidentId]);

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
                        {(incidentStatus === "ON_SCENE" || incidentStatus === "RESPONDING") && (
                          <>
                            <FlowBtn label='Resolved'    color={colors.success}  onClick={() => updateStatus("RESOLVED")} />
                            <FlowBtn label='False Alarm' color={colors.fgMuted}  onClick={() => updateStatus("FALSE_ALARM")} />
                          </>
                        )}
                        {(incidentStatus === "RESOLVED" || incidentStatus === "FALSE_ALARM") && (
                          <div className='flex items-center gap-1.5 text-[11px] text-success pt-1'>
                            <CheckCircle size={12} /> Incident closed
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ChatPanel — fills all remaining right column space */}
          {/* h-48 on mobile (fixed), flex-1 on md+ (fills rest) */}
          <div className='h-48 md:flex-1 md:min-h-0'>
            <ChatPanel />
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

"use client";

import { useState, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import LiveFeed from "@/components/LiveFeed";
import EventLog from "@/components/EventLog";
import CountdownBar from "@/components/CountdownBar";
import StatusBadge from "@/components/StatusBadge";
import ChatPanel from "@/components/responder/ChatPanel";
import VoiceLog from "@/components/responder/VoiceLog";
import {
  Wifi,
  WifiOff,
  Activity,
  Users,
  AlertTriangle,
  Hand,
  CheckCircle,
  ChevronRight,
} from "lucide-react";
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
  const [personsDetected, setPersonsDetected] = useState(0);
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [alertIncidentId, setAlertIncidentId] = useState<string | null>(null);
  const [incidentStatus, setIncidentStatus] =
    useState<IncidentStatus>("UNACKNOWLEDGED");
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [voiceLog, setVoiceLog] = useState<string[]>([]);

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
        setPersonsDetected(msg.persons_detected ?? 0);
        return;
      }
      if (msg.type === "fall_alert" && msg.event_id) {
        addEvent(
          "fall",
          `Fall detected — Person ${msg.person_id ?? 0} (AR: ${msg.ar?.toFixed(2)})`,
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
        setIncidentStatus("UNACKNOWLEDGED");
        setAlertIncidentId(null);
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
            const d = await res.json();
            setAlertIncidentId(d.id);
          }
        } catch {
          /* non-critical */
        }
      }
      if (msg.type === "sos_alert" && msg.event_id) {
        addEvent(
          "sos",
          "SOS gesture triggered — manual emergency",
          msg.timestamp,
        );
        setSystemState("SOS");
        setActiveAlert({
          eventId: msg.event_id,
          type: "sos",
          timestamp: msg.timestamp,
        });
        setIncidentStatus("UNACKNOWLEDGED");
        setAlertIncidentId(null);
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
            const d = await res.json();
            setAlertIncidentId(d.id);
          }
        } catch {
          /* non-critical */
        }
      }
      if (msg.type === "recovery") {
        addEvent(
          "recovery",
          `Person ${msg.person_id ?? 0} recovered`,
          msg.timestamp,
        );
        setSystemState("STABLE");
      }
      if (msg.type === "voice_alert" && msg.message) {
        addEvent("voice", `"${msg.message}"`, msg.timestamp);
        setVoiceLog((prev) => [msg.message!, ...prev.slice(0, 19)]);
      }
    },
    [addEvent],
  );

  const { status: wsStatus, send } = useWebSocket(handleMessage);

  const acknowledge = useCallback(async () => {
    if (!activeAlert) return;
    send({ type: "acknowledge", event_id: activeAlert.eventId });
    setIncidentStatus("ACKNOWLEDGED");
    addEvent("ack", `Alert acknowledged`, Date.now() / 1000);
    if (alertIncidentId) {
      await fetch(`/api/incidents/${alertIncidentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ACKNOWLEDGED",
          acknowledgedBy: userId,
        }),
      });
    }
  }, [activeAlert, send, addEvent, alertIncidentId, userId]);

  const updateStatus = useCallback(
    async (newStatus: IncidentStatus) => {
      setIncidentStatus(newStatus);
      if (alertIncidentId) {
        await fetch(`/api/incidents/${alertIncidentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
      }
      if (newStatus === "RESOLVED" || newStatus === "FALSE_ALARM")
        setTimeout(() => setActiveAlert(null), 1000);
    },
    [alertIncidentId],
  );

  const isAlarming = activeAlert !== null;
  const isFall = activeAlert?.type === "fall";
  const alertColor = isFall ? "#ff3355" : "#ffaa00";

  return (
    <div className='max-w-full mx-auto flex flex-col gap-3'>
      {/* Top bar: connection + system state */}
      <div className='flex items-center justify-between px-3 py-2 bg-[#111318] border border-[#1e2229] rounded'>
        <div className='flex items-center gap-3'>
          <StatusBadge
            status={systemState === "SOS" ? "SOS" : systemState}
            size='sm'
            pulse={isAlarming}
          />
          <span className='text-xs text-[#4a5568]'>
            {isAlarming
              ? isFall
                ? `Person ${activeAlert.personId} · AR ${activeAlert.ar?.toFixed(2)} · ${activeAlert.downDuration?.toFixed(1)}s on ground`
                : "Manual SOS gesture detected"
              : "Monitoring — all clear"}
          </span>
        </div>
        <div className='flex items-center gap-4 text-xs'>
          <span className='flex items-center gap-1 text-[#4a5568]'>
            <Users size={12} />
            <span className='font-mono'>{personsDetected}</span>
          </span>
          {wsStatus === "connected" && (
            <span className='flex items-center gap-1 text-[#00ff88]'>
              <Wifi size={12} />
              Connected
            </span>
          )}
          {wsStatus === "connecting" && (
            <span className='flex items-center gap-1 text-[#ffaa00]'>
              <Activity size={12} />
              Connecting…
            </span>
          )}
          {wsStatus === "disconnected" && (
            <span className='flex items-center gap-1 text-[#ff3355]'>
              <WifiOff size={12} />
              Offline
            </span>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className='grid gap-3' style={{ gridTemplateColumns: "1fr 300px" }}>
        {/* Left: feed + bottom row */}
        <div className='flex flex-col gap-3'>
          <div className='bg-[#111318] border border-[#1e2229] rounded p-3'>
            <LiveFeed online={wsStatus === "connected"} />
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <VoiceLog entries={voiceLog} />
            <ChatPanel />
          </div>

          <div className='bg-[#111318] border border-[#1e2229] rounded p-3'>
            <p className='section-label mb-2'>Event Log</p>
            <EventLog entries={eventLog} maxHeight='160px' />
          </div>
        </div>

        {/* Right: alert panel */}
        <div className='flex flex-col gap-3'>
          {/* Alert state card */}
          <div
            className='rounded border flex-1 p-4 flex flex-col gap-4'
            style={{
              background: isAlarming ? `${alertColor}0a` : "#111318",
              borderColor: isAlarming ? `${alertColor}40` : "#1e2229",
            }}
          >
            {!isAlarming ? (
              /* Calm state */
              <div className='flex flex-col items-center justify-center gap-2 py-8 text-[#4a5568]'>
                <CheckCircle size={28} />
                <p className='text-sm font-medium'>No active alerts</p>
                <p className='section-label'>system monitoring</p>
              </div>
            ) : (
              /* Alert state */
              <div className='flex flex-col gap-4'>
                {/* Alert headline */}
                <div>
                  <p
                    className='section-label mb-1'
                    style={{ color: alertColor }}
                  >
                    {isFall ? "fall detected" : "sos alert"}
                  </p>
                  <p className='text-2xl font-bold text-[#c9d1e0] leading-tight'>
                    {isFall ? `Person ${activeAlert.personId}` : "Manual SOS"}
                  </p>
                  {isFall && (
                    <div className='flex items-center gap-3 mt-1'>
                      <span className='font-mono text-xs text-[#4a5568]'>
                        AR{" "}
                        <span className='text-[#c9d1e0]'>
                          {activeAlert.ar?.toFixed(2)}
                        </span>
                      </span>
                      <span className='font-mono text-xs text-[#4a5568]'>
                        DOWN{" "}
                        <span className='text-[#c9d1e0]'>
                          {activeAlert.downDuration?.toFixed(1)}s
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className='h-px bg-[#1e2229]' />

                {/* Countdown + ACK */}
                {incidentStatus === "UNACKNOWLEDGED" && (
                  <>
                    <CountdownBar seconds={15} color={alertColor} />
                    <button
                      onClick={acknowledge}
                      className='w-full py-3 rounded font-semibold text-sm border-none cursor-pointer transition-opacity hover:opacity-90 active:opacity-75'
                      style={{ background: alertColor, color: "#0a0c10" }}
                    >
                      Acknowledge
                    </button>
                  </>
                )}

                {/* Status flow */}
                {incidentStatus !== "UNACKNOWLEDGED" && (
                  <div className='flex flex-col gap-2'>
                    <StatusBadge status={incidentStatus} size='md' />
                    <div className='flex flex-col gap-1 mt-1'>
                      {incidentStatus === "ACKNOWLEDGED" && (
                        <FlowBtn
                          label='Responding'
                          color='#ffaa00'
                          onClick={() => updateStatus("RESPONDING")}
                        />
                      )}
                      {incidentStatus === "RESPONDING" && (
                        <FlowBtn
                          label='On Scene'
                          color='#8b5cf6'
                          onClick={() => updateStatus("ON_SCENE")}
                        />
                      )}
                      {(incidentStatus === "ON_SCENE" ||
                        incidentStatus === "RESPONDING") && (
                        <>
                          <FlowBtn
                            label='Resolved'
                            color='#00ff88'
                            onClick={() => updateStatus("RESOLVED")}
                          />
                          <FlowBtn
                            label='False Alarm'
                            color='#4a5568'
                            onClick={() => updateStatus("FALSE_ALARM")}
                          />
                        </>
                      )}
                      {(incidentStatus === "RESOLVED" ||
                        incidentStatus === "FALSE_ALARM") && (
                        <div className='flex items-center gap-1.5 text-xs text-[#00ff88] pt-1'>
                          <CheckCircle size={13} /> Incident closed
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* System info strip */}
          <div className='bg-[#111318] border border-[#1e2229] rounded p-3'>
            <div className='flex flex-col gap-1.5'>
              <InfoRow
                label='WS'
                value={wsStatus}
                mono
                color={wsStatus === "connected" ? "#00ff88" : "#ff3355"}
              />
              <InfoRow
                label='Persons'
                value={String(personsDetected)}
                mono
                color='#c9d1e0'
              />
              <InfoRow label='User' value={userName} color='#4a5568' />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FlowBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className='w-full bg-transparent rounded px-3 py-2 text-xs font-medium cursor-pointer flex items-center justify-between transition-colors border'
      style={{ color, borderColor: `${color}30` }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = `${color}10`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      {label} <ChevronRight size={12} />
    </button>
  );
}

function InfoRow({
  label,
  value,
  color,
  mono,
}: {
  label: string;
  value: string;
  color: string;
  mono?: boolean;
}) {
  return (
    <div className='flex items-center justify-between text-xs'>
      <span className='text-[#4a5568]'>{label}</span>
      <span className={`${mono ? "font-mono" : ""}`} style={{ color }}>
        {value}
      </span>
    </div>
  );
}

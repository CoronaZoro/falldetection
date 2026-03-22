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
  Activity, Wifi, WifiOff, Users, AlertTriangle, Hand,
  CheckCircle, ChevronRight,
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
  const [systemState, setSystemState]       = useState<string>("STABLE");
  const [personsDetected, setPersonsDetected] = useState(0);
  const [activeAlert, setActiveAlert]       = useState<Alert | null>(null);
  const [alertIncidentId, setAlertIncidentId] = useState<string | null>(null);
  const [incidentStatus, setIncidentStatus] = useState<IncidentStatus>("UNACKNOWLEDGED");
  const [eventLog, setEventLog]             = useState<EventLogEntry[]>([]);
  const [voiceLog, setVoiceLog]             = useState<string[]>([]);

  const addEvent = useCallback((type: EventLogEntry["type"], message: string, timestamp: number) => {
    setEventLog((prev) => [
      { id: String(++eventCounter), type, message, timestamp },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const handleMessage = useCallback(
    async (msg: WSMessage) => {
      if (msg.type === "heartbeat") {
        setSystemState("STABLE");
        setPersonsDetected(msg.persons_detected ?? 0);
        return;
      }
      if (msg.type === "fall_alert" && msg.event_id) {
        addEvent("fall", `Fall detected — Person ${msg.person_id ?? 0} (AR: ${msg.ar?.toFixed(2)})`, msg.timestamp);
        setSystemState("ALARM");
        setActiveAlert({ eventId: msg.event_id, type: "fall", personId: msg.person_id ?? 0, ar: msg.ar, downDuration: msg.down_duration, timestamp: msg.timestamp });
        setIncidentStatus("UNACKNOWLEDGED");
        setAlertIncidentId(null);
        try {
          const res = await fetch("/api/incidents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: msg.event_id, type: "FALL", personId: msg.person_id ?? 0, ar: msg.ar ?? 0, downDuration: msg.down_duration ?? 0 }),
          });
          if (res.ok) { const d = await res.json(); setAlertIncidentId(d.id); }
        } catch { /* non-critical */ }
      }
      if (msg.type === "sos_alert" && msg.event_id) {
        addEvent("sos", "SOS gesture triggered — manual emergency alert", msg.timestamp);
        setSystemState("SOS");
        setActiveAlert({ eventId: msg.event_id, type: "sos", timestamp: msg.timestamp });
        setIncidentStatus("UNACKNOWLEDGED");
        setAlertIncidentId(null);
        try {
          const res = await fetch("/api/incidents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId: msg.event_id, type: "SOS", personId: 0, ar: 0, downDuration: 0 }),
          });
          if (res.ok) { const d = await res.json(); setAlertIncidentId(d.id); }
        } catch { /* non-critical */ }
      }
      if (msg.type === "recovery") {
        addEvent("recovery", `Recovery — Person ${msg.person_id ?? 0} stood up`, msg.timestamp);
        setSystemState("STABLE");
      }
      if (msg.type === "voice_alert" && msg.message) {
        addEvent("voice", `Voice: "${msg.message}"`, msg.timestamp);
        setVoiceLog((prev) => [msg.message!, ...prev.slice(0, 19)]);
      }
    },
    [addEvent]
  );

  const { status: wsStatus, send } = useWebSocket(handleMessage);

  const acknowledge = useCallback(async () => {
    if (!activeAlert) return;
    send({ type: "acknowledge", event_id: activeAlert.eventId });
    setIncidentStatus("ACKNOWLEDGED");
    addEvent("ack", `Acknowledged alert ${activeAlert.eventId}`, Date.now() / 1000);
    if (alertIncidentId) {
      await fetch(`/api/incidents/${alertIncidentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACKNOWLEDGED", acknowledgedBy: userId }),
      });
    }
  }, [activeAlert, send, addEvent, alertIncidentId, userId]);

  const updateStatus = useCallback(async (newStatus: IncidentStatus) => {
    setIncidentStatus(newStatus);
    if (alertIncidentId) {
      await fetch(`/api/incidents/${alertIncidentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    }
    if (newStatus === "RESOLVED" || newStatus === "FALSE_ALARM") {
      setTimeout(() => setActiveAlert(null), 1500);
    }
  }, [alertIncidentId]);

  const isAlerting  = activeAlert !== null;
  const bannerColor = systemState === "ALARM" ? "#ff3355" : systemState === "SOS" ? "#ffaa00" : "#00ff88";

  const wsIcon = wsStatus === "connected"
    ? <><Wifi size={14} className="text-[#00ff88]" /><span className="text-[#00ff88]">Connected</span></>
    : wsStatus === "connecting"
    ? <><Activity size={14} className="text-[#ffaa00]" /><span className="text-[#ffaa00]">Connecting...</span></>
    : <><WifiOff size={14} className="text-[#ff3355]" /><span className="text-[#ff3355]">Offline</span></>;

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Top status banner — dynamic border/bg color */}
      <div
        className="rounded-lg px-4 py-3 mb-4 flex items-center justify-between flex-wrap gap-2 border"
        style={{
          background: isAlerting ? `${bannerColor}15` : "#111318",
          borderColor: isAlerting ? bannerColor : "#1e2229",
        }}
      >
        <div className="flex items-center gap-3">
          <StatusBadge status={systemState === "SOS" ? "SOS" : systemState} size="md" pulse={isAlerting} />
          <span className="text-[#c8d0e0] text-sm">
            {isAlerting
              ? activeAlert?.type === "fall"
                ? `Fall detected — Person ${activeAlert.personId}`
                : "SOS gesture — Manual emergency alert"
              : "System monitoring — all clear"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[#4a5568] text-[13px]">
            <Users size={14} />
            <span>{personsDetected} detected</span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px]">{wsIcon}</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 340px" }}>
        {/* Left col */}
        <div className="flex flex-col gap-4">
          {/* Feed */}
          <div className="bg-[#111318] border border-[#1e2229] rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-[#4a5568]" />
              <span className="text-sm font-semibold text-[#c8d0e0]">Live Feed</span>
            </div>
            <LiveFeed online={wsStatus === "connected"} />
          </div>

          {/* Voice + Chat */}
          <div className="grid grid-cols-2 gap-4">
            <VoiceLog entries={voiceLog} />
            <ChatPanel />
          </div>

          {/* Event log */}
          <div className="bg-[#111318] border border-[#1e2229] rounded-lg p-4">
            <p className="text-sm font-semibold text-[#c8d0e0] mb-3">Event Log</p>
            <EventLog entries={eventLog} maxHeight="180px" />
          </div>
        </div>

        {/* Right col — alert panel */}
        <div className="flex flex-col gap-4">
          {/* Alert card */}
          <div
            className="bg-[#111318] rounded-lg p-4 shrink-0 border"
            style={{ borderColor: isAlerting ? `${bannerColor}55` : "#1e2229" }}
          >
            <p className="text-sm font-semibold text-[#c8d0e0] mb-3">Alert Panel</p>

            {!isAlerting ? (
              <div className="text-center py-8 text-[#4a5568]">
                <CheckCircle size={32} className="mx-auto mb-2" />
                <p className="text-sm">No active alerts</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Alert type row */}
                <div
                  className="flex items-center gap-2.5 px-3 py-3 rounded border"
                  style={{
                    background: `${bannerColor}12`,
                    borderColor: `${bannerColor}33`,
                  }}
                >
                  {activeAlert.type === "fall"
                    ? <AlertTriangle size={20} className="text-[#ff3355]" />
                    : <Hand size={20} className="text-[#ffaa00]" />
                  }
                  <div>
                    <p className="font-bold text-[15px]" style={{ color: bannerColor }}>
                      {activeAlert.type === "fall" ? "FALL DETECTED" : "SOS ALERT"}
                    </p>
                    {activeAlert.type === "fall" && (
                      <p className="text-[12px] text-[#4a5568]">
                        Person {activeAlert.personId} · AR {activeAlert.ar?.toFixed(2)} · {activeAlert.downDuration?.toFixed(1)}s
                      </p>
                    )}
                  </div>
                </div>

                {incidentStatus === "UNACKNOWLEDGED" && (
                  <CountdownBar seconds={15} color={bannerColor} />
                )}

                {incidentStatus === "UNACKNOWLEDGED" && (
                  <button
                    onClick={acknowledge}
                    className="w-full rounded-lg py-3 font-bold text-[15px] text-[#0a0c10] cursor-pointer border-none"
                    style={{ background: bannerColor }}
                  >
                    ACKNOWLEDGE
                  </button>
                )}

                {incidentStatus !== "UNACKNOWLEDGED" && (
                  <div className="flex flex-col gap-1.5">
                    <StatusBadge status={incidentStatus} size="md" />
                    <p className="text-[12px] text-[#4a5568] mt-1">Update status:</p>
                    {incidentStatus === "ACKNOWLEDGED" && (
                      <StatusBtn label="RESPONDING" color="#ffaa00" onClick={() => updateStatus("RESPONDING")} />
                    )}
                    {incidentStatus === "RESPONDING" && (
                      <StatusBtn label="ON SCENE" color="#8b5cf6" onClick={() => updateStatus("ON_SCENE")} />
                    )}
                    {(incidentStatus === "ON_SCENE" || incidentStatus === "RESPONDING") && (
                      <>
                        <StatusBtn label="RESOLVED"    color="#00ff88" onClick={() => updateStatus("RESOLVED")}    />
                        <StatusBtn label="FALSE ALARM" color="#4a5568" onClick={() => updateStatus("FALSE_ALARM")} />
                      </>
                    )}
                    {(incidentStatus === "RESOLVED" || incidentStatus === "FALSE_ALARM") && (
                      <div className="flex items-center gap-1.5 text-[#00ff88] text-sm">
                        <CheckCircle size={16} />
                        <span>Incident closed</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* System info */}
          <div className="bg-[#111318] border border-[#1e2229] rounded-lg p-4">
            <p className="text-[13px] font-semibold text-[#c8d0e0] mb-3">System</p>
            <div className="flex flex-col gap-2">
              <InfoRow label="WebSocket"   value={wsStatus}                     color={wsStatus === "connected" ? "#00ff88" : "#ff3355"} />
              <InfoRow label="Camera feed" value="http://localhost:8765/video"  color="#4a5568" mono />
              <InfoRow label="Persons"     value={String(personsDetected)}      color="#c8d0e0" />
              <InfoRow label="Responder"   value={userName}                     color="#3b82f6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-transparent rounded px-3 py-2 font-semibold text-[13px] font-mono cursor-pointer flex items-center justify-between transition-colors border"
      style={{ color, borderColor: `${color}55` }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = `${color}15`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      {label}
      <ChevronRight size={14} />
    </button>
  );
}

function InfoRow({ label, value, color, mono }: { label: string; value: string; color: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-[#4a5568]">{label}</span>
      <span
        className={`max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap ${mono ? "font-mono" : ""}`}
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import {
  ArrowLeft, FileText, Loader2, ListOrdered, MessageSquare,
  AlertTriangle, Siren, CheckCircle, Activity, Bot, User,
} from "lucide-react";
import { colors, rgba } from "@/lib/colors";

interface Incident {
  id: string;
  eventId: string;
  type: string;
  personId: number;
  ar: number;
  downDuration: number;
  status: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  notes: string | null;
  reportText: string | null;
  reportGenerated: boolean;
  createdAt: string;
  user?: { name: string; email: string } | null;
  logs:        IncidentLogEntry[];
  transcripts: IncidentTranscriptEntry[];
}

interface IncidentLogEntry {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface IncidentTranscriptEntry {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
}

interface Props {
  id: string;
  role: "ADMIN" | "RESPONDER";
}

type Tab = "timeline" | "transcript" | "report";

const LOG_ICONS: Record<string, React.ReactNode> = {
  fall:     <AlertTriangle size={11} className="text-danger shrink-0 mt-0.5" />,
  sos:      <Siren        size={11} className="text-warning shrink-0 mt-0.5" />,
  recovery: <CheckCircle  size={11} className="text-success shrink-0 mt-0.5" />,
  ack:      <Activity     size={11} className="text-info    shrink-0 mt-0.5" />,
};

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function IncidentDetailClient({ id, role }: Props) {
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [notes,    setNotes]    = useState("");
  const [genReport, setGenReport] = useState(false);
  const [tab, setTab] = useState<Tab>("timeline");

  useEffect(() => {
    fetch(`/api/incidents/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setIncident(d);
        setNotes(d.notes ?? "");
        setLoading(false);
      });
  }, [id]);

  async function saveNotes() {
    await fetch(`/api/incidents/${id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ notes }),
    });
    setIncident((prev) => (prev ? { ...prev, notes } : prev));
  }

  async function generateReport() {
    setGenReport(true);
    const res  = await fetch(`/api/incidents/${id}/report`, { method: "POST" });
    const data = await res.json();
    setIncident((prev) =>
      prev ? { ...prev, reportText: data.reportText, reportGenerated: true } : prev,
    );
    setGenReport(false);
  }

  const backPath = role === "ADMIN" ? "/admin/incidents" : "/responder/incidents";

  if (loading)  return <div className="text-fg-muted text-center pt-16">Loading…</div>;
  if (!incident) return <div className="text-danger text-center pt-16">Incident not found</div>;

  const responseTime = incident.acknowledgedAt
    ? Math.round(
        (new Date(incident.acknowledgedAt).getTime() - new Date(incident.createdAt).getTime()) / 1000,
      )
    : null;

  const TABS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: "timeline",   label: "Timeline",   icon: <ListOrdered  size={11} />, badge: incident.logs.length },
    { key: "transcript", label: "Transcript", icon: <MessageSquare size={11} />, badge: incident.transcripts.length },
    { key: "report",     label: "Report",     icon: <FileText      size={11} /> },
  ];

  return (
    <div className="flex flex-col gap-4 max-w-[720px] mx-auto">

      {/* Back */}
      <button
        onClick={() => router.push(backPath)}
        className="flex items-center gap-1.5 bg-transparent border-none text-fg-muted hover:text-fg cursor-pointer text-sm p-0 transition-colors w-fit"
      >
        <ArrowLeft size={14} /> Back to incidents
      </button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-base font-semibold text-fg">Incident Detail</h1>
          <StatusBadge status={incident.type}   size="sm" />
          <StatusBadge status={incident.status} size="sm" />
        </div>
        <p className="text-xs text-fg-muted font-mono">{incident.eventId}</p>
      </div>

      {/* Data grid */}
      <div className="bg-surface border border-line rounded p-4">
        <p className="section-label mb-3">Incident Data</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ["Person ID",          `#${incident.personId}`],
            ["Aspect Ratio",       incident.ar.toFixed(2)],
            ["Duration on ground", `${incident.downDuration.toFixed(1)}s`],
            ["Response time",      responseTime !== null ? `${responseTime}s` : "Not acknowledged"],
            ["Detected",           new Date(incident.createdAt).toLocaleString()],
            ["Resolved",           incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleString() : "—"],
            ["Acknowledged by",    incident.user?.name ?? "—"],
          ].map(([label, val]) => (
            <div key={label as string}>
              <p className="section-label mb-0.5">{label}</p>
              <p className="text-sm text-fg font-mono">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-surface border border-line rounded p-4">
        <p className="section-label mb-3">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this incident..."
          rows={3}
          className="w-full bg-page border border-line rounded px-3 py-2 text-fg text-xs outline-none focus:border-info resize-y transition-colors"
        />
        <button
          onClick={saveNotes}
          className="mt-1.5 bg-info hover:bg-info-dark border-none rounded px-3 py-1.5 text-white font-semibold text-xs cursor-pointer transition-colors"
        >
          Save Notes
        </button>
      </div>

      {/* Tabs: Timeline / Transcript / Report */}
      <div className="bg-surface border border-line rounded overflow-hidden">

        {/* Tab bar */}
        <div className="flex border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium cursor-pointer border-none transition-colors ${
                tab === t.key
                  ? "text-fg border-b-2 border-accent bg-transparent"
                  : "text-fg-muted bg-transparent hover:text-fg"
              }`}
              style={tab === t.key ? { borderBottomColor: colors.accent } : {}}
            >
              {t.icon}
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="ml-0.5 font-mono text-[10px] text-fg-muted">({t.badge})</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4">

          {/* ── Timeline ── */}
          {tab === "timeline" && (
            incident.logs.length === 0 ? (
              <p className="text-xs text-fg-muted text-center py-6">
                No timeline entries recorded for this incident.
              </p>
            ) : (
              <div className="flex flex-col gap-0">
                {incident.logs.map((entry, i) => (
                  <div key={entry.id} className="flex gap-3 items-start relative">
                    {/* Vertical connector line */}
                    {i < incident.logs.length - 1 && (
                      <div
                        className="absolute left-[11px] top-5 w-px bottom-0"
                        style={{ background: rgba(colors.line, 1), minHeight: "20px" }}
                      />
                    )}
                    {/* Icon */}
                    <div
                      className="shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center mt-0.5 z-10"
                      style={{ background: rgba(colors.line, 1), border: `1px solid ${colors.line}` }}
                    >
                      {LOG_ICONS[entry.type] ?? <Activity size={10} className="text-fg-muted" />}
                    </div>
                    {/* Content */}
                    <div className="pb-4 flex-1">
                      <p className="text-xs text-fg leading-snug">{entry.message}</p>
                      <p className="text-[10px] text-fg-muted font-mono mt-0.5">{fmt(entry.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── Transcript ── */}
          {tab === "transcript" && (
            incident.transcripts.length === 0 ? (
              <p className="text-xs text-fg-muted text-center py-6">
                No voice transcript recorded for this incident.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {incident.transcripts.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex gap-1.5 items-start ${entry.speaker === "user" ? "justify-end" : ""}`}
                  >
                    {entry.speaker === "assistant" && (
                      <Bot size={11} className="text-accent shrink-0 mt-0.5" />
                    )}
                    <div className="max-w-[82%]">
                      <p className={`text-[11px] leading-snug text-fg px-2.5 py-1.5 rounded-lg ${
                        entry.speaker === "user"
                          ? "bg-info/15 rounded-br-none"
                          : "bg-accent/10 rounded-bl-none"
                      }`}>
                        {entry.text}
                      </p>
                      <p className={`text-[10px] text-fg-muted font-mono mt-0.5 ${
                        entry.speaker === "user" ? "text-right" : ""
                      }`}>
                        {fmt(entry.timestamp)}
                      </p>
                    </div>
                    {entry.speaker === "user" && (
                      <User size={11} className="text-info shrink-0 mt-0.5" />
                    )}
                  </div>
                ))}
              </div>
            )
          )}

          {/* ── Report ── */}
          {tab === "report" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="section-label">AI Incident Report</p>
                {!incident.reportGenerated && (
                  <button
                    onClick={generateReport}
                    disabled={genReport}
                    className="flex items-center gap-1.5 bg-accent hover:bg-accent-dark border-none rounded px-3 py-1.5 text-white font-semibold text-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {genReport && <Loader2 size={12} className="animate-spin" />}
                    Generate Report
                  </button>
                )}
              </div>

              {incident.reportText ? (
                <div>
                  <p
                    className="text-xs text-fg leading-relaxed rounded border-l-2 px-3 py-2.5"
                    style={{ background: rgba(colors.accent, 0.06), borderLeftColor: colors.accent }}
                  >
                    {incident.reportText}
                  </p>
                  <button
                    onClick={() => {
                      const blob = new Blob([incident.reportText!], { type: "text/plain" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a");
                      a.href = url; a.download = `incident-${incident.eventId}.txt`; a.click();
                    }}
                    className="mt-3 bg-transparent border border-line rounded px-3 py-1.5 text-fg-muted hover:text-fg text-xs cursor-pointer transition-colors"
                  >
                    Download Report
                  </button>
                </div>
              ) : (
                <p className="text-xs text-fg-muted">
                  {incident.status === "RESOLVED"
                    ? "Click 'Generate Report' to create an AI-written incident summary."
                    : "Report generation is available once the incident is resolved."}
                </p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

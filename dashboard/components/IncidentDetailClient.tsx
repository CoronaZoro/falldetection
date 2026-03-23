"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";

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
}

interface Props {
  id: string;
  role: "ADMIN" | "RESPONDER";
}

export default function IncidentDetailClient({ id, role }: Props) {
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading]   = useState(true);
  const [notes, setNotes]       = useState("");
  const [genReport, setGenReport] = useState(false);

  useEffect(() => {
    fetch(`/api/incidents/${id}`).then((r) => r.json()).then((d) => {
      setIncident(d);
      setNotes(d.notes ?? "");
      setLoading(false);
    });
  }, [id]);

  async function saveNotes() {
    await fetch(`/api/incidents/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setIncident((prev) => prev ? { ...prev, notes } : prev);
  }

  async function generateReport() {
    setGenReport(true);
    const res  = await fetch(`/api/incidents/${id}/report`, { method: "POST" });
    const data = await res.json();
    setIncident((prev) => prev ? { ...prev, reportText: data.reportText, reportGenerated: true } : prev);
    setGenReport(false);
  }

  const backPath = role === "ADMIN" ? "/admin/incidents" : "/responder/incidents";

  if (loading) return <div className="text-[#4a5568] text-center pt-16">Loading...</div>;
  if (!incident) return <div className="text-[#ff3355] text-center pt-16">Incident not found</div>;

  const responseTime = incident.acknowledgedAt
    ? Math.round((new Date(incident.acknowledgedAt).getTime() - new Date(incident.createdAt).getTime()) / 1000)
    : null;

  return (
    <div className="flex flex-col gap-6 max-w-[700px]">
      <button
        onClick={() => router.push(backPath)}
        className="flex items-center gap-1.5 bg-transparent border-none text-[#4a5568] hover:text-[#c8d0e0] cursor-pointer text-sm p-0 transition-colors"
      >
        <ArrowLeft size={16} /> Back to incidents
      </button>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-base font-semibold text-[#c9d1e0]">Incident Detail</h1>
          <StatusBadge status={incident.type}   size="sm" />
          <StatusBadge status={incident.status} size="sm" />
        </div>
        <p className="text-xs text-[#4a5568] font-mono">{incident.eventId}</p>
      </div>

      {/* Data grid */}
      <div className="bg-[#111318] border border-[#1e2229] rounded p-4">
        <p className="section-label mb-3">Incident Data</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Person ID",         `#${incident.personId}`],
            ["Aspect Ratio",      incident.ar.toFixed(2)],
            ["Duration on ground",`${incident.downDuration.toFixed(1)}s`],
            ["Response time",     responseTime !== null ? `${responseTime}s` : "Not acknowledged"],
            ["Created",           new Date(incident.createdAt).toLocaleString()],
            ["Resolved",          incident.resolvedAt ? new Date(incident.resolvedAt).toLocaleString() : "—"],
            ["Acknowledged by",   incident.user?.name ?? "—"],
          ].map(([label, val]) => (
            <div key={label as string}>
              <p className="section-label mb-0.5">{label}</p>
              <p className="text-sm text-[#c9d1e0] font-mono">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-[#111318] border border-[#1e2229] rounded p-4">
        <p className="section-label mb-3">Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about this incident..."
          rows={4}
          className="w-full bg-[#0a0c10] border border-[#1e2229] rounded px-3 py-2 text-[#c9d1e0] text-xs outline-none focus:border-[#3b82f6] resize-y transition-colors"
        />
        <button
          onClick={saveNotes}
          className="mt-2 bg-[#3b82f6] hover:bg-[#2563eb] border-none rounded px-3 py-1.5 text-white font-semibold text-xs cursor-pointer transition-colors"
        >
          Save Notes
        </button>
      </div>

      {/* AI Report */}
      <div className="bg-[#111318] border border-[#1e2229] rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <FileText size={13} className="text-[#8b5cf6]" />
            <p className="section-label">AI Incident Report</p>
          </div>
          {!incident.reportGenerated && (
            <button
              onClick={generateReport}
              disabled={genReport}
              className="flex items-center gap-1.5 bg-[#8b5cf6] hover:bg-[#7c3aed] border-none rounded px-3 py-1.5 text-white font-semibold text-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {genReport && <Loader2 size={13} className="animate-spin" />}
              Generate Report
            </button>
          )}
        </div>

        {incident.reportText ? (
          <div>
            <p className="text-xs text-[#c9d1e0] leading-relaxed bg-[#8b5cf6]/06 rounded border-l-2 border-[#8b5cf6] px-3 py-2.5">
              {incident.reportText}
            </p>
            <button
              onClick={() => {
                const blob = new Blob([incident.reportText!], { type: "text/plain" });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement("a");
                a.href = url; a.download = `incident-${incident.eventId}.txt`; a.click();
              }}
              className="mt-3 bg-transparent border border-[#1e2229] rounded px-3 py-1.5 text-[#4a5568] hover:text-[#c9d1e0] text-xs cursor-pointer transition-colors"
            >
              Download Report
            </button>
          </div>
        ) : (
          <p className="text-xs text-[#4a5568]">
            {incident.status === "RESOLVED"
              ? "Click 'Generate Report' to create an AI-written incident summary."
              : "Report generation is available once the incident is resolved."}
          </p>
        )}
      </div>
    </div>
  );
}

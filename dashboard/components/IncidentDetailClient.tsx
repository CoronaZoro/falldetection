"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import {
  ArrowLeft,
  FileText,
  Loader2,
  ListOrdered,
  MessageSquare,
  AlertTriangle,
  Siren,
  CheckCircle,
  Activity,
  Bot,
  User,
  ChevronDown,
  Download,
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
  logs: IncidentLogEntry[];
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
  fall: <AlertTriangle size={11} className='text-danger shrink-0 mt-0.5' />,
  sos: <Siren size={11} className='text-warning shrink-0 mt-0.5' />,
  recovery: <CheckCircle size={11} className='text-success shrink-0 mt-0.5' />,
  ack: <Activity size={11} className='text-info    shrink-0 mt-0.5' />,
};

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function IncidentDetailClient({ id, role }: Props) {
  const router = useRouter();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [genReport, setGenReport] = useState(false);
  const [tab, setTab] = useState<Tab>("timeline");
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);

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
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setIncident((prev) => (prev ? { ...prev, notes } : prev));
  }

  async function generateReport() {
    setGenReport(true);
    const res = await fetch(`/api/incidents/${id}/report`, { method: "POST" });
    const data = await res.json();
    setIncident((prev) =>
      prev
        ? { ...prev, reportText: data.reportText, reportGenerated: true }
        : prev,
    );
    setGenReport(false);
  }

  function downloadTxt() {
    if (!incident?.reportText) return;
    const blob = new Blob([incident.reportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guardian-handover-${incident.eventId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setDlOpen(false);
  }

  async function downloadPdf() {
    if (!incident?.reportText) return;
    setDlOpen(false);
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const MARGIN = 48;
    const CONTENT_W = W - MARGIN * 2;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.setFillColor(4, 13, 18);
    doc.rect(0, 0, W, 56, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(193, 255, 114);
    doc.text("Guardian Fall Detection System", MARGIN, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(160, 160, 180);
    doc.text("Hospital Patient Handover Report", MARGIN, 40);

    // Event ID + timestamp (top-right)
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 150);
    const meta = `${incident.eventId}  ·  ${new Date(incident.createdAt).toLocaleString()}`;
    doc.text(meta, W - MARGIN, 40, { align: "right" });

    // ── Report body ──────────────────────────────────────────────────────────
    doc.setTextColor(30, 30, 40);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const lines = doc.splitTextToSize(incident.reportText, CONTENT_W);
    let y = 80;
    const LINE_H = 15;
    const PAGE_BOTTOM = H - MARGIN;

    for (const line of lines) {
      if (y + LINE_H > PAGE_BOTTOM) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(line, MARGIN, y);
      y += LINE_H;
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageCount = (
      doc.internal as unknown as { getNumberOfPages(): number }
    ).getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 175);
      doc.text(
        `Guardian · Confidential · Page ${p} of ${pageCount}`,
        W / 2,
        H - 18,
        { align: "center" },
      );
    }

    doc.save(`guardian-handover-${incident.eventId}.pdf`);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dlRef.current && !dlRef.current.contains(e.target as Node)) {
        setDlOpen(false);
      }
    }
    if (dlOpen) document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [dlOpen]);

  const backPath =
    role === "ADMIN" ? "/admin/incidents" : "/responder/incidents";

  if (loading)
    return <div className='text-fg-muted text-center pt-16'>Loading…</div>;
  if (!incident)
    return (
      <div className='text-danger text-center pt-16'>Incident not found</div>
    );

  const responseTime = incident.acknowledgedAt
    ? Math.round(
        (new Date(incident.acknowledgedAt).getTime() -
          new Date(incident.createdAt).getTime()) /
          1000,
      )
    : null;

  const TABS: {
    key: Tab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      key: "timeline",
      label: "Timeline",
      icon: <ListOrdered size={11} />,
      badge: incident.logs.length,
    },
    {
      key: "transcript",
      label: "Transcript",
      icon: <MessageSquare size={11} />,
      badge: incident.transcripts.length,
    },
    { key: "report", label: "Report", icon: <FileText size={11} /> },
  ];

  return (
    <div className='h-full flex flex-col gap-3 max-w-[720px] mx-auto overflow-hidden'>
      {/* Back */}
      <button
        onClick={() => router.push(backPath)}
        className='shrink-0 flex items-center gap-1.5 bg-transparent border-none text-fg-muted hover:text-fg cursor-pointer text-sm p-0 transition-colors w-fit'
      >
        <ArrowLeft size={14} /> Back to incidents
      </button>

      {/* Header */}
      <div className='shrink-0'>
        <div className='flex items-center gap-2 mb-1'>
          <h1 className='text-base font-semibold text-fg'>Incident Detail</h1>
          <StatusBadge status={incident.type} size='sm' />
          <StatusBadge status={incident.status} size='sm' />
        </div>
        <p className='text-xs text-fg-muted font-mono'>{incident.eventId}</p>
      </div>

      {/* Data grid */}
      <div className='shrink-0 bg-surface border border-line rounded p-3'>
        <p className='section-label mb-2'>Incident Data</p>
        <div className='grid grid-cols-2 sm:grid-cols-3 gap-2.5'>
          {[
            ["Person ID", `#${incident.personId}`],
            ["Aspect Ratio", incident.ar.toFixed(2)],
            ["Duration on ground", `${incident.downDuration.toFixed(1)}s`],
            [
              "Response time",
              responseTime !== null ? `${responseTime}s` : "Not acknowledged",
            ],
            ["Detected", new Date(incident.createdAt).toLocaleString()],
            [
              "Resolved",
              incident.resolvedAt
                ? new Date(incident.resolvedAt).toLocaleString()
                : "—",
            ],
            ["Acknowledged by", incident.user?.name ?? "—"],
          ].map(([label, val]) => (
            <div key={label as string}>
              <p className='section-label mb-0.5'>{label}</p>
              <p className='text-xs text-fg font-mono'>{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className='shrink-0 bg-surface border border-line rounded p-3 hidden'>
        <p className='section-label mb-2'>Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder='Add notes about this incident...'
          rows={2}
          className='w-full bg-page border border-line rounded px-3 py-2 text-fg text-xs outline-none focus:border-info resize-none transition-colors'
        />
        <button
          onClick={saveNotes}
          className='mt-1.5 bg-info hover:bg-info-dark border-none rounded px-3 py-1.5 text-white font-semibold text-xs cursor-pointer transition-colors'
        >
          Save Notes
        </button>
      </div>

      {/* Tabs: Timeline / Transcript / Report — fills remaining height */}
      <div className='flex-1 min-h-0 bg-surface border border-line rounded overflow-hidden flex flex-col'>
        {/* Tab bar */}
        <div className='shrink-0 flex border-b border-line'>
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
                <span className='ml-0.5 font-mono text-[10px] text-fg-muted'>
                  ({t.badge})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content — scrollable */}
        <div className='flex-1 min-h-0 overflow-y-auto p-4'>
          {/* ── Timeline ── */}
          {tab === "timeline" &&
            (incident.logs.length === 0 ? (
              <p className='text-xs text-fg-muted text-center py-6'>
                No timeline entries recorded for this incident.
              </p>
            ) : (
              <div className='flex flex-col gap-0'>
                {incident.logs.map((entry, i) => (
                  <div
                    key={entry.id}
                    className='flex gap-3 items-start relative'
                  >
                    {/* Vertical connector line */}
                    {i < incident.logs.length - 1 && (
                      <div
                        className='absolute left-[11px] top-5 w-px bottom-0'
                        style={{
                          background: rgba(colors.line, 1),
                          minHeight: "20px",
                        }}
                      />
                    )}
                    {/* Icon */}
                    <div
                      className='shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center mt-0.5 z-10'
                      style={{
                        background: rgba(colors.line, 1),
                        border: `1px solid ${colors.line}`,
                      }}
                    >
                      {LOG_ICONS[entry.type] ?? (
                        <Activity size={10} className='text-fg-muted' />
                      )}
                    </div>
                    {/* Content */}
                    <div className='pb-4 flex-1'>
                      <p className='text-xs text-fg leading-snug'>
                        {entry.message}
                      </p>
                      <p className='text-[10px] text-fg-muted font-mono mt-0.5'>
                        {fmt(entry.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))}

          {/* ── Transcript ── */}
          {tab === "transcript" &&
            (incident.transcripts.length === 0 ? (
              <p className='text-xs text-fg-muted text-center py-6'>
                No voice transcript recorded for this incident.
              </p>
            ) : (
              <div className='flex flex-col gap-2 pb-6'>
                {incident.transcripts.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex gap-1.5 items-start ${entry.speaker === "user" ? "justify-end" : ""}`}
                  >
                    {entry.speaker === "assistant" && (
                      <Bot size={11} className='text-accent shrink-0 mt-0.5' />
                    )}
                    <div className='max-w-[82%]'>
                      <p
                        className={`text-[11px] leading-snug text-fg px-2.5 py-1.5 rounded-lg ${
                          entry.speaker === "user"
                            ? "bg-info/15 rounded-br-none"
                            : "bg-accent/10 rounded-bl-none"
                        }`}
                      >
                        {entry.text}
                      </p>
                      <p
                        className={`text-[10px] text-fg-muted font-mono mt-0.5 ${
                          entry.speaker === "user" ? "text-right" : ""
                        }`}
                      >
                        {fmt(entry.timestamp)}
                      </p>
                    </div>
                    {entry.speaker === "user" && (
                      <User size={11} className='text-info shrink-0 mt-0.5' />
                    )}
                  </div>
                ))}
              </div>
            ))}

          {/* ── Report ── */}
          {tab === "report" && (
            <div className='flex flex-col gap-4'>
              {/* Header row */}
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='text-xs font-semibold text-fg'>
                    Hospital Handover Summary
                  </p>
                  <p className='text-[10px] text-fg-muted mt-0.5'>
                    AI-generated from incident logs, voice transcript, and
                    sensor data.
                    {incident.reportGenerated &&
                      " Regenerate to reflect latest notes."}
                  </p>
                </div>
                <button
                  onClick={generateReport}
                  disabled={genReport}
                  className='shrink-0 flex items-center gap-1.5 bg-accent/12 hover:bg-accent/22 border border-accent/30 rounded-full px-3 py-1.5 text-accent font-semibold text-[11px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95'
                >
                  {genReport ? (
                    <>
                      <Loader2 size={11} className='animate-spin' /> Generating…
                    </>
                  ) : incident.reportGenerated ? (
                    "↻ Regenerate"
                  ) : (
                    "Generate"
                  )}
                </button>
              </div>

              {/* Report body */}
              {genReport && !incident.reportText && (
                <div className='flex items-center gap-2 text-xs text-fg-muted py-8 justify-center'>
                  <Loader2 size={14} className='animate-spin text-accent' />
                  Analysing logs and transcript…
                </div>
              )}

              {incident.reportText && (
                <div className='flex flex-col gap-3'>
                  {/* Structured display */}
                  <div className='bg-page border border-line rounded-lg px-4 py-3.5'>
                    <div className='flex items-center gap-1.5 mb-3 pb-2.5 border-b border-line'>
                      <FileText size={11} className='text-accent' />
                      <span className='text-[10px] font-semibold uppercase tracking-widest text-fg-muted'>
                        Guardian Fall Detection System · Patient Handover
                      </span>
                    </div>
                    <p className='text-[11px] text-fg leading-relaxed whitespace-pre-wrap'>
                      {incident.reportText}
                    </p>
                    <div className='mt-3 pt-2.5 border-t border-line flex items-center justify-between'>
                      <span className='text-[9px] text-fg-muted font-mono'>
                        {incident.eventId} ·{" "}
                        {new Date(incident.createdAt).toLocaleString()}
                      </span>

                      {/* ── Download dropdown ── */}
                      <div ref={dlRef} className='relative'>
                        <button
                          onClick={() => setDlOpen((o) => !o)}
                          className='flex items-center gap-1.5 text-[10px] text-fg-muted hover:text-fg border border-line hover:border-line/80 rounded px-2.5 py-1 cursor-pointer transition-colors'
                        >
                          <Download size={10} />
                          Download
                          <ChevronDown
                            size={9}
                            className={`transition-transform ${dlOpen ? "rotate-180" : ""}`}
                          />
                        </button>

                        {dlOpen && (
                          <div className='absolute right-0 bottom-full mb-1.5 w-36 bg-surface border border-line rounded-lg shadow-lg overflow-hidden z-20'>
                            <button
                              onClick={downloadTxt}
                              className='w-full flex items-center gap-2 px-3 py-2 text-[11px] text-fg-muted hover:text-fg hover:bg-line/10 transition-colors cursor-pointer'
                            >
                              <FileText size={11} className='text-accent/70' />
                              Plain Text (.txt)
                            </button>
                            <button
                              onClick={downloadPdf}
                              className='w-full flex items-center gap-2 px-3 py-2 text-[11px] text-fg-muted hover:text-fg hover:bg-line/10 transition-colors cursor-pointer'
                            >
                              <FileText size={11} className='text-accent/70' />
                              PDF Document (.pdf)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!incident.reportText && !genReport && (
                <div className='flex flex-col items-center justify-center gap-2 py-10 text-center'>
                  <FileText size={22} className='text-fg-muted/30' />
                  <p className='text-xs font-medium text-fg/60'>
                    No report yet
                  </p>
                  <p className='text-[10px] text-fg-muted/50 max-w-[260px] leading-relaxed'>
                    Click Generate to create a hospital handover summary using
                    the full incident log and voice transcript.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

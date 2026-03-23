"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { Filter, ExternalLink } from "lucide-react";

interface IncidentRow {
  id: string;
  eventId: string;
  type: string;
  status: string;
  personId: number;
  ar: number;
  downDuration: number;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  user?: { name: string } | null;
}

const selectCls = "bg-[#0a0c10] border border-[#1e2229] rounded px-2.5 py-1.5 text-[#c8d0e0] text-sm outline-none focus:border-[#3b82f6] transition-colors";

export default function AdminIncidentsClient() {
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [typeFilter, setTypeFilter]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const p = new URLSearchParams({ limit: "100" });
    if (typeFilter)   p.set("type", typeFilter);
    if (statusFilter) p.set("status", statusFilter);
    setLoading(true);
    fetch(`/api/incidents?${p}`).then((r) => r.json()).then((d) => { setIncidents(d); setLoading(false); });
  }, [typeFilter, statusFilter]);

  function responseTime(row: IncidentRow) {
    if (!row.acknowledgedAt) return "—";
    return `${Math.round((new Date(row.acknowledgedAt).getTime() - new Date(row.createdAt).getTime()) / 1000)}s`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-base font-semibold text-[#c9d1e0]">Incident History</h1>
          <p className="section-label mt-0.5">{incidents.length} incidents</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={12} className="text-[#4a5568]" />
          <select value={typeFilter}   onChange={(e) => setTypeFilter(e.target.value)}   className={selectCls}>
            <option value="">All Types</option>
            <option value="FALL">Fall</option>
            <option value="SOS">SOS</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="">All Statuses</option>
            <option value="UNACKNOWLEDGED">Unacknowledged</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESPONDING">Responding</option>
            <option value="ON_SCENE">On Scene</option>
            <option value="RESOLVED">Resolved</option>
            <option value="FALSE_ALARM">False Alarm</option>
          </select>
        </div>
      </div>

      <div className="bg-[#111318] border border-[#1e2229] rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#1e2229]">
                {["Time", "Type", "Person", "Duration", "AR", "Responder", "Response", "Status", ""].map((h) => (
                  <th key={h} className="py-2.5 px-3 text-left section-label whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-8 text-center text-[#4a5568]">Loading...</td></tr>
              ) : incidents.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-[#4a5568]">No incidents found</td></tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} className="border-b border-[#1e2229]">
                    <td className="py-2.5 px-3 text-[#4a5568] font-mono whitespace-nowrap">
                      {new Date(inc.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3"><StatusBadge status={inc.type} /></td>
                    <td className="py-2.5 px-3 text-[#c9d1e0] font-mono">#{inc.personId}</td>
                    <td className="py-2.5 px-3 text-[#c9d1e0] font-mono">{inc.downDuration.toFixed(1)}s</td>
                    <td className="py-2.5 px-3 text-[#c9d1e0] font-mono">{inc.ar.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-[#c9d1e0]">{inc.user?.name ?? "—"}</td>
                    <td className="py-2.5 px-3 text-[#c9d1e0] font-mono">{responseTime(inc)}</td>
                    <td className="py-2.5 px-3"><StatusBadge status={inc.status} /></td>
                    <td className="py-2.5 px-3">
                      <Link href={`/admin/incidents/${inc.id}`} className="text-[#3b82f6] flex items-center hover:text-[#60a5fa]">
                        <ExternalLink size={13} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

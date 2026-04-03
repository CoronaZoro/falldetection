"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { Filter, ExternalLink } from "lucide-react";

interface IncidentRow {
  id: string; eventId: string; type: string; status: string;
  personId: number; ar: number; downDuration: number;
  createdAt: string; acknowledgedAt: string | null; resolvedAt: string | null;
  user?: { name: string } | null;
}

const selectCls = "bg-page border border-line rounded px-2.5 py-1.5 text-fg text-sm outline-none focus:border-info transition-colors";

export default function AdminIncidentsClient() {
  const [incidents, setIncidents]       = useState<IncidentRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [typeFilter, setTypeFilter]     = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const p = new URLSearchParams({ limit: "100" });
    if (typeFilter)   p.set("type", typeFilter);
    if (statusFilter) p.set("status", statusFilter);
    setLoading(true);
    fetch(`/api/incidents?${p}`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setIncidents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [typeFilter, statusFilter]);

  function responseTime(row: IncidentRow) {
    if (!row.acknowledgedAt) return "—";
    return `${Math.round((new Date(row.acknowledgedAt).getTime() - new Date(row.createdAt).getTime()) / 1000)}s`;
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <div>
          <h1 className='text-base font-semibold text-fg'>Incident History</h1>
          <p className='section-label mt-0.5'>{incidents.length} incidents</p>
        </div>
        <div className='flex items-center gap-2'>
          <Filter size={12} className='text-fg-muted' />
          <select value={typeFilter}   onChange={(e) => setTypeFilter(e.target.value)}   className={selectCls}>
            <option value=''>All Types</option>
            <option value='FALL'>Fall</option>
            <option value='SOS'>SOS</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value=''>All Statuses</option>
            <option value='UNACKNOWLEDGED'>Unacknowledged</option>
            <option value='ACKNOWLEDGED'>Acknowledged</option>
            <option value='RESPONDING'>Responding</option>
            <option value='ON_SCENE'>On Scene</option>
            <option value='RESOLVED'>Resolved</option>
            <option value='FALSE_ALARM'>False Alarm</option>
          </select>
        </div>
      </div>

      <div className='bg-surface border border-line rounded overflow-hidden'>
        <div className='overflow-auto max-h-[calc(100vh-16rem)]'>
          <table className='w-full border-collapse text-xs'>
            <thead>
              <tr className='border-b border-line'>
                {["Time", "Type", "Person", "Duration", "AR", "Responder", "Response", "Status", ""].map((h) => (
                  <th key={h} className='py-2.5 px-3 text-left section-label whitespace-nowrap sticky top-0 bg-surface z-10'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className='py-8 text-center text-fg-muted'>Loading...</td></tr>
              ) : incidents.length === 0 ? (
                <tr><td colSpan={9} className='py-8 text-center text-fg-muted'>No incidents found</td></tr>
              ) : (
                incidents.map((inc) => (
                  <tr key={inc.id} className='border-b border-line'>
                    <td className='py-2.5 px-3 text-fg-muted font-mono whitespace-nowrap'>
                      {new Date(inc.createdAt).toLocaleString()}
                    </td>
                    <td className='py-2.5 px-3'><StatusBadge status={inc.type} /></td>
                    <td className='py-2.5 px-3 text-fg font-mono'>#{inc.personId}</td>
                    <td className='py-2.5 px-3 text-fg font-mono'>{inc.downDuration.toFixed(1)}s</td>
                    <td className='py-2.5 px-3 text-fg font-mono'>{inc.ar.toFixed(2)}</td>
                    <td className='py-2.5 px-3 text-fg'>{inc.user?.name ?? "—"}</td>
                    <td className='py-2.5 px-3 text-fg font-mono'>{responseTime(inc)}</td>
                    <td className='py-2.5 px-3'><StatusBadge status={inc.status} /></td>
                    <td className='py-2.5 px-3'>
                      <Link href={`/admin/incidents/${inc.id}`} className='text-info flex items-center hover:text-info-light'>
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { ExternalLink } from "lucide-react";

interface Row {
  id: string;
  type: string;
  status: string;
  downDuration: number;
  ar: number;
  createdAt: string;
  acknowledgedAt: string | null;
}

export default function ResponderIncidentsPage() {
  const [incidents, setIncidents] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/incidents?limit=50")
      .then((r) => r.json())
      .then((d) => {
        setIncidents(d);
        setLoading(false);
      });
  }, []);

  return (
    <div className='h-full flex flex-col gap-3 max-w-[900px] mx-auto'>
      {/* Static header */}
      <div className='shrink-0'>
        <h1 className='text-base font-semibold text-fg'>Incident Logs</h1>
        <p className='section-label mt-0.5'>Incidents you have acknowledged</p>
      </div>

      {/* Table — fills remaining height, scrolls inside */}
      <div className='flex-1 min-h-0 bg-surface border border-line rounded overflow-hidden flex flex-col'>
        {/* Sticky thead wrapper */}
        <div className='shrink-0 overflow-x-auto border-b border-line'>
          <table className='w-full border-collapse text-xs'>
            <thead>
              <tr>
                {["Time", "Type", "Duration", "AR", "Response", "Status", ""].map((h) => (
                  <th key={h} className='py-2.5 px-3 text-left section-label whitespace-nowrap'>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        {/* Scrollable body */}
        <div className='flex-1 min-h-0 overflow-y-auto overflow-x-auto'>
          <table className='w-full border-collapse text-xs'>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className='py-12 text-center text-fg-muted'>
                    Loading…
                  </td>
                </tr>
              ) : incidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-12 text-center text-fg-muted'>
                    No incidents yet
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => {
                  const rt = inc.acknowledgedAt
                    ? `${Math.round(
                        (new Date(inc.acknowledgedAt).getTime() - new Date(inc.createdAt).getTime()) / 1000,
                      )}s`
                    : "—";
                  return (
                    <tr key={inc.id} className='border-b border-line hover:bg-elevated/40 transition-colors'>
                      <td className='py-2.5 px-3 text-fg-muted font-mono whitespace-nowrap text-[11px]'>
                        {new Date(inc.createdAt).toLocaleString()}
                      </td>
                      <td className='py-2.5 px-3'>
                        <StatusBadge status={inc.type} />
                      </td>
                      <td className='py-2.5 px-3 text-fg font-mono text-[11px]'>
                        {inc.downDuration.toFixed(1)}s
                      </td>
                      <td className='py-2.5 px-3 text-fg font-mono text-[11px]'>
                        {inc.ar.toFixed(2)}
                      </td>
                      <td className='py-2.5 px-3 text-fg font-mono text-[11px]'>
                        {rt}
                      </td>
                      <td className='py-2.5 px-3'>
                        <StatusBadge status={inc.status} />
                      </td>
                      <td className='py-2.5 px-3'>
                        <Link
                          href={`/responder/incidents/${inc.id}`}
                          className='text-info flex items-center hover:text-info-light transition-colors'
                        >
                          <ExternalLink size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

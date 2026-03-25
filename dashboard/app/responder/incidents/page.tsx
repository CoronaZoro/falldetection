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
    <div className='max-w-[900px] mx-auto flex flex-col gap-4'>
      <div>
        <h1 className='text-base font-semibold text-[#c9d1e0]'>
          Incident Logs
        </h1>
        <p className='section-label mt-0.5'>Incidents you have acknowledged</p>
      </div>

      <div className='bg-[#111318] border border-line rounded overflow-hidden'>
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-xs'>
            <thead>
              <tr className='border-b border-line'>
                {[
                  "Time",
                  "Type",
                  "Duration",
                  "AR",
                  "Response",
                  "Status",
                  "",
                ].map((h) => (
                  <th key={h} className='py-2.5 px-3 text-left section-label'>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className='py-8 text-center text-[#4a5568]'>
                    Loading...
                  </td>
                </tr>
              ) : incidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-8 text-center text-[#4a5568]'>
                    No incidents yet
                  </td>
                </tr>
              ) : (
                incidents.map((inc) => {
                  const rt = inc.acknowledgedAt
                    ? `${Math.round((new Date(inc.acknowledgedAt).getTime() - new Date(inc.createdAt).getTime()) / 1000)}s`
                    : "—";
                  return (
                    <tr key={inc.id} className='border-b border-[#1e2229]'>
                      <td className='py-2.5 px-3 text-[#4a5568] font-mono whitespace-nowrap'>
                        {new Date(inc.createdAt).toLocaleString()}
                      </td>
                      <td className='py-2.5 px-3'>
                        <StatusBadge status={inc.type} />
                      </td>
                      <td className='py-2.5 px-3 text-[#c9d1e0] font-mono'>
                        {inc.downDuration.toFixed(1)}s
                      </td>
                      <td className='py-2.5 px-3 text-[#c9d1e0] font-mono'>
                        {inc.ar.toFixed(2)}
                      </td>
                      <td className='py-2.5 px-3 text-[#c9d1e0] font-mono'>
                        {rt}
                      </td>
                      <td className='py-2.5 px-3'>
                        <StatusBadge status={inc.status} />
                      </td>
                      <td className='py-2.5 px-3'>
                        <Link
                          href={`/responder/incidents/${inc.id}`}
                          className='text-[#3b82f6] flex items-center hover:text-[#60a5fa]'
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

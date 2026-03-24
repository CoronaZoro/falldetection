"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import StatusBadge from "@/components/StatusBadge";
import { AlertTriangle, Clock, TrendingUp, Activity, Users } from "lucide-react";
import { colors } from "@/lib/colors";

interface Analytics {
  fallsToday: number; fallsWeek: number; fallsMonth: number;
  totalIncidents: number; avgResponseTime: number;
  recentIncidents: IncidentRow[];
  fallsPerDayChart: { date: string; count: number }[];
  responseTimeChart: { date: string; seconds: number }[];
  typeBreakdown: { name: string; value: number }[];
}

interface IncidentRow {
  id: string; type: string; status: string; createdAt: string;
  downDuration: number; ar: number; user?: { name: string } | null;
}

const PIE_COLORS = [colors.danger, colors.warning];

const TOOLTIP_STYLE = {
  background: colors.surface,
  border: `1px solid ${colors.line}`,
  borderRadius: "6px",
  color: colors.fg,
  fontSize: "12px",
};

function StatCard({ label, value, icon, iconBg }: {
  label: string; value: string | number; icon: React.ReactNode; iconBg: string;
}) {
  return (
    <div className='bg-surface border border-line rounded px-4 py-3 flex items-center gap-3'>
      <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className='section-label'>{label}</p>
        <p className='text-xl font-bold font-mono text-fg leading-tight'>{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='bg-surface border border-line rounded p-3'>
      <p className='section-label mb-3'>{title}</p>
      {children}
    </div>
  );
}

export default function AdminOverviewClient() {
  const [data, setData]       = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className='text-fg-muted text-center pt-16'>Loading analytics...</div>;
  if (!data)   return null;

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <h1 className='text-base font-semibold text-fg'>System Overview</h1>
        <p className='section-label mt-0.5'>Real-time monitoring dashboard</p>
      </div>

      {/* Stat cards */}
      <div className='grid gap-3' style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <StatCard label='Falls Today'      value={data.fallsToday}     icon={<AlertTriangle size={18} className='text-danger' />}  iconBg='bg-danger/10'  />
        <StatCard label='Falls This Week'  value={data.fallsWeek}      icon={<TrendingUp    size={18} className='text-warning' />} iconBg='bg-warning/10' />
        <StatCard label='Falls This Month' value={data.fallsMonth}     icon={<Activity      size={18} className='text-info' />}    iconBg='bg-info/10'    />
        <StatCard label='Total Incidents'  value={data.totalIncidents} icon={<Users         size={18} className='text-accent' />}  iconBg='bg-accent/10'  />
        <StatCard
          label='Avg Response'
          value={data.avgResponseTime > 0 ? `${data.avgResponseTime}s` : "N/A"}
          icon={<Clock size={18} className='text-success' />}
          iconBg='bg-success/10'
        />
      </div>

      {/* Charts row */}
      <div className='grid gap-3' style={{ gridTemplateColumns: "1fr 1fr 200px" }}>
        <ChartCard title='Falls Per Day (7d)'>
          <ResponsiveContainer width='100%' height={160}>
            <LineChart data={data.fallsPerDayChart}>
              <XAxis dataKey='date' tick={{ fontSize: 10, fill: colors.fgMuted }} />
              <YAxis tick={{ fontSize: 10, fill: colors.fgMuted }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type='monotone' dataKey='count' stroke={colors.danger} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title='Response Times (s)'>
          <ResponsiveContainer width='100%' height={160}>
            <BarChart data={data.responseTimeChart}>
              <XAxis dataKey='date' tick={{ fontSize: 10, fill: colors.fgMuted }} />
              <YAxis tick={{ fontSize: 10, fill: colors.fgMuted }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey='seconds' fill={colors.info} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title='Incident Types'>
          <ResponsiveContainer width='100%' height={120}>
            <PieChart>
              <Pie data={data.typeBreakdown} dataKey='value' cx='50%' cy='50%' outerRadius={50}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {data.typeBreakdown.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className='flex gap-2 flex-wrap justify-center mt-1'>
            {data.typeBreakdown.map((item, i) => (
              <span key={i} className='flex items-center gap-1 text-[11px]' style={{ color: PIE_COLORS[i] }}>
                <span className='w-2 h-2 rounded-full inline-block' style={{ background: PIE_COLORS[i] }} />
                {item.name}
              </span>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Recent incidents */}
      <div className='bg-surface border border-line rounded p-3'>
        <p className='section-label mb-3'>Recent Incidents</p>
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse text-xs'>
            <thead>
              <tr className='border-b border-line'>
                {["Time", "Type", "Duration", "AR", "Responder", "Status"].map((h) => (
                  <th key={h} className='py-2 px-3 text-left section-label font-medium'>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recentIncidents.length === 0 ? (
                <tr><td colSpan={6} className='py-6 text-center text-fg-muted'>No incidents yet</td></tr>
              ) : (
                data.recentIncidents.map((inc) => (
                  <tr key={inc.id} className='border-b border-line'>
                    <td className='py-2 px-3 text-fg-muted font-mono whitespace-nowrap'>
                      {new Date(inc.createdAt).toLocaleTimeString()}
                    </td>
                    <td className='py-2 px-3'><StatusBadge status={inc.type} /></td>
                    <td className='py-2 px-3 text-fg font-mono'>{inc.downDuration.toFixed(1)}s</td>
                    <td className='py-2 px-3 text-fg font-mono'>{inc.ar.toFixed(2)}</td>
                    <td className='py-2 px-3 text-fg'>{inc.user?.name ?? "—"}</td>
                    <td className='py-2 px-3'><StatusBadge status={inc.status} /></td>
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

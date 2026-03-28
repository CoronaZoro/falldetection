"use client";

import { colors, rgba } from "@/lib/colors";

const CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  // ── Detection states ──────────────────────────────────────────────────────
  STABLE:     { label: "STABLE",      color: colors.success, bg: rgba(colors.success, 0.08), border: rgba(colors.success, 0.18) },
  MONITORING: { label: "MONITORING",  color: colors.success, bg: rgba(colors.success, 0.08), border: rgba(colors.success, 0.18) },
  SLEEPING:   { label: "SLEEPING",    color: colors.accent,  bg: rgba(colors.accent,  0.08), border: rgba(colors.accent,  0.20) },
  TRANSITION: { label: "TRANSITION",  color: colors.warning, bg: rgba(colors.warning, 0.08), border: rgba(colors.warning, 0.20) },
  VALIDATION: { label: "VALIDATING",  color: colors.warning, bg: rgba(colors.warning, 0.08), border: rgba(colors.warning, 0.20) },
  INACTIVITY: { label: "INACTIVITY",  color: colors.warning, bg: rgba(colors.warning, 0.08), border: rgba(colors.warning, 0.20) },
  ALARM:      { label: "ALARM",       color: colors.danger,  bg: rgba(colors.danger,  0.10), border: rgba(colors.danger,  0.22) },
  RECOVERY:   { label: "RECOVERY",    color: colors.success, bg: rgba(colors.success, 0.08), border: rgba(colors.success, 0.18) },

  // ── Incident statuses ─────────────────────────────────────────────────────
  UNACKNOWLEDGED: { label: "UNACKNOWLEDGED", color: colors.danger,  bg: rgba(colors.danger,  0.10), border: rgba(colors.danger,  0.22) },
  ACKNOWLEDGED:   { label: "ACKNOWLEDGED",   color: colors.info,    bg: rgba(colors.info,    0.08), border: rgba(colors.info,    0.20) },
  RESPONDING:     { label: "RESPONDING",     color: colors.warning, bg: rgba(colors.warning, 0.08), border: rgba(colors.warning, 0.20) },
  ON_SCENE:       { label: "ON SCENE",       color: colors.accent,  bg: rgba(colors.accent,  0.08), border: rgba(colors.accent,  0.20) },
  RESOLVED:       { label: "RESOLVED",       color: colors.success, bg: rgba(colors.success, 0.08), border: rgba(colors.success, 0.18) },
  RECOVERED:      { label: "FALL — RECOVERED", color: colors.success, bg: rgba(colors.success, 0.08), border: rgba(colors.success, 0.18) },
  FALSE_ALARM:    { label: "FALSE ALARM",    color: colors.fgMuted, bg: rgba(colors.fgMuted, 0.08), border: rgba(colors.fgMuted, 0.20) },

  // ── Misc ──────────────────────────────────────────────────────────────────
  ONLINE:    { label: "ONLINE",     color: colors.success, bg: rgba(colors.success, 0.08), border: rgba(colors.success, 0.18) },
  OFFLINE:   { label: "OFFLINE",   color: colors.danger,  bg: rgba(colors.danger,  0.10), border: rgba(colors.danger,  0.22) },
  FALL:      { label: "FALL",      color: colors.danger,  bg: rgba(colors.danger,  0.10), border: rgba(colors.danger,  0.22) },
  SOS:       { label: "SOS",       color: colors.warning, bg: rgba(colors.warning, 0.08), border: rgba(colors.warning, 0.20) },
  ADMIN:     { label: "ADMIN",     color: colors.accent,  bg: rgba(colors.accent,  0.08), border: rgba(colors.accent,  0.20) },
  RESPONDER: { label: "RESPONDER", color: colors.info,    bg: rgba(colors.info,    0.08), border: rgba(colors.info,    0.20) },
};

const FALLBACK = {
  color:  colors.fgMuted,
  bg:     rgba(colors.fgMuted, 0.08),
  border: rgba(colors.fgMuted, 0.20),
};

interface Props {
  status: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

export default function StatusBadge({ status, size = "sm", pulse = false }: Props) {
  const cfg = CONFIG[status] ?? { label: status, ...FALLBACK };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold uppercase tracking-widest border rounded whitespace-nowrap ${
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-[11px] px-2.5 py-1"
      }`}
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
    >
      {pulse && (
        <span
          className='inline-block w-1.5 h-1.5 rounded-full shrink-0 animate-pulse-red'
          style={{ background: cfg.color }}
        />
      )}
      {cfg.label}
    </span>
  );
}

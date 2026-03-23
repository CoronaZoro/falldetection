"use client";

const CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  STABLE: {
    label: "STABLE",
    color: "#00ff88",
    bg: "rgba(0,255,136,0.08)",
    border: "rgba(0,255,136,0.18)",
  },
  MONITORING: {
    label: "MONITORING",
    color: "#00ff88",
    bg: "rgba(0,255,136,0.08)",
    border: "rgba(0,255,136,0.18)",
  },
  TRANSITION: {
    label: "TRANSITION",
    color: "#ffaa00",
    bg: "rgba(255,170,0,0.08)",
    border: "rgba(255,170,0,0.2)",
  },
  VALIDATION: {
    label: "VALIDATING",
    color: "#ffaa00",
    bg: "rgba(255,170,0,0.08)",
    border: "rgba(255,170,0,0.2)",
  },
  ALARM: {
    label: "ALARM",
    color: "#ff3355",
    bg: "rgba(255,51,85,0.1)",
    border: "rgba(255,51,85,0.22)",
  },
  RECOVERY: {
    label: "RECOVERY",
    color: "#00ff88",
    bg: "rgba(0,255,136,0.08)",
    border: "rgba(0,255,136,0.18)",
  },
  UNACKNOWLEDGED: {
    label: "UNACKNOWLEDGED",
    color: "#ff3355",
    bg: "rgba(255,51,85,0.1)",
    border: "rgba(255,51,85,0.22)",
  },
  ACKNOWLEDGED: {
    label: "ACKNOWLEDGED",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.2)",
  },
  RESPONDING: {
    label: "RESPONDING",
    color: "#ffaa00",
    bg: "rgba(255,170,0,0.08)",
    border: "rgba(255,170,0,0.2)",
  },
  ON_SCENE: {
    label: "ON SCENE",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.2)",
  },
  RESOLVED: {
    label: "RESOLVED",
    color: "#00ff88",
    bg: "rgba(0,255,136,0.08)",
    border: "rgba(0,255,136,0.18)",
  },
  FALSE_ALARM: {
    label: "FALSE ALARM",
    color: "#4a5568",
    bg: "rgba(74,85,104,0.08)",
    border: "rgba(74,85,104,0.2)",
  },
  ONLINE: {
    label: "ONLINE",
    color: "#00ff88",
    bg: "rgba(0,255,136,0.08)",
    border: "rgba(0,255,136,0.18)",
  },
  OFFLINE: {
    label: "OFFLINE",
    color: "#ff3355",
    bg: "rgba(255,51,85,0.1)",
    border: "rgba(255,51,85,0.22)",
  },
  FALL: {
    label: "FALL",
    color: "#ff3355",
    bg: "rgba(255,51,85,0.1)",
    border: "rgba(255,51,85,0.22)",
  },
  SOS: {
    label: "SOS",
    color: "#ffaa00",
    bg: "rgba(255,170,0,0.08)",
    border: "rgba(255,170,0,0.2)",
  },
  ADMIN: {
    label: "ADMIN",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.08)",
    border: "rgba(139,92,246,0.2)",
  },
  RESPONDER: {
    label: "RESPONDER",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.08)",
    border: "rgba(59,130,246,0.2)",
  },
};

interface Props {
  status: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

export default function StatusBadge({
  status,
  size = "sm",
  pulse = false,
}: Props) {
  const cfg = CONFIG[status] ?? {
    label: status,
    color: "#4a5568",
    bg: "rgba(74,85,104,0.08)",
    border: "rgba(74,85,104,0.2)",
  };

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

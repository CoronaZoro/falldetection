/**
 * GUARDIAN — Color system
 *
 * Single source of truth for all color values used across the dashboard.
 * CSS @theme tokens in globals.css mirror these exact values.
 * Use Tailwind token classes (bg-surface, text-danger, etc.) in JSX where possible.
 * Use these constants in inline style={} props and JS color configs (e.g. StatusBadge, charts).
 */

export const colors = {
  // ── Backgrounds ─────────────────────────────────────────────────
  page:     "#0a0c10",   // outermost page background
  surface:  "#111318",   // card / panel background
  elevated: "#161b24",   // modals, tooltips

  // ── Borders ─────────────────────────────────────────────────────
  line:      "#1e2229",  // default border
  lineMuted: "#2a3040",  // muted border, placeholder text

  // ── Text ────────────────────────────────────────────────────────
  fg:      "#c9d1e0",    // primary text
  fgMuted: "#4a5568",    // secondary / muted text

  // ── Semantic ────────────────────────────────────────────────────
  danger:     "#ff3355", // fall alert, alarm, error, UNACKNOWLEDGED
  warning:    "#ffaa00", // SOS, transition, RESPONDING
  success:    "#00ff88", // stable, resolved, online, recovery
  info:       "#3b82f6", // acknowledged, primary action
  infoDark:   "#2563eb", // hover state for info buttons
  infoLight:  "#60a5fa", // subtle info links/hover
  accent:     "#8b5cf6", // on-scene, admin role, AI chat
  accentDark: "#7c3aed", // hover for accent
} as const;

export type ColorKey = keyof typeof colors;

/**
 * Returns an rgba() string for a hex color at the given opacity (0–1).
 * Use for inline style props where Tailwind opacity modifiers can't apply.
 *
 * @example rgba(colors.danger, 0.1) → "rgba(255,51,85,0.1)"
 */
export function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

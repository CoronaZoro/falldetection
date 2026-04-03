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
  page: "#000000", // outermost page background
  surface: "#040d12", // card / panel background
  elevated: "#1e1e1e", // modals, tooltips

  // ── Borders ─────────────────────────────────────────────────────
  line: "#1e2229", // default border
  lineMuted: "#2a3040", // muted border, placeholder text

  // ── Text ────────────────────────────────────────────────────────
  fg: "#c9d1e0", // primary text
  fgMuted: "#4a5568", // secondary / muted text

  // ── Semantic ────────────────────────────────────────────────────
  danger: "#bb2124", // fall alert, alarm, error, UNACKNOWLEDGED
  warning: "#f0ad4e", // SOS, transition, RESPONDING
  success: "#22bb33", // stable, resolved, online, recovery
  info: "#3b82f6", // acknowledged, primary action
  infoDark: "#2563eb", // hover state for info buttons
  infoLight: "#60a5fa", // subtle info links/hover
  accent: "#c1ff72", // on-scene, admin role, AI chat
  accentDark: "#7c3aed", // hover for accent
  accentLight: "#faf6f0", // subtle accent bg
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

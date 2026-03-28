"use client";

import { useEffect, useState } from "react";
import { Save, Info, Mic, Cpu } from "lucide-react";
import type { SystemConfig } from "@/types";

function Slider({ label, desc, value, min, max, step, onChange }: {
  label: string; desc: string; value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className='bg-page border border-line rounded p-3'>
      <div className='flex justify-between items-start mb-3'>
        <div>
          <p className='text-xs font-semibold text-fg'>{label}</p>
          <p className='section-label mt-0.5 normal-case tracking-normal font-normal'>{desc}</p>
        </div>
        <span className='font-mono text-base font-bold text-info bg-info/10 border border-info/20 rounded px-2 py-0.5 min-w-[52px] text-center shrink-0 ml-3'>
          {value}
        </span>
      </div>
      <input
        type='range'
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className='w-full accent-info'
      />
      <div className='flex justify-between text-[10px] text-fg-muted mt-1'>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

const VAD_TIERS = [
  { label: "Sensitive", agg: 0, pause: "100 ms", use: "Soft voices · quiet room"  },
  { label: "Balanced",  agg: 1, pause: "300 ms", use: "Normal speech · indoors"   },
  { label: "Clear",     agg: 2, pause: "600 ms", use: "Clear speech · some noise" },
  { label: "Strict",    agg: 3, pause: "1200 ms",use: "Loud speech · noisy room"  },
];

export default function AdminSettingsClient() {
  const [config, setConfig]   = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setConfig(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    if (!config) return;
    setSaving(true);
    await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const upd = (k: keyof SystemConfig, v: unknown) =>
    setConfig((c) => c ? { ...c, [k]: v } : c);

  return (
    <div className='flex flex-col gap-6 max-w-2xl'>

      {/* Header */}
      <div>
        <h1 className='text-base font-semibold text-fg'>Settings</h1>
        <p className='section-label mt-0.5'>Detection thresholds, camera, and voice configuration</p>
      </div>

      <div className='flex gap-2 items-start bg-info/[0.08] border border-info/20 rounded p-3'>
        <Info size={16} className='text-info shrink-0 mt-0.5' />
        <p className='text-[13px] text-fg-muted leading-relaxed'>
          Detection and camera changes are saved to the database. Restart the Python engine to apply new thresholds.
          Voice &amp; VAD settings are per-call and set by the responder from their dashboard.
        </p>
      </div>

      {/* ── Fall Detection ──────────────────────────────────────── */}
      <section className='flex flex-col gap-3'>
        <div className='flex items-center gap-2'>
          <Cpu size={13} className='text-fg-muted' />
          <p className='text-xs font-semibold text-fg'>Fall Detection</p>
        </div>

        {loading || !config ? (
          <div className='text-fg-muted text-sm py-4 text-center'>Loading…</div>
        ) : (
          <div className='bg-surface border border-line rounded p-3 flex flex-col gap-3'>
            <Slider
              label='AR Threshold'
              desc='Minimum aspect ratio (width/height) to classify as "down". Standing ≈ 0.9–1.3, fallen ≈ 2–3.'
              value={config.arThreshold} min={1.0} max={3.0} step={0.1}
              onChange={(v) => upd("arThreshold", v)}
            />
            <Slider
              label='Max Transition Time (s)'
              desc='Transitions slower than this are treated as intentional lying down, not a fall.'
              value={config.transitionTime} min={0.5} max={3.0} step={0.1}
              onChange={(v) => upd("transitionTime", v)}
            />
            <Slider
              label='Confirm Seconds (s)'
              desc='Person must be down this long without movement before the alarm triggers.'
              value={config.confirmSeconds} min={1.0} max={5.0} step={0.5}
              onChange={(v) => upd("confirmSeconds", v)}
            />
            <Slider
              label='Escalation Timer (s)'
              desc='Countdown before auto-escalation if no responder acknowledges.'
              value={config.escalationSeconds} min={5} max={60} step={5}
              onChange={(v) => upd("escalationSeconds", v)}
            />
          </div>
        )}
      </section>

      {/* ── Camera ──────────────────────────────────────────────── */}
      <section className='flex flex-col gap-3'>
        <div className='flex items-center gap-2'>
          <Cpu size={13} className='text-fg-muted' />
          <p className='text-xs font-semibold text-fg'>Camera</p>
        </div>

        {config && (
          <div className='bg-surface border border-line rounded p-3'>
            <div className='bg-page border border-line rounded p-3'>
              <p className='text-xs font-semibold text-fg mb-0.5'>Camera Index</p>
              <p className='section-label mb-2.5 normal-case tracking-normal font-normal'>
                0 = default webcam · 1 = second camera · etc.
              </p>
              <input
                type='number' min={0} max={5}
                value={config.cameraIndex}
                onChange={(e) => upd("cameraIndex", parseInt(e.target.value))}
                className='w-20 bg-surface border border-line rounded px-3 py-2 text-fg text-sm font-mono outline-none focus:border-info transition-colors'
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Save button ─────────────────────────────────────────── */}
      {config && (
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center justify-center gap-2 rounded py-2.5 font-semibold text-sm cursor-pointer border-none transition-colors disabled:opacity-70 disabled:cursor-not-allowed max-w-2xl ${
            saved ? "bg-success text-page" : "bg-info hover:bg-info-dark text-white"
          }`}
        >
          <Save size={16} />
          {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
        </button>
      )}

      {/* ── Voice & VAD ─────────────────────────────────────────── */}
      <section className='flex flex-col gap-3'>
        <div className='flex items-center gap-2'>
          <Mic size={13} className='text-fg-muted' />
          <p className='text-xs font-semibold text-fg'>Voice &amp; VAD</p>
          <span className='text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/20 tracking-wide'>
            WebRTC VAD
          </span>
        </div>

        <div className='bg-surface border border-line rounded p-4 flex flex-col gap-4'>

          {/* Description */}
          <p className='text-xs text-fg-muted leading-relaxed'>
            The voice assistant uses <span className='text-fg font-medium'>Google WebRTC VAD</span> for
            speech detection. Audio is classified in 30 ms frames; a 300 ms pre-roll buffer prevents
            clipping. Sensitivity and pause threshold are set per-call from the responder's Voice
            Assistant panel.
          </p>

          {/* Sensitivity tiers table */}
          <div>
            <p className='section-label mb-2'>Sensitivity Tiers (set by responder per call)</p>
            <div className='bg-page border border-line rounded overflow-hidden'>
              <table className='w-full border-collapse text-xs'>
                <thead>
                  <tr className='border-b border-line'>
                    {["Level", "VAD aggressiveness", "Silence threshold", "Best for"].map((h) => (
                      <th key={h} className='py-2 px-3 text-left section-label whitespace-nowrap'>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {VAD_TIERS.map((t, i) => (
                    <tr key={t.label} className={i < VAD_TIERS.length - 1 ? "border-b border-line" : ""}>
                      <td className='py-2 px-3 text-fg font-medium'>{t.label}</td>
                      <td className='py-2 px-3 text-fg font-mono'>{t.agg}</td>
                      <td className='py-2 px-3 text-fg font-mono'>{t.pause}</td>
                      <td className='py-2 px-3 text-fg-muted'>{t.use}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Language + Speed */}
          <div className='grid grid-cols-2 gap-3'>
            <div className='bg-page border border-line rounded p-3'>
              <p className='section-label mb-1.5'>Supported Languages</p>
              <div className='flex flex-wrap gap-1.5'>
                {["English", "Thai", "Japanese", "Chinese"].map((lang) => (
                  <span key={lang} className='text-[11px] px-2 py-0.5 rounded bg-line text-fg-muted'>{lang}</span>
                ))}
              </div>
              <p className='text-[11px] text-fg-muted mt-2 leading-snug'>
                Auto-detects spoken language and responds in kind.
              </p>
            </div>

            <div className='bg-page border border-line rounded p-3'>
              <p className='section-label mb-1.5'>Speaking Speed</p>
              <div className='flex flex-wrap gap-1.5'>
                {["0.5x", "0.75x", "1x", "1.25x", "1.5x", "2x"].map((s) => (
                  <span key={s} className='text-[11px] px-2 py-0.5 rounded bg-line text-fg-muted font-mono'>{s}</span>
                ))}
              </div>
              <p className='text-[11px] text-fg-muted mt-2 leading-snug'>
                Changeable mid-call without restarting the session.
              </p>
            </div>
          </div>

          {/* Platform note */}
          <div className='flex gap-2 items-start bg-warning/[0.07] border border-warning/20 rounded p-3'>
            <Info size={14} className='text-warning shrink-0 mt-0.5' />
            <p className='text-[12px] text-fg-muted leading-relaxed'>
              TTS playback uses <span className='text-fg font-mono text-[11px]'>afplay</span> (macOS only).
              For Linux/Windows, replace with <span className='text-fg font-mono text-[11px]'>mpg123</span> or{" "}
              <span className='text-fg font-mono text-[11px]'>ffplay</span> in <span className='text-fg font-mono text-[11px]'>alerts/voice.py</span>.
            </p>
          </div>

        </div>
      </section>

    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, Info, Cpu, Activity, CheckCircle, Zap } from "lucide-react";
import type { SystemConfig } from "@/types";

const DETECTION_API = (process.env.NEXT_PUBLIC_DETECTION_WS_URL ?? "ws://localhost:8765/ws")
  .replace("ws://", "http://")
  .replace("/ws", "");

function Slider({
  label, desc, value, min, max, step, unit = "", onChange,
}: {
  label: string; desc: string; value: number;
  min: number; max: number; step: number; unit?: string;
  onChange: (v: number) => void;
}) {
  const display = Number.isInteger(step) ? value.toString() : value.toFixed(step < 0.1 ? 2 : 1);
  return (
    <div className='bg-page border border-line rounded p-3'>
      <div className='flex justify-between items-start mb-3'>
        <div>
          <p className='text-xs font-semibold text-fg'>{label}</p>
          <p className='section-label mt-0.5 normal-case tracking-normal font-normal'>{desc}</p>
        </div>
        <span className='font-mono text-base font-bold text-info bg-info/10 border border-info/20 rounded px-2 py-0.5 min-w-[52px] text-center shrink-0 ml-3'>
          {display}{unit}
        </span>
      </div>
      <input
        type='range' min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className='w-full accent-info'
      />
      <div className='flex justify-between text-[10px] text-fg-muted mt-1'>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <section className='flex flex-col gap-3'>
      <div className='flex items-center gap-2'>
        <Icon size={13} className='text-fg-muted' />
        <p className='text-xs font-semibold text-fg'>{title}</p>
      </div>
      <div className='bg-surface border border-line rounded p-3 flex flex-col gap-3'>
        {children}
      </div>
    </section>
  );
}

export default function AdminSettingsClient() {
  const [config, setConfig]   = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [synced,  setSynced]  = useState(false);

  // On mount: load from DB then push to FastAPI to ensure engine is in sync
  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.ok ? r.json() : null)
      .then(async (d) => {
        if (!d) return;
        setConfig(d);
        // Push to FastAPI to sync engine with stored config
        await fetch(`${DETECTION_API}/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        }).catch(() => {});
        setSynced(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const upd = useCallback((k: keyof SystemConfig, v: unknown) =>
    setConfig((c) => c ? { ...c, [k]: v } : c), []);

  async function save() {
    if (!config) return;
    setSaving(true);
    setSynced(false);
    await fetch("/api/admin/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
    setSynced(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className='flex flex-col gap-6 max-w-2xl'>

      {/* Header */}
      <div className='flex items-start justify-between'>
        <div>
          <h1 className='text-base font-semibold text-fg'>Detection Settings</h1>
          <p className='section-label mt-0.5'>Thresholds applied in real-time — no restart required</p>
        </div>
        {synced && (
          <span className='flex items-center gap-1.5 text-[11px] font-semibold text-success bg-success/10 border border-success/20 rounded px-2.5 py-1'>
            <CheckCircle size={11} /> Engine synced
          </span>
        )}
      </div>

      {/* Info banner */}
      <div className='flex gap-2 items-start bg-info/[0.08] border border-info/20 rounded p-3'>
        <Zap size={15} className='text-info shrink-0 mt-0.5' />
        <p className='text-[13px] text-fg-muted leading-relaxed'>
          All changes are saved to the database and pushed to the detection engine immediately.
          Camera index takes effect on next engine restart.
        </p>
      </div>

      {loading || !config ? (
        <div className='text-fg-muted text-sm py-8 text-center flex items-center justify-center gap-2'>
          <Activity size={14} className='animate-spin' /> Loading…
        </div>
      ) : (
        <>
          {/* ── Fall Detection Thresholds ──────────────────────── */}
          <Section icon={Cpu} title='Fall Detection'>
            <Slider
              label='AR Threshold'
              desc='Minimum aspect ratio (width÷height) to classify a bounding box as "down". Standing ≈ 0.9–1.3, fallen ≈ 2–3.'
              value={config.arThreshold} min={1.0} max={3.0} step={0.1}
              onChange={(v) => upd("arThreshold", v)}
            />
            <Slider
              label='Confirm Duration'
              desc='Person must remain down this long without movement before the alarm triggers.'
              value={config.confirmSeconds} min={0.5} max={5.0} step={0.5} unit='s'
              onChange={(v) => upd("confirmSeconds", v)}
            />
            <Slider
              label='Max Transition Time'
              desc='Falls slower than this (no pose) are treated as intentional lying down.'
              value={config.transitionTime} min={0.5} max={3.0} step={0.1} unit='s'
              onChange={(v) => upd("transitionTime", v)}
            />
          </Section>

          {/* ── Velocity & Pose ────────────────────────────────── */}
          <Section icon={Activity} title='Velocity & Pose (Skeleton)'>
            <Slider
              label='Fall Velocity Threshold'
              desc='Hip downward velocity (normalised screen units/s) above this instantly classifies as a fall.'
              value={config.fallVelThreshold} min={0.10} max={1.0} step={0.05}
              onChange={(v) => upd("fallVelThreshold", v)}
            />
            <Slider
              label='Sleep Velocity Threshold'
              desc='Hip velocity below this treats the motion as intentional lying down (sleep), not a fall.'
              value={config.sleepVelThreshold} min={0.05} max={0.5} step={0.05}
              onChange={(v) => upd("sleepVelThreshold", v)}
            />
            <Slider
              label='Spine Angle Threshold'
              desc='Degrees from vertical. Body is considered horizontal (fallen) above this angle.'
              value={config.poseSpineFallen} min={20} max={80} step={5} unit='°'
              onChange={(v) => upd("poseSpineFallen", v)}
            />
            <Slider
              label='Movement Threshold'
              desc='Bounding-box centre movement (px) below which the person is considered still.'
              value={config.movementThreshold} min={2} max={30} step={1} unit='px'
              onChange={(v) => upd("movementThreshold", v)}
            />
          </Section>

          {/* ── Recovery ───────────────────────────────────────── */}
          <Section icon={CheckCircle} title='Recovery'>
            <Slider
              label='Recovery Label Time'
              desc='Seconds the person must be upright (up or bending) before recovery is confirmed.'
              value={config.recoveryLabelTime} min={0.2} max={2.0} step={0.1} unit='s'
              onChange={(v) => upd("recoveryLabelTime", v)}
            />
          </Section>

          {/* ── Escalation ─────────────────────────────────────── */}
          <Section icon={Zap} title='Escalation'>
            <Slider
              label='Escalation Timer'
              desc='Countdown before auto-escalating if no responder acknowledges the alert.'
              value={config.escalationSeconds} min={5} max={60} step={5} unit='s'
              onChange={(v) => upd("escalationSeconds", v)}
            />
          </Section>

          {/* ── Camera ─────────────────────────────────────────── */}
          <Section icon={Cpu} title='Camera'>
            <div className='bg-page border border-line rounded p-3'>
              <p className='text-xs font-semibold text-fg mb-0.5'>Camera Index</p>
              <p className='section-label mb-2.5 normal-case tracking-normal font-normal'>
                0 = default webcam · 1 = second camera · Takes effect on engine restart.
              </p>
              <input
                type='number' min={0} max={5}
                value={config.cameraIndex}
                onChange={(e) => upd("cameraIndex", parseInt(e.target.value))}
                className='w-20 bg-surface border border-line rounded px-3 py-2 text-fg text-sm font-mono outline-none focus:border-info transition-colors'
              />
            </div>
          </Section>

          {/* ── Save ───────────────────────────────────────────── */}
          <button
            onClick={save}
            disabled={saving}
            className={`flex items-center justify-center gap-2 rounded py-2.5 font-semibold text-sm cursor-pointer border-none transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${
              saved ? "bg-success text-page" : "bg-info hover:bg-info-dark text-white"
            }`}
          >
            <Save size={15} />
            {saving ? "Applying…" : saved ? "Applied!" : "Save & Apply"}
          </button>
        </>
      )}
    </div>
  );
}

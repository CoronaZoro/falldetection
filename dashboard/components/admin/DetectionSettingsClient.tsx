"use client";

import { useEffect, useState } from "react";
import { Save, Info } from "lucide-react";
import type { SystemConfig } from "@/types";

function Slider({
  label, desc, value, min, max, step, onChange,
}: {
  label: string; desc: string; value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="bg-[#0a0c10] border border-[#1e2229] rounded p-3">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-xs font-semibold text-[#c9d1e0]">{label}</p>
          <p className="section-label mt-0.5 normal-case tracking-normal font-normal">{desc}</p>
        </div>
        <span className="font-mono text-base font-bold text-[#3b82f6] bg-[#3b82f6]/10 border border-[#3b82f6]/20 rounded px-2 py-0.5 min-w-[52px] text-center shrink-0 ml-3">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#3b82f6]"
      />
      <div className="flex justify-between text-[10px] text-[#4a5568] mt-1">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export default function DetectionSettingsClient() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  useEffect(() => {
    fetch("/api/admin/config").then((r) => r.json()).then((d) => { setConfig(d); setLoading(false); });
  }, []);

  async function save() {
    if (!config) return;
    setSaving(true);
    await fetch("/api/admin/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading || !config) return <div className="text-[#4a5568] text-center pt-16">Loading...</div>;

  const upd = (k: keyof SystemConfig, v: unknown) => setConfig((c) => c ? { ...c, [k]: v } : c);

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h1 className="text-base font-semibold text-[#c9d1e0]">Detection Settings</h1>
        <p className="section-label mt-0.5">Tune the fall detection thresholds</p>
      </div>

      <div className="flex gap-2 items-start bg-[#3b82f6]/08 border border-[#3b82f6]/20 rounded p-3">
        <Info size={16} className="text-[#3b82f6] shrink-0 mt-0.5" />
        <p className="text-[13px] text-[#4a5568] leading-relaxed">
          Changes saved here update the database only. Restart the Python detection engine to apply new thresholds.
        </p>
      </div>

      <div className="bg-[#111318] border border-[#1e2229] rounded p-3 flex flex-col gap-3">
        <Slider
          label="AR Threshold"
          desc="Minimum aspect ratio (width/height) to classify as 'down'. Standing ≈ 0.9–1.3, fallen ≈ 2–3."
          value={config.arThreshold} min={1.0} max={3.0} step={0.1}
          onChange={(v) => upd("arThreshold", v)}
        />
        <Slider
          label="Max Transition Time (s)"
          desc="Transitions slower than this are treated as intentional lying down, not a fall."
          value={config.transitionTime} min={0.5} max={3.0} step={0.1}
          onChange={(v) => upd("transitionTime", v)}
        />
        <Slider
          label="Confirm Seconds (s)"
          desc="Person must be down this long (without movement) before alarm triggers."
          value={config.confirmSeconds} min={1.0} max={5.0} step={0.5}
          onChange={(v) => upd("confirmSeconds", v)}
        />
        <Slider
          label="Escalation Timer (s)"
          desc="Countdown before auto-escalation if no responder acknowledges."
          value={config.escalationSeconds} min={5} max={60} step={5}
          onChange={(v) => upd("escalationSeconds", v)}
        />

        {/* Camera index */}
        <div className="bg-[#0a0c10] border border-[#1e2229] rounded p-3">
          <p className="text-xs font-semibold text-[#c9d1e0] mb-0.5">Camera Index</p>
          <p className="section-label mb-2.5 normal-case tracking-normal font-normal">0 = default webcam, 1 = second camera, etc.</p>
          <input
            type="number"
            min={0} max={5}
            value={config.cameraIndex}
            onChange={(e) => upd("cameraIndex", parseInt(e.target.value))}
            className="w-20 bg-[#111318] border border-[#1e2229] rounded px-3 py-2 text-[#c9d1e0] text-sm font-mono outline-none focus:border-[#3b82f6] transition-colors"
          />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className={`flex items-center justify-center gap-2 rounded py-2.5 font-semibold text-sm cursor-pointer border-none transition-colors disabled:opacity-70 disabled:cursor-not-allowed ${
          saved ? "bg-[#00ff88] text-[#0a0c10]" : "bg-[#3b82f6] hover:bg-[#2563eb] text-white"
        }`}
      >
        <Save size={16} />
        {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}

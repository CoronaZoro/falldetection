"use client";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111318] border border-[#1e2229] rounded p-3">
      <p className="section-label mb-3">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, color = "text-[#c9d1e0]" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-[#1e2229] text-xs last:border-0">
      <span className="text-[#4a5568]">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}

export default function SystemPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-base font-semibold text-[#c9d1e0]">System Health</h1>
        <p className="section-label mt-0.5">Dashboard and detection engine status</p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Card title="Dashboard (Next.js)">
          <Row label="Port"       value="3000"                     />
          <Row label="Framework"  value="Next.js 14 App Router"    />
          <Row label="Auth"       value="NextAuth v5 (JWT)"        />
          <Row label="Database"   value="SQLite via Prisma"        />
          <Row label="Status"     value="ONLINE" color="text-[#00ff88]" />
        </Card>

        <Card title="Detection Engine (Python)">
          <Row label="WebSocket"   value="ws://localhost:8765/ws"      />
          <Row label="Video feed"  value="http://localhost:8765/video" />
          <Row label="Model"       value="YOLO11 Nano"                 />
          <Row label="Accelerator" value="MPS (Apple Silicon)"        />
          <Row label="Status"      value="See responder dashboard" color="text-[#ffaa00]" />
        </Card>

        <Card title="AI Services">
          <Row label="Chat model"   value="claude-sonnet-4-20250514"  />
          <Row label="Report model" value="claude-sonnet-4-20250514"  />
          <Row label="SDK"          value="@anthropic-ai/sdk"         />
          <Row label="API Key"      value="Set in .env.local"         />
        </Card>
      </div>

      <Card title="Architecture">
        <pre className="text-xs text-[#4a5568] font-mono leading-loose whitespace-pre">
{`MacBook M4 (single machine)
├── Python detection engine (port 8765)
│   ├── YOLOv11 + OpenCV + MediaPipe
│   ├── FastAPI WebSocket server
│   └── MJPEG video stream
└── Next.js dashboard (port 3000)
    ├── WebSocket client → localhost:8765
    ├── Prisma + SQLite
    └── Anthropic Claude API`}
        </pre>
      </Card>
    </div>
  );
}

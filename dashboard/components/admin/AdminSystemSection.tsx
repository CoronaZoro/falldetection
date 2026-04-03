"use client";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='bg-surface border border-line rounded p-3'>
      <p className='section-label mb-3'>{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className='flex justify-between py-1.5 border-b border-line text-xs last:border-0'>
      <span className='text-fg-muted'>{label}</span>
      <span className={`font-mono ${color ?? "text-fg"}`}>{value}</span>
    </div>
  );
}

export default function AdminSystemSection() {
  return (
    <div className='flex flex-col gap-4 max-w-3xl'>
      <div>
        <h1 className='text-base font-semibold text-fg'>System</h1>
        <p className='section-label mt-0.5'>Dashboard and detection engine status</p>
      </div>

      <div className='grid gap-3' style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <Card title='Dashboard (Next.js)'>
          <Row label='Port'      value='3000'                  />
          <Row label='Framework' value='Next.js 14 App Router' />
          <Row label='Auth'      value='NextAuth v5 (JWT)'     />
          <Row label='Database'  value='SQLite via Prisma'     />
          <Row label='Status'    value='ONLINE' color='text-success' />
        </Card>

        <Card title='Detection Engine (Python)'>
          <Row label='WebSocket'  value='ws://localhost:8765/ws'      />
          <Row label='Video feed' value='http://localhost:8765/video' />
          <Row label='Model'      value='YOLO11 Nano'                 />
          <Row label='Accelerator'value='MPS (Apple Silicon)'         />
          <Row label='Status'     value='See responder dashboard' color='text-warning' />
        </Card>

        <Card title='Voice Assistant'>
          <Row label='VAD'        value='WebRTC VAD (webrtcvad)'     />
          <Row label='STT'        value='Google Speech Recognition'  />
          <Row label='LLM'        value='claude-haiku-4-20250514'    />
          <Row label='TTS'        value='Edge TTS + afplay (macOS)'  />
          <Row label='Module'     value='alerts/voice.py'            />
        </Card>

        <Card title='AI Services'>
          <Row label='Chat model'   value='claude-sonnet-4-20250514' />
          <Row label='Report model' value='claude-sonnet-4-20250514' />
          <Row label='SDK'          value='@anthropic-ai/sdk'        />
          <Row label='API Key'      value='Set in .env.local'        />
        </Card>
      </div>

      <Card title='Architecture'>
        <pre className='text-xs text-fg-muted font-mono leading-loose whitespace-pre'>
{`MacBook / Server (single machine)
├── Python detection engine  (port 8765)
│   ├── YOLO11 + OpenCV  — frame classification
│   ├── alerts/fall_logic.py  — fall state machine
│   ├── alerts/server.py  — FastAPI WS + MJPEG + escalation
│   └── alerts/voice.py  — WebRTC VAD · STT · Claude · TTS
└── Next.js dashboard  (port 3000)
    ├── WebSocket client → localhost:8765/ws
    ├── Prisma + SQLite  — incidents, logs, users
    └── Anthropic Claude API  — chat + report generation`}
        </pre>
      </Card>
    </div>
  );
}

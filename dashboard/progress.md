# GUARDIAN Dashboard — Progress

## Tech Stack
- Next.js 14 App Router + TypeScript (strict)
- Tailwind CSS v4 (no config file, @theme directive)
- Prisma + SQLite
- NextAuth v5 (JWT sessions)
- Recharts
- Anthropic SDK (@anthropic-ai/sdk)
- Lucide React icons
- Dark theme only (#0a0c10 base)

## File Structure
```
dashboard/
├── app/
│   ├── layout.tsx               Root layout + fonts
│   ├── page.tsx                 Redirects by role
│   ├── globals.css              Tailwind v4 + @theme + animations
│   ├── login/page.tsx           Login page (both roles)
│   ├── api/
│   │   ├── auth/[...nextauth]/  NextAuth handler
│   │   ├── chat/route.ts        Claude AI chatbot
│   │   ├── incidents/           GET/POST incidents
│   │   │   └── [id]/            GET/PUT + report POST + log POST + transcript POST
│   │   └── admin/
│   │       ├── users/           GET/POST users
│   │       │   └── [id]/        PUT/DELETE user
│   │       ├── config/          GET/PUT system config
│   │       └── analytics/       GET analytics data
│   ├── admin/
│   │   ├── layout.tsx           Admin layout (sidebar)
│   │   ├── dashboard/page.tsx   Overview + charts
│   │   ├── users/page.tsx       User management CRUD
│   │   ├── detection/page.tsx   Threshold sliders
│   │   ├── camera/page.tsx      Camera settings
│   │   ├── incidents/           List + detail
│   │   └── system/page.tsx      System health info
│   └── responder/
│       ├── layout.tsx           Responder layout (top nav)
│       ├── dashboard/page.tsx   Main live dashboard
│       ├── incidents/           List + detail
│       └── profile/page.tsx     User profile
├── components/
│   ├── StatusBadge.tsx          Color-coded status badge
│   ├── CountdownBar.tsx         15s countdown timer
│   ├── LiveFeed.tsx             MJPEG img wrapper
│   ├── EventLog.tsx             Scrollable event log
│   ├── IncidentDetailClient.tsx Shared incident detail
│   ├── responder/
│   │   ├── ResponderNav.tsx     Top navigation bar
│   │   ├── ResponderDashboardClient.tsx  Main dashboard
│   │   ├── ChatPanel.tsx        AI first aid chatbot
│   │   └── VoiceLog.tsx         Voice transcript panel
│   └── admin/
│       ├── AdminSidebar.tsx     Left sidebar navigation
│       ├── AdminOverviewClient.tsx  Analytics + charts
│       ├── AdminUsersClient.tsx     User management
│       ├── AdminIncidentsClient.tsx Incidents table
│       └── DetectionSettingsClient.tsx Sliders
├── hooks/
│   └── useWebSocket.ts          Auto-reconnect WS hook
├── lib/
│   └── db.ts                    Prisma singleton
├── types/
│   ├── index.ts                 All TypeScript types
│   └── next-auth.d.ts           Session type augmentation
├── prisma/
│   ├── schema.prisma            DB schema
│   └── seed.ts                  Seed admin + responder
├── auth.ts                      NextAuth config
├── middleware.ts                Role-based route guard
├── next.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── package.json
├── .env.local                   Runtime environment variables (Next.js)
└── .env                         Prisma CLI variables (DATABASE_URL only)
```

## Completed Features

### Phase 1 — Core ✅
- [x] Next.js 14 + TypeScript strict + Tailwind v4
- [x] Prisma schema (User, Incident, SystemConfig)
- [x] Seed: admin@guardian.com / admin123, responder@guardian.com / resp123
- [x] NextAuth v5 JWT auth
- [x] Role-based middleware (ADMIN vs RESPONDER routing)
- [x] Login page with demo credentials

### Phase 2 — Responder Dashboard ✅
- [x] WebSocket hook (auto-reconnect every 3s)
- [x] Live MJPEG feed component with error fallback
- [x] Fall alert + SOS alert banners
- [x] 15s countdown timer with color change
- [x] Acknowledge button → sends ACK to Python
- [x] Status flow: ACKNOWLEDGED → RESPONDING → ON_SCENE → RESOLVED/FALSE_ALARM
- [x] Incidents saved to DB on detection
- [x] Event log (last 50 events, timestamped)
- [x] Voice alert transcript log
- [x] AI First Aid chatbot (Claude claude-sonnet-4-20250514)

### Phase 3 — Admin Dashboard ✅
- [x] System overview with stat cards
- [x] Analytics charts: falls/day line, response time bar, type pie
- [x] User management CRUD (add/edit/deactivate/delete)
- [x] Detection threshold sliders (AR, transition, confirm, escalation)
- [x] Incident history with type/status filters
- [x] Incident detail with notes
- [x] AI incident report generator (Claude, on RESOLVED)
- [x] System health page

## API Routes
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | /api/incidents | List / create incidents |
| GET/PUT | /api/incidents/[id] | Get (with logs + transcripts) / update incident |
| POST | /api/incidents/[id]/report | Generate AI report |
| GET/POST | /api/incidents/[id]/log | Fetch / append incident timeline entries |
| GET/POST | /api/incidents/[id]/transcript | Fetch / append voice transcript entries |
| GET/POST | /api/admin/users | List / create users |
| PUT/DELETE | /api/admin/users/[id] | Edit / delete user |
| GET/PUT | /api/admin/config | Get / update system config |
| GET | /api/admin/analytics | Analytics data |
| POST | /api/chat | AI chatbot (Claude) |

## Setup Commands
```bash
cd dashboard
npm install
# .env.local — for Next.js runtime (copy from .env.local.example and fill in keys)
# .env — for Prisma CLI (only needs DATABASE_URL)
echo 'DATABASE_URL="file:./dev.db"' > .env
npm run db:push          # Create SQLite schema
npm run db:seed          # Seed admin + responder accounts
npm run dev              # Start on port 3000
```

## Design System

### Color Tokens (`lib/colors.ts` + `globals.css @theme`)
All colors are defined in **one place**: `lib/colors.ts` exports JS constants; `globals.css @theme` defines matching Tailwind tokens. To change a color, edit both.

| Token | Tailwind class | Value | Use |
|-------|---------------|-------|-----|
| page | `bg-page` | #0a0c10 | Page background |
| surface | `bg-surface` | #111318 | Cards, panels |
| elevated | `bg-elevated` | #161b24 | Modals, tooltips |
| line | `border-line` | #1e2229 | All borders |
| line-muted | `border-line-muted` | #2a3040 | Muted borders, placeholders |
| fg | `text-fg` | #c9d1e0 | Primary text |
| fg-muted | `text-fg-muted` | #4a5568 | Secondary text, labels |
| danger | `text-danger` / `bg-danger` | #ff3355 | Fall alert, alarm, error |
| warning | `text-warning` / `bg-warning` | #ffaa00 | SOS, transition, responding |
| success | `text-success` / `bg-success` | #00ff88 | Stable, resolved, online |
| info | `text-info` / `bg-info` | #3b82f6 | Primary actions, acknowledged |
| info-dark | `bg-info-dark` | #2563eb | Info button hover |
| info-light | `text-info-light` | #60a5fa | Link hover |
| accent | `text-accent` / `bg-accent` | #8b5cf6 | On-scene, admin, AI chat |
| accent-dark | `bg-accent-dark` | #7c3aed | Accent hover |

JS-only uses (charts, StatusBadge CONFIG, dynamic inline styles):
```ts
import { colors, rgba } from "@/lib/colors";
colors.danger          // "#ff3355"
rgba(colors.danger, 0.1) // "rgba(255,51,85,0.1)"
```

## Responder Dashboard Layout
```
┌─ Status bar (h-9) ──────────────────────────────────────────────┐
│ [STABLE badge] [context text]          [persons] [name] [conn]  │
├─ Left column (50%) ──────────┬─ Right column (50%) ────────────┤
│  Live feed (aspect-video)    │  Alert card (shrink-0, max 264px)│
│                              │  ─ idle: compact "all clear"     │
│  Event log (flex-1, scroll)  │  ─ alarm: headline+countdown+ack │
│                              │                                  │
│                              │  ChatPanel (flex-1, fills rest)  │
│                              │  ─ first-class AI assistant      │
└──────────────────────────────┴──────────────────────────────────┘
Mobile: right col first (alert+chat), left col below (feed+log)
```

## Phase 4 — Voice AI Integration ✅

### Authorization Tier System
- [x] `isAuthorized` field added to `User` model (Prisma migration via `db push`)
- [x] Passed through NextAuth JWT → session → responder dashboard
- [x] Admin UI: "Authorized healthcare provider" checkbox in user create/edit modal
- [x] Admin table: shows `ShieldCheck` (authorized) / `ShieldOff` (unauthorized) per responder
- [x] API routes (`POST /api/admin/users`, `PUT /api/admin/users/[id]`) handle `isAuthorized`

### Voice Assistant Panel (Gemini Live-style)
- [x] `ChatPanel.tsx` full rewrite: Start/Stop call button, Gemini-style pulsing phone icon, language picker
- [x] Idle + no history: large centered pulsing phone button + language dropdown
- [x] Active call: pulsing mic + "Listening…" text + red End Call button
- [x] Idle + has history: compact "New Call" button row with language picker
- [x] Authorized badge: `ShieldCheck` green — "Clinical guidance enabled"
- [x] Unauthorized badge: `ShieldOff` amber — "Emergency contacts only"
- [x] Live "●live" indicator when call is active
- [x] Transcript entries: user speech (right, blue bubble), AI reply (left, purple bubble)
- [x] `VoiceEntry` type: `{ speaker: "user"|"assistant", text, timestamp }`

### Voice Session API
- [x] `POST /call/start` — starts headless voice loop in daemon thread
- [x] `POST /call/stop` — stops loop + kills TTS subprocess
- [x] `GET /call/status` — returns `{ active: bool }` (fetched on dashboard mount)
- [x] `call_status` WS message syncs button state across all clients
- [x] Language picker (English / Thai / Japanese / Chinese) sends language to server
- [x] `is_authorized` flag sent so server picks correct system prompt tier

### Deduplication
- [x] `mid` counter in `_tx()` — each `voice_alert` broadcast has a unique monotonic ID
- [x] `seenMids` `useRef<Set<number>>` on client — drops duplicate messages from React StrictMode double-WS-connections
- [x] Set cleared at 200 entries to prevent unbounded memory growth

### FastAPI `/transcript` endpoint
- [x] `POST /transcript` added to `alerts/server.py`
- [x] Accepts `{ speaker: "user"|"assistant", text: string }` (Pydantic model)
- [x] Broadcasts as `voice_alert` WS message with `speaker` field to all dashboards
- [x] Zero changes to the voice script — it just needs to POST here

### WS protocol update
- [x] `WSMessage` type extended with `speaker?: "user" | "assistant"`
- [x] `voice_alert` handler in `ResponderDashboardClient` now extracts speaker
- [x] Transcript state (`VoiceEntry[]`) maintained separately from event log
- [x] Event log shows `You: ...` / `AI: ...` prefix for voice entries

### Seed accounts updated
| Email | Password | Tier |
|-------|----------|------|
| admin@guardian.com | admin123 | ADMIN |
| responder@guardian.com | resp123 | RESPONDER, AUTHORIZED |
| responder2@guardian.com | resp456 | RESPONDER, UNAUTHORIZED |

## Phase 5 — Incident-Aware Event Log & Context-Aware Voice Bot ✅

### Event Log (incident-scoped)
- [x] `setEventLog([])` called on every new `fall_alert` or `sos_alert` WS message
- [x] Event log always shows only the **current incident's** timeline — no cross-incident noise
- [x] All subsequent events (ACK, status changes, voice exchanges) append to this fresh log

### Context-Aware Voice Bot
- [x] `onCallStart` in `ResponderDashboardClient` now passes `activeAlert` data to `POST /call/start`:
  ```ts
  incident: {
    type:          activeAlert.type.toUpperCase(),
    person_id:     activeAlert.personId ?? 0,
    ar:            activeAlert.ar         ?? 0,
    down_duration: activeAlert.downDuration ?? 0,
    status:        incidentStatus,
  }
  ```
- [x] `CallStartPayload` in `server.py` extended with `incident: IncidentContext = None`
- [x] `IncidentContext` Pydantic model: type, person_id, ar, down_duration, status
- [x] `_build_incident_block()` function generates a plain-text clinical context block from incident data
- [x] AR interpretation: < 0.5 = HIGH risk (fully horizontal), 0.5–0.7 = MODERATE, > 0.7 = LOW
- [x] Down-duration interpretation: ≥ 30s = CRITICAL, ≥ 10s = HIGH, < 10s = MODERATE
- [x] Incident block prepended to system prompt — bot immediately knows situation type, severity
- [x] Bot can answer "what happened?", "how serious is it?", "what should I check?"

### ChatPanel Incident Badge
- [x] `activeIncident` prop added to `ChatPanel` (type `ActiveIncident | null`)
- [x] Idle call launcher shows incident badge when fall/SOS is active:
  - FALL: red-tinted card with person ID, AR, down duration + "Bot is briefed on this incident"
  - SOS: amber-tinted card with alert type
- [x] Call button pulse ring changes from green to red when incident is active
- [x] Button label: "Start voice call" → "Brief AI on incident"
- [x] Subtitle: "Clinical guidance enabled" → "Clinical guidance · incident aware"

## Phase 6 — WebRTC VAD Dashboard UI ✅

### Voice Detection Sensitivity Picker
- [x] `SENSITIVITIES` updated from 4 ad-hoc levels to named VAD aggressiveness tiers:
  `["Sensitive", "Balanced", "Clear", "Strict"]`
- [x] `SENSITIVITY_MAP` maps labels to VAD aggressiveness numeric values (100→0 / 300→1 / 600→2 / 1200→3)
- [x] `SENSITIVITY_HINT` adds a subtitle per level ("Soft voices · quiet room", etc.)
- [x] Default sensitivity changed to `"Balanced"` (aggressiveness 1, 300 ms pause threshold)
- [x] Sensitivity picker redesigned as a 2×2 grid with hint subtitles under each option
- [x] Active call bar label updated: `"Mic:"` → `VAD` badge; select shows level + hint inline
- [x] Settings panel section renamed "Voice Detection" + `WebRTC VAD` badge; "Pause after speech" → "Silence before send"

### Waveform Animation (speech-only)
- [x] `micSpeaking` state added to `ResponderDashboardClient` (distinct from `micListening`)
- [x] `mic_status` WS handler: `"listening"` → `micListening=true, micSpeaking=false`; `"speaking"` → both `true`
- [x] `ListeningWaveform` component — 7 bars with staggered `vad-bar` CSS animation; shown only when `micSpeaking=true`
- [x] `@keyframes vad-bar` added to `globals.css` (0%/100% → 3px/0.4 opacity; 50% → 13px/0.95)
- [x] Idle listening shows muted pulse dot + "listening…" text; waveform only fires on speech onset
- [x] `micSpeaking` cleared on: user voice_alert received, call stopped
- [x] `micSpeaking` prop threaded from `ResponderDashboardClient` → `ChatPanel`

---

## Phase 7 — Prisma DB Bug Fixes ✅

### `acknowledgedBy` race condition
- [x] `acknowledge()` and `updateStatus()` previously used `alertIncidentId` React **state**, which may not yet reflect the newly-created incident when the user clicks quickly
- [x] Fixed: both functions now read `incidentIdRef.current` (set synchronously when the incident is created in DB) instead of state
- [x] `alertIncidentId` removed from dependency arrays of both callbacks — refs are stable

### Admin page error handling
- [x] `AdminUsersClient.load()` — added `if (res.ok)` guard and `try/catch`; non-OK responses no longer set `users` to a non-array, preventing `users.map is not a function` crash
- [x] `AdminIncidentsClient` fetch — added `.then(r => r.ok ? r.json() : [])` and `Array.isArray` guard; loading state correctly resets on network error
- [x] `AdminUsersClient` `colSpan` mismatch fixed: 6 → 7 (table has 7 columns: Name / Email / Role / Access / Status / Joined / Actions)

### DB seed and `.env` setup
- [x] `DATABASE_URL` was only in `.env.local` (loaded by Next.js, not by Prisma CLI or `tsx`)
- [x] Created `dashboard/.env` with `DATABASE_URL="file:./dev.db"` so `prisma db push` and `db:seed` work without manual env passing
- [x] `db:seed` and `db:reset` scripts updated to `node --env-file=.env --import=tsx prisma/seed.ts` — runs correctly on Node 20+
- [x] Users table re-seeded: admin + Responder One (authorized) + Responder Two (unauthorized)

---

## Known Limitations / TODO
- `ANTHROPIC_API_KEY` must be real for incident report and voice features
- `afplay` TTS playback is macOS-only; needs `mpg123`/`ffplay` for Linux/Windows

## Styling Notes
- **Color system**: All hardcoded hex values replaced with semantic Tailwind tokens (`text-danger`, `bg-surface`, `border-line`, etc.)
- **Single source of truth**: `lib/colors.ts` for JS, `globals.css @theme` for CSS — edit one place to retheme
- Only truly dynamic values (runtime alert color, countdown bar width) use inline `style={}`
- **Font rules**: Inter (sans-serif) for all UI text; JetBrains Mono (`font-mono`) only for data values — AR numbers, timestamps, IDs, person counts
- **`section-label` utility**: `10px, uppercase, tracking-wide, fg-muted color` — used for all card headers, form labels, panel subtitles
- **Alert hierarchy**: alarm card has `transition-colors duration-300` for smooth color shift; idle state is compact single-line strip
- **Non-scrollable responder page**: `h-screen overflow-hidden` layout chain — `html > body > layout div > main > dashboard` all with proper `min-h-0` on flex children
- Build verified: `npm run build` passes with 19 pages ✅

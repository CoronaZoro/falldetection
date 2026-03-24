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
│   │   │   └── [id]/            GET/PUT + report POST
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
└── .env.local                   Environment variables
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
| GET/PUT | /api/incidents/[id] | Get / update incident |
| POST | /api/incidents/[id]/report | Generate AI report |
| GET/POST | /api/admin/users | List / create users |
| PUT/DELETE | /api/admin/users/[id] | Edit / delete user |
| GET/PUT | /api/admin/config | Get / update system config |
| GET | /api/admin/analytics | Analytics data |
| POST | /api/chat | AI chatbot (Claude) |

## Setup Commands
```bash
cd dashboard
npm install
npm run db:push          # Create SQLite DB
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

## Known Limitations / TODO
- Twilio escalation is DB-only (no actual SMS sending)
- Camera page reuses detection settings (functional, not visual split)
- ANTHROPIC_API_KEY must be real for chat/report features
- VoiceLog component exists but is commented out (pending chatbot integration work)

## Styling Notes
- **Color system**: All hardcoded hex values replaced with semantic Tailwind tokens (`text-danger`, `bg-surface`, `border-line`, etc.)
- **Single source of truth**: `lib/colors.ts` for JS, `globals.css @theme` for CSS — edit one place to retheme
- Only truly dynamic values (runtime alert color, countdown bar width) use inline `style={}`
- **Font rules**: Inter (sans-serif) for all UI text; JetBrains Mono (`font-mono`) only for data values — AR numbers, timestamps, IDs, person counts
- **`section-label` utility**: `10px, uppercase, tracking-wide, fg-muted color` — used for all card headers, form labels, panel subtitles
- **Alert hierarchy**: alarm card has `transition-colors duration-300` for smooth color shift; idle state is compact single-line strip
- **Non-scrollable responder page**: `h-screen overflow-hidden` layout chain — `html > body > layout div > main > dashboard` all with proper `min-h-0` on flex children
- Build verified: `npm run build` passes with 19 pages ✅

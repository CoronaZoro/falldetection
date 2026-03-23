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
| Token | Value | Use |
|-------|-------|-----|
| Background | #0a0c10 | Page background |
| Surface | #111318 | Cards, panels |
| Border | #1e2229 | All borders |
| Text | #c8d0e0 | Primary text |
| Muted | #4a5568 | Secondary text, labels |
| Green | #00ff88 | Online, stable, resolved |
| Amber | #ffaa00 | Warning, SOS, transition |
| Red | #ff3355 | Alarm, fall, error |
| Blue | #3b82f6 | Actions, info |
| Purple | #8b5cf6 | AI features |

## Known Limitations / TODO
- Twilio escalation is DB-only (no actual SMS sending)
- Camera page reuses detection settings (functional, not visual split)
- ANTHROPIC_API_KEY must be real for chat/report features

## Styling Notes
- All components use **Tailwind CSS v4 utility classes** — no React inline `style={}` props for layout/spacing/color
- Only truly dynamic values (state-dependent colors/widths like alert banner border color, countdown bar width %) use inline `style={}` — everything static is Tailwind
- Custom colors use Tailwind arbitrary value syntax: `bg-[#0a0c10]`, `text-[#c8d0e0]`, `border-[#1e2229]`
- Opacity variants: `bg-[#ff3355]/10`, `border-[#3b82f6]/20`
- **Font rules**: Inter (sans-serif) for all UI text; JetBrains Mono (`font-mono`) only for data values — AR numbers, timestamps, IDs, person counts
- **`section-label` utility**: `10px, uppercase, tracking-wide, #4a5568` — used for all card headers, form labels, panel subtitles
- **Page titles**: `text-base font-semibold text-[#c9d1e0]` — compact but legible
- **Alert hierarchy**: alarm states use dynamic border + background tint from `alertColor`; calm states use flat `#111318` surface
- Build verified: `npm run build` passes with 19 pages ✅ (after full UI cleanup)

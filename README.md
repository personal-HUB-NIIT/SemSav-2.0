# SemSav 2.0 — Semester Saviour

A full-stack academic companion platform built for NIIT University students. Track attendance, share verified notes, manage assignments, and never miss a deadline again.

**Live Demo:** [https://sem-sav-2-0.vercel.app](https://sem-sav-2-0.vercel.app)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Attendance Tracker** | Subject-wise manual logging with cancelled-class exclusion, real-time % calculation, and mass-bunk protection alerts |
| **Verified Notes Vault** | Peer-reviewed upload system — only community-verified notes appear in the study vault |
| **Assignments & Tests** | Due-date tracking, test-type categorization (mid-sem, quiz, lab, viva), room numbers, and file attachments |
| **Community Review** | Upvote/downvote pending uploads; 5% dynamic threshold auto-verifies or purges content |
| **Karma System** | Earn points for contributions; leaderboards per branch/semester |
| **Real-time Timetable** | Admin-managed weekly schedule synced to student calendars |
| **Classroom Directory** | View peers in your branch/semester with karma scores and roles |
| **Admin Dashboard** | Manage uploads, users, branches, subjects; flag/ban spammers; delete accounts (uploads retained) |
| **PWA Ready** | Installable on mobile/desktop; `manifest.json` with `start_url: /dashboard` bypasses landing page |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite 5, Tailwind CSS 4 |
| **Animations** | Framer Motion, React Three Fiber + Drei (3D Hero) |
| **State/Router** | React Router v7, Custom `useAuth` hook |
| **Backend/BaaS** | Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions) |
| **Auth** | Supabase Auth (Email/OTP, Google OAuth, PKCE) |
| **Storage** | Supabase Storage (avatars, uploads) |
| **AI Assistant** | Local Node server (`VITE_AI_SERVER_URL`) for PDF/text extraction |
| **Deployment** | Vercel (SPA rewrites via `vercel.json`), GitHub Actions ready |
| **PWA** | Service Worker (`sw.js`), `manifest.json`, offline-first caching |

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (React + Vite)                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │  Landing    │ │   Auth      │ │  Dashboard  │ │  Admin    │ │
│  │  (3D Hero,  │ │ (PKCE/OAuth,│ │ (Attendance,│ │  (Users,  │ │
│  │   Intro Vid)│ │  Set Pass)  │ │  Notes, etc)│ │  Uploads) │ │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────┬────┘ │
└─────────┼───────────────┼───────────────┼───────────────┼──────┘
          │               │               │               │
          ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase (PostgreSQL + Auth)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │  users   │ │ uploads  │ │  votes   │ │attendance│ │ branches│
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │ subjects │ │ content_ │ │flagged_  │ │  class_  │ │study_  ││
│  │          │ │ reports  │ │ users    │ │ schedule │ │materials│
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘│
│  🔐 Row Level Security (RLS) on all tables                     │
│  ⚡ Realtime subscriptions for votes, uploads, attendance      │
│  📦 Storage buckets: `semsav-files`, `avatars`                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key DB Constraints:**
- `uploads.user_id` → `users(id)` **ON DELETE SET NULL** (orphans content on user deletion)
- `votes`, `user_tasks`, `attendance_logs` → **ON DELETE CASCADE**
- `verification_queue`, `queue_votes` (legacy) → `auth.users` cascade

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- **Node.js ≥ 20** (LTS recommended)
- **npm ≥ 10**
- **Supabase Account** (free tier works)
- **Git**

### 1. Clone & Install
```bash
git clone https://github.com/personal-HUB-NIIT/SemSav-2.0.git
cd SemSav-2.0
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env.local
```
Edit `.env.local` with your Supabase credentials:
```env
# Required
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key

# Optional (AI auto-fill on Upload page)
VITE_AI_SERVER_URL=http://127.0.0.1:3001
```

> **Supabase Setup:** Create a new project → Settings → API → copy Project URL & `anon` public key.
> Run all migrations in `supabase/migrations/` in order (001 → 035) via Supabase SQL Editor.

### 3. Run Development Server
```bash
npm run dev
```
Open `http://localhost:5173` — you'll see the Landing Page with 3D Hero + Intro Video.

### 4. (Optional) Local AI Server for Auto-Fill
```bash
cd local-ai-server
npm install
npm run dev    # runs on http://127.0.0.1:3001
```
The Upload page will auto-fill title, test type, room, deadline from PDFs/images.

---

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (HMR) |
| `npm run build` | Type-check (`tsc -b`) + production build (`vite build`) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | ESLint with React/TypeScript rules |

---

## 📦 Project Structure

```
SemSav-2.0/
├── public/                 # Static assets (manifest.json, sw.js, video2.mp4, favicon)
├── src/
│   ├── components/
│   │   ├── three/GlassOrb.tsx        # 3D Hero (React Three Fiber)
│   │   └── ProtectedRoute.tsx        # Auth guard wrapper
│   ├── hooks/
│   │   └── useAuth.ts                # Supabase auth + profile state
│   ├── lib/
│   │   └── supabaseClient.ts         # Supabase client (anon key only)
│   ├── pages/
│   │   ├── LandingPage.tsx           # Hero, Problem, Solution, Benefits, CTA
│   │   ├── IntroPage.tsx             # Intro video + white flash → /role
│   │   ├── RoleSelection.tsx         # Student vs Admin entry
│   │   ├── Login.tsx / AdminLogin.tsx
│   │   ├── SetPassword.tsx / Onboarding.tsx
│   │   ├── Dashboard.tsx             # Main student hub
│   │   ├── AdminDashboard.tsx        # Admin tabs: Uploads, Users, Curriculum, Flagged
│   │   ├── Upload.tsx                # Drag-drop upload + AI extract
│   │   ├── Notes.tsx                 # Study materials vault
│   │   ├── Attendance.tsx            # Subject-wise tracker
│   │   ├── KarmaPoll.tsx             # Community review queue
│   │   ├── MyClassroom.tsx           # Peer directory
│   │   ├── AdminLogin.tsx / Unauthorized.tsx / AuthCallback.tsx / RoleSelection.tsx
│   ├── hooks/useAuth.ts
│   ├── App.tsx                       # Routes + Auth guard (LandingRoute)
│   ├── main.tsx / index.css          # Tailwind + Aurora BG + Glass utilities
│   └── hooks/useAuth.ts
├── supabase/
│   ├── migrations/001_..._035_*.sql  # Full schema + RLS + RPCs
│   └── FULL_SCHEMA_RUN_THIS.sql      # Consolidated (run in SQL Editor)
├── local-ai-server/                  # Optional AI extraction microservice
├── vercel.json                       # SPA rewrites + build config
├── .vercel-token.example             # Template for local Vercel token
├── .vercel-token                     # (gitignored) real token for CLI
├── .gitignore
├── .env.example / .env.local
├── package.json / tsconfig*.json / vite.config.ts / eslint.config.js
└── README.md
```

---

## 🔐 Security Notes

- **No Service Role Key in Frontend** — only `anon` key via `VITE_SUPABASE_ANON_KEY`
- **Row Level Security** enforced on every table; policies in `supabase/migrations/004_...007_`
- **Admin actions** via `SECURITY DEFINER` RPCs (`admin_delete_user`, `ban_flagged_user`, `submit_queue_vote`)
- **Service Role** only used in Supabase Dashboard / Edge Functions (never in repo)
- **Secrets**: `.env.local`, `.vercel-token`, `supabase/.env.local` are gitignored
- **CSP-ready** — no inline scripts except Vite HMR in dev

---

## 🚀 Deployment (Vercel)

### Automatic (GitHub Push)
1. Push to `main` → Vercel auto-deploys
2. Branch `teammate-ui` → Preview deployments

### Manual (CLI)
```bash
# Requires Node ≥ 20
export $(cat .vercel-token | xargs)  # loads VERCEL_TOKEN from gitignored file
npx vercel --prod --yes
```

### Vercel Config (`vercel.json`)
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### Required Vercel Env Vars (Settings → Environment Variables)
| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` |
| `VITE_AI_SERVER_URL` | *(optional — leave empty on Vercel)* |

---

## 🗄 Database Migrations

Run in Supabase SQL Editor **in order** (001 → 035):
```bash
# Or use the consolidated file:
cat supabase/FULL_SCHEMA_RUN_THIS.sql | pbcopy  # paste in SQL Editor → Run
```

Key migrations:
| # | File | Purpose |
|---|------|---------|
| 001–005 | Core schema, enums, triggers, RLS, Auth hook |
| 011 | Storage buckets (`semsav-files`, `avatars`) |
| 014 | Verification queue + karma poll |
| 015 | Avatar storage + policy |
| 016–019 | Account management + delete account (retains uploads) |
| 017 | Attendance logs + summary RPC |
| 026–027 | Study materials auto-sync on verification |
| 032–033 | Content reports + flagged users + admin ban |
| 034 | **uploads.user_id SET NULL** (retain uploads on delete) + admin storage delete |
| 035 | **admin_delete_user RPC** (admin deletes user, retains uploads) |

---

## 🤝 Contributing

1. Fork → Create feature branch (`git checkout -b feat/amazing-feature`)
2. Commit with conventional messages (`feat:`, `fix:`, `chore:`, `refactor:`)
3. Ensure `npm run build` passes locally
4. Open PR against `teammate-ui` branch

**Code Style:**
- TypeScript strict (`noUnusedLocals`, `noUnusedParameters`)
- ESLint flat config (`eslint.config.js`)
- Prettier not required — consistent formatting via ESLint

---

## 📄 License

MIT License — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgements

- **Supabase** — BaaS that makes full-stack React trivial
- **Vercel** — Zero-config deployments with SPA rewrites
- **Tailwind CSS** — Utility-first styling
- **Framer Motion / Three.js** — Delightful animations
- **Lucide React** — Beautiful icons
- **NIIT University** — The community this was built for

---

**Built with ❤️ for NIIT University students**  
*SemSav — Take Control of Your Semester*
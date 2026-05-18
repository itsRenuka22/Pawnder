# Pawnder 🐾

> Tinder for adoptable pets — swipe right to love, left to pass. Votes aggregate globally so the whole community shapes the results.

Built for CMPE 285.

---

## Quick Start

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- An [Unsplash](https://unsplash.com/developers) developer account (free)

### 1. Apply the database schema

In your Supabase project → **SQL Editor**, paste and run the contents of `supabase-schema.sql`. This creates the `items` and `votes` tables, the `results` aggregate view, RLS policies, and indexes.

### 2. Seed 100 pets

```bash
cd seed-script
npm install
# Copy .env and fill in your keys
cp .env .env.local   # or edit .env directly
```

Edit `seed-script/.env`:
```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>   # from Project Settings → API
UNSPLASH_ACCESS_KEY=<your_unsplash_key>
```

```bash
npm run seed
```

The script fetches 100 real pet photos from Unsplash (puppies, kittens, rabbits, hamsters, guinea pigs, parrots) and inserts them into the `items` table.

### 3. Run the frontend

```bash
cd frontend
npm install --legacy-peer-deps   # needed for react-tinder-card peer dep on React 19
```

Create `frontend/.env`:
```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon_key>   # from Project Settings → API → anon/public
```

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) (or the port Vite picks).

---

## Architecture

Pawnder is a **single-page React app** backed entirely by **Supabase** (PostgreSQL + Auth + RLS).

```
Browser (React + TanStack Router)
        │
        │  Supabase JS SDK  (no custom API server)
        ▼
Supabase
├── Auth  — email/password sign-up and login
├── items table  — 100 seeded pets (id, name, breed, species, image_url, …)
├── votes table  — one row per (user, item) pair; UNIQUE constraint deduplicates
└── results VIEW — COUNT(*) aggregation across all users, exposed as a Postgres view
```

**Why no custom REST API server?** Supabase's PostgREST layer auto-exposes the tables and view as REST endpoints (`GET /rest/v1/items`, `POST /rest/v1/votes`, `GET /rest/v1/results`). Row-Level Security policies enforce that:
- Anyone can read `items` and `results`
- Only the authenticated user can insert or read their own `votes`
- The server rejects votes where `user_id ≠ auth.uid()` — clients cannot spoof another user's vote

The frontend uses the Supabase JS SDK rather than raw `fetch`, which provides type safety, automatic JWT injection, and token refresh. Under the hood it is still HTTP to the same PostgREST endpoints.

**Idempotency / deduplication:** The `votes` table has a `UNIQUE (user_id, item_id)` constraint. A second insert for the same pair returns a Postgres unique-violation error (code `23505`), which the frontend catches and silently ignores (the vote was already counted). The UI also filters already-voted items out of the swipe deck on load, so the user never sees a pet they already voted on.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| UI framework | React 19 + TanStack Router | File-based routing, SSR-ready |
| Styling | Tailwind CSS v4 + shadcn/ui | Rapid iteration, design-token-driven |
| Animations | Framer Motion | Spring physics, AnimatePresence |
| Swipe gestures | react-tinder-card | Proven Tinder-style swipe on mobile & desktop |
| Backend / DB | Supabase (PostgreSQL) | Auth + RLS + real-time, zero infra to manage |
| Seed images | Unsplash API | 100 real, high-quality pet photos |

---

## Trade-offs Made Under Time Pressure

**Supabase BaaS vs. custom API server**
Choosing Supabase eliminated the need to write, deploy, and secure a Node/Express server. The trade-off is vendor lock-in — migrating off Supabase would require re-implementing auth, RLS, and the REST layer. For a class project this is acceptable; for production a custom API would give more control over rate limiting, logging, and schema migrations.

**Client-side aggregation on results page (no)**
Results are computed by a PostgreSQL VIEW (`results`) on the server, not in JavaScript. This means sorting and counting are correct regardless of how many users vote, and the client just renders what the DB returns.

**react-tinder-card + React 19 peer dep mismatch**
`react-tinder-card@1.6.4` declares peer deps up to React 18, but works fine at runtime with React 19. Installed with `--legacy-peer-deps`. A fork or upgrade of the library would be the clean fix.

**No email confirmation flow**
Supabase email confirmation is disabled for development speed. In production, enable it in the Supabase Auth settings and add a "check your email" screen after sign-up.

**Image source credit**
All pet photos are sourced from [Unsplash](https://unsplash.com) via the Unsplash API. Each photo is used under the [Unsplash License](https://unsplash.com/license). Photo URLs link directly to Unsplash CDN.

---

## Project Structure

```
Pawnder/
├── supabase-schema.sql      # DB schema: tables, view, RLS, indexes
├── seed-script/
│   ├── seed-pets.js         # Fetches 100 pets from Unsplash → Supabase
│   ├── verify-api.js        # End-to-end API test script
│   └── package.json
└── frontend/
    └── src/
        ├── routes/
        │   ├── auth.tsx     # Login / sign-up screen
        │   ├── swipe.tsx    # Card swipe + vote recording
        │   └── results.tsx  # Global aggregate results
        ├── integrations/supabase/
        │   ├── client.ts    # Supabase client singleton
        │   └── types.ts     # Auto-generated + hand-extended DB types
        └── styles.css       # Tailwind v4 design tokens (OKLCH color system)
```

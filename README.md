# Pawnder 🐾
**Tinder for Paws** — A mobile-first pet voting app where users swipe through adoptable pets and see what the community thinks.

---

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Installation & Setup](#installation--setup)
- [How to Use](#how-to-use)
- [Requirements Completed](#requirements-completed)
- [Known Issues](#known-issues)
- [Future Improvements](#future-improvements)
- [AI Usage](#ai-usage)
- [Credits](#credits)

---

## Overview

Pawnder is a swipe-based voting app where users vote yes or no on 100 adoptable pets. The app shows aggregate voting results from all users, revealing which pets are most loved, most divisive, and most voted on.

**This is a demo app** — not connected to real shelters or adoption services. It's built to practice full-stack development with authentication, gestures, real-time data, and mobile UI.

**Run locally** using the setup instructions below.

---

## Features

✅ **User Authentication**
- Email signup and login
- Secure session management with JWT tokens
- Password validation (6+ characters)

✅ **Swipe Interface**
- 100 pets to vote on with real photos
- Swipe right (or tap 🥰 Pawwfect) = Yes
- Swipe left (or tap 🙈 Nope, Fur Now) = No
- Undo last vote
- Visual feedback (green/red tint flash on swipe)
- Randomised deck order — each user sees pets in a different sequence
- Progress bar tracking (e.g. "47 / 100")

✅ **Real-Time Results**
- Voting stats aggregated across ALL users
- Three sorting modes:
  - **Most Loved:** Highest % of yes votes
  - **Most Divisive:** Closest to 50/50 split
  - **Most Voted:** Highest total vote count
- Live badge and auto-refresh when new votes come in
- Visual yes/no split bars per pet

✅ **Matches View**
- Pets you voted yes on where 70%+ of the community agreed
- Sorted by community approval percentage

✅ **Analytics Dashboard**
- Total yes votes cast globally
- Total votes across all pets
- Active voters in last 24 hours (global, from `analytics` view)
- Your average swipe decision time (tracked locally)

✅ **Mobile Optimised**
- Designed for 390×844px (iPhone-sized) screens
- Touch gestures work smoothly
- Dynamic viewport height (`100dvh`) and iOS safe-area padding
- No horizontal scrolling

---

## Tech Stack

### Frontend
- **React 19** with TypeScript
- **TanStack Router** — file-based routing, SSR-ready
- **Vite** — fast build tool
- **Tailwind CSS v4** — OKLCH colour system, design tokens
- **Framer Motion** — spring animations, AnimatePresence
- **react-tinder-card** — swipe gesture library

### Backend
- **Supabase** — complete backend solution
  - PostgreSQL database
  - Authentication (email/password)
  - Row Level Security (RLS)
  - Real-time subscriptions (Postgres changes)
  - Auto-generated REST API via PostgREST

### Tooling
- **Node.js** 18+
- **npm** package manager
- **Git** version control

---

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        USER DEVICE                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           React 19 Frontend (Vite + TanStack)       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐ ┌────────┐ │   │
│  │  │  Auth   │  │  Swipe  │  │ Results │ │Matches │ │   │
│  │  │ Screen  │  │ Screen  │  │ Screen  │ │ Screen │ │   │
│  │  └─────────┘  └─────────┘  └─────────┘ └────────┘ │   │
│  │                      │                              │   │
│  │            Supabase JS Client SDK                   │   │
│  └──────────────────────┼──────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │ HTTPS + WebSocket (Realtime)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      SUPABASE CLOUD                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Supabase Auth                     │   │
│  │         (Email/password, JWT tokens, sessions)      │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               PostgreSQL Database                   │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────┐ │   │
│  │  │  items   │  │  votes   │  │  results (view)   │ │   │
│  │  │ (100     │  │  (user   │  │  aggregates votes  │ │   │
│  │  │  pets)   │  │  votes)  │  │  across all users  │ │   │
│  │  └──────────┘  └──────────┘  └───────────────────┘ │   │
│  │                              ┌───────────────────┐  │   │
│  │                              │ analytics (view)  │  │   │
│  │                              │ global vote stats │  │   │
│  │                              └───────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │               Row Level Security (RLS)              │   │
│  │  • Anyone can read items and aggregate results      │   │
│  │  • Users can only insert their own votes            │   │
│  │  • Users can only read their own vote rows          │   │
│  │  • UNIQUE(user_id, item_id) prevents duplicates     │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Realtime Engine                    │   │
│  │   Broadcasts INSERT/DELETE on votes to all clients  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ Service role API (bypasses RLS)
                          │
┌─────────────────────────────────────────────────────────────┐
│                  SEED SCRIPT (one-time)                     │
│  • Fetches 100 pet photos from Unsplash API                 │
│  • Generates names, breeds, descriptions, age labels        │
│  • Inserts all records into the items table                 │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

**items** table — 100 seeded pets:
```sql
id          uuid        PRIMARY KEY DEFAULT gen_random_uuid()
name        text        NOT NULL          -- e.g. "Mango"
breed       text                          -- e.g. "Golden Retriever"
species     text        NOT NULL          -- e.g. "dog", "cat"
description text                          -- short bio
image_url   text        NOT NULL          -- Unsplash CDN URL
age_label   text                          -- e.g. "2 years"
created_at  timestamptz DEFAULT now()
```

**votes** table — one row per user per pet:
```sql
id       uuid        PRIMARY KEY DEFAULT gen_random_uuid()
user_id  uuid        NOT NULL REFERENCES auth.users(id)
item_id  uuid        NOT NULL REFERENCES items(id)
choice   text        NOT NULL CHECK (choice IN ('yes','no'))
voted_at timestamptz DEFAULT now()
UNIQUE (user_id, item_id)               -- prevents duplicate votes
```

**results** view — computed aggregates (all users):
```sql
item_id         uuid
yes_count       bigint
no_count        bigint
total_votes     bigint
yes_percentage  numeric   -- 0–100, rounded to 2dp
```

**analytics** view — global stats:
```sql
total_votes          bigint
active_sessions_24h  bigint   -- votes in last 24h
votes_last_hour      bigint
total_voters         bigint   -- distinct user_ids all time
active_voters_24h    bigint   -- distinct users in last 24h
```

### Data Flow

1. **User signs up** → Supabase Auth creates user → JWT token returned to client
2. **User swipes right** → vote inserted into `votes` table → RLS confirms `user_id = auth.uid()`
3. **Duplicate swipe** → Postgres `UNIQUE` constraint returns error code `23505` → client silently ignores
4. **Vote recorded** → Realtime broadcasts INSERT event → all Results screens debounce-refetch after 2s
5. **User views Results** → client queries `results` view → returns aggregates across all users (no RLS filter on views)
6. **Sorting** → client-side sort applied to fetched rows (Most Loved / Divisive / Voted)
7. **Analytics** → client queries `analytics` view → bypasses per-row RLS, returns global counts

---

## Installation & Setup

### Prerequisites

Before starting, make sure you have:
- **Node.js** version 18 or higher — [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)
- A **Supabase account** — [Sign up free](https://supabase.com)
- An **Unsplash developer account** — [Sign up free](https://unsplash.com/developers)

### Step 1: Clone the Repository

```bash
git clone https://github.com/itsRenuka22/Pawnder.git
cd Pawnder
```

### Step 2: Set Up Supabase

#### 2.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Give it a name (e.g. "Pawnder"), set a database password, choose a region
4. Click **Create new project** and wait 2–3 minutes for it to initialise

#### 2.2 Run the Database Schema

1. In your Supabase dashboard, click **SQL Editor** in the left sidebar
2. Copy the entire contents of `supabase-schema.sql` from this repo
3. Paste it into the editor and click **Run**
4. You should see success messages — this creates the tables, views, RLS policies, and grants

#### 2.3 Enable Email Authentication

1. Go to **Authentication → Providers**
2. Find **Email** and make sure it is toggled **ON**
3. Turn **OFF** "Confirm email" (makes local testing easier)
4. Click **Save**

#### 2.4 Enable Realtime on the Votes Table

Run this in the SQL Editor:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
```

Or go to **Database → Replication** and toggle the `votes` table on.

#### 2.5 Get Your API Credentials

Go to **Settings → API** and copy:
- **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
- **anon / public** key — long string starting with `eyJ...`
- **service_role** key — another long string (keep this secret — never commit it)

### Step 3: Seed 100 Pets

#### 3.1 Get an Unsplash API Key

1. Go to [unsplash.com/developers](https://unsplash.com/developers)
2. Click **New Application**, accept the terms, fill in the details
3. After creating it, copy your **Access Key**

#### 3.2 Configure the Seed Script

```bash
cd seed-script
npm install
```

Create a file called `.env` inside the `seed-script/` folder:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
UNSPLASH_ACCESS_KEY=your_unsplash_access_key_here
```

Replace each value with your real credentials.

#### 3.3 Run the Seed Script

```bash
npm run seed
```

This fetches 100 real pet photos from Unsplash and inserts them into Supabase. It takes about 2–3 minutes. You should see output like:

```
✅ Fetched 15 puppies
✅ Fetched 15 kittens
...
✅ Successfully seeded 100 pets to Supabase!
```

### Step 4: Configure the Frontend

```bash
cd ../frontend
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` is required because `react-tinder-card` declares a peer dependency on React ≤18 but works fine at runtime with React 19.

Create a file called `.env` inside the `frontend/` folder:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_public_key_here
```

Use the **anon / public** key here — not the service_role key.

### Step 5: Run the App

```bash
npm run dev
```

Open your browser to **http://localhost:5173**

You should see the Pawnder login screen. Sign up with any email and password, then start swiping!

---

## How to Use

### 1. Sign Up or Log In
- Enter your email and a password (minimum 6 characters)
- Click **Sign Up** to create an account, or **Log In** if you already have one

### 2. Swipe Through Pets
- You'll see a stack of pet cards with photos, names, breeds, and descriptions
- **Swipe right** or tap **🥰 Pawwfect** → vote YES
- **Swipe left** or tap **🙈 Nope, Fur Now** → vote NO
- Your progress shows at the top (e.g. "23 / 100")
- Each user sees pets in a randomised order

### 3. Undo a Vote
- After swiping, an **↩ Undo** button appears below the action buttons
- Tap it to remove your last vote and get the card back
- Only one undo is available at a time

### 4. View Results
- Click **Results** in the header to see global vote stats
- Toggle the sort mode:
  - **❤️ Loved** — pets with highest yes percentage
  - **⚖️ Split** — pets closest to a 50/50 split
  - **📊 Voted** — pets with most total votes
- A 🔴 Live badge appears when real-time updates are active

### 5. Check Your Matches
- Click **Matches** in the header
- See pets you loved (voted yes) where 70%+ of all users also voted yes
- Sorted by community approval percentage

### 6. View Analytics
- The top of the Results page shows four stat cards:
  - Total yes votes (global)
  - Total votes cast (global)
  - Active voters in the last 24 hours (global)
  - Your average swipe decision time (personal, tracked in browser)

---

## Requirements Completed

### Core Requirements ✅

| Requirement | Status | Details |
|---|---|---|
| Pick a voting theme | ✅ | Adoptable pets — dogs, cats, rabbits, hamsters, parrots |
| 100+ items with images | ✅ | 100 real pet photos from Unsplash with names, breeds, descriptions |
| Swipe card UI | ✅ | Right = yes, left = no, visual tint feedback, stack animations |
| Results view | ✅ | Global aggregate stats, sortable 3 ways, animated vote bars |
| Backend persistence | ✅ | Supabase PostgreSQL with RLS — votes survive page refresh |
| Vote deduplication | ✅ | `UNIQUE(user_id, item_id)` constraint + client-side 23505 handling |
| End-of-deck handling | ✅ | Friendly empty state with "See Results" button |

### Stretch Goals Completed

| # | Goal | Status | Notes |
|---|---|---|---|
| 7 | Full authentication | ✅ | Supabase Auth — email/password, session persistence, friendly error messages |
| 8 | Undo last swipe | ✅ | Deletes vote by ID, restores card to top of deck, one level deep |
| 9 | Matches view | ✅ | User's yes votes filtered to pets with ≥70% global approval |
| 10 | Real-time results | ✅ | Supabase Realtime channel on votes table, debounced 2s refetch, Live badge |
| 11 | Admin seed script | ✅ | Node.js script fetches from Unsplash API, deduplicates, inserts 100 pets |
| 12 | Basic analytics | ✅ | Global stats via `analytics` DB view + personal decision time via localStorage |

**All 7 core requirements + all 6 stretch goals completed.**

---

## Known Issues

### 1. Image Loading Speed
**Issue:** Some Unsplash images load slowly on first view.  
**Why:** Images are served directly from Unsplash CDN — no local caching or resizing.  
**Workaround:** Shimmer skeleton shows while the image loads. Browser caches images after first load.  
**Future fix:** Pre-load next 2–3 card images, or proxy through an image CDN for resizing.

### 2. Swipe Sensitivity
**Issue:** Swipe threshold is fixed at 80px. Some users may find it too sensitive or stiff.  
**Why:** Single threshold value doesn't suit every swiping style.  
**Workaround:** Use the Pawwfect / Nope pill buttons instead of swiping.  
**Future fix:** Make threshold configurable, or adapt it based on device screen width.

### 3. Undo Depth
**Issue:** Only the most recent vote can be undone — not a full history.  
**Why:** Only the last vote ID is stored in state; clearing it on navigation or reload.  
**Workaround:** Undo immediately after the swipe you want to reverse.  
**Future fix:** Maintain a local stack of recent vote IDs.

### 4. Analytics Decision Time
**Issue:** "Avg decision time" is personal and stored only in `localStorage`. It resets if you clear browser data, and can't show a global average.  
**Why:** No database column for per-vote timing data.  
**Future fix:** Add a `decision_ms` column to the `votes` table and record it on insert.

### 5. Results Undo Lag
**Issue:** When a vote is undone, the Results screen may show stale counts for up to 2 seconds.  
**Why:** Realtime listens for INSERT events; the DELETE from undo also triggers a debounced refetch, but with a 2s delay.  
**Workaround:** Wait 2–3 seconds and the Results view will self-correct.

### 6. Mobile Browser UI Overlap
**Issue:** On some mobile browsers, the bottom navigation bar may partially overlap the action buttons.  
**Why:** Browser chrome height varies across devices and browsers.  
**Workaround:** `env(safe-area-inset-bottom)` padding is applied — if overlap still occurs, scrolling slightly helps.

### 7. react-tinder-card Peer Dep Warning
**Issue:** `npm install` without `--legacy-peer-deps` fails because `react-tinder-card@1.6.4` declares a peer dep on React ≤18.  
**Why:** Library hasn't been updated for React 19.  
**Workaround:** Always install with `npm install --legacy-peer-deps`. The library works correctly at runtime.

---

## Future Improvements

If this were a production product, here's what would come next:

### High Priority
- **Filter by species** — "Show me only dogs" or "only cats" toggle
- **User profiles** — voting history, stats, avatar
- **Share results** — share a pet's result card on social media
- **PWA support** — install as a mobile app with offline support
- **Email confirmation** — enable Supabase email verification for production

### Medium Priority
- **Comments** — let users leave a short note explaining their vote
- **Admin dashboard** — monitor engagement, flag inappropriate content
- **Leaderboards** — most active voters, fastest decision makers
- **Auto-advance** — navigate to Results automatically after voting on all pets

### Nice to Have
- **Real shelter integration** — connect to Petfinder API for real adoptable pets
- **Pet recommendations** — "Based on your votes, you might like..."
- **Gamification** — streaks, badges, voting achievements
- **Image optimisation** — proxy Unsplash images through Cloudinary for resizing

---

## AI Usage

This project was built with significant AI assistance. Full details are in:

📄 **[AI_NOTES.md](./AI_NOTES.md)**

**Summary:**
- **Lovable** — generated the initial UI design, colour system, and auth screen
- **Claude Code** — completed all screens, wrote seed and verify scripts, fixed bugs, implemented stretch goals
- **Claude (chat)** — architecture planning, stack decisions, debugging guidance

Total development time: ~4 hours (estimated 8–10 hours without AI assistance)

---

## Credits

- **Pet images:** [Unsplash](https://unsplash.com) via the Unsplash API — used under the [Unsplash License](https://unsplash.com/license)
- **Initial UI scaffold:** [Lovable](https://lovable.dev)
- **AI coding assistant:** [Claude Code](https://claude.ai/claude-code) by Anthropic
- **Swipe gestures:** [react-tinder-card](https://www.npmjs.com/package/react-tinder-card)
- **Backend:** [Supabase](https://supabase.com)
- **Animations:** [Framer Motion](https://www.framer.com/motion/)

---

## License

MIT License — free to use for learning or portfolio purposes.

---

## Questions?

If you have trouble setting up:
1. Check the [Known Issues](#known-issues) section first
2. Verify all `.env` values are correct and match your Supabase project
3. Confirm the schema ran successfully: run `SELECT COUNT(*) FROM items;` in the Supabase SQL editor — should return 100 after seeding
4. Open the browser console (F12) and look for error messages

---

*Made with 🐾 and ❤️ — built for CMPE 285*

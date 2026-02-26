# Lease Tracker

VW lease maturity management app.

---

## Run locally

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

Create your account on first run — it persists in localStorage until you connect Supabase.

---

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to vercel.com → New Project → Import your repo
3. Framework: Vite (auto-detected)
4. Click Deploy

Done. Your app is live at a `.vercel.app` URL.

---

## Connect Supabase (real database — do this when ready)

### 1. Create Supabase project

- Go to supabase.com → New Project
- Save your **Project URL** and **anon key** (Settings → API)

### 2. Create tables

Run this SQL in the Supabase SQL editor:

```sql
-- Customers
create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  year int,
  model text,
  trim text,
  bank text,
  term int,
  miles_yearly int,
  miles_term int,
  current_miles int,
  monthly_payment numeric,
  down_payment numeric,
  trade_equity numeric,
  lease_end text,
  private_incentive numeric default 0,
  incentive_exp text,
  status text default 'early',
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Notes
create table notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers on delete cascade,
  user_id uuid references auth.users not null,
  text text not null,
  saved_at text,
  created_at timestamptz default now()
);

-- Row level security (users only see their own data)
alter table customers enable row level security;
alter table notes enable row level security;

create policy "Users see own customers" on customers
  for all using (auth.uid() = user_id);

create policy "Users see own notes" on notes
  for all using (auth.uid() = user_id);
```

### 3. Add environment variables

Create `.env.local` in the project root:

```
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

In Vercel: Settings → Environment Variables → add the same two.

### 4. Install Supabase client

```bash
npm install @supabase/supabase-js
```

### 5. Swap the auth layer

In `src/auth.jsx`, replace the mock functions with real Supabase calls.
Each function has a comment showing the exact Supabase equivalent.
The rest of the app doesn't change at all.

---

## File structure

```
src/
  main.jsx          — entry point
  App.jsx           — auth routing (login → app)
  auth.jsx          — auth context + mock/supabase layer
  AuthPages.jsx     — login + signup pages
  SettingsModal.jsx — account settings (name, email, password)
  LeaseTracker.jsx  — main app
```

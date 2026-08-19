# DotBox — Simple Online Multiplayer Dots & Boxes

DotBox is a modern, fully functional, online multiplayer Dots & Boxes game built using **Next.js**, **Supabase** (Auth, Database, Realtime), and **Tailwind CSS**. It features ranked matchmaking, private friend lobbies, and a smart AI engine.

## Features
1. **Google OAuth Login**: Authentic sign-in powered by Supabase Auth.
2. **Matchmaking Queue**: Atomic, transaction-safe ranked matchmaking via PostgreSQL RPC.
3. **Private Friend Lobbies**: Real-time room syncing and host-controlled start actions.
4. **Offline AI Bot**: Easy (random), Medium (scoring + safe moves), and Hard (Minimax search with alpha-beta pruning) difficulties.
5. **Secure Game Loops**: Moves, boxes, scores, and turns are validated inside a Postgres RPC function to prevent client-side cheating.
6. **ELO Rating System**: Automatic post-match ELO calculations (+/- 18) for ranked matches.
7. **Responsive Board**: Vector absolute percentage grid scaling that works perfectly on desktop, tablet, and mobile.

---

## 🚀 Quick Start Guide

### 1. Supabase Database Configuration
1. Create a new project on [Supabase](https://supabase.com/).
2. Navigate to the **SQL Editor** in the Supabase Dashboard.
3. Open a new query, paste the entire contents of the [`database.sql`](file:///c:/Users/user/Desktop/Freeflow%20Ventures/DotBoxGame/database.sql) file, and click **Run**. This will generate all tables, triggers, ELO functions, and secure move RPCs.

### 2. Google Authentication Setup
1. In the Supabase Dashboard, go to **Auth** -> **Providers** -> **Google**.
2. Enable the Google provider.
3. Input your Google Client ID and Google Client Secret (obtainable from the Google Cloud Console).
4. Copy the **Redirect URL** provided by Supabase and add it to your Google Cloud Console Authorized Redirect URIs.

### 3. Local Project Configuration
1. Clone the project and copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and add your Supabase credentials:
   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
   ```

### 4. Install & Run
1. Install the packages:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Project Structure

- [`app/`](file:///c:/Users/user/Desktop/Freeflow%20Ventures/DotBoxGame/app/): App Router pages (`page.tsx` landing, `login/` auth, `dashboard/` hub, `room/` lobby, `game/` board, `leaderboard/` stats, `profile/` card).
- [`components/`](file:///c:/Users/user/Desktop/Freeflow%20Ventures/DotBoxGame/components/): Reusable UI pieces (e.g. [`Navbar.tsx`](file:///c:/Users/user/Desktop/Freeflow%20Ventures/DotBoxGame/components/Navbar.tsx)).
- [`lib/game/`](file:///c:/Users/user/Desktop/Freeflow%20Ventures/DotBoxGame/lib/game/): Core Dots & Boxes logic, validation, scoring, and turn switching.
- [`lib/bot/`](file:///c:/Users/user/Desktop/Freeflow%20Ventures/DotBoxGame/lib/bot/): Bot AI decision modules (Easy, Medium, Minimax-based Hard).
- [`lib/supabase/`](file:///c:/Users/user/Desktop/Freeflow%20Ventures/DotBoxGame/lib/supabase/): Client configuration and global Authentication Provider context.
- [`database.sql`](file:///c:/Users/user/Desktop/Freeflow%20Ventures/DotBoxGame/database.sql): Script for Postgres setups.

---

## ⚡ Production Deployment

### Host on Vercel
1. Create a new project on [Vercel](https://vercel.com/) and connect your GitHub repository.
2. In Vercel Project Settings, add the Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Click **Deploy**. Vercel will optimize and compile the Next.js app in seconds.

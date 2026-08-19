'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/supabase/AuthContext';
import { Users, Link as LinkIcon, Cpu } from 'lucide-react';

export default function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-gray-950">
      {/* Background glowing meshes */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-violet-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px] pointer-events-none" />

      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      {/* Top Navbar */}
      <header className="relative z-10 px-6 py-4 flex justify-between items-center max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-emerald-500 flex items-center justify-center font-black text-white text-lg tracking-wider shadow-[0_0_15px_rgba(99,102,241,0.5)]">
            D
          </div>
          <span className="text-xl font-bold tracking-wider bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            DOTBOX
          </span>
        </div>

        <div>
          {loading ? (
            <div className="h-9 w-24 bg-gray-900 rounded-lg animate-pulse" />
          ) : user ? (
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-gray-900 border border-gray-800 text-sm font-medium hover:bg-gray-800 transition-all"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-sm font-medium transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)]"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 py-12 max-w-7xl w-full mx-auto">
        <div className="text-center max-w-3xl flex flex-col items-center">
          {/* Tag badge */}
          <div className="mb-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-950/20 text-xs font-semibold tracking-wider text-violet-400 uppercase shadow-[0_0_15px_rgba(99,102,241,0.1)]">
            🎯 Dots. Strategy. Victory.
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-6">
            DOTBOX
          </h1>

          <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-xl leading-relaxed">
            Play the classic Dots & Boxes game online. Challenge friends in private lobbies, match with random opponents, or test your skills against our smart AI bot.
          </p>

          <div className="flex gap-4">
            <Link
              href={user ? '/dashboard' : '/login'}
              className="group relative px-8 py-4 rounded-xl font-bold tracking-wider text-white overflow-hidden transition-all hover:scale-105"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-violet-600 to-indigo-600 transition-all group-hover:from-violet-500 group-hover:to-indigo-500 shadow-[0_0_25px_rgba(99,102,241,0.4)]" />
              <span className="relative z-10 flex items-center gap-2">
                {user ? 'PLAY NOW' : 'GET STARTED'}
              </span>
            </Link>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-20">
          {/* Card 1: Random Player */}
          <div className="glass-panel glass-panel-hover p-8 rounded-2xl flex flex-col items-start text-left">
            <div className="h-12 w-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400 mb-6 border border-violet-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
              <Users size={24} />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">PLAY ONLINE</h3>
            <p className="text-gray-400 leading-relaxed">
              Queue up in ranked matchmaking. Face random opponents worldwide to test your skills and climb the global ELO leaderboards.
            </p>
          </div>

          {/* Card 2: Friends */}
          <div className="glass-panel glass-panel-hover p-8 rounded-2xl flex flex-col items-start text-left">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-6 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <LinkIcon size={24} />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">PLAY WITH FRIENDS</h3>
            <p className="text-gray-400 leading-relaxed">
              Create a private lobby in seconds and share a custom link with your friends. Join in on any device without complicated downloads.
            </p>
          </div>

          {/* Card 3: Bot */}
          <div className="glass-panel glass-panel-hover p-8 rounded-2xl flex flex-col items-start text-left">
            <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 mb-6 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <Cpu size={24} />
            </div>
            <h3 className="text-xl font-semibold text-white mb-3">PLAY WITH BOT</h3>
            <p className="text-gray-400 leading-relaxed">
              Challenge our built-in offline AI bot. Play on Easy, Medium, or search-powered Hard difficulty levels for continuous training.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 border-t border-gray-900 text-center text-xs text-gray-600">
        &copy; {new Date().getFullYear()} DotBox. Designed for ultimate performance and modern strategy.
      </footer>
    </div>
  );
}

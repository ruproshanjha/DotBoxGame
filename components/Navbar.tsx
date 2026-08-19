'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/AuthContext';
import { LogOut, Trophy, User as UserIcon, LayoutDashboard } from 'lucide-react';

export default function Navbar() {
  const { profile, logout } = useAuth();
  const pathname = usePathname();

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { href: '/profile', label: 'Profile', icon: UserIcon },
  ];

  return (
    <nav className="relative z-10 border-b border-gray-900 bg-gray-950/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-violet-600 to-emerald-500 flex items-center justify-center font-black text-white text-lg tracking-wider shadow-[0_0_15px_rgba(99,102,241,0.5)]">
                D
              </div>
              <span className="text-xl font-bold tracking-wider bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                DOTBOX
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isActive
                        ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20'
                        : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900 border border-transparent'
                    }`}
                  >
                    <Icon size={16} />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* User Profile Summary & LogOut */}
          <div className="flex items-center gap-4">
            {profile && (
              <div className="hidden sm:flex items-center gap-3 bg-gray-900/50 border border-gray-800 px-3 py-1.5 rounded-2xl">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    className="h-6 w-6 rounded-full border border-gray-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-violet-600/20 text-violet-400 flex items-center justify-center font-bold text-xs">
                    {profile.display_name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-gray-300 leading-none max-w-[120px] truncate">
                    {profile.display_name}
                  </span>
                  <span className="text-[10px] font-black text-emerald-400 mt-0.5 tracking-wider leading-none">
                    ⭐ {profile.rating}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={logout}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 border border-transparent transition-all duration-200 cursor-pointer"
              title="Logout"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Links (Bottom bar on mobile or just simple list) */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-gray-900/50">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                  isActive ? 'text-violet-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={18} />
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

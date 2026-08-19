'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/AuthContext';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import { User as UserIcon, Calendar, Edit2, Check, X, ArrowLeft, Percent, Trophy, Sparkles } from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [updateLoading, setUpdateLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace('/login');
      return;
    }
    setEditDisplayName(profile.display_name || '');
  }, [user, profile, loading]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editDisplayName.trim()) return;

    try {
      setUpdateLoading(true);
      setErrorMsg('');

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: editDisplayName.trim(),
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      setIsEditing(false);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setErrorMsg(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setUpdateLoading(false);
    }
  };

  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Statistics
  const winRate = profile.games_played > 0
    ? Math.round((profile.games_won / profile.games_played) * 100)
    : 0;

  return (
    <div className="relative min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <Navbar />

      {/* Background meshes */}
      <div className="absolute top-[20%] left-[20%] w-[35%] h-[35%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[20%] w-[35%] h-[35%] rounded-full bg-emerald-600/5 blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex-1 max-w-lg w-full mx-auto px-6 py-12">
        <div className="w-full glass-panel p-8 md:p-10 rounded-3xl border border-gray-900 shadow-2xl flex flex-col items-center animate-claim-pop text-center">
          
          {/* Header Action */}
          <div className="w-full flex justify-between items-center mb-8">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-white transition-all cursor-pointer"
            >
              <ArrowLeft size={14} />
              Dashboard
            </button>
            <span className="text-[9px] font-bold tracking-widest text-violet-400 uppercase bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-md">
              Player Card
            </span>
          </div>

          {/* Large Avatar */}
          <div className="relative mb-6">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="h-24 w-24 rounded-full border-2 border-violet-500/40 shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-24 w-24 rounded-full bg-violet-600/20 text-violet-400 flex items-center justify-center font-black text-3xl border-2 border-violet-500/40 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                {profile.display_name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="absolute bottom-0 right-0 bg-emerald-500 border border-gray-950 w-4 h-4 rounded-full dot-glow" />
          </div>

          {/* Edit / View Display Name Form */}
          {isEditing ? (
            <form onSubmit={handleUpdateProfile} className="w-full max-w-xs flex flex-col gap-2 mb-2">
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  maxLength={30}
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-bold bg-gray-900 border border-gray-800 rounded-xl focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-white text-center"
                  placeholder="Enter Display Name"
                  required
                />
                <button
                  type="submit"
                  disabled={updateLoading}
                  className="p-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all cursor-pointer"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditDisplayName(profile.display_name || '');
                    setIsEditing(false);
                  }}
                  className="p-2 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-white transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
              {errorMsg && <p className="text-red-400 text-[10px] font-semibold text-left">{errorMsg}</p>}
            </form>
          ) : (
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-black text-white">{profile.display_name}</h2>
              <button
                onClick={() => setIsEditing(true)}
                className="text-gray-500 hover:text-gray-300 transition-all p-1 cursor-pointer"
                title="Edit Display Name"
              >
                <Edit2 size={14} />
              </button>
            </div>
          )}

          <p className="text-xs text-gray-500 tracking-wider font-semibold mb-8">@{profile.username}</p>

          {/* Rating and XP Badges */}
          <div className="flex gap-3 mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-900/60 border border-gray-900 shadow-md">
              <Trophy size={16} className="text-yellow-500" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rating:</span>
              <span className="text-base font-black text-violet-400">{profile.rating}</span>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-900/60 border border-gray-900 shadow-md">
              <Sparkles size={16} className="text-amber-500" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">XP:</span>
              <span className="text-base font-black text-amber-400">{profile.xp}</span>
            </div>
          </div>

          {/* Stats Metrics Grid */}
          <div className="grid grid-cols-3 gap-3 w-full border-t border-gray-900/60 pt-8">
            <div className="flex flex-col items-center bg-gray-900/10 border border-gray-900/40 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Played</span>
              <span className="text-xl font-black text-gray-300">{profile.games_played}</span>
            </div>
            
            <div className="flex flex-col items-center bg-gray-900/10 border border-gray-900/40 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Wins</span>
              <span className="text-xl font-black text-emerald-400">{profile.games_won}</span>
            </div>

            <div className="flex flex-col items-center bg-gray-900/10 border border-gray-900/40 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Losses</span>
              <span className="text-xl font-black text-red-400">{profile.games_lost}</span>
            </div>
          </div>

          {/* Win rate indicator */}
          <div className="w-full flex items-center justify-between mt-6 bg-gray-900/20 border border-gray-900 p-4 rounded-2xl">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Percent size={12} className="text-amber-500" />
              Win Percentage
            </span>
            <span className="text-sm font-black text-amber-500">{winRate}%</span>
          </div>

          {/* Created Date */}
          <div className="w-full flex items-center justify-center gap-1.5 mt-8 text-[10px] text-gray-600 font-bold uppercase tracking-wider">
            <Calendar size={12} />
            Joined {new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
          </div>

        </div>
      </main>
    </div>
  );
}

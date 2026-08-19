'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/supabase/AuthContext';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import { Trophy, Medal, Loader, ArrowLeft } from 'lucide-react';

interface LeaderboardUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  rating: number;
  games_played: number;
  games_won: number;
}

export default function LeaderboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    fetchLeaderboard();
  }, [user, loading]);

  const fetchLeaderboard = async () => {
    try {
      setDataLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, rating, games_played, games_won')
        .order('rating', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLeaderboard((data as any) || []);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
    } finally {
      setDataLoading(false);
    }
  };

  if (loading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <Navbar />

      {/* Meshes */}
      <div className="absolute top-[20%] right-[10%] w-[35%] h-[35%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] left-[10%] w-[35%] h-[35%] rounded-full bg-emerald-600/5 blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex-1 max-w-3xl w-full mx-auto px-6 py-10 flex flex-col gap-8 animate-claim-pop">
        
        {/* Page Header */}
        <section className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Trophy size={20} />
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-wide">
              Global Leaderboard
            </h1>
          </div>
          
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white bg-gray-900 border border-gray-800 hover:border-gray-700 transition-all cursor-pointer"
          >
            <ArrowLeft size={14} />
            Dashboard
          </button>
        </section>

        {/* Leaderboard Table Panel */}
        <section className="glass-panel rounded-3xl border border-gray-900 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-900 bg-gray-900/30 text-gray-500 text-[10px] font-black tracking-widest uppercase">
                  <th className="py-4 px-6 text-center w-16">Rank</th>
                  <th className="py-4 px-6">Player</th>
                  <th className="py-4 px-6 text-center w-24">Rating</th>
                  <th className="py-4 px-6 text-center w-28">Games Played</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/40">
                {leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-gray-500">
                      No active players found. Be the first to claim the top spot!
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((item, index) => {
                    const rank = index + 1;
                    const isCurrentUser = item.id === user?.id;

                    // Rank decoration
                    let rankBadge = null;
                    let rankRowStyle = '';
                    if (rank === 1) {
                      rankBadge = <Medal size={18} className="text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]" />;
                      rankRowStyle = 'bg-yellow-400/5';
                    } else if (rank === 2) {
                      rankBadge = <Medal size={18} className="text-gray-300 drop-shadow-[0_0_6px_rgba(209,213,219,0.5)]" />;
                      rankRowStyle = 'bg-gray-300/5';
                    } else if (rank === 3) {
                      rankBadge = <Medal size={18} className="text-amber-600 drop-shadow-[0_0_6px_rgba(217,119,6,0.5)]" />;
                      rankRowStyle = 'bg-amber-600/5';
                    }

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-gray-900/20 transition-colors ${rankRowStyle} ${
                          isCurrentUser ? 'border-l-4 border-l-violet-500' : ''
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-4 px-6 text-center font-black">
                          <div className="flex items-center justify-center">
                            {rankBadge ? rankBadge : <span className="text-xs text-gray-500">{rank}</span>}
                          </div>
                        </td>

                        {/* Player details */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            {item.avatar_url ? (
                              <img
                                src={item.avatar_url}
                                alt={item.display_name}
                                className="h-8 w-8 rounded-full border border-gray-800"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-violet-600/20 text-violet-400 flex items-center justify-center font-bold text-sm border border-violet-500/20">
                                {item.display_name?.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col text-left">
                              <span className={`text-sm font-bold ${isCurrentUser ? 'text-violet-400 font-extrabold' : 'text-gray-200'}`}>
                                {item.display_name}
                              </span>
                              <span className="text-[10px] text-gray-500">@{item.username}</span>
                            </div>
                          </div>
                        </td>

                        {/* Rating */}
                        <td className="py-4 px-6 text-center font-black text-gray-200 text-sm">
                          <span className="bg-gray-950 border border-gray-900 px-3 py-1 rounded-xl shadow-inner">
                            {item.rating}
                          </span>
                        </td>

                        {/* Games Played */}
                        <td className="py-4 px-6 text-center font-bold text-gray-400 text-xs">
                          {item.games_played}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}

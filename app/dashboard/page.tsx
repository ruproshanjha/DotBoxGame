'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/AuthContext';
import supabase from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import { Users, Link as LinkIcon, Cpu, Play, Search, X, Hash, ChevronRight } from 'lucide-react';

interface RecentGame {
  id: string;
  player1_id: string;
  player2_id: string | null;
  player1_score: number;
  player2_score: number;
  status: string;
  winner_id: string | null;
  game_mode: string;
  created_at: string;
  player1: { display_name: string; avatar_url: string } | null;
  player2: { display_name: string; avatar_url: string } | null;
}

export default function DashboardPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const router = useRouter();

  // Modal States
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isBotModalOpen, setIsBotModalOpen] = useState(false);
  const [isMatchingOpen, setIsMatchingOpen] = useState(false);

  // Form inputs
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [matchmakingTime, setMatchmakingTime] = useState(0);

  // Data states
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);

  // Matchmaking refs
  const matchmakingChannelRef = useRef<any>(null);
  const matchmakingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const matchmakingPollRef = useRef<NodeJS.Timeout | null>(null);

  // Authenticate user
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    } else if (user) {
      fetchRecentGames();
      refreshProfile();
    }
  }, [user, loading, router]);

  // Handle Matchmaking Timer
  useEffect(() => {
    if (isMatchingOpen) {
      setMatchmakingTime(0);
      matchmakingTimerRef.current = setInterval(() => {
        setMatchmakingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (matchmakingTimerRef.current) clearInterval(matchmakingTimerRef.current);
    }
    return () => {
      if (matchmakingTimerRef.current) clearInterval(matchmakingTimerRef.current);
    };
  }, [isMatchingOpen]);

  const fetchRecentGames = async () => {
    if (!user) return;
    try {
      setGamesLoading(true);
      const { data, error } = await supabase
        .from('games')
        .select(`
          id,
          player1_id,
          player2_id,
          player1_score,
          player2_score,
          status,
          winner_id,
          game_mode,
          created_at,
          player1:profiles!player1_id(display_name, avatar_url),
          player2:profiles!player2_id(display_name, avatar_url)
        `)
        .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) throw error;
      setRecentGames((data as any) || []);
    } catch (err) {
      console.error('Error fetching recent games:', err);
    } finally {
      setGamesLoading(false);
    }
  };

  // 1. QUICK PLAY (MATCHMAKING)
  const startMatchmaking = async () => {
    if (!user) return;
    try {
      setIsMatchingOpen(true);

      // Call join matchmaking RPC
      const { data, error } = await supabase.rpc('join_matchmaking', {
        p_user_id: user.id,
      });

      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;

      if (result.status === 'matched') {
        // Match found instantly, redirect to game
        router.push(`/game/${result.game_id}`);
      } else {
        // Waiting in queue. Subscribe to games table inserts
        const channel = supabase
          .channel(`matchmaking_waiting_${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'games',
              filter: `player1_id=eq.${user.id}`,
            },
            (payload) => {
              cleanupMatchmaking();
              router.push(`/game/${payload.new.id}`);
            }
          )
          .subscribe();

        matchmakingChannelRef.current = channel;

        // Polling fallback every 3s in case websocket drops
        matchmakingPollRef.current = setInterval(async () => {
          const { data: activeGames } = await supabase
            .from('games')
            .select('id')
            .eq('player1_id', user.id)
            .eq('status', 'playing')
            .limit(1);

          if (activeGames && activeGames.length > 0) {
            cleanupMatchmaking();
            router.push(`/game/${activeGames[0].id}`);
          }
        }, 3000);
      }
    } catch (err) {
      console.error('Matchmaking error:', err);
      alert('Failed to start matchmaking. Please try again.');
      setIsMatchingOpen(false);
    }
  };

  const cleanupMatchmaking = async () => {
    if (matchmakingChannelRef.current) {
      supabase.removeChannel(matchmakingChannelRef.current);
      matchmakingChannelRef.current = null;
    }
    if (matchmakingPollRef.current) {
      clearInterval(matchmakingPollRef.current);
      matchmakingPollRef.current = null;
    }
    setIsMatchingOpen(false);
  };

  const cancelMatchmaking = async () => {
    if (!user) return;
    cleanupMatchmaking();
    try {
      await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', user.id);
    } catch (err) {
      console.error('Error leaving matchmaking queue:', err);
    }
  };

  // 2. CREATE PRIVATE ROOM
  const handleCreateRoom = async () => {
    if (!user) return;
    try {
      // Generate a short 6 character uppercase code
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let roomCode = '';
      for (let i = 0; i < 6; i++) {
        roomCode += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      // Create a private game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert({
          player1_id: user.id,
          board_size: 4,
          status: 'waiting',
          game_mode: 'private',
        })
        .select()
        .single();

      if (gameError) throw gameError;

      // Create the room
      const { error: roomError } = await supabase.from('rooms').insert({
        room_code: roomCode,
        host_id: user.id,
        game_id: game.id,
        status: 'waiting',
      });

      if (roomError) throw roomError;

      router.push(`/room/${roomCode}`);
    } catch (err) {
      console.error('Create room error:', err);
      alert('Failed to create private room. Please try again.');
    }
  };

  // 3. JOIN PRIVATE ROOM
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !roomCodeInput) return;
    setJoinError('');

    const formattedCode = roomCodeInput.trim().toUpperCase();

    try {
      // Find the room
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', formattedCode)
        .eq('status', 'waiting')
        .maybeSingle();

      if (roomError) throw roomError;

      if (!room) {
        setJoinError('Room not found or game already started.');
        return;
      }

      if (room.host_id === user.id) {
        router.push(`/room/${formattedCode}`);
        return;
      }

      // Join the room
      const { error: joinError } = await supabase
        .from('rooms')
        .update({
          guest_id: user.id,
        })
        .eq('id', room.id);

      if (joinError) throw joinError;

      // Update the game record to add player 2
      const { error: gameError } = await supabase
        .from('games')
        .update({
          player2_id: user.id,
        })
        .eq('id', room.game_id);

      if (gameError) throw gameError;

      router.push(`/room/${formattedCode}`);
    } catch (err) {
      console.error('Join room error:', err);
      setJoinError('An error occurred while joining the room.');
    }
  };

  // 4. BOT GAME LOBBY REDIRECT
  const handleStartBotGame = (difficulty: string) => {
    router.push(`/game/bot?difficulty=${difficulty}`);
  };

  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Calculate statistics
  const winRate = profile.games_played > 0
    ? Math.round((profile.games_won / profile.games_played) * 100)
    : 0;

  return (
    <div className="relative min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <Navbar />

      {/* Hero mesh */}
      <div className="absolute top-[20%] right-[10%] w-[35%] h-[35%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] left-[5%] w-[35%] h-[35%] rounded-full bg-emerald-600/5 blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        
        {/* Welcome Banner & Stats */}
        <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 glass-panel p-8 rounded-3xl border border-gray-900 shadow-xl">
          <div>
            <h1 className="text-3xl font-extrabold text-white">
              Welcome, {profile.display_name} 👋
            </h1>
            <p className="text-gray-400 text-sm mt-1">Ready for your next move?</p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto">
            <div className="bg-gray-900/50 border border-gray-800 px-5 py-3 rounded-2xl text-center min-w-[100px]">
              <span className="text-xs text-gray-500 font-bold block mb-1 uppercase tracking-wider">Rating</span>
              <span className="text-2xl font-black text-violet-400">{profile.rating}</span>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 px-5 py-3 rounded-2xl text-center min-w-[100px]">
              <span className="text-xs text-gray-500 font-bold block mb-1 uppercase tracking-wider">Games</span>
              <span className="text-2xl font-black text-gray-200">{profile.games_played}</span>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 px-5 py-3 rounded-2xl text-center min-w-[100px]">
              <span className="text-xs text-gray-500 font-bold block mb-1 uppercase tracking-wider">Wins</span>
              <span className="text-2xl font-black text-emerald-400">{profile.games_won}</span>
            </div>
            <div className="bg-gray-900/50 border border-gray-800 px-5 py-3 rounded-2xl text-center min-w-[100px]">
              <span className="text-xs text-gray-500 font-bold block mb-1 uppercase tracking-wider">Win Rate</span>
              <span className="text-2xl font-black text-amber-400">{winRate}%</span>
            </div>
          </div>
        </section>

        {/* Action Panel Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Quick Play */}
          <div className="relative group overflow-hidden rounded-3xl glass-panel border border-violet-500/20 shadow-lg flex flex-col justify-between p-8 min-h-[220px]">
            <div className="absolute inset-0 bg-violet-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative z-10">
              <div className="h-10 w-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-6">
                <Users size={20} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">QUICK PLAY</h2>
              <p className="text-gray-400 text-xs leading-relaxed">
                Jump into ranked matchmaking. Battle other live players of similar rating. ELO points are on the line!
              </p>
            </div>
            
            <button
              onClick={startMatchmaking}
              className="relative z-10 w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold transition-all shadow-[0_5px_15px_rgba(99,102,241,0.2)] hover:shadow-[0_5px_20px_rgba(99,102,241,0.3)] active:scale-[0.98] cursor-pointer"
            >
              <Play size={16} fill="currentColor" />
              Find Random Player
            </button>
          </div>

          {/* Card 2: Private Room */}
          <div className="relative group overflow-hidden rounded-3xl glass-panel border border-emerald-500/20 shadow-lg flex flex-col justify-between p-8 min-h-[220px]">
            <div className="absolute inset-0 bg-emerald-600/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative z-10">
              <div className="h-10 w-10 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6">
                <LinkIcon size={20} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">PLAY WITH FRIENDS</h2>
              <p className="text-gray-400 text-xs leading-relaxed">
                Host a private match. Generate a room link or join a friend's active lobby. Does not affect ELO ratings.
              </p>
            </div>
            
            <div className="relative z-10 grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={handleCreateRoom}
                className="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-[0_5px_15px_rgba(16,185,129,0.2)] active:scale-[0.98] cursor-pointer"
              >
                Create Room
              </button>
              <button
                onClick={() => {
                  setRoomCodeInput('');
                  setJoinError('');
                  setIsJoinModalOpen(true);
                }}
                className="py-3 rounded-2xl bg-gray-900 border border-gray-800 text-gray-300 hover:text-white hover:bg-gray-800 font-bold text-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                Join Room
              </button>
            </div>
          </div>

          {/* Card 3: Bot */}
          <div className="relative group overflow-hidden rounded-3xl glass-panel border border-amber-500/20 shadow-lg flex flex-col justify-between p-8 min-h-[220px]">
            <div className="absolute inset-0 bg-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative z-10">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6">
                <Cpu size={20} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">PLAY BOT</h2>
              <p className="text-gray-400 text-xs leading-relaxed">
                Challenge our built-in engine locally. Practice tactics and improve your endgame with varying difficulty settings.
              </p>
            </div>
            
            <button
              onClick={() => setIsBotModalOpen(true)}
              className="relative z-10 w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-[0_5px_15px_rgba(245,158,11,0.2)] hover:shadow-[0_5px_20px_rgba(245,158,11,0.3)] active:scale-[0.98] cursor-pointer"
            >
              <Cpu size={16} />
              Play Engine
            </button>
          </div>

        </section>

        {/* Recent Games List */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-extrabold text-white tracking-wide">
            Recent Games
          </h2>

          {gamesLoading ? (
            <div className="glass-panel p-8 rounded-3xl border border-gray-900 flex flex-col gap-3">
              <div className="h-6 bg-gray-900 rounded-lg animate-pulse w-[40%]" />
              <div className="h-12 bg-gray-900 rounded-xl animate-pulse" />
              <div className="h-12 bg-gray-900 rounded-xl animate-pulse" />
            </div>
          ) : recentGames.length === 0 ? (
            <div className="glass-panel p-10 rounded-3xl border border-gray-900 text-center text-gray-500">
              No games played yet. Hit "Quick Play" to find your first match!
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentGames.map((game) => {
                const isP1 = game.player1_id === user.id;
                const scoreStr = `${game.player1_score} - ${game.player2_score}`;
                
                // Get opponent name
                let opponentName = 'AI Bot';
                if (game.game_mode !== 'bot') {
                  const oppProfile = isP1 ? game.player2 : game.player1;
                  opponentName = oppProfile?.display_name || 'Finding Opponent...';
                }

                // Determine result string
                let resultText = 'Draw';
                let resultColor = 'text-gray-400';
                if (game.winner_id) {
                  if (game.winner_id === user.id) {
                    resultText = 'Won';
                    resultColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                  } else {
                    resultText = 'Lost';
                    resultColor = 'text-red-400 bg-red-500/10 border-red-500/20';
                  }
                }

                // Mode label
                const modeLabel = game.game_mode === 'quick' ? 'Ranked' : game.game_mode === 'private' ? 'Private' : 'Bot';

                return (
                  <div
                    key={game.id}
                    onClick={() => router.push(`/game/${game.id}`)}
                    className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl glass-panel glass-panel-hover border border-gray-900/50 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-gray-900 flex items-center justify-center text-gray-400 font-bold border border-gray-800">
                        {opponentName.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-bold text-gray-200 block">
                          vs {opponentName}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                          {modeLabel} &bull; {new Date(game.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <span className="text-sm font-black text-gray-300 leading-none">
                          {scoreStr}
                        </span>
                      </div>
                      
                      <div className={`px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase border ${resultColor}`}>
                        {resultText}
                      </div>

                      <ChevronRight size={16} className="text-gray-600" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* --- MODALS --- */}

      {/* 1. MATCHMAKING MODAL */}
      {isMatchingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-sm glass-panel p-8 rounded-3xl border border-violet-500/30 text-center shadow-2xl flex flex-col items-center animate-claim-pop">
            <div className="h-16 w-16 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 mb-6 animate-pulse">
              <Search size={32} />
            </div>

            <h3 className="text-xl font-black text-white mb-2">Finding Opponent</h3>
            <p className="text-gray-400 text-xs leading-relaxed max-w-[240px] mb-6">
              Searching the queue for a player with similar rating...
            </p>

            {/* Timer visual */}
            <div className="h-12 w-28 bg-gray-900/50 border border-gray-800 rounded-2xl flex items-center justify-center font-mono text-lg font-black text-violet-400 mb-8">
              {Math.floor(matchmakingTime / 60)}:{(matchmakingTime % 60).toString().padStart(2, '0')}
            </div>

            <button
              onClick={cancelMatchmaking}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-900 border border-gray-800 text-sm font-bold text-gray-300 hover:text-white hover:bg-gray-800 hover:border-gray-700 transition-all cursor-pointer"
            >
              <X size={16} />
              Cancel Search
            </button>
          </div>
        </div>
      )}

      {/* 2. JOIN ROOM CODE MODAL */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-sm glass-panel p-8 rounded-3xl border border-emerald-500/30 shadow-2xl flex flex-col animate-claim-pop">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-white">Join Private Room</h3>
              <button
                onClick={() => setIsJoinModalOpen(false)}
                className="text-gray-500 hover:text-gray-300 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleJoinRoom} className="flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 tracking-wider uppercase mb-1.5 block">
                  Enter 6-Digit Room Code
                </label>
                <div className="relative">
                  <Hash className="absolute left-4 top-3.5 text-gray-600" size={18} />
                  <input
                    type="text"
                    maxLength={6}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value)}
                    placeholder="A7K29P"
                    required
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-gray-900 border border-gray-800 font-bold text-white text-center tracking-widest placeholder:tracking-normal placeholder:text-gray-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all uppercase"
                  />
                </div>
                {joinError && (
                  <p className="text-red-400 text-xs font-semibold mt-2 text-left leading-normal">
                    {joinError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-[0_5px_15px_rgba(16,185,129,0.2)] active:scale-[0.98] cursor-pointer"
              >
                Join Lobby
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. BOT DIFFICULTY MODAL */}
      {isBotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
          <div className="w-full max-w-sm glass-panel p-8 rounded-3xl border border-amber-500/30 shadow-2xl flex flex-col animate-claim-pop">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-white">Play Against Engine</h3>
              <button
                onClick={() => setIsBotModalOpen(false)}
                className="text-gray-500 hover:text-gray-300 transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-6 leading-relaxed">
              Test your skills against our AI engine. ELO rankings are not affected in bot games.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleStartBotGame('easy')}
                className="w-full py-3.5 rounded-2xl bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-white font-bold text-sm transition-all flex items-center justify-between px-6 group cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 group-hover:scale-110 transition-transform" />
                  Easy Bot
                </span>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  Random Moves
                </span>
              </button>

              <button
                onClick={() => handleStartBotGame('medium')}
                className="w-full py-3.5 rounded-2xl bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-white font-bold text-sm transition-all flex items-center justify-between px-6 group cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 group-hover:scale-110 transition-transform" />
                  Medium Bot
                </span>
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                  Basic Strategy
                </span>
              </button>

              <button
                onClick={() => handleStartBotGame('hard')}
                className="w-full py-3.5 rounded-2xl bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-white font-bold text-sm transition-all flex items-center justify-between px-6 group cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400 group-hover:scale-110 transition-transform" />
                  Hard Bot (Minimax)
                </span>
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                  Search-Guided AI
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

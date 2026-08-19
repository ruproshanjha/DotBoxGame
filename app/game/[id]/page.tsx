'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/supabase/AuthContext';
import supabase from '@/lib/supabase/client';
import { createGame, GameState, GameMove, makeMove, getGameResultText, isValidMove } from '@/lib/game';
import { getBotMove } from '@/lib/bot';
import Navbar from '@/components/Navbar';
import { Trophy, ArrowLeft, RotateCcw, Home, Sparkles, MessageSquare, AlertCircle } from 'lucide-react';

export default function GamePage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  // Determine if it's a bot game
  const isBotGame = id === 'bot';
  const difficulty = (searchParams.get('difficulty') || 'medium') as 'easy' | 'medium' | 'hard';

  // Game state
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<{ display_name: string; avatar_url: string } | null>(null);
  const [gameLoading, setGameLoading] = useState(true);
  const [moveSubmitting, setMoveSubmitting] = useState(false);
  const [saveTriggered, setSaveTriggered] = useState(false);

  // Sync ref for game state (needed in bot effect)
  const gameStateRef = useRef<GameState | null>(null);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // 1. INITIALIZE GAME STATE
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    if (isBotGame) {
      // Local Bot Game initialization
      const localGame = createGame(user.id, 'bot', 'bot', 4);
      setGameState(localGame);
      setOpponentProfile({
        display_name: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Bot`,
        avatar_url: '',
      });
      setGameLoading(false);
    } else {
      // Online Multiplayer Game initialization
      fetchMultiplayerGame();

      // Subscribe to Realtime Updates
      const channel = supabase
        .channel(`game_play_${id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${id}`,
          },
          (payload) => {
            console.log('Realtime game update:', payload);
            setGameState((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                ...payload.new,
                // Keep the joined profiles we loaded originally
                player1_id: payload.new.player1_id,
                player2_id: payload.new.player2_id,
              };
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [id, user, loading]);

  const fetchMultiplayerGame = async () => {
    try {
      setGameLoading(true);
      const { data: game, error } = await supabase
        .from('games')
        .select(`
          *,
          player1:profiles!player1_id(display_name, avatar_url),
          player2:profiles!player2_id(display_name, avatar_url)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      setGameState(game as any);
      
      // Get opponent profile info
      if (user) {
        const isP1 = game.player1_id === user.id;
        const opp = isP1 ? game.player2 : game.player1;
        setOpponentProfile(opp as any);
      }
    } catch (err) {
      console.error('Error fetching multiplayer game:', err);
      alert('Failed to load the game. It might have ended or is invalid.');
      router.replace('/dashboard');
    } finally {
      setGameLoading(false);
    }
  };

  // 2. BOT MOVE TRIGGER EFFECT
  useEffect(() => {
    if (!isBotGame || !gameState) return;

    const { current_player_id, status } = gameState;

    if (status === 'playing' && current_player_id === 'bot') {
      const botTimer = setTimeout(() => {
        const state = gameStateRef.current;
        if (!state || state.current_player_id !== 'bot') return;

        // Clone current state and search for bot move
        const stateClone = JSON.parse(JSON.stringify(state));
        const move = getBotMove(stateClone, difficulty, 'bot', user!.id);
        
        if (move) {
          const updatedState = makeMove(stateClone, move, 'bot');
          setGameState(updatedState);
        }
      }, 700); // 700ms realistic artificial thinking delay

      return () => clearTimeout(botTimer);
    }
  }, [gameState?.current_player_id, gameState?.status, isBotGame]);

  // 3. BOT GAME SAVER EFFECT
  useEffect(() => {
    if (!isBotGame || !gameState || saveTriggered) return;
    
    if (gameState.status === 'finished') {
      saveBotGameToDatabase();
    }
  }, [gameState?.status, isBotGame, saveTriggered]);

  const saveBotGameToDatabase = async () => {
    if (!user || !gameState) return;
    setSaveTriggered(true);
    try {
      // Save bot game results quietly to DB for history logs
      await supabase.from('games').insert({
        player1_id: user.id,
        player2_id: null, // Null is bot
        board_size: gameState.board_size,
        player1_score: gameState.player1_score,
        player2_score: gameState.player2_score,
        status: 'finished',
        winner_id: gameState.winner_id === 'bot' ? null : gameState.winner_id, // If bot won, store null or special
        game_mode: 'bot',
      });
    } catch (err) {
      console.error('Error saving bot game results:', err);
    }
  };

  // 4. CLICK HANDLER FOR DRAWING LINES
  const handleLineClick = async (type: 'horizontal' | 'vertical', r: number, c: number) => {
    if (!user || !gameState || moveSubmitting || gameState.status !== 'playing') return;

    // Verify it is our turn
    if (gameState.current_player_id !== user.id) return;

    const move: GameMove = { type, r, c };

    // Validate move locally
    if (!isValidMove(gameState, move, user.id)) return;

    if (isBotGame) {
      // Local State update
      const stateClone = JSON.parse(JSON.stringify(gameState));
      const updatedState = makeMove(stateClone, move, user.id);
      setGameState(updatedState);
    } else {
      // Online DB update via RPC
      try {
        setMoveSubmitting(true);
        const { data, error } = await supabase.rpc('make_move', {
          p_game_id: id,
          p_line_type: type,
          p_r: r,
          p_c: c,
        });

        if (error) throw error;
        
        const res = typeof data === 'string' ? JSON.parse(data) : data;
        if (!res.success) {
          alert(`Move rejected: ${res.error}`);
        }
      } catch (err) {
        console.error('Submit move error:', err);
        alert('An error occurred submitting your move.');
      } finally {
        setMoveSubmitting(false);
      }
    }
  };

  // Rematch for Bot games
  const handleRestartBotGame = () => {
    if (!user) return;
    setSaveTriggered(false);
    const newGame = createGame(user.id, 'bot', 'bot', 4);
    setGameState(newGame);
  };

  if (loading || gameLoading || !gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Define layout parameters for 4x4 dot grid (3x3 boxes)
  const boardSize = gameState.board_size;
  const boxCount = boardSize - 1; // 3

  // Helper variables
  const isP1 = gameState.player1_id === user?.id;
  const turnName = gameState.current_player_id === user?.id
    ? 'YOUR TURN'
    : `${opponentProfile?.display_name || 'Opponent'}'s turn`;

  const isYourTurn = gameState.current_player_id === user?.id;

  // Score colors
  const activeTurnGlow = isYourTurn
    ? isP1 ? 'glow-p1 text-violet-400' : 'glow-p2 text-emerald-400'
    : 'text-gray-400';

  return (
    <div className="relative min-h-screen flex flex-col bg-gray-950 text-gray-100 select-none">
      <Navbar />

      {/* Meshes */}
      <div className="absolute top-[10%] left-[10%] w-[30%] h-[30%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[10%] right-[10%] w-[30%] h-[30%] rounded-full bg-emerald-600/5 blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center max-w-4xl w-full mx-auto px-6 py-6">
        
        {/* Score Board */}
        <section className="w-full max-w-[360px] flex justify-between items-center bg-gray-900/50 border border-gray-900 px-6 py-4 rounded-3xl mb-4 shadow-md">
          {/* Player 1 Details */}
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              {isP1 ? 'You' : 'Friend'}
            </span>
            <span className="text-sm font-extrabold text-white truncate max-w-[100px]">
              {isP1 ? profile?.display_name : opponentProfile?.display_name || 'Opponent'}
            </span>
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="w-2 h-2 rounded-full bg-violet-500 dot-glow" />
              <span className="text-xl font-black text-violet-400">
                {gameState.player1_score} <span className="text-xs text-gray-500 font-bold">Boxes</span>
              </span>
            </div>
          </div>

          <div className="text-center font-bold text-gray-700 text-sm">vs</div>

          {/* Player 2 Details */}
          <div className="flex flex-col items-end text-right">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              {!isP1 ? 'You' : (isBotGame ? 'Engine' : 'Friend')}
            </span>
            <span className="text-sm font-extrabold text-white truncate max-w-[100px]">
              {!isP1 ? profile?.display_name : opponentProfile?.display_name || 'Opponent'}
            </span>
            <div className="flex items-center gap-1.5 mt-1.5 justify-end">
              <span className="text-xl font-black text-emerald-400">
                {gameState.player2_score} <span className="text-xs text-gray-500 font-bold">Boxes</span>
              </span>
              <div className="w-2 h-2 rounded-full bg-emerald-500 dot-glow" />
            </div>
          </div>
        </section>

        {/* Turn Status Message */}
        <div className={`mb-6 text-center text-xs font-black tracking-widest uppercase transition-all duration-300 ${activeTurnGlow}`}>
          {gameState.status === 'playing' ? (
            <span className="flex items-center justify-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full animate-ping ${isYourTurn ? (isP1 ? 'bg-violet-500' : 'bg-emerald-500') : 'bg-gray-500'}`} />
              {turnName}
            </span>
          ) : (
            'GAME COMPLETED'
          )}
        </div>

        {/* --- MAIN GAME BOARD BOARD --- */}
        <div className="relative w-full max-w-[360px] aspect-square bg-gray-900/60 border border-gray-900 rounded-3xl p-6 shadow-xl flex items-center justify-center overflow-hidden">
          {/* Overlay inner border line */}
          <div className="absolute inset-2 border border-gray-900/40 rounded-2xl pointer-events-none" />

          {/* Board Coordinate Area */}
          <div className="relative w-full h-full">
            
            {/* 1. RENDER COMPLETED BOXES */}
            {gameState.claimed_boxes.map((row, br) =>
              row.map((claimOwner, bc) => {
                if (claimOwner === null) return null;
                const isClaimedByP1 = claimOwner === gameState.player1_id;
                const claimClass = isClaimedByP1 ? 'box-claimed-p1' : 'box-claimed-p2';
                const initial = isClaimedByP1 
                  ? (isP1 ? 'Y' : 'O') 
                  : (isP1 ? 'O' : 'Y');

                return (
                  <div
                    key={`box-${br}-${bc}`}
                    style={{
                      top: `${(br / boxCount) * 100}%`,
                      left: `${(bc / boxCount) * 100}%`,
                      width: `${(1 / boxCount) * 100}%`,
                      height: `${(1 / boxCount) * 100}%`,
                    }}
                    className="absolute p-4 flex items-center justify-center pointer-events-none select-none"
                  >
                    <div className={`w-full h-full rounded-2xl flex items-center justify-center font-black text-lg transition-all ${claimClass} ${isClaimedByP1 ? 'text-violet-400' : 'text-emerald-400'}`}>
                      {initial}
                    </div>
                  </div>
                );
              })
            )}

            {/* 2. RENDER HORIZONTAL LINES */}
            {gameState.horizontal_lines.map((row, r) =>
              row.map((isPlayed, c) => {
                const hoverColorClass = isP1 ? 'line-hover-p1' : 'line-hover-p2';
                const playedColorClass = isP1 
                  ? 'bg-violet-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
                  : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';
                const oppPlayedColorClass = !isP1 
                  ? 'bg-violet-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
                  : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';

                return (
                  <button
                    key={`h-${r}-${c}`}
                    disabled={isPlayed || !isYourTurn || moveSubmitting}
                    onClick={() => handleLineClick('horizontal', r, c)}
                    style={{
                      top: `${(r / boxCount) * 100}%`,
                      left: `${(c / boxCount) * 100}%`,
                      width: `${(1 / boxCount) * 100}%`,
                    }}
                    className="absolute h-6 -translate-y-1/2 flex items-center justify-center group focus:outline-none z-20 cursor-pointer"
                  >
                    <div
                      className={`h-1.5 w-full rounded-full transition-all duration-200 ${
                        isPlayed
                          ? (gameState.claimed_boxes[r === 0 ? 0 : r - 1]?.[c] === gameState.player1_id || 
                             gameState.claimed_boxes[r === boardSize - 1 ? boxCount - 1 : r]?.[c] === gameState.player1_id
                              ? playedColorClass
                              : oppPlayedColorClass)
                          : `bg-gray-800/40 group-hover:scale-y-125 ${isYourTurn ? hoverColorClass : ''}`
                      }`}
                    />
                  </button>
                );
              })
            )}

            {/* 3. RENDER VERTICAL LINES */}
            {gameState.vertical_lines.map((row, r) =>
              row.map((isPlayed, c) => {
                const hoverColorClass = isP1 ? 'line-hover-p1' : 'line-hover-p2';
                const playedColorClass = isP1 
                  ? 'bg-violet-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
                  : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';
                const oppPlayedColorClass = !isP1 
                  ? 'bg-violet-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]' 
                  : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';

                return (
                  <button
                    key={`v-${r}-${c}`}
                    disabled={isPlayed || !isYourTurn || moveSubmitting}
                    onClick={() => handleLineClick('vertical', r, c)}
                    style={{
                      top: `${(r / boxCount) * 100}%`,
                      left: `${(c / boxCount) * 100}%`,
                      height: `${(1 / boxCount) * 100}%`,
                    }}
                    className="absolute w-6 -translate-x-1/2 flex items-center justify-center group focus:outline-none z-20 cursor-pointer"
                  >
                    <div
                      className={`w-1.5 h-full rounded-full transition-all duration-200 ${
                        isPlayed
                          ? (gameState.claimed_boxes[r]?.[c === 0 ? 0 : c - 1] === gameState.player1_id || 
                             gameState.claimed_boxes[r]?.[c === boardSize - 1 ? boxCount - 1 : c] === gameState.player1_id
                              ? playedColorClass
                              : oppPlayedColorClass)
                          : `bg-gray-800/40 group-hover:scale-x-125 ${isYourTurn ? hoverColorClass : ''}`
                      }`}
                    />
                  </button>
                );
              })
            )}

            {/* 4. RENDER GRID DOTS */}
            {Array.from({ length: boardSize }).map((_, r) =>
              Array.from({ length: boardSize }).map((_, c) => (
                <div
                  key={`dot-${r}-${c}`}
                  style={{
                    top: `${(r / boxCount) * 100}%`,
                    left: `${(c / boxCount) * 100}%`,
                  }}
                  className="absolute w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300 border-2 border-slate-700 shadow-[0_0_8px_rgba(255,255,255,0.3)] z-30 pointer-events-none"
                />
              ))
            )}

          </div>
        </div>

        {/* Back and Reset Options */}
        <div className="mt-8 flex gap-4 w-full max-w-[360px]">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gray-900 border border-gray-800 text-gray-300 hover:text-white hover:bg-gray-800 hover:border-gray-700 transition-all font-bold text-sm cursor-pointer"
          >
            <ArrowLeft size={16} />
            Leave Match
          </button>
          
          {isBotGame && (
            <button
              onClick={handleRestartBotGame}
              className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-gray-900 border border-gray-800 text-amber-400 hover:text-amber-300 hover:bg-gray-800 hover:border-amber-500/30 transition-all font-bold text-sm cursor-pointer"
              title="Reset Offline Game"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          )}
        </div>
      </main>

      {/* --- GAME COMPLETED MODAL OVERLAY --- */}
      {gameState.status === 'finished' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6">
          <div className="w-full max-w-sm glass-panel p-8 rounded-3xl border border-violet-500/20 text-center shadow-2xl flex flex-col items-center animate-claim-pop">
            
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-emerald-500 flex items-center justify-center text-white mb-6 shadow-[0_0_30px_rgba(99,102,241,0.5)]">
              <Trophy size={32} />
            </div>

            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">
              Match Complete
            </span>
            
            <h2 className="text-3xl font-black text-white mb-4">
              {getGameResultText(gameState, user!.id)}
            </h2>

            {/* Score box */}
            <div className="flex items-center justify-center gap-6 bg-gray-900/50 border border-gray-800 px-6 py-3.5 rounded-2xl mb-8">
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-500 font-bold mb-1">P1</span>
                <span className="text-2xl font-black text-violet-400">{gameState.player1_score}</span>
              </div>
              <div className="text-xl font-bold text-gray-700">-</div>
              <div className="flex flex-col items-center">
                <span className="text-xs text-gray-500 font-bold mb-1">P2</span>
                <span className="text-2xl font-black text-emerald-400">{gameState.player2_score}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full">
              {isBotGame ? (
                <button
                  onClick={handleRestartBotGame}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold transition-all shadow-[0_5px_15px_rgba(99,102,241,0.2)] cursor-pointer"
                >
                  <RotateCcw size={16} />
                  Play Again
                </button>
              ) : (
                <button
                  onClick={() => router.replace('/dashboard')}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold transition-all shadow-[0_5px_15px_rgba(99,102,241,0.2)] cursor-pointer"
                >
                  Find Another Match
                </button>
              )}

              <button
                onClick={() => router.replace('/dashboard')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gray-900 border border-gray-800 text-sm font-bold text-gray-300 hover:text-white hover:bg-gray-800 hover:border-gray-700 transition-all cursor-pointer"
              >
                <Home size={16} />
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/AuthContext';
import supabase from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import { Copy, Check, Users, Play, Loader, ShieldAlert } from 'lucide-react';

interface RoomData {
  id: string;
  room_code: string;
  host_id: string;
  guest_id: string | null;
  game_id: string;
  status: string;
  host: { display_name: string; avatar_url: string } | null;
  guest: { display_name: string; avatar_url: string } | null;
}

export default function RoomLobbyPage() {
  const { code } = useParams();
  const { user, loading } = useAuth();
  const router = useRouter();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [roomLoading, setRoomLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const formattedCode = (code as string).toUpperCase();

  const fetchRoomData = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select(`
          id,
          room_code,
          host_id,
          guest_id,
          game_id,
          status,
          host:profiles!host_id(display_name, avatar_url),
          guest:profiles!guest_id(display_name, avatar_url)
        `)
        .eq('room_code', formattedCode)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setRoom(null);
      } else {
        setRoom(data as any);
        
        // If room is already playing, redirect automatically
        if (data.status === 'playing') {
          router.push(`/game/${data.game_id}`);
        }
      }
    } catch (err) {
      console.error('Error fetching room details:', err);
    } finally {
      setRoomLoading(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?redirectTo=/room/${formattedCode}`);
      return;
    }

    fetchRoomData();

    // Subscribe to updates on this room row
    const channel = supabase
      .channel(`room_sync_${formattedCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `room_code=eq.${formattedCode}`,
        },
        async (payload) => {
          console.log('Room Realtime update:', payload);
          
          if (payload.eventType === 'UPDATE') {
            const updatedRoom = payload.new;
            // If host started the game, redirect immediately
            if (updatedRoom.status === 'playing') {
              router.push(`/game/${updatedRoom.game_id}`);
              return;
            }
          }
          // For other updates (e.g. guest joined), refetch to get joined profile details
          await fetchRoomData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loading, formattedCode]);

  const copyRoomLink = () => {
    const link = `${window.location.origin}/room/${formattedCode}`;
    navigator.clipboard.writeText(link);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleStartGame = async () => {
    if (!room || !user || room.host_id !== user.id || !room.guest_id) return;

    try {
      setStarting(true);

      // 1. Update the game row status to 'playing' and set current player to host
      const { error: gameError } = await supabase
        .from('games')
        .update({
          status: 'playing',
          current_player_id: room.host_id, // Host makes the first move
        })
        .eq('id', room.game_id);

      if (gameError) throw gameError;

      // 2. Update the room row status to 'playing'
      const { error: roomError } = await supabase
        .from('rooms')
        .update({
          status: 'playing',
        })
        .eq('id', room.id);

      if (roomError) throw roomError;

      // Both updates succeeded. Realtime update trigger will handle redirecting the guest.
      router.push(`/game/${room.game_id}`);
    } catch (err) {
      console.error('Error starting game:', err);
      alert('Failed to start the game. Please try again.');
      setStarting(false);
    }
  };

  if (loading || roomLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
        <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-950 text-gray-100">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mb-6">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-2xl font-extrabold text-white mb-2">Room Not Found</h2>
          <p className="text-gray-400 max-w-sm mb-8 leading-relaxed">
            This private lobby does not exist, has expired, or the game has already completed.
          </p>
          <button
            onClick={() => router.replace('/dashboard')}
            className="px-6 py-3 rounded-2xl bg-gray-900 border border-gray-800 text-gray-300 font-bold hover:text-white hover:bg-gray-800 hover:border-gray-700 transition-all cursor-pointer"
          >
            Back to Dashboard
          </button>
        </main>
      </div>
    );
  }

  const isHost = room.host_id === user?.id;
  const isGuestJoined = !!room.guest_id;

  return (
    <div className="relative min-h-screen flex flex-col bg-gray-950 text-gray-100">
      <Navbar />

      {/* Hero mesh */}
      <div className="absolute top-[20%] left-[20%] w-[35%] h-[35%] rounded-full bg-violet-600/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] right-[20%] w-[35%] h-[35%] rounded-full bg-emerald-600/5 blur-[120px] pointer-events-none" />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center max-w-lg w-full mx-auto px-6 py-12">
        <div className="w-full glass-panel p-8 md:p-10 rounded-3xl border border-gray-900 shadow-2xl text-center flex flex-col items-center">
          
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">
            Private Lobby
          </span>
          <h1 className="text-3xl font-extrabold text-white mb-8">
            DOTBOX ROOM
          </h1>

          {/* Share Code Widget */}
          <div className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl p-5 mb-8">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
              Share Room Link
            </span>
            <div className="flex items-center justify-between gap-3 bg-gray-950 border border-gray-900 rounded-xl px-4 py-2.5 mt-2">
              <span className="font-mono text-sm font-bold text-gray-300 select-all truncate max-w-[200px]">
                {room.room_code}
              </span>
              <button
                onClick={copyRoomLink}
                className="flex items-center gap-1.5 text-xs font-semibold text-violet-400 hover:text-violet-300 transition-all cursor-pointer"
              >
                {isCopied ? (
                  <>
                    <Check size={14} className="text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-3 leading-normal">
              Send this code or link to your friend. Once they log in and join, the match can begin.
            </p>
          </div>

          {/* Players Lobby Box */}
          <div className="w-full flex flex-col gap-4 mb-8 text-left">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block px-1">
              Lobby Players
            </span>

            {/* Host Player */}
            <div className="flex items-center justify-between p-4 bg-gray-900/30 border border-gray-900 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400 dot-glow" />
                <span className="text-sm font-bold text-gray-200">
                  {room.host?.display_name || 'Host'}
                </span>
              </div>
              <span className="text-[9px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
                Host
              </span>
            </div>

            {/* Guest Player */}
            <div className="flex items-center justify-between p-4 bg-gray-900/30 border border-gray-900 rounded-2xl">
              {isGuestJoined ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 dot-glow" />
                    <span className="text-sm font-bold text-gray-200">
                      {room.guest?.display_name || 'Guest'}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Ready
                  </span>
                </>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span className="text-sm font-semibold text-gray-600">
                      Waiting for opponent...
                    </span>
                  </div>
                  <Loader size={14} className="text-gray-700 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Action Trigger */}
          {isHost ? (
            <button
              onClick={handleStartGame}
              disabled={!isGuestJoined || starting}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-gray-900 disabled:to-gray-900 disabled:text-gray-600 disabled:border-gray-800 disabled:cursor-not-allowed border border-transparent font-bold tracking-wider transition-all shadow-[0_5px_20px_rgba(99,102,241,0.25)] cursor-pointer"
            >
              {starting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Starting game...
                </>
              ) : (
                <>
                  <Play size={16} fill="currentColor" />
                  START GAME
                </>
              )}
            </button>
          ) : (
            <div className="w-full bg-gray-900/20 border border-gray-900 px-5 py-4 rounded-2xl text-center text-xs text-gray-400 leading-relaxed">
              👋 You joined the lobby. Waiting for the Host (
              <span className="text-violet-400 font-bold">
                {room.host?.display_name}
              </span>
              ) to start the game...
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

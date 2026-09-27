import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, ArrowLeft, Play, Pause, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Socket } from 'socket.io-client';
import { AuctionRoom } from '../types';
import { TEAMS } from '../data/teams';
import { PLAYERS } from '../data/players';

export const RetentionArena = ({ user, room, socket }: { user: FirebaseUser, room: AuctionRoom, socket: Socket | null }) => {
  const navigate = useNavigate();
  const myProfile = room.teams[user.uid];
  const isHost = room.hostId === user.uid;

  const forceStart = () => {
    if (isHost) {
      socket?.emit('force-process-retentions', { roomId: room.id });
    }
  };

  if (!myProfile || !myProfile.teamId) {
    return (
      <div className="h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-8">
        <Shield size={48} className="text-zinc-700 mb-4" />
        <h2 className="text-xl font-semibold tracking-tight mb-2">
          {isHost ? 'Retention monitor' : 'No team selected'}
        </h2>
        <p className="text-zinc-400 text-center max-w-md mb-8 text-sm font-normal">
          {isHost
            ? 'As host, you can monitor the retention progress of all teams.'
            : 'You did not select a team in the lobby. You can still proceed without any retentions.'}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-3xl mb-8">
          {Object.values(room.teams).map((team, idx) => {
            const teamInfo = TEAMS.find(t => t.id === team.teamId);
            return (
              <div key={idx} className="bg-zinc-900 border border-zinc-800 p-3.5 rounded-xl flex flex-col items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center">
                  {teamInfo ? <img src={teamInfo.logo} className="w-7 h-7 object-contain" alt="Logo" /> : <Shield size={18} className="text-zinc-600" />}
                </div>
                <div className="text-center">
                  <p className="text-xs font-medium text-zinc-300 truncate w-24">
                    {teamInfo?.name || 'Spectator'}
                  </p>
                  <div className={`mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${team.retentionSubmitted ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'}`}>
                    {team.retentionSubmitted ? 'Ready' : 'Deciding...'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-3">
          {!isHost && myProfile && !myProfile.retentionSubmitted && (
            <button
              onClick={() => socket?.emit('submit-retentions', { roomId: room.id, userId: user.uid, playerIds: [] })}
              className="px-6 py-2.5 bg-white text-zinc-950 font-medium text-sm rounded-xl hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              Submit without retentions
            </button>
          )}
          {!isHost && myProfile?.retentionSubmitted && (
            <div className="flex items-center gap-2 text-green-400 font-medium text-sm">
              <CheckCircle2 size={16} />
              Submitted â€” Waiting for other teams...
            </div>
          )}
          {isHost && (
            <button
              onClick={forceStart}
              className="px-6 py-2.5 bg-orange-500 text-zinc-950 font-medium text-sm rounded-xl hover:bg-orange-400 transition-colors cursor-pointer shadow-sm"
            >
              Force start auction
            </button>
          )}
        </div>
      </div>
    );
  }

  const myTeam = TEAMS.find(t => t.id === myProfile.teamId);
  const teamPlayers = PLAYERS.filter(p => p.previousTeamId === myProfile.teamId);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [timer, setTimer] = useState(room.timer);

  useEffect(() => {
    if (!socket) return;
    socket.on('timer-update', (val) => setTimer(val));
    return () => { socket.off('timer-update'); };
  }, [socket]);

  const togglePlayer = (id: string) => {
    if (myProfile.retentionSubmitted) return;

    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= 6) {
        toast.error("Maximum 6 retentions allowed");
        return prev;
      }

      const player = PLAYERS.find(p => p.id === id);
      const cappedCount = prev.filter(pid => !PLAYERS.find(p => p.id === pid)?.isUncapped).length;
      const uncappedCount = prev.filter(pid => PLAYERS.find(p => p.id === pid)?.isUncapped).length;

      if (!player?.isUncapped && cappedCount >= 5) {
        toast.error("Maximum 5 capped players allowed");
        return prev;
      }
      if (player?.isUncapped && uncappedCount >= 2) {
        toast.error("Maximum 2 uncapped players allowed");
        return prev;
      }

      return [...prev, id];
    });
  };

  const submitRetentions = () => {
    socket?.emit('submit-retentions', { roomId: room.id, userId: user.uid, playerIds: selectedIds });
  };

  const calculateTotalCost = () => {
    let cost = 0;
    let cappedCount = 0;
    const cappedCosts = [18, 14, 11, 18, 14];

    selectedIds.forEach(id => {
      const player = PLAYERS.find(p => p.id === id);
      if (player?.isUncapped) {
        cost += 4;
      } else {
        cost += cappedCosts[cappedCount] || 14;
        cappedCount++;
      }
    });
    return cost;
  };

  const totalCost = calculateTotalCost();

  return (
    <div className="h-screen h-[100dvh] bg-zinc-950 text-white flex flex-col p-4 md:p-6 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-800 transition-colors cursor-pointer"
              title="Leave room"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden">
                <img src={myTeam?.logo} className="w-9 h-9 object-contain" alt="Logo" />
              </div>
              <div className="text-left">
                <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">{myTeam?.name}</h1>
                <p className="text-zinc-400 text-xs font-normal">Retention phase â€¢ {selectedIds.length}/6 selected</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {isHost && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => socket?.emit(room.isPaused ? 'resume-auction' : 'pause-auction', { roomId: room.id, userId: user.uid })}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors border text-xs font-medium cursor-pointer ${
                    room.isPaused
                      ? 'bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-750'
                  }`}
                >
                  {room.isPaused ? (
                    <>
                      <Play size={12} fill="currentColor" />
                      <span>Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause size={12} fill="currentColor" />
                      <span>Pause</span>
                    </>
                  )}
                </button>
                <button
                  onClick={forceStart}
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-medium text-zinc-300 rounded-lg transition-colors cursor-pointer"
                >
                  Force start
                </button>
              </div>
            )}
            <div className="text-right">
              <p className="text-xs text-zinc-400 font-normal">Estimated cost</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-orange-400">â‚¹{totalCost} Cr</p>
            </div>
            <div className="w-14 h-14 rounded-full border-2 border-zinc-800 flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="28" cy="28" r="24"
                  fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-zinc-800"
                />
                <motion.circle
                  cx="28" cy="28" r="24"
                  fill="none" stroke="currentColor" strokeWidth="3"
                  strokeDasharray={150}
                  animate={{ strokeDashoffset: 150 - (150 * timer / 60) }}
                  className="text-orange-500"
                />
              </svg>
              <span className="text-sm font-mono tabular-nums font-semibold">{room.isPaused ? '||' : `${timer}s`}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto custom-scrollbar pr-1 pb-4">
          {teamPlayers.map(player => {
            const isSelected = selectedIds.includes(player.id);
            return (
              <div
                key={player.id}
                onClick={() => togglePlayer(player.id)}
                className={`p-3.5 rounded-xl border transition-colors cursor-pointer relative ${
                  isSelected
                    ? 'bg-orange-500/10 border-orange-500 ring-1 ring-orange-500/30'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`}
                    className="w-12 h-12 rounded-lg object-cover bg-zinc-800"
                    alt={player.name}
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0 text-left">
                    <h3 className="font-medium text-sm truncate leading-tight mb-1 text-white">{player.name}</h3>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md">
                        {player.role}
                      </span>
                      {player.isUncapped && (
                        <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">
                          Uncapped
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div className="absolute top-3 right-3 text-orange-500">
                    <CheckCircle2 size={16} strokeWidth={2.5} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-auto pt-4 border-t border-zinc-800 flex items-center justify-between">
          <div className="text-left">
            <p className="text-zinc-400 text-xs font-normal">Select up to 5 capped and 2 uncapped players (maximum 6 retentions).</p>
            <p className="text-zinc-500 text-[11px] font-normal">Costs deducted from total auction purse.</p>
          </div>

          <button
            onClick={submitRetentions}
            disabled={myProfile.retentionSubmitted}
            className={`px-6 py-2.5 rounded-xl font-medium text-sm transition-colors cursor-pointer ${
              myProfile.retentionSubmitted
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-orange-500 hover:bg-orange-400 text-zinc-950 shadow-sm'
            }`}
          >
            {myProfile.retentionSubmitted ? 'Retentions confirmed' : 'Confirm retentions'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {myProfile.retentionSubmitted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <div className="text-center space-y-3 bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-sm w-full">
              <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <h2 className="text-lg font-semibold tracking-tight text-white">Retentions locked</h2>
              <p className="text-zinc-400 text-xs font-normal leading-relaxed">
                Waiting for remaining franchises to finalize retentions before the mega auction begins.
              </p>
              <div className="flex items-center justify-center gap-2 pt-3">
                {Object.values(room.teams).map((team, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full ${team.retentionSubmitted ? 'bg-orange-500' : 'bg-zinc-700 animate-pulse'}`}
                    title={team.displayName}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

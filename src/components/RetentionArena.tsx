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
      <div className="h-screen bg-black text-white flex flex-col items-center justify-center p-8">
        <Shield size={64} className="text-zinc-800 mb-6" />
        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">
          {isHost ? 'Retention Monitor' : 'No Team Selected'}
        </h2>
        <p className="text-zinc-500 text-center max-w-md mb-8">
          {isHost 
            ? 'As the host, you can monitor the retention progress of all teams.' 
            : 'You did not select a team in the lobby. You can still proceed without any retentions.'}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mb-12">
          {Object.values(room.teams).map((team, idx) => {
            const teamInfo = TEAMS.find(t => t.id === team.teamId);
            return (
              <div key={idx} className="bg-zinc-900 border border-white/5 p-4 rounded-2xl flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-black border border-white/10 flex items-center justify-center">
                  {teamInfo ? <img src={teamInfo.logo} className="w-8 h-8 object-contain" alt="Logo" /> : <Shield size={20} className="text-zinc-700" />}
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest truncate w-24">
                    {teamInfo?.name || 'Spectator'}
                  </p>
                  <div className={`mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${team.retentionSubmitted ? 'bg-green-500/20 text-green-500' : 'bg-orange-500/20 text-orange-500 animate-pulse'}`}>
                    {team.retentionSubmitted ? 'Ready' : 'Deciding...'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-4">
          {!isHost && myProfile && !myProfile.retentionSubmitted && (
            <button
              onClick={() => socket?.emit('submit-retentions', { roomId: room.id, userId: user.uid, playerIds: [] })}
              className="px-8 py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-orange-500 transition-all"
            >
              Submit — No Retentions
            </button>
          )}
          {!isHost && myProfile?.retentionSubmitted && (
            <div className="flex items-center gap-2 text-green-500 font-black uppercase tracking-widest text-sm">
              <CheckCircle2 size={18} />
              Submitted — Waiting for others...
            </div>
          )}
          {isHost && (
            <button 
              onClick={forceStart}
              className="px-8 py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:bg-orange-500 transition-all"
            >
              Force Start Auction
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
        toast.error("Maximum 6 retentions allowed!");
        return prev;
      }
      
      const player = PLAYERS.find(p => p.id === id);
      const cappedCount = prev.filter(pid => !PLAYERS.find(p => p.id === pid)?.isUncapped).length;
      const uncappedCount = prev.filter(pid => PLAYERS.find(p => p.id === pid)?.isUncapped).length;
      
      if (!player?.isUncapped && cappedCount >= 5) {
        toast.error("Maximum 5 capped players allowed!");
        return prev;
      }
      if (player?.isUncapped && uncappedCount >= 2) {
        toast.error("Maximum 2 uncapped players allowed!");
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
    <div className="h-screen h-[100dvh] bg-black text-white flex flex-col p-4 md:p-8 overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => navigate('/')}
              className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-2xl border border-white/5 transition-all group"
            >
              <ArrowLeft className="text-zinc-500 group-hover:text-white" size={20} />
            </button>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden">
                <img src={myTeam?.logo} className="w-12 h-12 object-contain" alt="Logo" />
              </div>
              <div>
                <h1 className="text-4xl font-black tracking-tighter uppercase">{myTeam?.name}</h1>
                <p className="text-zinc-500 font-black text-[10px] uppercase tracking-widest">Retention Phase • {selectedIds.length}/6 Selected</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-8">
            {isHost && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => socket?.emit(room.isPaused ? 'resume-auction' : 'pause-auction', { roomId: room.id, userId: user.uid })}
                  className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all group border ${
                    room.isPaused 
                      ? 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20' 
                      : 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20'
                  }`}
                >
                  {room.isPaused ? (
                    <>
                      <Play size={14} className="text-green-500 fill-green-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-green-500">Resume</span>
                    </>
                  ) : (
                    <>
                      <Pause size={14} className="text-orange-500 fill-orange-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-orange-500">Pause</span>
                    </>
                  )}
                </button>
                <button 
                  onClick={forceStart}
                  className="px-4 py-2 bg-zinc-900 border border-white/5 hover:border-orange-500/50 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all"
                >
                  Force Start
                </button>
              </div>
            )}
            <div className="text-right">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Estimated Cost</p>
              <p className="text-3xl font-black text-orange-500 tracking-tighter">₹{totalCost} Cr</p>
            </div>
            <div className="w-20 h-20 rounded-full border-4 border-white/5 flex items-center justify-center relative">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle 
                  cx="40" cy="40" r="36" 
                  fill="none" stroke="currentColor" strokeWidth="4" 
                  className="text-orange-500/20"
                />
                <motion.circle 
                  cx="40" cy="40" r="36" 
                  fill="none" stroke="currentColor" strokeWidth="4" 
                  strokeDasharray={226}
                  animate={{ strokeDashoffset: 226 - (226 * timer / 60) }}
                  className="text-orange-500"
                />
              </svg>
              <span className="text-2xl font-black">{room.isPaused ? '||' : `${timer}s`}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto custom-scrollbar pr-2 pb-8">
          {teamPlayers.map(player => {
            const isSelected = selectedIds.includes(player.id);
            return (
              <motion.div 
                key={player.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => togglePlayer(player.id)}
                className={`relative p-4 rounded-3xl border-2 transition-all cursor-pointer overflow-hidden group ${isSelected ? 'bg-orange-500 border-orange-500 text-black' : 'bg-zinc-900 border-white/5 hover:border-white/20'}`}
              >
                <div className="flex items-center gap-4 relative z-10">
                  <img 
                    src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`} 
                    className={`w-16 h-16 rounded-2xl object-cover ${isSelected ? 'bg-black/20' : 'bg-zinc-800'}`} 
                    alt={player.name}
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-lg truncate leading-none mb-1">{player.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${isSelected ? 'bg-black/10' : 'bg-white/5 text-zinc-500'}`}>
                        {player.role}
                      </span>
                      {player.isUncapped && (
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${isSelected ? 'bg-black/20' : 'bg-blue-500/20 text-blue-500'}`}>
                          Uncapped
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                {isSelected && (
                  <div className="absolute top-4 right-4 z-20">
                    <CheckCircle2 size={24} className="text-black" />
                  </div>
                )}
                
                <div className={`absolute -bottom-2 -right-2 opacity-10 transition-transform group-hover:scale-110 ${isSelected ? 'text-black' : 'text-white'}`}>
                  <Shield size={80} />
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-auto pt-8 border-t border-white/5 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-zinc-500 text-sm font-medium">Select up to 5 capped and 2 uncapped players (Max 6 total).</p>
            <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest italic">Note: Retention costs follow IPL 2025 slabs.</p>
          </div>
          
          <button 
            onClick={submitRetentions}
            disabled={myProfile.retentionSubmitted}
            className={`px-12 py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-2xl ${myProfile.retentionSubmitted ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-white text-black hover:bg-orange-500 hover:scale-105 active:scale-95'}`}
          >
            {myProfile.retentionSubmitted ? 'Submitted' : 'Confirm Retentions'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {myProfile.retentionSubmitted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center"
          >
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-orange-500 rounded-full flex items-center justify-center mx-auto shadow-2xl shadow-orange-500/20">
                <CheckCircle2 size={40} className="text-black" />
              </div>
              <h2 className="text-3xl font-black tracking-tighter uppercase">Retentions Locked</h2>
              <p className="text-zinc-500 max-w-xs mx-auto">Waiting for other teams to finalize their squads before the Mega Auction begins...</p>
              <div className="flex items-center justify-center gap-2 pt-4">
                {Object.values(room.teams).map((team, idx) => (
                  <div 
                    key={idx}
                    className={`w-2 h-2 rounded-full ${team.retentionSubmitted ? 'bg-orange-500' : 'bg-zinc-800 animate-pulse'}`}
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

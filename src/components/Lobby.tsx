import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Share2, Play, CheckCircle2, Users, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Socket } from 'socket.io-client';
import { AuctionRoom } from '../types';
import { TEAMS } from '../data/teams';

export const Lobby = ({ user, room, socket }: { user: FirebaseUser, room: AuctionRoom, socket: Socket | null }) => {
  const navigate = useNavigate();

  if (!room) {
    return <div className="h-screen flex items-center justify-center bg-black text-white font-black text-2xl animate-pulse tracking-tighter uppercase">Initializing Arena...</div>;
  }

  const [auctionType, setAuctionType] = useState<'open' | 'blind' | 'draft' | 'mega'>(room.auctionType || 'open');

  useEffect(() => {
    if (room.auctionType) {
      setAuctionType(room.auctionType);
    }
  }, [room.auctionType]);

  const selectTeam = (teamId: string) => {
    socket?.emit('select-team', { roomId: room.id, userId: user.uid, teamId });
  };

  const readyUp = () => {
    socket?.emit('ready-up', { roomId: room.id, userId: user.uid });
  };

  const startAuction = () => {
    socket?.emit('start-auction', { roomId: room.id, auctionType });
  };
  
  const updateSettings = (purse: number, bidTime: number, draftLimit: number, type?: 'open' | 'blind' | 'draft' | 'mega') => {
    socket?.emit('update-room-settings', { 
      roomId: room.id, 
      userId: user.uid, 
      purse, 
      bidTime, 
      draftLimit,
      auctionType: type || auctionType
    });
  };

  const participants = Object.values(room.teams || {});
  const myProfile = room.teams?.[user.uid];

  return (
    <div className="relative min-h-screen bg-stadium bg-fixed overflow-x-hidden">
      {/* Tactical Overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '100px 100px' }} />

      <div className="relative z-10 pt-6 md:pt-10 px-4 md:px-8 max-w-7xl mx-auto pb-20">
        <div className="flex flex-col lg:flex-row items-start lg:items-stretch justify-between gap-8 mb-12 md:mb-16">
          <div className="flex flex-col sm:flex-row items-start gap-5 md:gap-6 lg:max-w-2xl">
            <button 
              onClick={() => navigate('/')}
              className="p-3.5 bg-zinc-900/90 backdrop-blur-md hover:bg-zinc-800 hover:border-white/10 rounded-2xl border border-white/5 transition-all duration-200 group shadow-xl cursor-pointer active:scale-95"
            >
              <ArrowLeft className="text-zinc-400 group-hover:text-white transition-colors duration-200" size={20} />
            </button>
            <div className="space-y-3.5 text-left">
              <div className="flex flex-wrap items-center gap-2.5">
                <motion.div 
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="px-4 py-1 bg-gradient-to-r from-orange-500 to-orange-600 text-black font-black text-[10px] tracking-[0.3em] uppercase rounded-full shadow-lg shadow-orange-500/15"
                >
                  War Room
                </motion.div>
                <span className="px-3 py-1 bg-white/[0.04] backdrop-blur-md rounded-lg text-zinc-400 font-mono text-xs tracking-widest uppercase border border-white/5">ID: {room.id}</span>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    toast.success("Arena link copied!");
                  }}
                  className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-white transition-all duration-150 cursor-pointer active:scale-95 flex items-center justify-center"
                  title="Copy arena invite link"
                >
                  <Share2 size={15} />
                </button>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tighter leading-none drop-shadow-2xl">{room.name}</h1>
              <p className="text-xs text-zinc-500 font-semibold uppercase tracking-widest">Select your franchise and ready up to start the drafting war</p>
            </div>
          </div>
          
          {/* Integrated Settings Panel - Interactive for Host, Read-Only for Guest */}
          <div className="flex flex-col gap-4 w-full lg:w-[420px] shrink-0 justify-between">
            <div className="flex flex-col gap-5 bg-zinc-900/40 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl text-left">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">
                    {room.hostId === user.uid ? "Auction Configuration" : "Room settings"}
                  </label>
                  {room.hostId !== user.uid && (
                    <span className="text-[9px] font-black bg-white/[0.03] text-zinc-500 px-2.5 py-0.5 rounded-full border border-white/5 uppercase tracking-widest">
                      Guest View
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {['open', 'blind', 'draft', 'mega'].map((type) => {
                    const isSelected = auctionType === type;
                    const isHost = room.hostId === user.uid;
                    return (
                      <button 
                        key={type}
                        disabled={!isHost}
                        onClick={() => {
                          if (!isHost) return;
                          setAuctionType(type as any);
                          socket?.emit('update-room-settings', { roomId: room.id, userId: user.uid, auctionType: type });
                        }}
                        className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200 border ${
                          isSelected 
                            ? 'bg-orange-500 text-black border-orange-500 shadow-md shadow-orange-500/10 font-black' 
                            : 'bg-black/30 text-zinc-500 border-white/5 hover:text-zinc-300'
                        } ${isHost ? 'cursor-pointer hover:border-white/20 active:scale-[0.98]' : 'cursor-not-allowed opacity-90'}`}
                      >
                        {type} Mode
                      </button>
                    );
                  })}
                </div>
                {auctionType === 'mega' && (
                  <motion.p 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[9px] font-bold text-orange-500/70 uppercase tracking-widest text-center mt-1"
                  >
                    * Retired players will be excluded from the pool
                  </motion.p>
                )}
              </div>

              <div className="h-px bg-white/5" />

              {auctionType !== 'draft' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">Total Purse</span>
                      <span className="text-2xl font-black text-white tracking-tighter">₹{room.purse} Cr</span>
                    </div>
                    {room.hostId === user.uid && (
                      <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                        <button 
                          onClick={() => updateSettings(Math.max(80, room.purse - 5), room.bidTime, room.draftLimit || 15)}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center transition-all duration-150 text-white font-black cursor-pointer active:scale-90 text-sm"
                        >
                          -
                        </button>
                        <button 
                          onClick={() => updateSettings(Math.min(200, room.purse + 5), room.bidTime, room.draftLimit || 15)}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center transition-all duration-150 text-white font-black cursor-pointer active:scale-90 text-sm"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">Bid Time</span>
                      <span className="text-2xl font-black text-white tracking-tighter">{room.bidTime}s</span>
                    </div>
                    {room.hostId === user.uid && (
                      <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                        <button 
                          onClick={() => updateSettings(room.purse, Math.max(5, room.bidTime - 1), room.draftLimit || 15)}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center transition-all duration-150 text-white font-black cursor-pointer active:scale-90 text-sm"
                        >
                          -
                        </button>
                        <button 
                          onClick={() => updateSettings(room.purse, Math.min(30, room.bidTime + 1), room.draftLimit || 15)}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center transition-all duration-150 text-white font-black cursor-pointer active:scale-90 text-sm"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">Draft Limit</span>
                    <span className="text-2xl font-black text-white tracking-tighter">{room.draftLimit || 15} Players</span>
                  </div>
                  {room.hostId === user.uid && (
                    <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                      <button 
                        onClick={() => updateSettings(room.purse, room.bidTime, Math.max(5, (room.draftLimit || 15) - 1))}
                        className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center transition-all duration-150 text-white font-black cursor-pointer active:scale-90 text-sm"
                      >
                        -
                      </button>
                      <button 
                        onClick={() => updateSettings(room.purse, room.bidTime, Math.min(20, (room.draftLimit || 15) + 1))}
                        className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center transition-all duration-150 text-white font-black cursor-pointer active:scale-90 text-sm"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {room.hostId === user.uid ? (
              <motion.button 
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={startAuction}
                disabled={participants.length < 2 || !participants.every(p => p.isReady)}
                className="bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-850 disabled:text-zinc-600 text-black font-black py-4 px-10 rounded-2xl transition-all duration-200 shadow-xl shadow-orange-500/10 disabled:shadow-none flex items-center gap-3 w-full justify-center text-md group cursor-pointer"
              >
                <Play size={20} fill="currentColor" className="group-hover:translate-x-1 transition-transform duration-200" />
                START ARENA
              </motion.button>
            ) : (
              <div className="w-full text-center py-3.5 px-6 bg-zinc-950/40 backdrop-blur-md rounded-2xl border border-white/5 flex items-center justify-center gap-2 shadow-inner">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  Waiting for host to start arena
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8 space-y-8">
            <div className="flex items-center gap-3.5 text-left">
              <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center border border-orange-500/20">
                <ShieldCheck className="text-orange-500" size={20} />
              </div>
              <div>
                <h2 className="text-xs font-black text-white uppercase tracking-[0.4em] leading-none mb-1">Franchise Selection</h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Choose a franchise to represent in the war room</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {TEAMS.map((team, idx) => {
                const isTaken = participants.some(p => p.teamId === team.id && p.uid !== user.uid);
                const isSelected = myProfile?.teamId === team.id;
                
                return (
                  <motion.button 
                    key={team.id}
                    initial={{ opacity: 0, scale: 0.93 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.03 }}
                    disabled={isTaken}
                    onClick={() => selectTeam(team.id)}
                    className={`aspect-square rounded-2xl border transition-all duration-300 flex flex-col items-center justify-center p-4 sm:p-5 gap-3.5 relative overflow-hidden group ${
                      isSelected 
                        ? 'border-orange-500 bg-orange-500/5 ring-2 ring-orange-500/10 shadow-lg shadow-orange-500/5' 
                        : isTaken 
                          ? 'border-white/5 bg-zinc-950/40 opacity-30 cursor-not-allowed' 
                          : 'border-white/5 bg-zinc-900/30 backdrop-blur-md hover:border-white/15 hover:bg-zinc-800/50 hover:shadow-xl hover:scale-[1.02] cursor-pointer'
                    }`}
                  >
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center transition-all duration-500 group-hover:scale-105 ${isSelected ? 'drop-shadow-[0_0_15px_rgba(249,115,22,0.3)]' : ''}`}>
                      <img 
                        src={team.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`} 
                        className="w-full h-full object-contain" 
                        alt={team.name} 
                        referrerPolicy="no-referrer" 
                        onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`)} 
                      />
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-[0.25em] text-center leading-tight transition-colors ${isSelected ? 'text-orange-500' : 'text-zinc-500 group-hover:text-zinc-200'}`}>
                      {team.shortName}
                    </span>
                    {isSelected && (
                      <div className="absolute top-3 right-3 text-orange-500">
                        <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-black shadow-md">
                           <CheckCircle2 size={13} strokeWidth={3.5} />
                        </div>
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-8">
            <div className="flex items-center gap-3.5 text-left">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                <Users className="text-blue-500" size={20} />
              </div>
              <div>
                <h2 className="text-xs font-black text-white uppercase tracking-[0.4em] leading-none mb-1">Managers ({participants.length}/10)</h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Active war commanders waiting inside</p>
              </div>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {participants.map((p, idx) => {
                  const isCurrentUser = p.uid === user.uid;
                  return (
                    <motion.div 
                      key={p.uid}
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`group bg-zinc-900/30 backdrop-blur-md border p-3.5 rounded-2xl flex items-center justify-between transition-all duration-200 hover:shadow-lg ${
                        isCurrentUser 
                          ? 'border-orange-500/30 bg-zinc-900/50 shadow-inner' 
                          : 'border-white/5 hover:border-white/10 hover:bg-zinc-900/50'
                      }`}
                    >
                      <div className="flex items-center gap-4 text-left">
                        <div className="relative shrink-0">
                          <img 
                            src={p.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.uid}`} 
                            className={`w-11 h-11 rounded-xl border object-cover shadow-md transition-all duration-300 ${
                              isCurrentUser ? 'border-orange-500/20 group-hover:border-orange-500/40' : 'border-white/10 group-hover:border-white/20'
                            }`} 
                            alt={p.displayName} 
                            referrerPolicy="no-referrer" 
                          />
                          {p.teamId && (
                            <motion.div 
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute -bottom-1.5 -right-1.5 w-6.5 h-6.5 bg-black rounded-lg border border-white/10 p-1 shadow-lg"
                            >
                              <img 
                                src={TEAMS.find(t => t.id === p.teamId)?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${p.teamId}`} 
                                className="w-full h-full object-contain" 
                                alt="Team Logo" 
                                referrerPolicy="no-referrer"
                                onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${p.teamId}`)}
                              />
                            </motion.div>
                          )}
                        </div>
                        <div>
                          <span className="block font-black text-white text-md tracking-tight leading-none mb-1.5">
                            {p.displayName}
                            {isCurrentUser && <span className="text-[9px] font-bold text-orange-500 ml-1.5 uppercase tracking-wider">(You)</span>}
                          </span>
                          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.15em]">
                            {TEAMS.find(t => t.id === p.teamId)?.name || 'Strategizing...'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {p.isReady ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-full border border-green-500/20">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">Ready</span>
                          </div>
                        ) : (
                          p.uid === user.uid ? (
                            <button 
                              onClick={readyUp}
                              disabled={!myProfile?.teamId}
                              className="text-[9px] font-black bg-orange-500 hover:bg-orange-400 text-black px-4 py-2 rounded-xl transition-all duration-200 disabled:opacity-40 shadow-lg shadow-orange-500/15 cursor-pointer active:scale-95"
                            >
                              READY UP
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-full border border-white/5">
                              <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Waiting</span>
                            </div>
                          )
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

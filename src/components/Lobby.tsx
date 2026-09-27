import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Share2,
  Play,
  CheckCircle2,
  Users,
  ShieldCheck,
  Copy,
  SlidersHorizontal
} from 'lucide-react';
import { toast } from 'sonner';
import { Socket } from 'socket.io-client';
import { AuctionRoom } from '../types';
import { TEAMS } from '../data/teams';

export const Lobby = ({ user, room, socket }: { user: FirebaseUser, room: AuctionRoom, socket: Socket | null }) => {
  const navigate = useNavigate();

  if (!room) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 font-medium text-base">
        Initializing arena...
      </div>
    );
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
  const isHost = room.hostId === user.uid;
  const canStartAuction = isHost && participants.length >= 2 && participants.every(p => p.isReady);

  return (
    <div className="relative min-h-screen bg-stadium bg-fixed overflow-x-hidden">
      <div className="relative z-10 pt-6 md:pt-8 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto pb-20 space-y-6 sm:space-y-8">

        {/* COMPACT TOP HEADER */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 text-left">
            <button
              onClick={() => navigate('/')}
              className="p-2.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors cursor-pointer shrink-0"
              title="Leave room"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium text-xs rounded-full">
                  Lobby
                </span>
                <span className="px-2.5 py-0.5 bg-zinc-900 rounded-md text-zinc-300 font-medium text-xs border border-zinc-800 capitalize">
                  {auctionType} auction
                </span>
                <span className="text-xs text-zinc-500 font-normal">
                  {participants.length}/10 managers joined
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-semibold text-white tracking-tight leading-tight">
                {room.name}
              </h1>
            </div>
          </div>

          {/* Quick Ready Action in Header */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {myProfile && (
              myProfile.isReady ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-xl border border-green-500/20 text-green-400 text-xs font-medium">
                  <CheckCircle2 size={15} />
                  <span>You are ready</span>
                </div>
              ) : (
                <button
                  onClick={readyUp}
                  disabled={!myProfile.teamId}
                  className="bg-orange-500 hover:bg-orange-400 text-zinc-950 font-medium px-4 py-2 rounded-xl transition-colors text-xs sm:text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  Confirm ready
                </button>
              )
            )}
          </div>
        </div>

        {/* CONNECTION & INVITE BAR (ARENA CODE + INVITE LINK) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl">
          {/* Arena Code Section */}
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <div className="text-left">
              <span className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Arena code
              </span>
              <span className="font-mono tabular-nums text-sm sm:text-base font-semibold text-white tracking-wider select-all">
                {room.id}
              </span>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(room.id);
                toast.success("Arena code copied to clipboard");
              }}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg transition-colors border border-zinc-700/60 cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title="Copy arena code"
            >
              <Copy size={13} />
              <span>Copy code</span>
            </button>
          </div>

          {/* Invite Link Section */}
          <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-zinc-800/80 pt-3 sm:pt-0">
            <span className="text-xs text-zinc-400 hidden md:inline">
              Share direct join link with managers
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("Invite link copied to clipboard");
              }}
              className="w-full sm:w-auto px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 border border-zinc-700/60 cursor-pointer"
              title="Copy arena invite link"
            >
              <Share2 size={13} />
              Copy invite link
            </button>
          </div>
        </div>

        {/* FRANCHISE SELECTION (PROMINENT FIRST-CLASS ACTION) */}
        <section className="space-y-4 text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-orange-500/10 rounded-lg flex items-center justify-center text-orange-400 border border-orange-500/20">
                <ShieldCheck size={16} strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                  Franchise selection
                </h2>
                <p className="text-xs text-zinc-400 font-normal">
                  Claim your team for this session. Exactly one franchise per manager.
                </p>
              </div>
            </div>
            {myProfile?.teamId && (
              <span className="text-xs font-medium text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20 hidden sm:inline-block">
                Team selected
              </span>
            )}
          </div>

          {/* 10-Franchise Grid: 5 columns x 2 rows on desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {TEAMS.map((team) => {
              const claimant = participants.find(p => p.teamId === team.id);
              const isSelectedByMe = myProfile?.teamId === team.id;
              const isTakenByOther = !!claimant && claimant.uid !== user.uid;

              return (
                <button
                  key={team.id}
                  disabled={isTakenByOther}
                  onClick={() => selectTeam(team.id)}
                  className={`relative rounded-2xl border p-4 sm:p-5 flex flex-col items-center justify-between min-h-[160px] sm:min-h-[175px] transition-all group ${
                    isSelectedByMe
                      ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/30 text-orange-400 shadow-md'
                      : isTakenByOther
                        ? 'border-zinc-800/80 bg-zinc-950/60 opacity-50 cursor-not-allowed'
                        : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-850 cursor-pointer'
                  }`}
                >
                  {/* Top Status Pill */}
                  <div className="w-full flex items-center justify-end h-5">
                    {isSelectedByMe ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-400 bg-orange-500/20 px-2 py-0.5 rounded-full border border-orange-500/30">
                        <CheckCircle2 size={13} strokeWidth={2.5} />
                        You
                      </span>
                    ) : isTakenByOther ? (
                      <span className="text-[10px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md truncate max-w-[90%]">
                        {claimant.displayName}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors">
                        Available
                      </span>
                    )}
                  </div>

                  {/* Team Logo (Significantly Larger) */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center my-1">
                    <img
                      src={team.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`}
                      className="w-full h-full object-contain filter drop-shadow-md transition-transform group-hover:scale-105"
                      alt={team.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`)}
                    />
                  </div>

                  {/* Team Name Details */}
                  <div className="w-full text-center space-y-0.5">
                    <span className={`block font-display font-semibold text-base sm:text-lg leading-tight transition-colors ${
                      isSelectedByMe ? 'text-orange-400' : 'text-white'
                    }`}>
                      {team.shortName}
                    </span>
                    <span className="block text-[11px] sm:text-xs text-zinc-400 truncate max-w-full font-normal">
                      {team.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* LOWER SECTION: CONNECTED MANAGERS & ROOM CONTROLS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">

          {/* Left Column: Connected Managers List */}
          <div className="lg:col-span-7 space-y-4 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400 border border-blue-500/20">
                  <Users size={16} strokeWidth={2} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white tracking-tight">
                    Connected managers ({participants.length}/10)
                  </h2>
                  <p className="text-xs text-zinc-400 font-normal">
                    Managers claim franchises and confirm readiness before start.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <AnimatePresence>
                {participants.map((p) => {
                  const isCurrentUser = p.uid === user.uid;
                  const teamInfo = TEAMS.find(t => t.id === p.teamId);

                  return (
                    <div
                      key={p.uid}
                      className={`bg-zinc-900/60 border p-3 sm:p-3.5 rounded-2xl flex items-center justify-between transition-colors ${
                        isCurrentUser
                          ? 'border-orange-500/30 bg-zinc-900/90'
                          : 'border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 text-left">
                        <div className="relative shrink-0">
                          <img
                            src={p.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.uid}`}
                            className="w-10 h-10 rounded-xl border border-zinc-800 object-cover bg-zinc-950"
                            alt={p.displayName}
                            referrerPolicy="no-referrer"
                          />
                          {teamInfo && (
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-zinc-950 rounded-md border border-zinc-800 p-0.5 shadow-sm">
                              <img
                                src={teamInfo.logo}
                                className="w-full h-full object-contain"
                                alt="Team Logo"
                                referrerPolicy="no-referrer"
                                onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${p.teamId}`)}
                              />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-sm leading-tight">
                              {p.displayName}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[10px] font-medium text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
                                You
                              </span>
                            )}
                            {p.uid === room.hostId && (
                              <span className="text-[10px] font-medium text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                                Host
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-400 font-normal block mt-0.5">
                            {teamInfo ? `${teamInfo.name} (${teamInfo.shortName})` : 'Selecting franchise...'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {p.isReady ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            <span className="text-xs font-medium text-green-400">Ready</span>
                          </div>
                        ) : isCurrentUser ? (
                          <button
                            onClick={readyUp}
                            disabled={!myProfile?.teamId}
                            className="text-xs font-medium bg-orange-500 hover:bg-orange-400 text-zinc-950 px-3 py-1.5 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                          >
                            Ready up
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800/80 rounded-full border border-zinc-700/50">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                            <span className="text-xs font-normal text-zinc-400">Not ready</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Column: Room Settings & Launch Panel */}
          <div className="lg:col-span-5 space-y-4 text-left">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-zinc-800 rounded-lg flex items-center justify-center text-zinc-300">
                <SlidersHorizontal size={15} strokeWidth={2} />
              </div>
              <h2 className="text-base font-semibold text-white tracking-tight">
                {isHost ? 'Host controls & settings' : 'Arena settings'}
              </h2>
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 p-5 rounded-2xl space-y-5">
              {/* Auction Format Picker */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">
                    Auction format
                  </label>
                  {!isHost && (
                    <span className="text-[10px] font-medium bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md">
                      Host managed
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {(['open', 'blind', 'draft', 'mega'] as const).map((type) => {
                    const isSelected = auctionType === type;
                    return (
                      <button
                        key={type}
                        disabled={!isHost}
                        onClick={() => {
                          if (!isHost) return;
                          setAuctionType(type);
                          socket?.emit('update-room-settings', { roomId: room.id, userId: user.uid, auctionType: type });
                        }}
                        className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors border ${
                          isSelected
                            ? 'bg-orange-500 text-zinc-950 border-orange-500 font-semibold'
                            : 'bg-zinc-800/80 text-zinc-400 border-transparent hover:text-zinc-200'
                        } ${isHost ? 'cursor-pointer hover:border-zinc-700' : 'cursor-not-allowed opacity-80'}`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
                {auctionType === 'mega' && (
                  <p className="text-[11px] text-orange-400/80 font-normal">
                    Retired players are excluded from the mega auction pool.
                  </p>
                )}
              </div>

              <div className="h-px bg-zinc-800" />

              {/* Purse & Timer Steppers */}
              {auctionType !== 'draft' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-zinc-400 block">Total team purse</span>
                      <span className="text-lg font-semibold font-mono tabular-nums text-white">₹{room.purse} Cr</span>
                    </div>
                    {isHost && (
                      <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                        <button
                          onClick={() => updateSettings(Math.max(80, room.purse - 5), room.bidTime, room.draftLimit || 15)}
                          className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white font-medium transition-colors cursor-pointer text-xs"
                          title="Decrease purse"
                        >
                          -
                        </button>
                        <button
                          onClick={() => updateSettings(Math.min(200, room.purse + 5), room.bidTime, room.draftLimit || 15)}
                          className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white font-medium transition-colors cursor-pointer text-xs"
                          title="Increase purse"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-zinc-400 block">Bid timer countdown</span>
                      <span className="text-lg font-semibold font-mono tabular-nums text-white">{room.bidTime}s</span>
                    </div>
                    {isHost && (
                      <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                        <button
                          onClick={() => updateSettings(room.purse, Math.max(5, room.bidTime - 1), room.draftLimit || 15)}
                          className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white font-medium transition-colors cursor-pointer text-xs"
                          title="Decrease timer"
                        >
                          -
                        </button>
                        <button
                          onClick={() => updateSettings(room.purse, Math.min(30, room.bidTime + 1), room.draftLimit || 15)}
                          className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white font-medium transition-colors cursor-pointer text-xs"
                          title="Increase timer"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-medium text-zinc-400 block">Draft limit</span>
                    <span className="text-lg font-semibold font-mono tabular-nums text-white">{room.draftLimit || 15} rounds</span>
                  </div>
                  {isHost && (
                    <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                      <button
                        onClick={() => updateSettings(room.purse, room.bidTime, Math.max(5, (room.draftLimit || 15) - 1))}
                        className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white font-medium transition-colors cursor-pointer text-xs"
                      >
                        -
                      </button>
                      <button
                        onClick={() => updateSettings(room.purse, room.bidTime, Math.min(20, (room.draftLimit || 15) + 1))}
                        className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white font-medium transition-colors cursor-pointer text-xs"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Start / Launch Action Panel */}
              <div className="pt-2 border-t border-zinc-800">
                {isHost ? (
                  <div className="space-y-2">
                    <button
                      onClick={startAuction}
                      disabled={!canStartAuction}
                      className="bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-950 font-medium py-3 px-6 rounded-xl transition-colors flex items-center gap-2.5 w-full justify-center text-sm cursor-pointer shadow-sm disabled:cursor-not-allowed"
                    >
                      <Play size={16} fill="currentColor" />
                      Start auction
                    </button>
                    {!canStartAuction && (
                      <p className="text-[11px] text-zinc-500 text-center font-normal">
                        {participants.length < 2
                          ? 'Requires at least 2 connected managers to start.'
                          : 'Waiting for all managers to confirm ready status.'}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="py-3 px-4 bg-zinc-950/70 border border-zinc-800 rounded-xl text-center space-y-1">
                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-zinc-300">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      <span>Waiting for host to launch auction</span>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      {participants.every(p => p.isReady)
                        ? 'All managers are ready!'
                        : 'Please ensure you have selected a team and confirmed ready.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

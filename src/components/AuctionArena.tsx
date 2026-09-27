import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  Gavel, Trophy, Users, Wallet, Plane, RefreshCw, ListOrdered, History,
  Clock, ArrowRight, ArrowLeft, Hash, MessageSquare, Send, X, Lock,
  User as UserIcon, Zap, Pause, Play, XCircle, Star, Shield,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import { AuctionRoom, Player } from '../types';
import { TEAMS } from '../data/teams';
import { PLAYERS } from '../data/players';
import { PRE_GENERATED_FACTS } from '../data/scoutingReports';
import { getFlagUrl } from '../utils/helpers';
import { useTTS } from '../hooks/useTTS';

interface PlayerCardImageProps {
  player: Player;
}

const PlayerCardImage: React.FC<PlayerCardImageProps> = ({ player }) => {
  const fallbackSrc = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(player.name)}`;
  const [imgSrc, setImgSrc] = useState<string>(player.image || fallbackSrc);

  // Synchronize when the player prop changes intentionally
  useEffect(() => {
    setImgSrc(player.image || fallbackSrc);
  }, [player.id, player.image, fallbackSrc]);

  return (
    <img
      src={imgSrc}
      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      alt={player.name}
      referrerPolicy="no-referrer"
      onError={() => {
        // Persist fallback into React state so timer-update ticks do not reset DOM src
        setImgSrc(fallbackSrc);
      }}
    />
  );
};

export const AuctionArena = ({ user, room, socket }: { user: FirebaseUser, room: AuctionRoom, socket: Socket | null }) => {
  const navigate = useNavigate();
  const { speak } = useTTS();

  // 1. Critical Guards at the very top
  if (!room || !room.players || !room.teams) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-400 font-medium text-xs font-display">Initializing arena...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = room.players[room.currentPlayerIndex];
  const myProfile = room.teams[user.uid];

  // In Draft Mode, currentPlayer might be undefined if the pool is empty, but we still want to show the arena
  if ((!currentPlayer && room.auctionType !== 'draft') || !myProfile) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-400 font-medium text-xs font-display">Syncing arena...</p>
        </div>
      </div>
    );
  }

  const [timer, setTimer] = useState(room.timer);
  const [chat, setChat] = useState<{ userName: string, message: string, timestamp: string }[]>([]);
  const [bidHistory, setBidHistory] = useState<{ teamName: string, amount: number, teamId?: string }[]>([]);
  const [soldOverlay, setSoldOverlay] = useState<{ player: Player, teamName: string, price: number, teamId: string } | null>(null);
  const [upcomingSetOverlay, setUpcomingSetOverlay] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const lastSetRef = useRef<string | null>(null);
  const [isBiddingWar, setIsBiddingWar] = useState(false);
  const lastBidTimeRef = useRef<number>(0);
  const [message, setMessage] = useState('');
  const [showSquads, setShowSquads] = useState(false);
  const [showFullMySquad, setShowFullMySquad] = useState(false);
  const [blindBidAmount, setBlindBidAmount] = useState<string>('');
  const [showBiddingLog, setShowBiddingLog] = useState(true);
  const [leftCollapsed, setLeftCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(`sidebar_left_collapsed_${room.id}`);
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [rightCollapsed, setRightCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(`sidebar_right_collapsed_${room.id}`);
      return saved === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(`sidebar_left_collapsed_${room.id}`, String(leftCollapsed));
    } catch (_) {}
  }, [leftCollapsed, room.id]);

  useEffect(() => {
    try {
      localStorage.setItem(`sidebar_right_collapsed_${room.id}`, String(rightCollapsed));
    } catch (_) {}
  }, [rightCollapsed, room.id]);

  useEffect(() => {
    if (room.auctionType === 'draft') return; // Draft mode phase transitions are handled separately
    if (currentPlayer) {
      const currentSet = currentPlayer.auctionSet || 'General Pool';
      if (lastSetRef.current !== currentSet) {
        lastSetRef.current = currentSet;
        setUpcomingSetOverlay(currentSet);

        // Play set transition sound
        const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-system-notification-1444.mp3');
        audio.volume = 0.3;
        audio.play().catch(() => {});
      }
    } else if (room.status === 'lobby' || room.status === 'finished') {
      lastSetRef.current = null;
    }
  }, [currentPlayer?.id, room.status, room.auctionType]);

  useEffect(() => {
    if (upcomingSetOverlay) {
      const timer = setTimeout(() => {
        setUpcomingSetOverlay(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [upcomingSetOverlay]);

  // Draft Mode: trigger phase transition overlay when draftPhase changes
  useEffect(() => {
    if (room.auctionType !== 'draft') return;
    if (room.status === 'lobby' || room.status === 'finished') {
      lastSetRef.current = null;
      return;
    }
    if (!room.draftPhase) return;
    if (lastSetRef.current !== room.draftPhase) {
      lastSetRef.current = room.draftPhase;
      setUpcomingSetOverlay(room.draftPhase);
      const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-system-notification-1444.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    }
  }, [room.draftPhase, room.auctionType, room.status]);

  // Auto-reset bidding war highlight after 3 seconds of calm
  useEffect(() => {
    if (!isBiddingWar) return;
    const warTimeout = setTimeout(() => {
      setIsBiddingWar(false);
    }, 3000);
    return () => clearTimeout(warTimeout);
  }, [isBiddingWar]);

  // Reset bidding war on player transition or status change
  useEffect(() => {
    setIsBiddingWar(false);
  }, [currentPlayer?.id, room.status]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef(room);
  roomRef.current = room;

  const currentBidder = room.currentBidderId ? room.teams[room.currentBidderId] : null;
  const currentBidderTeam = currentBidder ? TEAMS.find(t => t.id === currentBidder.teamId) : null;

  const upcomingPlayers = room.players.slice(room.currentPlayerIndex + 1, room.currentPlayerIndex + 6);

  // Authoritative completed-sale history for Recent Buys (derived strictly from room.history)
  const recentPurchases = useMemo(() => {
    if (!room.history || room.history.length === 0) return [];
    return [...room.history].reverse().slice(0, 10).map((h) => {
      const player = room.players.find(p => p.id === h.playerId) || PLAYERS.find(p => p.id === h.playerId);
      const buyerProfile = Object.values(room.teams).find(t => t.teamId === h.teamId);
      const team = TEAMS.find(t => t.id === h.teamId || t.shortName === h.teamId || t.id.toLowerCase() === h.teamId?.toLowerCase());
      const isRecord = player && player.basePrice ? h.price >= player.basePrice * 5 : false;

      return {
        id: `${h.playerId}-${h.timestamp}`,
        player,
        team,
        buyerProfile,
        price: h.price,
        isRecord
      };
    }).filter((item): item is { id: string; player: Player; team: any; buyerProfile: any; price: number; isRecord: boolean } => Boolean(item.player));
  }, [room.history, room.players, room.teams]);

  // Calculate overseas count for current user's team
  const myOverseasCount = useMemo(() => {
    if (!myProfile || !myProfile.squad) return 0;
    return (myProfile.squad as any[]).filter((p: any) => p.country !== 'India').length;
  }, [myProfile]);

  // Retrieve pre-generated scouting report for the current player
  const currentPlayerReport = useMemo(() => {
    if (!currentPlayer) return null;
    return PRE_GENERATED_FACTS[currentPlayer.id] || {
      facts: [
        `${currentPlayer.name} is a key ${currentPlayer.role} for any T20 squad.`,
        `Known for consistent performances in domestic and international T20 leagues.`,
        `A highly valuable strategic asset who can change the course of the match.`
      ],
      minPrice: currentPlayer.basePrice,
      maxPrice: currentPlayer.basePrice * 1.5
    };
  }, [currentPlayer]);

  useEffect(() => {
    if (!socket) return;

    setTimer(room.timer);
    setBidHistory([]); // Reset history on player change

    socket.on('timer-update', (val) => setTimer(val));
    socket.on('new-chat', (msg) => setChat(prev => [...prev, msg]));
    socket.on('bid-placed', ({ teamName, amount, userId }) => {
      const now = Date.now();
      if (now - lastBidTimeRef.current < 2000) {
        setIsBiddingWar(true);
      }
      lastBidTimeRef.current = now;

      const teamId = roomRef.current.teams[userId]?.teamId;
      setBidHistory(prev => [{ teamName, amount, teamId }, ...prev].slice(0, 10));
      playSfx('bid');
    });

    // Auto-reset bidding war on player change or status change
    if (room.status === 'transitioning') {
      setIsBiddingWar(false);
    }

    socket.on('blind-bid-received', ({ amount }) => {
      toast.success(`Secret bid of ₹${amount}Cr submitted!`);
    });

    socket.on('blind-reveal', ({ winnerId, amount, bids }) => {
      const winner = roomRef.current.teams[winnerId];
      toast.info(`Blind Auction Reveal: ${winner?.displayName || 'Someone'} wins with ₹${amount}Cr!`, {
        duration: 3000
      });
    });

    socket.on('player-sold', ({ player, teamName, price, userId, isRtm }) => {
      const teamId = roomRef.current.teams[userId]?.teamId || '';
      // Re-enable sold popups/overlays
      setSoldOverlay({ player, teamName, price, teamId });
      setTimeout(() => setSoldOverlay(null), 3500);

      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.5 },
        colors: ['#f97316', '#fbbf24', '#ffffff', '#3b82f6']
      });
      playSfx('sold');
    });

    socket.on('player-unsold', (player) => {
      // Disable unsold toast popups per user request
      // toast.error(`${player.name} UNSOLD!`, {
      //   duration: 3000,
      //   icon: <XCircle size={16} className="text-red-500" />
      // });
      playSfx('unsold');
    });

    return () => {
      socket.off('timer-update');
      socket.off('new-chat');
      socket.off('bid-placed');
      socket.off('player-sold');
      socket.off('player-unsold');
      socket.off('blind-bid-received');
      socket.off('blind-reveal');
    };
  }, [socket, room.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const playSfx = (type: 'bid' | 'sold' | 'unsold') => {
    const urls = {
      bid: 'https://assets.mixkit.co/sfx/preview/mixkit-positive-interface-click-1112.mp3',
      sold: 'https://assets.mixkit.co/sfx/preview/mixkit-winning-chime-2064.mp3',
      unsold: 'https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-fail-notification-946.mp3'
    };
    const audio = new Audio(urls[type]);
    audio.volume = 0.4;
    audio.play().catch(e => {
      if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
        console.warn("SFX Playback Issue:", e.message);
      }
    });
  };

  const placeBid = () => {
    if (room.isPaused) {
      toast.error("Auction is paused!");
      return;
    }
    if (room.auctionType === 'blind') {
      const amount = parseFloat(blindBidAmount);
      if (isNaN(amount) || amount < (currentPlayer?.basePrice || 0)) {
        toast.error(`Minimum bid is ₹${currentPlayer?.basePrice || 0}Cr`);
        return;
      }
      if (myProfile.budget < amount) {
        toast.error("Insufficient budget!");
        return;
      }
      socket?.emit('place-bid', { roomId: room.id, userId: user.uid, amount });
      setBlindBidAmount('');
    } else {
      const increment = (room.currentBid || 0) < 1 ? 0.05 : 0.25;
      const isFirstBid = !room.currentBidderId || room.currentBidderId === '';
      const nextBid = isFirstBid ? (currentPlayer?.basePrice || 0) : (room.currentBid || 0) + increment;

      if (myProfile.budget >= nextBid) {
        socket?.emit('place-bid', { roomId: room.id, userId: user.uid, amount: nextBid });
      } else {
        toast.error("Insufficient budget!");
      }
    }
  };

  const handleRtmDecision = (useRtm: boolean) => {
    socket?.emit('rtm-decision', { roomId: room.id, userId: user.uid, decision: useRtm ? 'match' : 'pass' });
  };

  const handlePickPlayer = (playerId: string) => {
    socket?.emit('pick-player', { roomId: room.id, userId: user.uid, playerId });
  };

  const isMyDraftTurn = room.auctionType === 'draft' && room.draftOrder && room.draftOrder[room.draftTurnIndex!] === user.uid;
  const currentTurnUserId = room.auctionType === 'draft' && room.draftOrder ? room.draftOrder[room.draftTurnIndex!] : null;
  const currentTurnTeam = currentTurnUserId ? room.teams[currentTurnUserId] : null;
  const currentTurnTeamInfo = currentTurnTeam ? TEAMS.find(t => t.id === currentTurnTeam.teamId) : null;

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    socket?.emit('chat-message', { roomId: room.id, userId: user.uid, message, userName: user.displayName });
    setMessage('');
  };

  const increment = (room.currentBid || 0) < 1 ? 0.05 : 0.25;
  const isFirstBid = !room.currentBidderId || room.currentBidderId === '';
  const nextBidAmount = isFirstBid ? (currentPlayer?.basePrice || 0) : (room.currentBid || 0) + increment;

  // Squad Balance Logic
  const squadStats = useMemo(() => {
    if (room.auctionType === 'draft') {
      return {
        TOP: myProfile.squad.filter(p => p.role === 'Top Order').length,
        MID: myProfile.squad.filter(p => p.role === 'Middle Order').length,
        WK: myProfile.squad.filter(p => p.role === 'Wicket-keeper').length,
        FIN: myProfile.squad.filter(p => p.role === 'Finisher').length,
        AR: myProfile.squad.filter(p => p.role === 'All-rounder').length,
        PACER: myProfile.squad.filter(p => p.role === 'Pacer').length,
        SPIN: myProfile.squad.filter(p => p.role === 'Spinner').length,
      };
    } else {
      return {
        BAT: myProfile.squad.filter(p => ['Top Order', 'Middle Order', 'Finisher'].includes(p.role)).length,
        WK: myProfile.squad.filter(p => p.role === 'Wicket-keeper').length,
        AR: myProfile.squad.filter(p => p.role === 'All-rounder').length,
        BOWL: myProfile.squad.filter(p => ['Pacer', 'Spinner'].includes(p.role)).length,
      };
    }
  }, [myProfile.squad, room.auctionType]);

  const isRoleNeeded = (role: string) => {
    if (room.auctionType === 'draft') {
      if (role === 'Top Order' && squadStats.TOP < 2) return true;
      if (role === 'Middle Order' && squadStats.MID < 2) return true;
      if (role === 'Wicket-keeper' && squadStats.WK < 1) return true;
      if (role === 'Finisher' && squadStats.FIN < 1) return true;
      if (role === 'All-rounder' && squadStats.AR < 2) return true;
      if (role === 'Pacer' && squadStats.PACER < 2) return true;
      if (role === 'Spinner' && squadStats.SPIN < 1) return true;
    } else {
      if (['Top Order', 'Middle Order', 'Finisher'].includes(role) && (squadStats as any).BAT < 5) return true;
      if (role === 'Wicket-keeper' && (squadStats as any).WK < 1) return true;
      if (role === 'All-rounder' && (squadStats as any).AR < 2) return true;
      if (['Pacer', 'Spinner'].includes(role) && (squadStats as any).BOWL < 3) return true;
    }
    return false;
  };

  const circleRadius = 26;
  const circleStrokeWidth = 3;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const timerMaxTime = Math.max(room.status === 'rtm' ? 10 : (room.auctionType === 'draft' ? 30 : (room.bidTime || 15)), timer);
  const timerProgress = timer / timerMaxTime;
  const timerStrokeDashoffset = circleCircumference - (timerProgress * circleCircumference);

  return (
    <div className={`h-screen h-[100dvh] flex flex-col bg-zinc-950 text-white overflow-hidden transition-all duration-500 ${timer < 5 && timer > 0 ? 'ring-4 ring-inset ring-red-500/20' : ''}`}>
      {/* Host Controls Overlay */}
      {room.hostId === user.uid && (
        <div className="fixed bottom-6 left-6 z-[150] flex flex-col gap-2.5">
          {room.status === 'finished' && (
            <>
              <button
                onClick={() => socket?.emit('start-accelerated', { roomId: room.id, userId: user.uid })}
                className="bg-orange-600 hover:bg-orange-500 text-white px-3.5 py-2 rounded-xl font-medium text-xs shadow-lg flex items-center gap-2 border border-orange-500/30 transition-colors"
              >
                <Zap size={14} /> Start accelerated round
              </button>
              <button
                onClick={() => socket?.emit('start-trade-window', { roomId: room.id, userId: user.uid })}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl font-medium text-xs shadow-lg flex items-center gap-2 border border-blue-500/30 transition-colors"
              >
                <RefreshCw size={14} /> Open trade window
              </button>
            </>
          )}
        </div>
      )}

      {/* RTM Decision Overlay */}
      <AnimatePresence>
        {room.status === 'rtm' && room.rtmPending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-md"
          >
            <div className="max-w-md w-full p-8 text-center space-y-6 bg-zinc-900/90 border border-zinc-800 rounded-2xl">
              <div className="space-y-3">
                <div className="inline-block px-3 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold uppercase tracking-wider rounded-full">
                  RTM Opportunity
                </div>
                <h2 className="text-2xl font-semibold font-display text-white">Right to Match?</h2>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {currentPlayer?.name} was previously with your team. Do you want to match the final bid of <span className="text-white font-semibold font-mono tabular-nums">₹{room.rtmPending.amount.toFixed(2)} Cr</span>?
                </p>
              </div>

              {room.rtmPending.eligibleUserId === user.uid ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleRtmDecision(false)}
                    className="py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold text-sm hover:bg-zinc-700 transition-colors"
                  >
                    Pass
                  </button>
                  <button
                    onClick={() => handleRtmDecision(true)}
                    disabled={myProfile.budget < room.rtmPending.amount}
                    className="py-3 rounded-xl bg-orange-500 text-black font-semibold text-sm hover:bg-orange-400 transition-colors disabled:opacity-50"
                  >
                    Use RTM Card
                  </button>
                </div>
              ) : (
                <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-800">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
                    <span className="text-sm font-medium text-zinc-200">
                      Waiting for {room.teams[room.rtmPending!.eligibleUserId] ?
                        TEAMS.find(t => t.id === room.teams[room.rtmPending!.eligibleUserId].teamId)?.shortName :
                        'Team'}...
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">They have the Right to Match</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* SOLD Overlay */}
      <AnimatePresence>
        {soldOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center space-y-6 max-w-lg w-full p-8"
            >
              <div className="relative inline-block">
                <img
                  src={soldOverlay.player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${soldOverlay.player.name}`}
                  className="w-44 h-44 rounded-full object-cover border-4 border-orange-500/80 shadow-2xl relative z-10 mx-auto"
                  alt={soldOverlay.player.name}
                />
              </div>
              <div className="space-y-3">
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="inline-block px-4 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider"
                >
                  Sold
                </motion.div>
                <motion.h1
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl sm:text-4xl font-bold font-display tracking-tight text-white"
                >
                  {soldOverlay.player.name}
                </motion.h1>
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col items-center gap-2 pt-2"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={TEAMS.find(t => t.id === soldOverlay.teamId)?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${soldOverlay.teamName}`}
                      className="w-10 h-10 object-contain"
                      alt={soldOverlay.teamName}
                    />
                    <span className="text-xl font-semibold font-display text-orange-400">{soldOverlay.teamName}</span>
                  </div>
                  <span className="text-4xl sm:text-5xl font-bold font-mono tabular-nums text-white">₹{soldOverlay.price.toFixed(2)} Cr</span>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upcoming Set Overlay */}
      <AnimatePresence>
        {upcomingSetOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: -10, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 140 }}
              className="text-center max-w-md px-6 space-y-5 relative bg-zinc-900/90 border border-zinc-800 p-8 rounded-2xl shadow-2xl"
            >
              <div className="space-y-3">
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-xs font-semibold uppercase tracking-wider text-orange-400"
                >
                  {room.auctionType === 'draft' ? 'Phase Starting Next' : 'Set Starting Next'}
                </motion.p>
                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-3xl sm:text-4xl font-semibold font-display tracking-tight text-white"
                >
                  {upcomingSetOverlay === 'Marquee' && 'Marquee Players'}
                  {upcomingSetOverlay === 'Batters' && 'Batters'}
                  {upcomingSetOverlay === 'Wicketkeepers' && 'Wicketkeepers'}
                  {upcomingSetOverlay === 'All-rounders' && 'All-rounders'}
                  {upcomingSetOverlay === 'Bowlers' && 'Bowlers'}
                  {upcomingSetOverlay === 'Accelerated' && 'Accelerated Round'}
                  {upcomingSetOverlay === 'Flexible' && 'Flexible Picks'}
                  {!['Marquee', 'Batters', 'Wicketkeepers', 'All-rounders', 'Bowlers', 'Accelerated', 'Flexible'].includes(upcomingSetOverlay) && upcomingSetOverlay}
                </motion.h1>
              </div>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-zinc-400 font-mono tabular-nums text-xs"
              >
                {
                  (() => {
                    if (room.auctionType === 'draft') {
                      const remaining = (room.players?.length || 0) + (room.draftPool?.length || 0);
                      return `${remaining} player${remaining !== 1 ? 's' : ''} remaining in draft`;
                    }
                    const totalInSet = room.players.filter(p => p.auctionSet === upcomingSetOverlay).length;
                    return `${totalInSet} player${totalInSet !== 1 ? 's' : ''} in this set`;
                  })()
                }
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Top Navigation Bar */}
      <div className="h-14 border-b border-white/5 bg-zinc-900/80 backdrop-blur-xl flex items-center justify-between px-6 shrink-0 z-[60]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-white transition-colors"
            title="Leave Arena"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-center justify-center text-orange-400">
              <Gavel size={16} />
            </div>
            <div>
              <h1 className="text-sm font-semibold font-display text-white leading-none">Auction Arena</h1>
              <div className="flex items-center gap-2 text-[10px] font-medium text-zinc-400 mt-1 font-mono">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Room {room.id}
              </div>
            </div>
          </div>
        </div>

        {/* Host Controls: Pause/Resume & Finish in Header */}
        {room.hostId === user.uid && room.status !== 'finished' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => socket?.emit(room.isPaused ? 'resume-auction' : 'pause-auction', { roomId: room.id, userId: user.uid })}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-2 transition-colors border ${
                room.isPaused
                  ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400'
                  : 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20 text-orange-400'
              }`}
            >
              {room.isPaused ? (
                <>
                  <Play size={13} className="fill-emerald-400" />
                  <span className="text-xs font-medium">Resume</span>
                </>
              ) : (
                <>
                  <Pause size={13} className="fill-orange-400" />
                  <span className="text-xs font-medium">Pause</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                if (confirmFinish) {
                  socket?.emit('finish-auction', { roomId: room.id, userId: user.uid });
                  setConfirmFinish(false);
                } else {
                  setConfirmFinish(true);
                  setTimeout(() => setConfirmFinish(false), 4000); // Reset after 4 seconds
                }
              }}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-2 transition-colors cursor-pointer border ${
                confirmFinish
                  ? 'bg-red-600 border-red-500 hover:bg-red-700 text-white shadow-lg animate-pulse'
                  : 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20 text-red-400'
              }`}
            >
              <XCircle size={13} className={confirmFinish ? 'text-white' : 'text-red-400'} />
              <span className="text-xs font-medium">
                {confirmFinish ? 'Click again to confirm' : 'Finish auction'}
              </span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setShowSquads(true)}
            className="px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-700/80 rounded-lg text-xs font-medium text-zinc-300 flex items-center gap-1.5 transition-colors border border-zinc-700/60"
          >
            <Users size={13} />
            All Squads
          </button>
          <div className="h-5 w-px bg-zinc-800 mx-0.5" />
          {room.auctionType !== 'draft' && (
            <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-800">
              <Wallet className="text-orange-400" size={13} />
              <span className="text-xs font-semibold font-mono tabular-nums text-zinc-200">₹{myProfile.budget.toFixed(2)} Cr</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-800">
            <Plane className="text-blue-400" size={13} />
            <span className="text-xs font-semibold font-mono tabular-nums text-zinc-200">OS: {myOverseasCount}/8</span>
          </div>
          {room.auctionType === 'mega' && (
            <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1.5 rounded-lg border border-zinc-800">
              <RefreshCw className="text-orange-400" size={13} />
              <span className="text-xs font-semibold font-mono tabular-nums text-zinc-200">RTM: {myProfile.rtmCards || 0}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Sidebar: Upcoming, Recent */}
        <motion.div
          className="hidden md:flex border-r border-white/5 bg-zinc-900/30 flex-col overflow-hidden shrink-0"
          initial={false}
          animate={{
            width: leftCollapsed ? 0 : '25%',
            opacity: leftCollapsed ? 0 : 1,
            borderRightWidth: leftCollapsed ? 0 : 1
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{ minWidth: leftCollapsed ? 0 : '240px', maxWidth: leftCollapsed ? 0 : '360px' }}
        >
          <div className="p-4 flex-1 overflow-y-auto space-y-6 custom-scrollbar">
            {/* Upcoming Players */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ListOrdered size={15} className="text-orange-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-display">Upcoming</h3>
              </div>
              <div className="space-y-2">
                {upcomingPlayers.length > 0 ? upcomingPlayers.map((p, idx) => (
                  <div key={p.id} className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800/80 flex items-center gap-3 group hover:border-zinc-700/80 transition-colors">
                    <img
                      src={p.image || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`}
                      className="w-9 h-9 rounded-lg object-cover bg-zinc-800"
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block text-xs font-medium text-zinc-200 truncate">{p.name}</span>
                      <span className="text-[11px] text-zinc-400 font-mono tabular-nums">{p.role} ”¢ ₹{p.basePrice} Cr</span>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 text-center border border-dashed border-zinc-800 rounded-xl">
                    <span className="text-xs text-zinc-500 font-medium">No more players</span>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Buys */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <History size={15} className="text-orange-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-display">Recent Buys</h3>
              </div>
              <div className="space-y-2">
                {recentPurchases.length > 0 ? recentPurchases.map((item) => {
                  const p = item.player;
                  const team = item.team;

                  return (
                    <div key={item.id} className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800/80 flex items-center justify-between gap-3 group hover:border-zinc-700/80 transition-colors relative overflow-hidden">
                      {item.isRecord && (
                        <div className="absolute -right-7 top-2 bg-orange-500 text-[8px] font-semibold text-black px-7 py-0.5 rotate-45 uppercase tracking-wider shadow">Record</div>
                      )}

                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={p.image || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`}
                          className="w-9 h-9 rounded-lg object-cover bg-zinc-800 shrink-0"
                          alt={p.name}
                          referrerPolicy="no-referrer"
                          onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`)}
                        />
                        <span className="text-xs font-medium text-zinc-200 truncate">{p.name}</span>
                      </div>

                      <div className="flex flex-col items-center justify-center min-w-[65px] relative">
                        <span className="text-xs font-semibold font-mono tabular-nums text-orange-400 mb-0.5 whitespace-nowrap">
                          {room.auctionType === 'draft' ? 'Drafted' : `₹${item.price?.toFixed(2)} Cr`}
                        </span>
                        <div className="flex items-center w-full">
                          <div className="h-px flex-1 bg-zinc-700" />
                          <ArrowRight className="w-3 h-3 text-zinc-500 -ml-1" />
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-center gap-1 min-w-[40px]">
                        {team ? (
                          <img
                            src={team.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`}
                            className="w-8 h-8 object-contain"
                            alt={team.name}
                            referrerPolicy="no-referrer"
                            onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`)}
                          />
                        ) : (
                          <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center border border-zinc-700">
                            <span className="text-[10px] font-semibold text-zinc-400 uppercase">{item.buyerProfile?.teamId?.slice(0, 2) || 'TM'}</span>
                          </div>
                        )}
                        <span className="text-[10px] font-medium text-zinc-400 uppercase">{team?.shortName || item.buyerProfile?.displayName?.slice(0, 4) || 'Sold'}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="p-4 text-center border border-dashed border-zinc-800 rounded-xl">
                    <span className="text-xs text-zinc-500 font-medium">No sales yet</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Center: Bidding Arena */}
        <div className={`flex-1 w-full bg-gradient-to-b from-zinc-900/40 to-zinc-950 relative flex flex-col items-center justify-center pt-8 p-4 overflow-y-auto lg:overflow-hidden custom-scrollbar transition-colors duration-300 ${timer < 5 && timer > 0 ? 'bg-red-950/20' : ''}`}>
          {/* Left/Right Sidebar Collapse Toggles */}
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-6 h-12 bg-zinc-900/90 hover:bg-zinc-800 hover:text-white border border-zinc-700/80 rounded-lg items-center justify-center text-zinc-400 transition-colors z-[50] group backdrop-blur-md cursor-pointer"
            title={leftCollapsed ? "Expand Left Sidebar" : "Collapse Left Sidebar"}
          >
            {leftCollapsed ? <ChevronRight size={14} className="group-hover:scale-110 transition-transform" /> : <ChevronLeft size={14} className="group-hover:scale-110 transition-transform" />}
          </button>

          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-6 h-12 bg-zinc-900/90 hover:bg-zinc-800 hover:text-white border border-zinc-700/80 rounded-lg items-center justify-center text-zinc-400 transition-colors z-[50] group backdrop-blur-md cursor-pointer"
            title={rightCollapsed ? "Expand Right Sidebar" : "Collapse Right Sidebar"}
          >
            {rightCollapsed ? <ChevronLeft size={14} className="group-hover:scale-110 transition-transform" /> : <ChevronRight size={14} className="group-hover:scale-110 transition-transform" />}
          </button>
          {timer < 5 && timer > 0 && (
            <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />
          )}

          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] blur-[120px] rounded-full transition-colors duration-500 ${timer < 5 && timer > 0 ? 'bg-red-500/5' : 'bg-orange-500/5'}`} />
          </div>

          {/* Timer Overlay */}
          {room.auctionType !== 'draft' && (
            <div className="absolute top-4 flex flex-col items-center z-[40]">
              <div className={`relative w-16 h-16 flex items-center justify-center mb-1 transition-all duration-300 ${timer < 5 && !room.isPaused ? 'scale-105' : ''}`}>
                {/* SVG Progress Ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 60 60">
                  {/* Background Circle */}
                  <circle
                    cx="30"
                    cy="30"
                    r={circleRadius}
                    className="fill-zinc-950/80 stroke-zinc-800"
                    strokeWidth={circleStrokeWidth}
                  />
                  {/* Active Progress Circle */}
                  <motion.circle
                    cx="30"
                    cy="30"
                    r={circleRadius}
                    className={`fill-none transition-all duration-1000 ease-linear ${
                      timer < 5 && !room.isPaused
                        ? 'stroke-red-500'
                        : 'stroke-orange-500'
                    }`}
                    strokeWidth={circleStrokeWidth}
                    strokeDasharray={circleCircumference}
                    animate={{ strokeDashoffset: timerStrokeDashoffset }}
                    transition={{ duration: room.isPaused ? 0 : 1, ease: "linear" }}
                    strokeLinecap="round"
                  />
                </svg>

                {/* Timer Text */}
                <span className={`relative z-10 text-lg font-bold font-mono tabular-nums transition-colors duration-300 ${timer < 5 && !room.isPaused ? 'text-red-400 animate-pulse' : 'text-zinc-100'}`}>
                  {room.isPaused ? '||' : `${timer}s`}
                </span>
              </div>
              {room.isPaused && (
                <span className="text-[9px] font-medium text-amber-400 uppercase tracking-wider">Auction Paused</span>
              )}
              {timer < 5 && timer > 0 && !room.isPaused && (
                <span className="text-[9px] font-semibold text-red-400 uppercase tracking-wider animate-pulse">Final Call!</span>
              )}
            </div>
          )}

          <div className="w-full max-w-[1400px] mx-auto relative z-10 transition-all duration-300">
            {room.auctionType === 'draft' ? (
              <div className="space-y-6">
                <div className="text-center space-y-3">
                  <div className="flex flex-col items-center gap-2">
                    <h2 className="text-2xl font-semibold font-display text-white">Draft Pool</h2>
                    <div className="flex items-center gap-3">
                      <div className={`px-3 py-1 rounded-full border flex items-center gap-1.5 transition-colors ${timer < 10 ? 'border-red-500/60 bg-red-500/10 text-red-400' : 'border-zinc-700 bg-zinc-800 text-zinc-200'}`}>
                        <Clock size={13} className={timer < 10 ? 'text-red-400' : 'text-zinc-400'} />
                        <span className="text-sm font-semibold font-mono tabular-nums">{room.isPaused ? '||' : `${timer}s`}</span>
                      </div>
                      <div className="flex flex-col items-start">
                        <p className="text-zinc-300 text-xs font-medium">
                          {isMyDraftTurn
                            ? 'It is your turn to pick'
                            : `Waiting for ${room.teams[currentTurnUserId!]?.displayName || 'Team'} to pick`}
                        </p>
                        {room.draftPhase && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                              Phase: <span className="text-zinc-200 font-semibold">{room.draftPhase}</span>
                            </span>
                            <span className="text-[10px] text-zinc-600 mx-1">|</span>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                              Round: <span className="text-zinc-200 font-mono tabular-nums">{room.draftRound} / {room.draftLimit || 15}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Draft Progress Bar */}
                  <div className="max-w-md mx-auto w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: "100%" }}
                      animate={{ width: `${(timer / 30) * 100}%` }}
                      transition={{ duration: 1, ease: "linear" }}
                      className={`h-full transition-colors duration-500 ${timer < 10 ? 'bg-red-500' : 'bg-orange-500'}`}
                    />
                  </div>

                  {/* Draft Order Track */}
                  <div className="max-w-2xl mx-auto flex items-center justify-center gap-2 overflow-x-auto py-2 custom-scrollbar no-scrollbar">
                    {room.draftOrder?.map((uid, idx) => {
                      const team = room.teams[uid];
                      const teamData = TEAMS.find(t => t.id === team?.teamId);
                      const isCurrent = room.draftTurnIndex === idx;

                      return (
                        <div key={uid} className="flex items-center gap-2">
                          <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${isCurrent ? 'scale-105' : 'opacity-40 grayscale'}`}>
                            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center bg-zinc-900 overflow-hidden ${isCurrent ? 'border-orange-500 shadow-md' : 'border-zinc-800'}`}>
                              <img
                                src={teamData?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`}
                                className="w-6 h-6 object-contain"
                                alt={teamData?.shortName}
                                onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`)}
                              />
                            </div>
                            <span className={`text-[9px] font-semibold uppercase ${isCurrent ? 'text-orange-400' : 'text-zinc-500'}`}>
                              {teamData?.shortName}
                            </span>
                          </div>
                          {idx < room.draftOrder!.length - 1 && (
                            <div className="w-3 h-px bg-zinc-800" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Direction Indicator */}
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <div className={`flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider transition-colors ${room.draftDirection === 'forward' ? 'text-orange-400' : 'text-zinc-600'}`}>
                      <span>Forward</span>
                      <ArrowRight size={10} className={room.draftDirection === 'forward' ? 'animate-pulse' : ''} />
                    </div>
                    <div className="w-6 h-px bg-zinc-800" />
                    <div className={`flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider transition-colors ${room.draftDirection === 'backward' ? 'text-orange-400' : 'text-zinc-600'}`}>
                      <ArrowLeft size={10} className={room.draftDirection === 'backward' ? 'animate-pulse' : ''} />
                      <span>Snake Back</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 px-4">
                  {room.draftPool?.map((player) => (
                    <motion.div
                      key={player.id}
                      layoutId={player.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ y: -3 }}
                      className={`relative bg-zinc-900/80 backdrop-blur-md border rounded-2xl overflow-hidden transition-all duration-200 ${
                        isMyDraftTurn ? 'border-orange-500/40 shadow-lg shadow-orange-500/10' : 'border-zinc-800'
                      }`}
                    >
                      <div className="relative aspect-[4/5]">
                        <img
                          src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`}
                          className="w-full h-full object-cover"
                          alt={player.name}
                          referrerPolicy="no-referrer"
                          onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent" />

                        <div className="absolute top-3 left-3">
                          <span className="px-2 py-0.5 bg-orange-500 text-black text-[9px] font-semibold uppercase tracking-wider rounded">
                            {player.role}
                          </span>
                        </div>

                        <div className="absolute bottom-3 left-3 right-3">
                          <h3 className="text-sm font-semibold font-display text-white truncate">{player.name}</h3>
                          <div className="flex items-center gap-2 text-zinc-400 text-xs mt-0.5">
                            <span>{player.country}</span>
                            {room.auctionType !== 'draft' && (
                              <>
                                <span>”¢</span>
                                <span className="font-mono tabular-nums">₹{player.basePrice} Cr</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-zinc-950/70 border-t border-zinc-800">
                        <button
                          onClick={() => handlePickPlayer(player.id)}
                          disabled={!isMyDraftTurn || timer === 0}
                          className={`w-full py-2 rounded-xl font-semibold text-xs transition-colors ${
                            isMyDraftTurn
                              ? 'bg-orange-500 hover:bg-orange-400 text-black shadow-md cursor-pointer'
                              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                          }`}
                        >
                          {isMyDraftTurn ? 'Draft Player' : 'Waiting...'}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col lg:flex-row items-start justify-center gap-8 w-full max-w-[1200px] mx-auto">
                {/* Left Column: Player Card & Name */}
                <div className="flex-1 w-full max-w-[340px] md:max-w-[360px] lg:max-w-[380px] space-y-4 shrink-0 transition-all duration-300">

                  <div className="relative group">
                    {currentPlayer.auctionSet === 'Marquee' && (
                      <div className="absolute -inset-1 rounded-3xl bg-amber-500/20 blur-xl opacity-60 pointer-events-none" />
                    )}

                    <motion.div
                      key={currentPlayer.id}
                      initial={{ opacity: 0, scale: 0.95, x: -10 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        x: 0,
                        borderColor: isBiddingWar
                          ? "rgba(249,115,22,0.8)"
                          : (currentPlayer.auctionSet === 'Marquee' ? "rgba(245,158,11,0.5)" : "rgba(39,39,42,1)")
                      }}
                      transition={{ duration: 0.3 }}
                      className={`relative w-full h-[280px] rounded-2xl overflow-hidden shadow-xl border transition-all duration-300 ${currentPlayer.auctionSet === 'Marquee' ? 'border-amber-500/50 shadow-amber-500/10' : 'border-zinc-800'}`}
                    >
                      {isBiddingWar && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute -inset-2 bg-orange-500/10 blur-xl -z-10 rounded-full animate-pulse pointer-events-none"
                        />
                      )}
                      <PlayerCardImage player={currentPlayer} />

                      <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                        <div className="flex flex-col gap-1.5">
                          <span className="px-2.5 py-1 bg-orange-500 text-black text-xs font-semibold uppercase tracking-wider rounded-md shadow">
                            {currentPlayer.role}
                          </span>
                          {currentPlayer.auctionSet === 'Marquee' && (
                            <span className="px-2.5 py-1 bg-amber-500 text-black text-xs font-semibold uppercase tracking-wider rounded-md shadow">
                              Marquee
                            </span>
                          )}
                        </div>
                        <div className="w-10 h-7 rounded-md overflow-hidden border border-zinc-700/80 shadow bg-zinc-900 flex items-center justify-center">
                          {currentPlayer.country === 'West Indies' ? (
                            <div className="w-full h-full bg-[#7B0041] flex items-center justify-center text-[10px] font-semibold text-white">WI</div>
                          ) : (
                            <img
                              src={getFlagUrl(currentPlayer.country)}
                              className="w-full h-full object-cover"
                              alt={currentPlayer.country}
                              referrerPolicy="no-referrer"
                            />
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </div>

                  {/* Player Name & Info Below Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-1.5 px-2"
                  >
                    <h2 className="text-2xl sm:text-3xl font-bold font-display text-white tracking-tight leading-tight">{currentPlayer.name}</h2>
                    <div className="flex items-center justify-center gap-2 text-zinc-400">
                      <div className="flex items-center gap-1.5 bg-zinc-900/80 px-3 py-1 rounded-full border border-zinc-800">
                        <Hash size={13} className="text-orange-400" />
                        <span className="font-mono tabular-nums text-xs font-medium text-zinc-300">Base Price: ₹{currentPlayer.basePrice} Cr</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Scouting Report Below Player Card & Name */}
                  {currentPlayerReport && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 shadow-lg space-y-3"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
                          <div className="w-5 h-5 rounded bg-orange-500/10 flex items-center justify-center">
                            <Shield size={12} className="text-orange-400" />
                          </div>
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-display">Scouting Report</h3>
                        </div>

                        <div className="space-y-2">
                          {currentPlayerReport.facts.map((fact, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300 leading-relaxed">
                              <span className="text-orange-400 select-none">”¢</span>
                              <p className="font-normal text-xs">{fact}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-zinc-800/80 pt-2.5">
                        <div className="flex items-center justify-between bg-zinc-950/60 px-3.5 py-2 rounded-xl border border-zinc-800/80">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Expected Range</span>
                            <span className="text-xs font-semibold font-mono tabular-nums text-zinc-200">₹{currentPlayerReport.minPrice.toFixed(1)} - ₹{currentPlayerReport.maxPrice.toFixed(1)} Cr</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Base Price</span>
                            <span className="text-xs font-semibold font-mono tabular-nums text-orange-400">₹{currentPlayer.basePrice.toFixed(1)} Cr</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Right Column: Stats & Bidding */}
                <motion.div
                  initial={{ opacity: 0, x: 15 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex-1 w-full max-w-[340px] md:max-w-[420px] lg:max-w-[480px] xl:max-w-[540px] space-y-4 transition-all duration-300"
                >
                  {/* Category Banner / Auction Set Indicator */}
                  {currentPlayer && (
                    <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1 shadow-lg">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">Current Category</span>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-base font-semibold font-display text-white">
                          {currentPlayer.auctionSet === 'Marquee' && 'Marquee Players'}
                          {currentPlayer.auctionSet === 'Batters' && 'Batters'}
                          {currentPlayer.auctionSet === 'Wicketkeepers' && 'Wicketkeepers'}
                          {currentPlayer.auctionSet === 'All-rounders' && 'All-rounders'}
                          {currentPlayer.auctionSet === 'Bowlers' && 'Bowlers'}
                          {currentPlayer.auctionSet === 'Accelerated' && 'Accelerated Auction'}
                          {!currentPlayer.auctionSet && 'General Pool'}
                        </span>
                        <div className="text-xs font-medium font-mono tabular-nums text-orange-400 bg-orange-500/10 px-2.5 py-1 rounded-full border border-orange-500/20 whitespace-nowrap">
                          Player {
                            (() => {
                              const setPlayers = room.players.filter(p => p.auctionSet === currentPlayer.auctionSet);
                              const idx = setPlayers.findIndex(p => p.id === currentPlayer.id) + 1;
                              return `${idx} / ${setPlayers.length}`;
                            })()
                          }
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-start gap-y-4 shadow-xl relative overflow-hidden">
                    {room.status === 'transitioning' && !room.currentBidderId && (
                      <div className="w-full bg-zinc-800/90 py-2 px-4 flex items-center justify-between -mx-5 -mt-5 mb-1 border-b border-zinc-700/50">
                        <div className="flex items-center gap-2">
                          <XCircle size={14} className="text-red-400" />
                          <span className="text-zinc-200 font-semibold text-xs uppercase tracking-wider">
                            Player Unsold ”” Next Lot Coming Up
                          </span>
                        </div>
                      </div>
                    )}
                    {room.status === 'selling' && (
                      <div className="w-full bg-red-600/90 py-2 px-4 flex items-center justify-between -mx-5 -mt-5 mb-1 border-b border-red-500/30">
                        <div className="flex items-center gap-2">
                          <Zap size={14} className="text-white animate-pulse" />
                          <span className="text-white font-semibold text-xs uppercase tracking-wider">
                            {timer === 2 ? "Going Once!" : timer === 1 ? "Going Twice!" : "Final Warning!"}
                          </span>
                        </div>
                        <div className="flex-1 max-w-[100px] ml-4 bg-white/20 h-1.5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: "100%" }}
                            animate={{ width: "0%" }}
                            transition={{ duration: 2, ease: "linear" }}
                            className="h-full bg-white"
                          />
                        </div>
                      </div>
                    )}

                    {room.status === 'rtm' && (
                      <div className="w-full bg-blue-600/90 py-2 px-4 flex items-center justify-between -mx-5 -mt-5 mb-1 border-b border-blue-500/30">
                        <div className="flex items-center gap-2">
                          <RefreshCw size={14} className="text-white animate-spin" />
                          <span className="text-white font-semibold text-xs uppercase tracking-wider">
                            {room.rtmPending?.eligibleUserId === user.uid
                              ? "Your RTM Decision"
                              : `${room.teams[room.rtmPending?.eligibleUserId!]?.displayName} RTM?`}
                          </span>
                        </div>
                        <div className="flex-1 max-w-[100px] ml-4 bg-white/20 h-1.5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: "100%" }}
                            animate={{ width: "0%" }}
                            transition={{ duration: 10, ease: "linear" }}
                            className="h-full bg-white"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2.5">
                        <div className="w-6 h-6 rounded bg-orange-500/10 flex items-center justify-center">
                          <Star size={14} className="text-orange-400" />
                        </div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-display">Career Statistics</h3>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                          <span className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-0.5">Matches</span>
                          <span className="text-sm font-semibold font-mono tabular-nums text-zinc-100">{currentPlayer.stats?.matches || '-'}</span>
                        </div>
                        <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                          <span className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-0.5">
                            {['Pacer', 'Spinner'].includes(currentPlayer.role) ? 'Wickets' : 'Runs'}
                          </span>
                          <span className="text-sm font-semibold font-mono tabular-nums text-zinc-100">
                            {['Pacer', 'Spinner'].includes(currentPlayer.role) ? currentPlayer.stats?.wickets : currentPlayer.stats?.runs || '-'}
                          </span>
                        </div>
                        <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                          <span className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-0.5">Strike Rate</span>
                          <span className="text-sm font-semibold font-mono tabular-nums text-zinc-100">{currentPlayer.stats?.strikeRate || '-'}</span>
                        </div>
                        <div className="p-2.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                          <span className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-0.5">
                            {['Pacer', 'Spinner'].includes(currentPlayer.role) ? 'Economy' : 'Average'}
                          </span>
                          <span className="text-sm font-semibold font-mono tabular-nums text-zinc-100">
                            {['Pacer', 'Spinner'].includes(currentPlayer.role) ? currentPlayer.stats?.economy : currentPlayer.stats?.average || '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-col items-center p-3 bg-gradient-to-b from-orange-500/10 to-transparent rounded-2xl border border-orange-500/20">
                        <span className="text-[10px] font-medium text-orange-400 uppercase tracking-wider mb-1">Current Bid</span>
                        <motion.div
                          key={room.currentBid || 0}
                          initial={{ y: 5, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="flex items-baseline gap-1"
                        >
                          <span className="text-3xl font-bold font-mono tabular-nums text-white tracking-tight">₹{(room.currentBid || 0).toFixed(2)}</span>
                          <span className="text-sm font-semibold font-mono text-zinc-400">Cr</span>
                        </motion.div>
                      </div>

                      <div className="space-y-2">
                        {room.status === 'rtm' && room.rtmPending?.eligibleUserId === user.uid ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => socket?.emit('rtm-decision', { roomId: room.id, userId: user.uid, decision: 'match' })}
                              className="py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl transition-colors"
                            >
                              Match Bid
                            </button>
                            <button
                              onClick={() => socket?.emit('rtm-decision', { roomId: room.id, userId: user.uid, decision: 'pass' })}
                              className="py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs rounded-xl transition-colors border border-zinc-700"
                            >
                              Pass
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="px-1 space-y-3">
                    {room.auctionType === 'blind' ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type="number"
                            step="0.05"
                            value={blindBidAmount}
                            onChange={(e) => setBlindBidAmount(e.target.value)}
                            placeholder={`Min bid ₹${currentPlayer?.basePrice || 0}Cr`}
                            className="w-full h-12 bg-zinc-950 border border-zinc-800 rounded-xl px-4 font-mono tabular-nums text-sm text-white focus:outline-none focus:border-orange-500 transition-colors placeholder:text-zinc-600"
                          />
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-500">Cr</div>
                        </div>
                        <button
                          onClick={placeBid}
                          disabled={room.isPaused || (timer === 0 && room.status !== 'selling' && room.status !== 'active')}
                          className="w-full h-12 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                          <Lock size={15} />
                          Submit Secret Bid
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={placeBid}
                        disabled={room.isPaused || room.currentBidderId === user.uid || (timer === 0 && room.status !== 'selling' && room.status !== 'active')}
                        className={`w-full h-14 rounded-2xl font-semibold font-display text-base transition-colors flex items-center justify-center gap-2.5 cursor-pointer ${
                          room.currentBidderId === user.uid || room.isPaused
                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/60'
                            : 'bg-white hover:bg-zinc-200 text-black shadow-lg shadow-white/5 active:scale-[0.99]'
                        }`}
                      >
                        <Gavel size={18} />
                        {room.isPaused ? 'Auction Paused' : room.currentBidderId === user.uid ? 'Leading Bid' : `Bid ₹${nextBidAmount.toFixed(2)} Cr`}
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Teams & Chat */}
        <motion.div
          className="hidden md:flex border-l border-white/5 bg-zinc-900/30 flex-col overflow-hidden shrink-0"
          initial={false}
          animate={{
            width: rightCollapsed ? 0 : '25%',
            opacity: rightCollapsed ? 0 : 1,
            borderLeftWidth: rightCollapsed ? 0 : 1
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          style={{ minWidth: rightCollapsed ? 0 : '240px', maxWidth: rightCollapsed ? 0 : '360px' }}
        >
          {/* Teams Overview */}
          <div className="p-4 border-b border-zinc-800/80 max-h-[35%] overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={15} className="text-orange-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-display">Franchise Status</h3>
            </div>
            <div className="space-y-2">
              {Object.values(room.teams).map(t => {
                const teamData = TEAMS.find(team => team.id === t.teamId);
                return (
                  <div key={t.uid} className="p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800/80 flex items-center justify-between group hover:border-zinc-700/80 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <img src={teamData?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`} className="w-8 h-8 object-contain" alt={teamData?.name} referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`)} />
                      <div>
                        <span className="block text-xs font-medium text-zinc-200">{teamData?.shortName}</span>
                        <span className="text-[11px] font-mono tabular-nums text-zinc-400">{t.squad.length}/25 Players</span>
                      </div>
                    </div>
                    {room.auctionType !== 'draft' && (
                      <div className="text-right flex flex-col items-end">
                        <span className="block text-xs font-semibold font-mono tabular-nums text-zinc-200">₹{t.budget.toFixed(1)} Cr</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-zinc-500 uppercase">Budget</span>
                          {room.auctionType === 'mega' && t.rtmCards > 0 && (
                            <div className="flex gap-0.5">
                              {[...Array(t.rtmCards)].map((_, i) => (
                                <div key={i} className="w-1.5 h-1.5 bg-orange-400 rounded-full" />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* My Squad Summary & Balance */}
          <div className="p-4 border-b border-zinc-800/80 max-h-[40%] overflow-y-auto custom-scrollbar bg-zinc-950/40">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <UserIcon size={15} className="text-blue-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-display">My Squad</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFullMySquad(!showFullMySquad)}
                  className="text-[10px] font-medium text-zinc-400 hover:text-zinc-200 uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {showFullMySquad ? 'Hide' : 'Full'}
                </button>
                <span className="text-xs font-semibold font-mono tabular-nums text-orange-400">{myProfile.squad.length}/25</span>
              </div>
            </div>

            {/* Role Balance Grid */}
            <div className={`grid ${Object.keys(squadStats).length > 4 ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'} gap-1.5 mb-3`}>
              {Object.entries(squadStats).map(([role, count]) => (
                <div key={role} className="p-2 bg-zinc-900/60 rounded-xl border border-zinc-800/80 text-center">
                  <div className="text-[9px] font-medium text-zinc-400 uppercase mb-0.5">{role}</div>
                  <div className="text-xs font-semibold font-mono tabular-nums text-zinc-200">{count}</div>
                </div>
              ))}
            </div>

            {showFullMySquad && (
              <div className="space-y-1.5">
                {myProfile.squad.length > 0 ? (myProfile.squad as any[]).slice().reverse().map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-xs p-2 bg-zinc-900/60 rounded-lg border border-zinc-800/80">
                    <span className="truncate max-w-[120px] font-medium text-zinc-300">{p.name}</span>
                    {room.auctionType !== 'draft' ? (
                      <span className="font-semibold font-mono tabular-nums text-orange-400">₹{p.soldPrice?.toFixed(2)} Cr</span>
                    ) : (
                      <span className="text-[10px] font-medium text-zinc-400 uppercase">Drafted</span>
                    )}
                  </div>
                )) : (
                  <div className="text-center py-4 border border-dashed border-zinc-800 rounded-xl">
                    <span className="text-xs text-zinc-500 font-medium">No signings yet</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat & Bidding War */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/60">
              <div className="flex items-center gap-2">
                {showBiddingLog ? (
                  <Gavel size={15} className="text-orange-400" />
                ) : (
                  <MessageSquare size={15} className="text-orange-400" />
                )}
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 font-display">
                  {showBiddingLog ? 'Bidding Log' : 'Live Comms'}
                </h3>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setShowBiddingLog(!showBiddingLog)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-medium uppercase tracking-wider transition-colors border cursor-pointer ${
                    showBiddingLog
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {showBiddingLog ? 'Show chat' : 'Show log'}
                </button>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-medium text-zinc-400 uppercase">Live</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              {showBiddingLog ? (
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar bg-zinc-950/30">
                  {bidHistory.length > 0 ? (
                    <AnimatePresence initial={false}>
                      {bidHistory.map((bid, i) => (
                        <motion.div
                          key={`${bid.teamName}-${bid.amount}-${i}`}
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex items-center justify-between p-2 rounded-xl border ${i === 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-zinc-900/40 border-zinc-800/60 opacity-70'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img src={TEAMS.find(t => t.id === bid.teamId)?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${bid.teamName}`} className="w-5 h-5 object-contain" alt="" />
                            <span className="text-xs font-medium text-zinc-200 truncate">{bid.teamName}</span>
                          </div>
                          <span className="text-xs font-semibold font-mono tabular-nums text-orange-400">₹{bid.amount.toFixed(2)} Cr</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-30">
                      <Gavel size={32} className="mb-2" />
                      <p className="text-xs text-zinc-400 font-medium">No bids placed yet</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                    {chat.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.userName === user.displayName ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] font-medium text-zinc-400 mb-0.5">{msg.userName}</span>
                        <div className={`px-3 py-1.5 rounded-xl text-xs max-w-[90%] ${msg.userName === user.displayName ? 'bg-orange-500 text-black font-medium' : 'bg-zinc-800 text-zinc-200 border border-zinc-700'}`}>
                          {msg.message}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={sendMessage} className="p-3 bg-zinc-950/80 border-t border-zinc-800 flex gap-2">
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-orange-500 transition-colors"
                    />
                    <button className="p-2 bg-orange-500 text-black rounded-xl hover:bg-orange-400 transition-colors cursor-pointer">
                      <Send size={15} />
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* All Squads Modal */}
      <AnimatePresence>
        {showSquads && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md p-6 sm:p-8 overflow-y-auto"
          >
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-xl flex items-center justify-center">
                    <Users size={20} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold font-display text-white">Squad Overview</h2>
                    <p className="text-zinc-400 text-xs mt-0.5">Real-time team compositions and budgets</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSquads(false)}
                  className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-300 hover:text-white transition-colors border border-zinc-700 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {Object.values(room.teams).map(t => {
                  const teamData = TEAMS.find(team => team.id === t.teamId);
                  return (
                    <div key={t.uid} className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-col">
                      <div className="flex items-center gap-3.5 mb-4 pb-3 border-b border-zinc-800">
                        <img src={teamData?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`} className="w-12 h-12 object-contain" alt={teamData?.name} referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`)} />
                        <div>
                          <h3 className="text-base font-semibold font-display text-white">{teamData?.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            {room.auctionType !== 'draft' && (
                              <span className="text-xs font-semibold font-mono tabular-nums text-orange-400">₹{t.budget.toFixed(2)} Cr</span>
                            )}
                            <span className="text-xs text-zinc-400 font-mono tabular-nums">{t.squad.length}/25 Players</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                        {t.squad.length > 0 ? t.squad.map(player => (
                          <div key={player.id} className="flex items-center justify-between p-2 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`}
                                className="w-7 h-7 rounded-lg object-cover bg-zinc-800"
                                alt={player.name}
                                referrerPolicy="no-referrer"
                                onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`)}
                              />
                              <div>
                                <span className="block text-xs font-medium text-zinc-200">{player.name}</span>
                                <span className="text-[10px] text-zinc-400">{player.role}</span>
                              </div>
                            </div>
                            {room.auctionType !== 'draft' ? (
                              <span className="text-xs font-semibold font-mono tabular-nums text-orange-400">₹{player.soldPrice?.toFixed(2)} Cr</span>
                            ) : (
                              <span className="text-[10px] font-medium text-zinc-400 uppercase">Drafted</span>
                            )}
                          </div>
                        )) : (
                          <div className="h-24 flex items-center justify-center border border-dashed border-zinc-800 rounded-xl">
                            <span className="text-xs text-zinc-500 font-medium">No players yet</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

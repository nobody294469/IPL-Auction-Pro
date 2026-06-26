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
import { PRE_GENERATED_FACTS } from '../data/scoutingReports';
import { getFlagUrl } from '../utils/helpers';
import { useTTS } from '../hooks/useTTS';

export const AuctionArena = ({ user, room, socket }: { user: FirebaseUser, room: AuctionRoom, socket: Socket | null }) => {
  const navigate = useNavigate();
  const { speak } = useTTS();

  // 1. Critical Guards at the very top
  if (!room || !room.players || !room.teams) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">Initializing Arena...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = room.players[room.currentPlayerIndex];
  const myProfile = room.teams[user.uid];

  // In Draft Mode, currentPlayer might be undefined if the pool is empty, but we still want to show the arena
  if ((!currentPlayer && room.auctionType !== 'draft') || !myProfile) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-500 font-black uppercase tracking-widest text-xs">Syncing War Room...</p>
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
  }, [currentPlayer?.id, room.status]);

  useEffect(() => {
    if (upcomingSetOverlay) {
      const timer = setTimeout(() => {
        setUpcomingSetOverlay(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [upcomingSetOverlay]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef(room);
  roomRef.current = room;

  const currentBidder = room.currentBidderId ? room.teams[room.currentBidderId] : null;
  const currentBidderTeam = currentBidder ? TEAMS.find(t => t.id === currentBidder.teamId) : null;

  const upcomingPlayers = room.players.slice(room.currentPlayerIndex + 1, room.currentPlayerIndex + 6);
  const soldPlayers = room.players.slice(0, room.currentPlayerIndex).filter(p => p.soldTo).reverse();

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

    // Reset bidding war on player change or status change
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
    <div className={`h-screen h-[100dvh] flex flex-col bg-black text-white overflow-hidden transition-all duration-500 ${timer < 5 && timer > 0 ? 'ring-[12px] ring-inset ring-red-500/20' : ''}`}>
      {/* Host Controls Overlay */}
      {room.hostId === user.uid && (
        <div className="fixed bottom-6 left-6 z-[150] flex flex-col gap-3">
          {room.status === 'finished' && (
            <>
              <button 
                onClick={() => socket?.emit('start-accelerated', { roomId: room.id, userId: user.uid })}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-full font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 border border-white/10"
              >
                <Zap size={14} /> Start Accelerated Round
              </button>
              <button 
                onClick={() => socket?.emit('start-trade-window', { roomId: room.id, userId: user.uid })}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2 border border-white/10"
              >
                <RefreshCw size={14} /> Open Trade Window
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
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 backdrop-blur-xl"
          >
            <div className="max-w-md w-full p-8 text-center space-y-8">
              <div className="space-y-4">
                <div className="inline-block px-4 py-1.5 bg-orange-500 text-black text-[10px] font-black uppercase tracking-[0.3em] rounded-full">
                  RTM Opportunity
                </div>
                <h2 className="text-4xl font-black text-white tracking-tighter">Right to Match?</h2>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  {currentPlayer?.name} was previously with your team. Do you want to match the final bid of <span className="text-white font-bold">₹{room.rtmPending.amount.toFixed(2)}Cr</span>?
                </p>
              </div>

              {room.rtmPending.eligibleUserId === user.uid ? (
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => handleRtmDecision(false)}
                    className="py-4 rounded-2xl bg-zinc-900 border border-white/10 text-white font-black hover:bg-zinc-800 transition-all"
                  >
                    PASS
                  </button>
                  <button 
                    onClick={() => handleRtmDecision(true)}
                    disabled={myProfile.budget < room.rtmPending.amount}
                    className="py-4 rounded-2xl bg-orange-500 text-black font-black hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50"
                  >
                    USE RTM CARD
                  </button>
                </div>
              ) : (
                <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
                    <span className="text-sm font-bold text-white">
                      Waiting for {room.teams[room.rtmPending!.eligibleUserId] ? 
                        TEAMS.find(t => t.id === room.teams[room.rtmPending!.eligibleUserId].teamId)?.shortName : 
                        'Team'}...
                    </span>
                  </div>
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">They have the Right to Match</p>
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
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.5, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center space-y-8"
            >
              <motion.div
                animate={{ rotate: [0, -5, 5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="relative inline-block"
              >
                <div className="absolute inset-0 bg-orange-500 blur-[100px] opacity-50 animate-pulse" />
                
                {/* Hammer Animation */}
                <motion.div
                  initial={{ rotate: -45, x: 100, y: -100, opacity: 0 }}
                  animate={{ rotate: 0, x: 0, y: 0, opacity: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.5 }}
                  className="absolute -top-12 -right-12 z-20"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-orange-500 blur-2xl opacity-50" />
                    <Gavel className="text-orange-500 w-24 h-24 drop-shadow-[0_0_20px_rgba(249,115,22,0.8)]" />
                  </div>
                </motion.div>

                <img 
                  src={soldOverlay.player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${soldOverlay.player.name}`} 
                  className="w-64 h-64 rounded-full object-cover border-8 border-orange-500 shadow-[0_0_80px_rgba(249,115,22,0.5)] relative z-10"
                  alt={soldOverlay.player.name}
                />
              </motion.div>
              <div className="space-y-2">
                <motion.h1 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-8xl font-black italic tracking-tighter text-white uppercase"
                >
                  SOLD!
                </motion.h1>
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex flex-col items-center gap-4"
                >
                  <div className="flex items-center gap-4">
                    <img 
                      src={TEAMS.find(t => t.id === soldOverlay.teamId)?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${soldOverlay.teamName}`} 
                      className="w-16 h-16 object-contain" 
                      alt={soldOverlay.teamName}
                    />
                    <span className="text-4xl font-black text-orange-500 tracking-tight">{soldOverlay.teamName}</span>
                  </div>
                  <span className="text-6xl font-black text-white">₹{soldOverlay.price.toFixed(2)} CR</span>
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
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-fade-in"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: -20, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 120 }}
              className="text-center max-w-lg px-6 space-y-8 relative"
            >
              {/* Background ambient glow based on set */}
              <div className={`absolute inset-[-100px] blur-[120px] opacity-40 animate-pulse rounded-full ${
                upcomingSetOverlay === 'Marquee' ? 'bg-yellow-500' :
                upcomingSetOverlay === 'Batters' ? 'bg-orange-500' :
                upcomingSetOverlay === 'Wicketkeepers' ? 'bg-emerald-500' :
                upcomingSetOverlay === 'All-rounders' ? 'bg-purple-500' :
                upcomingSetOverlay === 'Bowlers' ? 'bg-blue-500' :
                'bg-orange-600'
              }`} />

              <div className="relative z-10 space-y-6">
                <motion.div
                  initial={{ rotate: -10, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', damping: 12 }}
                  className="inline-flex items-center justify-center w-24 h-24 rounded-[30px] bg-white/5 border border-white/10 shadow-2xl backdrop-blur-md"
                >
                  <span className="text-5xl">
                    {upcomingSetOverlay === 'Marquee' && '⭐'}
                    {upcomingSetOverlay === 'Batters' && '🏏'}
                    {upcomingSetOverlay === 'Wicketkeepers' && '🧤'}
                    {upcomingSetOverlay === 'All-rounders' && '⭐'}
                    {upcomingSetOverlay === 'Bowlers' && '🎯'}
                    {upcomingSetOverlay === 'Accelerated' && '🚀'}
                  </span>
                </motion.div>

                <div className="space-y-2">
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 0.6, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-[11px] font-black uppercase tracking-[0.4em] text-zinc-400"
                  >
                    Set Starting Next
                  </motion.p>
                  <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, type: 'spring', damping: 15 }}
                    className="text-5xl md:text-6xl font-black tracking-tighter text-white uppercase"
                  >
                    {upcomingSetOverlay === 'Marquee' && 'Marquee Players'}
                    {upcomingSetOverlay === 'Batters' && 'Batters'}
                    {upcomingSetOverlay === 'Wicketkeepers' && 'Wicketkeepers'}
                    {upcomingSetOverlay === 'All-rounders' && 'All-rounders'}
                    {upcomingSetOverlay === 'Bowlers' && 'Bowlers'}
                    {upcomingSetOverlay === 'Accelerated' && 'Accelerated Round'}
                  </motion.h1>
                </div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-zinc-500 font-bold text-xs uppercase tracking-widest"
                >
                  {
                    (() => {
                      const totalInSet = room.players.filter(p => p.auctionSet === upcomingSetOverlay).length;
                      return `${totalInSet} Player${totalInSet !== 1 ? 's' : ''} in this set`;
                    })()
                  }
                </motion.p>
              </div>
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
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Trophy className="text-black" size={16} />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tighter uppercase leading-none">Auction Arena</h1>
              <div className="flex items-center gap-2 text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                Room: {room.id}
              </div>
            </div>
          </div>
        </div>

        {/* Host Controls: Pause/Resume & Finish in Header */}
        {room.hostId === user.uid && room.status !== 'finished' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => socket?.emit(room.isPaused ? 'resume-auction' : 'pause-auction', { roomId: room.id, userId: user.uid })}
              className={`px-4 py-1.5 rounded-full flex items-center gap-2 transition-all group border ${
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
              onClick={() => {
                if (confirmFinish) {
                  socket?.emit('finish-auction', { roomId: room.id, userId: user.uid });
                  setConfirmFinish(false);
                } else {
                  setConfirmFinish(true);
                  setTimeout(() => setConfirmFinish(false), 4000); // Reset after 4 seconds
                }
              }}
              className={`px-4 py-1.5 rounded-full flex items-center gap-2 transition-all cursor-pointer border ${
                confirmFinish
                  ? 'bg-red-600 border-red-500 hover:bg-red-700 text-white shadow-lg animate-pulse'
                  : 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20 text-red-500'
              }`}
            >
              <XCircle size={14} className={confirmFinish ? 'text-white' : 'text-red-500'} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                {confirmFinish ? 'Click again to confirm' : 'Finish Auction'}
              </span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSquads(true)}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold flex items-center gap-2 transition-all border border-white/5"
          >
            <Users size={12} />
            All Squads
          </button>
          <div className="h-6 w-px bg-white/10 mx-1" />
          {room.auctionType !== 'draft' && (
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
              <Wallet className="text-orange-500" size={12} />
              <span className="text-[10px] font-black">₹{myProfile.budget.toFixed(2)} CR</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
            <Plane className="text-blue-500" size={12} />
            <span className="text-[10px] font-black">OS: {myOverseasCount}/8</span>
          </div>
          {room.auctionType === 'mega' && (
            <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
              <RefreshCw className="text-orange-500" size={12} />
              <span className="text-[10px] font-black">RTM: {myProfile.rtmCards || 0}</span>
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
              <div className="flex items-center gap-2 mb-4">
                <ListOrdered size={16} className="text-orange-500" />
                <h3 className="text-[12px] font-black uppercase tracking-widest text-zinc-400">Upcoming</h3>
              </div>
              <div className="space-y-2">
                {upcomingPlayers.length > 0 ? upcomingPlayers.map((p, idx) => (
                  <div key={p.id} className="p-2.5 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3 group hover:border-white/10 transition-all">
                    <img 
                      src={p.image || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`} 
                      className="w-10 h-10 rounded-lg object-cover bg-zinc-800" 
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-black text-white truncate">{p.name}</span>
                      <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{p.role} • ₹{p.basePrice}Cr</span>
                    </div>
                  </div>
                )) : (
                  <div className="p-4 text-center border border-dashed border-white/5 rounded-xl">
                    <span className="text-[11px] font-bold text-zinc-600 uppercase">No more players</span>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Buys */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <History size={16} className="text-orange-500" />
                <h3 className="text-[12px] font-black uppercase tracking-widest text-zinc-400">Recent Buys</h3>
              </div>
              <div className="space-y-2">
                {soldPlayers.length > 0 ? soldPlayers.map((p) => {
                  const buyerProfile = room.teams[p.soldTo];
                  const teamId = buyerProfile?.teamId || p.soldTo;
                  const team = TEAMS.find(t => t.id === teamId || t.shortName === teamId || t.id.toLowerCase() === teamId?.toLowerCase());
                  const isRecord = p.soldPrice >= p.basePrice * 5;

                  return (
                    <div key={p.id} className="p-2.5 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between gap-3 group hover:bg-white/10 transition-all relative overflow-hidden">
                      {isRecord && (
                        <div className="absolute -right-8 top-2 bg-orange-500 text-[7px] font-black text-black px-8 py-0.5 rotate-45 uppercase tracking-widest shadow-lg">Record</div>
                      )}
                      
                      <div className="flex items-center gap-3 min-w-0">
                        <img 
                          src={p.image || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`} 
                          className="w-10 h-10 rounded-lg object-cover bg-zinc-800 shrink-0" 
                          alt={p.name}
                          referrerPolicy="no-referrer"
                          onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`)}
                        />
                        <span className="text-sm font-black text-white truncate">{p.name}</span>
                      </div>

                      <div className="flex flex-col items-center justify-center min-w-[70px] relative">
                        <span className="text-[9px] font-black text-orange-500 uppercase tracking-tighter mb-0.5 whitespace-nowrap">
                          {room.auctionType === 'draft' ? 'Drafted' : `₹${p.soldPrice?.toFixed(2)} Cr`}
                        </span>
                        <div className="flex items-center w-full">
                          <div className="h-px flex-1 bg-white/20" />
                          <ArrowRight className="w-3 h-3 text-white/40 -ml-1" />
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-center gap-1 min-w-[45px]">
                        {team ? (
                          <img 
                            src={team.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`} 
                            className="w-10 h-10 object-contain" 
                            alt={team.name} 
                            referrerPolicy="no-referrer" 
                            onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`)} 
                          />
                        ) : (
                          <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center border border-white/5">
                            <span className="text-[11px] font-black text-white/40 uppercase">{p.soldTo?.slice(0, 2)}</span>
                          </div>
                        )}
                        <span className="text-[9px] font-black text-white/60 uppercase">{team?.shortName || 'Sold'}</span>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="p-4 text-center border border-dashed border-white/5 rounded-xl">
                    <span className="text-[11px] font-bold text-zinc-600 uppercase">No sales yet</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Center: Bidding Arena */}
        <div className={`flex-1 w-full bg-gradient-to-b from-zinc-900/50 to-black relative flex flex-col items-center justify-center pt-8 p-4 overflow-y-auto lg:overflow-hidden custom-scrollbar transition-colors duration-300 ${timer < 5 && timer > 0 ? 'bg-red-950/20' : ''}`}>
          {/* Left/Right Sidebar Collapse Toggles */}
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-6 h-12 bg-zinc-950/80 hover:bg-orange-500/20 hover:text-orange-400 border border-white/10 hover:border-orange-500/30 rounded-lg items-center justify-center text-zinc-400 transition-all z-[50] group backdrop-blur-md cursor-pointer"
            title={leftCollapsed ? "Expand Left Sidebar" : "Collapse Left Sidebar"}
          >
            {leftCollapsed ? <ChevronRight size={14} className="group-hover:scale-110 transition-transform" /> : <ChevronLeft size={14} className="group-hover:scale-110 transition-transform" />}
          </button>
          
          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-6 h-12 bg-zinc-950/80 hover:bg-orange-500/20 hover:text-orange-400 border border-white/10 hover:border-orange-500/30 rounded-lg items-center justify-center text-zinc-400 transition-all z-[50] group backdrop-blur-md cursor-pointer"
            title={rightCollapsed ? "Expand Right Sidebar" : "Collapse Right Sidebar"}
          >
            {rightCollapsed ? <ChevronLeft size={14} className="group-hover:scale-110 transition-transform" /> : <ChevronRight size={14} className="group-hover:scale-110 transition-transform" />}
          </button>
          {timer < 5 && timer > 0 && (
            <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />
          )}

          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] blur-[120px] rounded-full transition-colors duration-500 ${timer < 5 && timer > 0 ? 'bg-red-500/10' : 'bg-orange-500/5'}`} />
          </div>

          {/* Timer Overlay */}
          {room.auctionType !== 'draft' && (
            <div className="absolute top-4 flex flex-col items-center z-[40]">
              <div className={`relative w-16 h-16 flex items-center justify-center mb-1 transition-all duration-300 ${timer < 5 && !room.isPaused ? 'scale-110' : ''}`}>
                {/* SVG Progress Ring */}
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 60 60">
                  {/* Background Circle */}
                  <circle
                    cx="30"
                    cy="30"
                    r={circleRadius}
                    className="fill-black/60 stroke-white/10"
                    strokeWidth={circleStrokeWidth}
                  />
                  {/* Active Progress Circle */}
                  <motion.circle
                    cx="30"
                    cy="30"
                    r={circleRadius}
                    className={`fill-none transition-all duration-1000 ease-linear ${
                      timer < 5 && !room.isPaused
                        ? 'stroke-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                        : 'stroke-orange-500 drop-shadow-[0_0_6px_rgba(249,115,22,0.3)]'
                    }`}
                    strokeWidth={circleStrokeWidth}
                    strokeDasharray={circleCircumference}
                    animate={{ strokeDashoffset: timerStrokeDashoffset }}
                    transition={{ duration: room.isPaused ? 0 : 1, ease: "linear" }}
                    strokeLinecap="round"
                  />
                </svg>

                {/* Timer Text */}
                <span className={`relative z-10 text-xl font-black tracking-tighter transition-colors duration-300 ${timer < 5 && !room.isPaused ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                  {room.isPaused ? '||' : `${timer}s`}
                </span>
              </div>
              {room.isPaused && (
                <span className="text-[8px] font-black text-orange-500 uppercase tracking-[0.3em] animate-pulse">Auction Paused</span>
              )}
              {timer < 5 && timer > 0 && !room.isPaused && (
                <span className="text-[8px] font-black text-red-500 uppercase tracking-[0.3em] animate-bounce">Final Call!</span>
              )}
            </div>
          )}

          <div className="w-full max-w-[1400px] mx-auto relative z-10 transition-all duration-300">
            {room.auctionType === 'draft' ? (
              <div className="space-y-8">
                <div className="text-center space-y-4">
                  <div className="flex flex-col items-center gap-2">
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Draft Pool</h2>
                    <div className="flex items-center gap-4">
                      <div className={`px-4 py-1 rounded-full border-2 flex items-center gap-2 transition-all ${timer < 10 ? 'border-red-500 bg-red-500/10 animate-pulse' : 'border-orange-500/30 bg-orange-500/5'}`}>
                        <Clock size={14} className={timer < 10 ? 'text-red-500' : 'text-orange-500'} />
                        <span className={`text-lg font-black tracking-tighter ${timer < 10 ? 'text-red-500' : 'text-white'}`}>{room.isPaused ? '||' : `${timer}s`}</span>
                      </div>
                      <div className="flex flex-col items-start">
                        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">
                          {isMyDraftTurn 
                            ? 'It is your turn to pick!' 
                            : `Waiting for ${room.teams[currentTurnUserId!]?.displayName || 'Team'} to pick`}
                        </p>
                        {room.draftPool && room.draftPool.length > 0 && room.draftPool[0] && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">
                              Current Role: <span className="text-white">{room.draftPool[0].role}s</span>
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-600 mx-1">|</span>
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">
                              Round: <span className="text-white">{room.draftRound} / {room.draftLimit || 15}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Draft Progress Bar */}
                  <div className="max-w-md mx-auto w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
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
                          <div className={`flex flex-col items-center gap-1 transition-all duration-500 ${isCurrent ? 'scale-110' : 'opacity-40 grayscale scale-90'}`}>
                            <div className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center bg-zinc-900 overflow-hidden ${isCurrent ? 'border-orange-500 shadow-lg shadow-orange-500/20' : 'border-white/5'}`}>
                              <img 
                                src={teamData?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`} 
                                className="w-7 h-7 object-contain" 
                                alt={teamData?.shortName}
                                onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`)}
                              />
                            </div>
                            <span className={`text-[8px] font-black uppercase tracking-tighter ${isCurrent ? 'text-orange-500' : 'text-zinc-500'}`}>
                              {teamData?.shortName}
                            </span>
                          </div>
                          {idx < room.draftOrder!.length - 1 && (
                            <div className="w-4 h-px bg-white/10" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Direction Indicator */}
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <div className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-widest transition-all duration-500 ${room.draftDirection === 'forward' ? 'text-orange-500' : 'text-zinc-700'}`}>
                      <span>Forward</span>
                      <ArrowRight size={10} className={room.draftDirection === 'forward' ? 'animate-pulse' : ''} />
                    </div>
                    <div className="w-8 h-px bg-white/5" />
                    <div className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-widest transition-all duration-500 ${room.draftDirection === 'backward' ? 'text-orange-500' : 'text-zinc-700'}`}>
                      <ArrowLeft size={10} className={room.draftDirection === 'backward' ? 'animate-pulse' : ''} />
                      <span>Snake Back</span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-6 px-4">
                  {room.draftPool?.map((player) => (
                    <motion.div
                      key={player.id}
                      layoutId={player.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ y: -5 }}
                      className={`relative bg-zinc-900/80 backdrop-blur-xl border rounded-[32px] overflow-hidden transition-all duration-300 ${
                        isMyDraftTurn ? 'border-orange-500/30 shadow-lg shadow-orange-500/10' : 'border-white/10'
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
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                        
                        <div className="absolute top-4 left-4">
                          <span className="px-2 py-1 bg-orange-500 text-black text-[8px] font-black uppercase tracking-widest rounded-md">
                            {player.role}
                          </span>
                        </div>
                        
                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="text-xl font-black text-white tracking-tighter uppercase italic truncate">{player.name}</h3>
                          <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-black uppercase tracking-widest">
                            <span>{player.country}</span>
                            {room.auctionType !== 'draft' && (
                              <>
                                <span>•</span>
                                <span>₹{player.basePrice} Cr</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-4 bg-black/40 border-t border-white/5 space-y-2">
                        <button
                          onClick={() => handlePickPlayer(player.id)}
                          disabled={!isMyDraftTurn || timer === 0}
                          className={`w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                            isMyDraftTurn 
                              ? 'bg-orange-500 hover:bg-orange-600 text-black shadow-lg shadow-orange-500/20' 
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
                      <div className="absolute inset-[-15px] z-0">
                        <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/40 via-orange-500/40 to-yellow-500/40 animate-pulse blur-3xl opacity-70" />
                        <motion.div 
                          animate={{ 
                            scale: [1, 1.08, 1],
                            opacity: [0.5, 0.8, 0.5]
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute inset-0 border-[10px] border-yellow-500/30 rounded-[40px] blur-2xl"
                        />
                        <div className="absolute inset-0 overflow-hidden">
                          {[...Array(10)].map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{
                                y: [-20, -150],
                                x: [Math.random() * 300 - 150, Math.random() * 300 - 150],
                                opacity: [0, 1, 0],
                                scale: [0, 1.5, 0]
                              }}
                              transition={{
                                duration: 2 + Math.random() * 2,
                                repeat: Infinity,
                                delay: Math.random() * 2
                              }}
                              className="absolute bottom-0 left-1/2 w-1.5 h-1.5 bg-yellow-400 rounded-full blur-[1px]"
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <motion.div 
                      key={currentPlayer.id}
                      initial={{ opacity: 0, scale: 0.9, x: -20 }}
                      animate={isBiddingWar ? { 
                        opacity: 1, 
                        scale: [1, 1.01, 1], 
                        x: 0,
                        borderColor: ["rgba(249,115,22,0.2)", "rgba(249,115,22,0.8)", "rgba(249,115,22,0.2)"]
                      } : { opacity: 1, scale: 1, x: 0 }}
                      transition={isBiddingWar ? { duration: 1, repeat: Infinity } : {}}
                      className={`relative w-full h-[300px] rounded-[40px] overflow-hidden shadow-2xl border transition-all duration-500 ${currentPlayer.auctionSet === 'Marquee' ? 'border-yellow-500/50 shadow-yellow-500/30' : 'border-white/20 shadow-black/50'}`}
                    >
                      {isBiddingWar && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute -inset-4 bg-orange-500/10 blur-2xl -z-10 rounded-full animate-pulse"
                        />
                      )}
                      <img 
                        src={currentPlayer.image || `https://api.dicebear.com/7.x/initials/svg?seed=${currentPlayer.name}`} 
                        className="w-full h-full object-cover transition-all duration-1000 group-hover:scale-110" 
                        alt={currentPlayer.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${currentPlayer.name}`;
                        }}
                      />
                      
                      <div className="absolute top-6 left-6 right-6 flex justify-between items-start">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-orange-500 text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-lg shadow-lg">
                              {currentPlayer.role}
                            </span>
                          </div>
                          {currentPlayer.auctionSet === 'Marquee' && (
                            <span className="px-3 py-1 bg-yellow-500 text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-lg shadow-[0_0_15px_rgba(234,179,8,0.5)]">
                              Marquee
                            </span>
                          )}
                        </div>
                        <div className="w-12 h-8 rounded-lg overflow-hidden border-2 border-white/20 shadow-2xl bg-zinc-800 flex items-center justify-center">
                          {currentPlayer.country === 'West Indies' ? (
                            <div className="w-full h-full bg-[#7B0041] flex items-center justify-center text-[10px] font-black text-white">WI</div>
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
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-1 px-2"
                  >
                    <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic leading-none drop-shadow-xl">{currentPlayer.name}</h2>
                    <div className="flex items-center justify-center gap-3 text-zinc-400">
                      <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                        <Hash size={14} className="text-orange-500" />
                        <span className="font-black uppercase tracking-[0.2em] text-[11px]">Base Price: ₹{currentPlayer.basePrice} Cr</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Scouting Report Below Player Card & Name */}
                  {currentPlayerReport && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-[30px] p-5 shadow-2xl relative overflow-hidden space-y-3"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 blur-3xl rounded-full -mr-12 -mt-12" />
                      
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 border-b border-white/5 pb-2.5">
                          <div className="w-6 h-6 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <Shield size={14} className="text-orange-500" />
                          </div>
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Scouting Report</h3>
                        </div>

                        <div className="space-y-2.5">
                          {currentPlayerReport.facts.map((fact, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-zinc-300 leading-relaxed">
                              <span className="text-orange-500 mt-1 select-none font-bold">•</span>
                              <p className="font-medium text-[11.5px]">{fact}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t border-white/5 pt-3 bg-transparent">
                        <div className="flex items-center justify-between bg-white/5 px-4 py-2.5 rounded-2xl border border-white/5">
                          <div className="flex flex-col">
                            <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">Expected Range</span>
                            <span className="text-[12px] font-black text-white">₹{currentPlayerReport.minPrice.toFixed(1)} - ₹{currentPlayerReport.maxPrice.toFixed(1)} Cr</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-0.5">Base Price</span>
                            <span className="text-[12px] font-black text-orange-500">₹{currentPlayer.basePrice.toFixed(1)} Cr</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Right Column: Stats & Bidding */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex-1 w-full max-w-[340px] md:max-w-[420px] lg:max-w-[480px] xl:max-w-[540px] space-y-4 transition-all duration-300"
                >
                  {/* Category Banner / Auction Set Indicator */}
                  {currentPlayer && (
                    <div className="bg-zinc-900/90 border border-white/10 rounded-[30px] p-5 flex flex-col gap-1.5 shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 blur-3xl rounded-full" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">Current Category</span>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-lg font-black text-white flex items-center gap-1.5 uppercase tracking-wide">
                          {currentPlayer.auctionSet === 'Marquee' && '⭐ Marquee Players'}
                          {currentPlayer.auctionSet === 'Batters' && '🏏 Batters'}
                          {currentPlayer.auctionSet === 'Wicketkeepers' && '🧤 Wicketkeepers'}
                          {currentPlayer.auctionSet === 'All-rounders' && '⭐ All-rounders'}
                          {currentPlayer.auctionSet === 'Bowlers' && '🎯 Bowlers'}
                          {currentPlayer.auctionSet === 'Accelerated' && '🚀 Accelerated Auction'}
                          {!currentPlayer.auctionSet && '🏏 General Pool'}
                        </span>
                        <div className="text-xs font-black text-orange-500 bg-orange-500/10 px-3 py-1.5 rounded-full border border-orange-500/20 whitespace-nowrap">
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

                  <div className="bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-[40px] p-5 flex flex-col justify-start gap-y-4 shadow-2xl relative overflow-hidden">
                    {room.status === 'selling' && (
                      <div className="w-full bg-red-600/90 backdrop-blur-xl py-2.5 px-5 flex items-center justify-between -mx-5 -mt-5 mb-2 border-b border-red-500/30">
                        <div className="flex items-center gap-2">
                          <Zap size={14} className="text-white animate-bounce" />
                          <span className="text-white font-black text-xs uppercase tracking-widest">
                            {timer === 2 ? "Going Once!" : timer === 1 ? "Going Twice!" : "Final Warning!"}
                          </span>
                        </div>
                        <div className="flex-1 max-w-[100px] ml-4 bg-white/20 h-1.5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: "100%" }}
                            animate={{ width: "0%" }}
                            transition={{ duration: 2, ease: "linear" }}
                            className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                          />
                        </div>
                      </div>
                    )}

                    {room.status === 'rtm' && (
                      <div className="w-full bg-blue-600/90 backdrop-blur-xl py-2.5 px-5 flex items-center justify-between -mx-5 -mt-5 mb-2 border-b border-blue-500/30">
                        <div className="flex items-center gap-2">
                          <RefreshCw size={14} className="text-white animate-spin" />
                          <span className="text-white font-black text-xs uppercase tracking-widest">
                            {room.rtmPending?.eligibleUserId === user.uid 
                              ? "Your RTM Decision!" 
                              : `${room.teams[room.rtmPending?.eligibleUserId!]?.displayName} RTM?`}
                          </span>
                        </div>
                        <div className="flex-1 max-w-[100px] ml-4 bg-white/20 h-1.5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: "100%" }}
                            animate={{ width: "0%" }}
                            transition={{ duration: 10, ease: "linear" }}
                            className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                          />
                        </div>
                      </div>
                    )}

                    <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 blur-3xl rounded-full -mr-12 -mt-12" />
                    
                    <div className="space-y-6">
                      <div className="flex items-center gap-2.5 border-b border-white/5 pb-3">
                        <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
                          <Star size={16} className="text-orange-500" />
                        </div>
                        <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400">Career Statistics</h3>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="p-2 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group">
                          <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-widest mb-0.5 group-hover:text-orange-500 transition-colors">Matches</span>
                          <span className="text-base font-black text-white">{currentPlayer.stats?.matches || '-'}</span>
                        </div>
                        <div className="p-2 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group">
                          <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-widest mb-0.5 group-hover:text-orange-500 transition-colors">
                            {['Pacer', 'Spinner'].includes(currentPlayer.role) ? 'Wickets' : 'Runs'}
                          </span>
                          <span className="text-base font-black text-white">
                            {['Pacer', 'Spinner'].includes(currentPlayer.role) ? currentPlayer.stats?.wickets : currentPlayer.stats?.runs || '-'}
                          </span>
                        </div>
                        <div className="p-2 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group">
                          <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-widest mb-0.5 group-hover:text-orange-500 transition-colors">Strike Rate</span>
                          <span className="text-base font-black text-white">{currentPlayer.stats?.strikeRate || '-'}</span>
                        </div>
                        <div className="p-2 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group">
                          <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-widest mb-0.5 group-hover:text-orange-500 transition-colors">
                            {['Pacer', 'Spinner'].includes(currentPlayer.role) ? 'Economy' : 'Average'}
                          </span>
                          <span className="text-base font-black text-white">
                            {['Pacer', 'Spinner'].includes(currentPlayer.role) ? currentPlayer.stats?.economy : currentPlayer.stats?.average || '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex flex-col items-center p-3 bg-gradient-to-b from-orange-500/10 to-transparent rounded-[28px] border border-orange-500/20 shadow-inner relative">
                        <span className="text-[9px] font-black text-orange-500 uppercase tracking-[0.4em] mb-1">Current Bid</span>
                        <motion.div 
                          key={room.currentBid || 0}
                          initial={{ y: 8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="flex items-baseline gap-1.5"
                        >
                          <span className="text-3xl font-black text-white tracking-tighter">₹{(room.currentBid || 0).toFixed(2)}</span>
                          <span className="text-sm font-black text-zinc-600 uppercase">Cr</span>
                        </motion.div>
                      </div>

                      <div className="space-y-3">
                        {room.status === 'rtm' && room.rtmPending?.eligibleUserId === user.uid ? (
                          <div className="flex gap-3">
                            <button 
                              onClick={() => socket?.emit('rtm-decision', { roomId: room.id, userId: user.uid, decision: 'match' })}
                              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest text-[10px] rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                            >
                              Match Bid
                            </button>
                            <button 
                              onClick={() => socket?.emit('rtm-decision', { roomId: room.id, userId: user.uid, decision: 'pass' })}
                              className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase tracking-widest text-[10px] rounded-xl transition-all border border-white/5"
                            >
                              Pass
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="px-2 space-y-4">
                    {room.auctionType === 'blind' ? (
                      <div className="space-y-3">
                        <div className="relative">
                          <input 
                            type="number"
                            step="0.05"
                            value={blindBidAmount}
                            onChange={(e) => setBlindBidAmount(e.target.value)}
                            placeholder={`Min bid ₹${currentPlayer?.basePrice || 0}Cr`}
                            className="w-full h-14 bg-black/60 border border-white/10 rounded-2xl px-6 font-bold text-white focus:outline-none focus:border-orange-500 transition-all placeholder:text-zinc-600"
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Cr</div>
                        </div>
                        <button 
                          onClick={placeBid}
                          disabled={room.isPaused || (timer === 0 && room.status !== 'selling' && room.status !== 'active')}
                          className="w-full h-14 rounded-2xl bg-orange-500 hover:bg-orange-600 text-black font-black text-sm transition-all transform active:scale-95 shadow-xl shadow-orange-500/20 flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          <Lock size={18} strokeWidth={3} />
                          SUBMIT SECRET BID
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={placeBid}
                        disabled={room.isPaused || room.currentBidderId === user.uid || (timer === 0 && room.status !== 'selling' && room.status !== 'active')}
                        className={`w-full h-[60px] rounded-[24px] font-black text-lg transition-all transform active:scale-95 shadow-2xl flex items-center justify-center gap-3 ${
                          room.currentBidderId === user.uid || room.isPaused
                            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5' 
                            : 'bg-white hover:bg-zinc-200 text-black shadow-white/20'
                        }`}
                      >
                        <Gavel size={22} strokeWidth={3} />
                        {room.isPaused ? 'AUCTION PAUSED' : room.currentBidderId === user.uid ? 'LEADING BID' : `BID ₹${nextBidAmount.toFixed(2)} CR`}
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
          <div className="p-4 border-b border-white/5 max-h-[35%] overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={16} className="text-orange-500" />
              <h3 className="text-[12px] font-black uppercase tracking-widest text-zinc-400">War Room Status</h3>
            </div>
            <div className="space-y-2">
              {Object.values(room.teams).map(t => {
                const teamData = TEAMS.find(team => team.id === t.teamId);
                return (
                  <div key={t.uid} className="p-2.5 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between group hover:bg-white/10 transition-all">
                    <div className="flex items-center gap-3">
                      <img src={teamData?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`} className="w-10 h-10 object-contain" alt={teamData?.name} referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`)} />
                      <div>
                        <span className="block text-sm font-black text-white">{teamData?.shortName}</span>
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t.squad.length}/25 Players</span>
                      </div>
                    </div>
                    {room.auctionType !== 'draft' && (
                      <div className="text-right flex flex-col items-end">
                        <span className="block text-sm font-black text-white">₹{t.budget.toFixed(1)}Cr</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">Budget</span>
                          {room.auctionType === 'mega' && t.rtmCards > 0 && (
                            <div className="flex gap-0.5">
                              {[...Array(t.rtmCards)].map((_, i) => (
                                <div key={i} className="w-1.5 h-1.5 bg-orange-500 rounded-full shadow-[0_0_5px_rgba(249,115,22,0.5)]" />
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
          <div className="p-4 border-b border-white/5 max-h-[40%] overflow-y-auto custom-scrollbar bg-black/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserIcon size={16} className="text-blue-500" />
                <h3 className="text-[12px] font-black uppercase tracking-widest text-zinc-400">My Squad</h3>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowFullMySquad(!showFullMySquad)}
                  className="text-[9px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
                >
                  {showFullMySquad ? 'Hide' : 'Full'}
                </button>
                <span className="text-[12px] font-black text-orange-500">{myProfile.squad.length}/25</span>
              </div>
            </div>

            {/* Role Balance Grid */}
            <div className={`grid ${Object.keys(squadStats).length > 4 ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'} gap-1.5 mb-5`}>
              {Object.entries(squadStats).map(([role, count]) => (
                <div key={role} className="p-2 bg-white/5 rounded-xl border border-white/5 text-center">
                  <div className="text-[8px] font-black text-zinc-500 uppercase mb-1">{role}</div>
                  <div className="text-sm font-black text-white">{count}</div>
                </div>
              ))}
            </div>

            {showFullMySquad && (
              <div className="space-y-2">
                {myProfile.squad.length > 0 ? (myProfile.squad as any[]).slice().reverse().map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-[12px] p-2 bg-white/5 rounded-lg border border-white/5">
                    <span className="truncate max-w-[110px] font-bold text-zinc-300">{p.name}</span>
                    {room.auctionType !== 'draft' && <span className="font-black text-orange-500">₹{p.soldPrice?.toFixed(2)}Cr</span>}
                  </div>
                )) : (
                  <div className="text-center py-6 border border-dashed border-white/5 rounded-xl">
                    <span className="text-[10px] text-zinc-600 uppercase font-black tracking-widest">No signings yet</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat & Bidding War */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-2">
                {showBiddingLog ? (
                  <Gavel size={16} className="text-orange-500" />
                ) : (
                  <MessageSquare size={16} className="text-orange-500" />
                )}
                <h3 className="text-[12px] font-black uppercase tracking-widest text-zinc-400">
                  {showBiddingLog ? 'Bidding Log' : 'Live Comms'}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowBiddingLog(!showBiddingLog)}
                  className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border ${
                    showBiddingLog 
                      ? 'bg-orange-500 text-black border-orange-500' 
                      : 'bg-white/5 text-zinc-500 border-white/10 hover:text-white'
                  }`}
                >
                  {showBiddingLog ? 'Show Chat' : 'Show Log'}
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Live</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              {showBiddingLog ? (
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-orange-500/5">
                  {bidHistory.length > 0 ? (
                    <AnimatePresence initial={false}>
                      {bidHistory.map((bid, i) => (
                        <motion.div
                          key={`${bid.teamName}-${bid.amount}-${i}`}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border ${i === 0 ? 'bg-orange-500/10 border-orange-500/30' : 'bg-white/5 border-white/5 opacity-60'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img src={TEAMS.find(t => t.id === bid.teamId)?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${bid.teamName}`} className="w-6 h-6 object-contain" alt="" />
                            <span className="text-[11px] font-bold text-white truncate">{bid.teamName}</span>
                          </div>
                          <span className="text-[11px] font-black text-orange-500">₹{bid.amount.toFixed(2)} Cr</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                      <Gavel size={40} className="mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No bids placed yet</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {chat.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.userName === user.displayName ? 'items-end' : 'items-start'}`}>
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{msg.userName}</span>
                        <div className={`px-3 py-2 rounded-2xl text-[13px] max-w-[90%] ${msg.userName === user.displayName ? 'bg-orange-500 text-black font-bold shadow-lg shadow-orange-500/20' : 'bg-white/5 text-zinc-300 border border-white/5'}`}>
                          {msg.message}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <form onSubmit={sendMessage} className="p-4 bg-black/40 border-t border-white/5 flex gap-3">
                    <input 
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-all"
                    />
                    <button className="p-2.5 bg-orange-500 text-black rounded-xl hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20">
                      <Send size={18} />
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
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl p-8 overflow-y-auto"
          >
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-500/20">
                    <Users className="text-black" size={24} />
                  </div>
                  <div>
                    <h2 className="text-4xl font-black text-white tracking-tighter">SQUAD OVERVIEW</h2>
                    <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Real-time team compositions</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSquads(false)}
                  className="w-12 h-12 bg-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center text-white transition-all border border-white/10"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.values(room.teams).map(t => {
                  const teamData = TEAMS.find(team => team.id === t.teamId);
                  return (
                    <div key={t.uid} className="bg-zinc-900/50 border border-white/5 rounded-[32px] p-6 flex flex-col">
                      <div className="flex items-center gap-4 mb-6">
                        <img src={teamData?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`} className="w-16 h-16 object-contain" alt={teamData?.name} referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamData?.shortName}`)} />
                        <div>
                          <h3 className="text-xl font-black text-white tracking-tight">{teamData?.name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            {room.auctionType !== 'draft' && (
                              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">₹{t.budget.toFixed(2)} Cr</span>
                            )}
                            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t.squad.length}/25 Players</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex-1 space-y-2">
                        {t.squad.length > 0 ? t.squad.map(player => (
                          <div key={player.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                            <div className="flex items-center gap-3">
                              <img 
                                src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`} 
                                className="w-8 h-8 rounded-lg object-cover bg-zinc-800" 
                                alt={player.name}
                                referrerPolicy="no-referrer"
                                onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`)}
                              />
                              <div>
                                <span className="block text-xs font-bold text-white">{player.name}</span>
                                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">{player.role}</span>
                              </div>
                            </div>
                            {room.auctionType !== 'draft' && (
                              <span className="text-[10px] font-black text-orange-500">₹{player.soldPrice?.toFixed(2)}Cr</span>
                            )}
                          </div>
                        )) : (
                          <div className="h-32 flex items-center justify-center border border-dashed border-white/5 rounded-2xl">
                            <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">No players yet</span>
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

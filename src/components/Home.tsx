import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronRight,
  Plus,
  X,
  Users,
  Shield,
  Gavel,
  Shirt
} from 'lucide-react';
import { toast } from 'sonner';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { TEAMS } from '../data/teams';
import { PLAYERS } from '../data/players';

export const Home = ({ user }: { user: FirebaseUser | null }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [customPurse, setCustomPurse] = useState(120);
  const [customBidTime, setCustomBidTime] = useState(10);
  const [customDraftLimit, setCustomDraftLimit] = useState(15);
  const [createAuctionType, setCreateAuctionType] = useState<'open' | 'blind' | 'draft' | 'mega'>('open');
  const navigate = useNavigate();

  const handleCreateClick = () => {
    if (!user) {
      signInWithPopup(auth, googleProvider).then(() => {
        setIsCreating(true);
      }).catch((err) => {
        console.error('Sign-in error:', err);
      });
      return;
    }
    setIsCreating(true);
  };

  const createRoom = async () => {
    if (!user) {
      await signInWithPopup(auth, googleProvider);
      return;
    }
    if (!roomName.trim()) {
      toast.error('Please enter an arena name');
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'rooms'), {
        name: roomName,
        hostId: user.uid,
        status: 'lobby',
        purse: customPurse,
        bidTime: customBidTime,
        draftLimit: customDraftLimit,
        auctionType: createAuctionType,
        createdAt: new Date().toISOString()
      });
      navigate(`/room/${docRef.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error('Failed to create arena. Please try again.');
    }
  };

  const joinRoom = () => {
    if (joinCode.trim()) navigate(`/room/${joinCode.trim()}`);
  };

  const auctionFormats = [
    {
      id: 'open',
      name: 'Open Auction',
      tag: 'Live Bidding',
      image: '/images/format_open.jpg',
      tagColor: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      description: 'Sequential live bidding where all managers bid openly against an active countdown clock.'
    },
    {
      id: 'blind',
      name: 'Blind Auction',
      tag: 'Sealed Bids',
      image: '/images/format_blind.jpg',
      tagColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      description: 'Managers submit confidential bids before the timer expires; highest bidder secures the lot.'
    },
    {
      id: 'draft',
      name: 'Draft',
      tag: 'Turn-Based',
      image: '/images/format_draft.jpg',
      tagColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      description: 'Snake-order selection rounds from role categories without purse deductions.'
    },
    {
      id: 'mega',
      name: 'Mega Auction',
      tag: 'Full Ruleset',
      image: '/images/format_mega.jpg',
      tagColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      description: 'Complete experience featuring squad retentions, RTM cards, purse limits, and unsold lots.'
    }
  ];

  const steps = [
    {
      step: '01',
      title: 'Create or join an arena',
      description: 'Host a room with custom purse and timer settings, or enter an arena code from a friend.',
      icon: Users
    },
    {
      step: '02',
      title: 'Choose your franchise',
      description: 'Claim one of 10 official IPL franchises in the lobby and confirm ready status.',
      icon: Shield
    },
    {
      step: '03',
      title: 'Bid or draft players',
      description: 'Compete against rivals in synchronized bidding rounds with live countdowns.',
      icon: Gavel
    },
    {
      step: '04',
      title: 'Build your squad',
      description: 'Balance roles, manage purse constraints, and finalize your championship lineup.',
      icon: Shirt
    }
  ];

  const rules = [
    {
      step: '01',
      title: 'One franchise per manager',
      description: 'Each participant claims and commands exactly one franchise for the session duration.'
    },
    {
      step: '02',
      title: 'Purse limits spending',
      description: 'Budgets (default â‚¹120 Cr, host-configurable) restrict player acquisition spending.'
    },
    {
      step: '03',
      title: 'Synchronized timers',
      description: 'Live clocks enforce fast bidding; subsequent bids reset or advance the timer.'
    },
    {
      step: '04',
      title: 'Structured progression',
      description: 'The auction continues sequentially through player sets until rosters or pools complete.'
    }
  ];

  return (
    <div className="relative min-h-screen bg-stadium text-white overflow-x-hidden selection:bg-orange-500/30">

      {/* Subtle Warm Environmental Lighting Highlights */}
      <div className="pointer-events-none absolute top-10 left-1/3 -translate-x-1/2 w-[700px] h-[400px] bg-orange-500/[0.06] blur-[140px] rounded-full -z-10" />
      <div className="pointer-events-none absolute top-24 right-5 w-[450px] h-[450px] bg-amber-500/[0.04] blur-[110px] rounded-full -z-10" />

      <div className="pt-24 pb-20 md:pt-28 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto space-y-16 md:space-y-20 relative z-10">

        {/* ========================================================================= */}
        {/* 1. HERO SECTION & OFFICIAL IPL FRANCHISES SHOWCASE                         */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">

          {/* Left Column: Hero Content & Room Controls */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="lg:col-span-7 space-y-7 text-left"
          >
            <div className="space-y-3.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-black/40 text-orange-400 rounded-full text-xs font-medium border border-orange-500/25 backdrop-blur-sm shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                IPL 2026 Edition
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white tracking-tight leading-[1.08]">
                Run your own <br />
                <span className="text-orange-500">IPL auction</span> <br />
                with friends.
              </h1>

              <p className="text-sm sm:text-base text-zinc-300/90 max-w-lg leading-relaxed font-normal">
                Create a room, choose a franchise, and compete in a live multiplayer auction to build your squad within budget.
              </p>
            </div>

            {/* Action Bar: Create Room & Enter Arena Code */}
            <div className="flex flex-wrap gap-3 items-center pt-1">
              <button
                onClick={handleCreateClick}
                className="bg-orange-500 hover:bg-orange-400 text-zinc-950 font-semibold py-3 px-6 rounded-xl transition-all duration-200 text-sm flex items-center gap-2 shadow-[0_0_24px_rgba(249,115,22,0.35)] hover:shadow-[0_0_30px_rgba(249,115,22,0.5)] cursor-pointer active:scale-[0.98]"
              >
                <Plus size={18} strokeWidth={2.5} />
                Create room
              </button>

              <div className="flex items-center bg-black/60 backdrop-blur-md border border-white/15 rounded-xl p-1 focus-within:border-orange-500/60 transition-all w-full sm:w-auto shadow-inner">
                <input
                  type="text"
                  placeholder="Enter arena code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                  className="bg-transparent px-3.5 py-2 text-white font-normal text-sm focus:outline-none w-full sm:w-44 placeholder:text-zinc-500"
                />
                <button
                  onClick={joinRoom}
                  className="bg-zinc-800/90 hover:bg-zinc-700 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs sm:text-sm cursor-pointer shrink-0 border border-white/10"
                >
                  Join <ChevronRight size={15} />
                </button>
              </div>
            </div>

            {/* Three Cohesive Metric Badges */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-3">
              {/* Stat 1: Registered Players */}
              <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3 shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                  <Users size={19} strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <span className="block text-xl sm:text-2xl font-display font-bold text-white tracking-tight tabular-nums">
                    {PLAYERS.length}+
                  </span>
                  <span className="text-[11px] sm:text-xs text-zinc-400 block truncate">Registered players</span>
                </div>
              </div>

              {/* Stat 2: Official Franchises */}
              <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3 shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                  <Shield size={19} strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <span className="block text-xl sm:text-2xl font-display font-bold text-white tracking-tight tabular-nums">
                    {TEAMS.length}
                  </span>
                  <span className="text-[11px] sm:text-xs text-zinc-400 block truncate">Official franchises</span>
                </div>
              </div>

              {/* Stat 3: Base Team Purse */}
              <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 sm:p-4 flex items-center gap-3 shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                  <span className="font-display font-bold text-sm text-orange-400">â‚¹</span>
                </div>
                <div className="min-w-0">
                  <span className="block text-xl sm:text-2xl font-display font-bold text-white tracking-tight tabular-nums">
                    â‚¹120 Cr
                  </span>
                  <span className="text-[11px] sm:text-xs text-zinc-400 block truncate">Base team purse</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Official IPL Franchises Showcase (Matches Reference) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="lg:col-span-5 relative"
          >
            {/* Ambient gold/orange glow behind panel */}
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-tr from-orange-500/15 via-transparent to-amber-500/10 blur-2xl -z-10 pointer-events-none" />

            <div className="bg-black/60 backdrop-blur-xl border border-white/15 rounded-3xl p-5 sm:p-6 shadow-2xl text-left relative">

              {/* Header: Title and Season Badge */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-base font-semibold text-white tracking-tight">Official IPL Franchises</h3>
                  <p className="text-xs text-zinc-400">10 teams participating in the 2026 auction</p>
                </div>
                <span className="text-[11px] font-medium px-2.5 py-1 bg-white/5 text-zinc-300 rounded-lg border border-white/10">
                  2026 Season
                </span>
              </div>

              {/* 5x2 Team Tiles Grid */}
              <div className="grid grid-cols-5 gap-2.5">
                {TEAMS.map((team) => (
                  <div
                    key={team.id}
                    title={team.name}
                    className="aspect-square bg-zinc-950/70 border border-white/10 hover:border-orange-500/50 hover:bg-zinc-900/90 rounded-2xl flex flex-col items-center justify-center p-2 transition-all duration-200 hover:-translate-y-0.5 group shadow-sm"
                  >
                    <div className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center">
                      <img
                        src={team.logo}
                        className="max-w-full max-h-full object-contain filter drop-shadow transition-transform group-hover:scale-110"
                        alt={team.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`)}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-zinc-300 group-hover:text-white mt-1 transition-colors tracking-tight">
                      {team.shortName}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ========================================================================= */}
        {/* 2. AVAILABLE AUCTION FORMATS (WITH VISUAL MOTIF BANNERS)                    */}
        {/* ========================================================================= */}
        <section className="space-y-6 text-left pt-4">
          <div className="flex items-end justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
                Available auction formats
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 font-normal">
                Choose the ruleset that fits your league's competitive style.
              </p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:text-orange-300 transition-colors"
            >
              Learn more about formats <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {auctionFormats.map((format) => (
              <div
                key={format.id}
                className="bg-black/60 backdrop-blur-md border border-white/10 hover:border-orange-500/40 rounded-2xl overflow-hidden transition-all duration-300 group flex flex-col justify-between shadow-xl hover:-translate-y-1"
              >
                {/* Visual Header Motif Banner */}
                <div className="relative h-28 w-full overflow-hidden bg-zinc-950">
                  <img
                    src={format.image}
                    alt={format.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* Subtle fade gradient overlay from image to card body */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />

                  {/* Format Category Tag Pill */}
                  <div className="absolute top-2.5 right-2.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border backdrop-blur-md ${format.tagColor}`}>
                      {format.tag}
                    </span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-5 pt-3 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-white tracking-tight group-hover:text-orange-400 transition-colors">
                      {format.name}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed font-normal">
                      {format.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3. HOW IT WORKS (CONNECTED TIMELINE WITH ORANGE PROGRESSION)              */}
        {/* ========================================================================= */}
        <section className="space-y-6 text-left pt-2">
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
              How it works
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 font-normal">
              Four steps from room creation to <span className="text-emerald-400 font-medium">finalizing your squad</span>.
            </p>
          </div>

          <div className="relative">
            {/* Connected horizontal dotted / dashed timeline on large screens */}
            <div className="hidden lg:block absolute top-4 left-10 right-10 h-px border-t border-dashed border-zinc-700/60 -z-0" />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 relative z-10">
              {steps.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="flex flex-col text-left space-y-3">
                    <div className="flex items-center gap-3">
                      {/* Step Number Circle */}
                      <div className="w-8 h-8 rounded-full bg-orange-500 text-zinc-950 flex items-center justify-center font-display text-xs font-bold shadow-md shrink-0">
                        {item.step}
                      </div>

                      {/* Icon motif */}
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300">
                        <Icon size={15} strokeWidth={2} />
                      </div>

                      {/* Small arrow separator for desktop timeline flow */}
                      {idx < 3 && (
                        <ChevronRight size={14} className="text-zinc-600 hidden lg:block ml-auto mr-2" />
                      )}
                    </div>

                    <div className="space-y-1 pt-1">
                      <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
                        {item.title}
                      </h3>
                      <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. AUCTION BASICS (COMPACT SPECIFICATION PANEL)                           */}
        {/* ========================================================================= */}
        <section className="space-y-6 text-left pt-2">
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
              Auction basics
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 font-normal">
              Core mechanics and constraints enforced during the session.
            </p>
          </div>

          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 sm:p-7 shadow-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 text-left">
              {rules.map((rule) => (
                <div key={rule.step} className="flex items-start gap-3.5">
                  <span className="w-6 h-6 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30 flex items-center justify-center font-display text-xs font-bold shrink-0 mt-0.5">
                    {rule.step}
                  </span>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-zinc-200 tracking-tight">
                      {rule.title}
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed font-normal">
                      {rule.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </div>

      {/* ========================================================================= */}
      {/* 5. CREATE ROOM MODAL (PRESERVED LOGIC)                                    */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4 sm:p-6 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.97, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-950 border border-white/15 p-6 sm:p-8 rounded-3xl w-full max-w-lg shadow-2xl relative"
            >
              <button
                onClick={() => setIsCreating(false)}
                className="absolute top-5 right-5 p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer border border-white/10"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>

              <h2 className="text-xl sm:text-2xl font-display font-semibold text-white mb-6 tracking-tight text-left">
                Create auction room
              </h2>

              <div className="space-y-5">
                <div className="text-left">
                  <label className="block text-xs font-medium text-zinc-400 mb-2">Arena name</label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Mega Auction 2026"
                    className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-white font-normal text-sm focus:outline-none focus:border-orange-500/80 transition-colors"
                  />
                </div>

                <div className="space-y-2 text-left">
                  <label className="block text-xs font-medium text-zinc-400">Auction mode</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['open', 'blind', 'draft', 'mega'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setCreateAuctionType(type)}
                        className={`py-2.5 rounded-xl text-xs font-medium capitalize transition-colors cursor-pointer border ${createAuctionType === type ? 'bg-orange-500 text-zinc-950 border-orange-500 font-semibold shadow-md' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white hover:bg-zinc-850'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {createAuctionType !== 'draft' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-left">
                      <label className="block text-xs font-medium text-zinc-400 mb-2">Total purse (â‚¹ Cr)</label>
                      <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-xl p-1.5">
                        <button
                          onClick={() => setCustomPurse(prev => Math.max(80, prev - 5))}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors cursor-pointer text-sm"
                        >
                          -
                        </button>
                        <span className="text-base font-semibold font-mono tabular-nums text-white w-12 text-center">{customPurse}</span>
                        <button
                          onClick={() => setCustomPurse(prev => Math.min(200, prev + 5))}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors cursor-pointer text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="text-left">
                      <label className="block text-xs font-medium text-zinc-400 mb-2">Bid timer (sec)</label>
                      <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-xl p-1.5">
                        <button
                          onClick={() => setCustomBidTime(prev => Math.max(5, prev - 1))}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors cursor-pointer text-sm"
                        >
                          -
                        </button>
                        <span className="text-base font-semibold font-mono tabular-nums text-white w-12 text-center">{customBidTime}</span>
                        <button
                          onClick={() => setCustomBidTime(prev => Math.min(30, prev + 1))}
                          className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors cursor-pointer text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-left">
                    <label className="block text-xs font-medium text-zinc-400 mb-2">Draft limit (rounds)</label>
                    <div className="flex items-center justify-between bg-zinc-900/80 border border-zinc-800 rounded-xl p-1.5 max-w-[200px]">
                      <button
                        onClick={() => setCustomDraftLimit(prev => Math.max(5, prev - 1))}
                        className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors cursor-pointer text-sm"
                      >
                        -
                      </button>
                      <span className="text-base font-semibold font-mono tabular-nums text-white w-12 text-center">{customDraftLimit}</span>
                      <button
                        onClick={() => setCustomDraftLimit(prev => Math.min(20, prev + 1))}
                        className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors cursor-pointer text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setIsCreating(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-xl transition-colors cursor-pointer text-sm border border-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createRoom}
                    className="flex-1 bg-orange-500 hover:bg-orange-400 text-zinc-950 font-semibold py-2.5 rounded-xl transition-colors cursor-pointer text-sm shadow-md"
                  >
                    Create room
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

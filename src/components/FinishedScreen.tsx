import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Sparkles, RefreshCw, TrendingUp, Zap, Star, Download,
  Award, Shield, Users, CheckCircle2, ChevronRight, Coins,
  MessageSquare, BarChart3, HelpCircle, Activity, Scale, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { generateAuctionSummary, analyzeDraftTeams } from '../services/ai';
import { AuctionRoom, Player } from '../types';
import { TEAMS } from '../data/teams';
import { GlassCard } from './GlassCard';
import { SquadPowerAnalysis } from './SquadPowerAnalysis';

export const FinishedScreen = ({ room, user, socket }: { room: AuctionRoom, user: any, socket: any }) => {
  const navigate = useNavigate();

  if (!room || !room.teams || !room.players) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 font-medium text-sm font-display animate-pulse">
        Syncing results...
      </div>
    );
  }

  const participants = Object.values(room.teams);
  const [aiSummary, setAiSummary] = useState<string>(room.aiSummary || 'Analyzing the auction results...');
  const [draftAnalysis, setDraftAnalysis] = useState<{
    rankings: string[];
    bestTeamReason: string;
    darkHorse: { name: string; reason: string };
  } | null>(room.draftAnalysis || null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [highlights, setHighlights] = useState<{ steal: Player | null, splurge: Player | null }>({ steal: null, splurge: null });

  // Interactive navigation & state
  const [activeTab, setActiveTab] = useState<'podium' | 'comparison' | 'awards' | 'analytics'>('podium');
  const [selectedAnalysisUserId, setSelectedAnalysisUserId] = useState<string>(user?.uid || (participants[0]?.uid || ''));
  const [compareTeamA, setCompareTeamA] = useState<string>(participants[0]?.uid || '');
  const [compareTeamB, setCompareTeamB] = useState<string>(participants[1]?.uid || participants[0]?.uid || '');

  // Dynamic Rating Calculator
  const getTeamStats = (squad: Player[]) => {
    const roles = {
      'Wicket-keeper': squad.filter(p => p.role === 'Wicket-keeper'),
      'Batters': squad.filter(p => ['Top Order', 'Middle Order', 'Finisher'].includes(p.role)),
      'All-rounders': squad.filter(p => p.role === 'All-rounder'),
      'Bowlers': squad.filter(p => ['Pacer', 'Spinner'].includes(p.role))
    };

    const getScore = (p: Player) => (p.stats?.runs || 0) + (p.stats?.wickets || 0) * 20;

    const battingScore = Math.min(100, Math.round(
      (roles['Batters'].length * 15 + roles['All-rounders'].length * 10 + roles['Wicket-keeper'].length * 10) * 0.8 +
      (roles['Batters'].slice(0, 4).reduce((sum, p) => sum + getScore(p), 0) / 25)
    )) || 50;

    const bowlingScore = Math.min(100, Math.round(
      (roles['Bowlers'].length * 20 + roles['All-rounders'].length * 10) * 0.8 +
      (roles['Bowlers'].slice(0, 4).reduce((sum, p) => sum + getScore(p), 0) / 25)
    )) || 50;

    const balanceScore = Math.min(100, Math.round(
      (roles['All-rounders'].length * 25 + Math.min(3, roles['Wicket-keeper'].length) * 15 + Math.min(5, roles['Batters'].length) * 5 + Math.min(5, roles['Bowlers'].length) * 5)
    )) || 50;

    const overall = Math.round((battingScore + bowlingScore + balanceScore) / 3);

    return {
      batting: battingScore,
      bowling: bowlingScore,
      balance: balanceScore,
      overall: overall
    };
  };

  // Process and sort participants by overall dynamic rating
  const ratedParticipants = participants.map(p => {
    const stats = getTeamStats(p.squad);
    const teamDetail = TEAMS.find(t => t.id === p.teamId);
    return {
      ...p,
      stats,
      teamDetail
    };
  }).sort((a, b) => b.stats.overall - a.stats.overall);

  useEffect(() => {
    const fetchSummary = async () => {
      if (room.hostId !== user?.uid) return;
      if (room.aiSummary && (room.auctionType !== 'draft' || room.draftAnalysis)) return;

      setIsAnalyzing(true);
      try {
        if (room.auctionType === 'draft') {
          const [summary, analysis] = await Promise.all([
            generateAuctionSummary(room.history, participants),
            analyzeDraftTeams(participants)
          ]);
          setAiSummary(summary);
          setDraftAnalysis(analysis);

          socket?.emit('update-ai-summary', { roomId: room.id, summary });
          socket?.emit('update-draft-analysis', { roomId: room.id, analysis });
        } else {
          const summary = await generateAuctionSummary(room.history, participants);
          setAiSummary(summary);
          socket?.emit('update-ai-summary', { roomId: room.id, summary });
        }
      } catch (error) {
        console.error("AI Analysis Error:", error);
      } finally {
        setIsAnalyzing(false);
      }
    };

    if (room.aiSummary) setAiSummary(room.aiSummary);
    if (room.draftAnalysis) setDraftAnalysis(room.draftAnalysis);

    // Calculate highlights (splurge/steal)
    let splurge: Player | null = null;
    let maxPrice = 0;
    let steal: Player | null = null;
    let maxValueRatio = 0;

    room.history.forEach(h => {
      const player = room.players.find(p => p.id === h.playerId);
      if (!player) return;

      if (h.price > maxPrice) {
        maxPrice = h.price;
        splurge = { ...player, soldPrice: h.price };
      }

      const stats = player.stats || {};
      const value = (stats.runs || 0) + (stats.wickets || 0) * 20;
      const price = h.price || 0.01;
      const ratio = value / price;
      if (ratio > maxValueRatio) {
        maxValueRatio = ratio;
        steal = { ...player, soldPrice: h.price };
      }
    });

    setHighlights({ steal, splurge });
    fetchSummary();
  }, [room.aiSummary, room.draftAnalysis]);

  // Podiums positions mapping
  const podiumOrder = [];
  if (ratedParticipants[1]) podiumOrder.push({ ...ratedParticipants[1], place: 2 }); // 2nd on left
  if (ratedParticipants[0]) podiumOrder.push({ ...ratedParticipants[0], place: 1 }); // 1st in center
  if (ratedParticipants[2]) podiumOrder.push({ ...ratedParticipants[2], place: 3 }); // 3rd on right

  return (
    <div className="relative min-h-screen bg-zinc-950 text-white overflow-hidden pb-32">
      {/* Stadium Atmospheric Background */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center bg-no-repeat opacity-65"
        style={{
          backgroundImage: "url('/images/stadium_bg.jpg')",
          backgroundAttachment: 'fixed',
        }}
      />
      {/* Moderate dark overlay to balance stadium visibility with content contrast */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-gradient-to-b from-zinc-950/75 via-zinc-950/60 to-zinc-950/90"
      />
      {/* Edge vignette framing */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse 85% 65% at 50% 25%, transparent 20%, rgba(9,9,11,0.6) 70%, rgba(9,9,11,0.92) 100%)'
        }}
      />

      <div className="relative z-10 pt-16 px-4 md:px-8 max-w-7xl mx-auto">

        {/* PRESENTATION HEADER */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold uppercase tracking-wider rounded-full mb-4"
          >
            <Trophy size={13} />
            Season Review & Final Standings
          </motion.div>
          <motion.h1
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold font-display text-white tracking-tight mb-2"
          >
            Auction Summary
          </motion.h1>
          <motion.p
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="text-zinc-400 text-sm sm:text-base font-normal max-w-2xl mx-auto"
          >
            The auction has concluded. Review final squad rosters, market valuations, and team balance.
          </motion.p>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex justify-center mb-10 border-b border-zinc-800 pb-px">
          <div className="flex items-center gap-1.5 bg-zinc-900/80 p-1.5 rounded-2xl border border-zinc-800 overflow-x-auto max-w-full">
            {[
              { id: 'podium', label: 'Podium & Standings', icon: Trophy },
              { id: 'comparison', label: 'Squad Comparison', icon: Scale },
              { id: 'awards', label: 'Market Highlights', icon: Award },
              { id: 'analytics', label: 'Squad Analytics', icon: BarChart3 }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-orange-500 text-black font-semibold shadow-md'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-black' : 'text-zinc-400'} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* TABS VIEWPORT */}
        <AnimatePresence mode="wait">
          {activeTab === 'podium' && (
            <motion.div
              key="podium"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-12"
            >
              {/* CHAMPIONSHIP PODIUM GRAPHIC */}
              <div className="relative max-w-3xl mx-auto pt-8 pb-4 px-4">
                <div className="grid grid-cols-3 gap-3 md:gap-5 items-end relative z-10">
                  {podiumOrder.map((team, index) => {
                    const isWinner = team.place === 1;
                    const isSilver = team.place === 2;
                    const isBronze = team.place === 3;

                    return (
                      <motion.div
                        key={team.uid}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.4 }}
                        className="flex flex-col items-center"
                      >
                        {/* Manager Avatar with Team Badge Overlay */}
                        <div className="relative mb-3">
                          {isWinner && (
                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-20 text-amber-400">
                              <Trophy size={22} />
                            </div>
                          )}
                          <div className={`rounded-full p-1 relative z-10 ${
                            isWinner ? 'bg-gradient-to-tr from-amber-400 to-orange-500 ring-2 ring-orange-500/30' :
                            isSilver ? 'bg-zinc-600 ring-2 ring-zinc-700' :
                            'bg-amber-800 ring-2 ring-amber-900'
                          }`}>
                            <img
                              src={team.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${team.uid}`}
                              className="w-14 h-14 sm:w-20 sm:h-20 rounded-full object-cover bg-zinc-950 border border-black"
                              alt={team.displayName}
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          {/* Team Logo Overlay */}
                          <div className="absolute -bottom-1 -right-1 z-20 w-7 h-7 sm:w-9 sm:h-9 bg-zinc-950 border border-zinc-800 p-1 rounded-lg shadow-md">
                            <img
                              src={team.teamDetail?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${team.teamDetail?.shortName}`}
                              className="w-full h-full object-contain"
                              alt="Team Logo"
                              referrerPolicy="no-referrer"
                              onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.teamDetail?.shortName}`)}
                            />
                          </div>
                        </div>

                        {/* Standings Label */}
                        <div className="text-center mb-2">
                          <h3 className="text-zinc-100 font-semibold text-xs sm:text-sm leading-tight truncate max-w-[100px] sm:max-w-[160px] font-display">
                            {team.displayName}
                          </h3>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            {team.teamDetail?.shortName || 'Team'}
                          </p>
                        </div>

                        {/* Podium Pedestal */}
                        <div className={`w-full rounded-t-2xl flex flex-col items-center justify-between py-5 px-3 border-x border-t relative overflow-hidden transition-all duration-300 ${
                          isWinner
                            ? 'h-[130px] sm:h-[160px] bg-gradient-to-t from-orange-500/10 to-transparent border-orange-500/30'
                            : isSilver
                              ? 'h-[100px] sm:h-[130px] bg-gradient-to-t from-zinc-800/30 to-transparent border-zinc-700/60'
                              : 'h-[80px] sm:h-[105px] bg-gradient-to-t from-amber-900/20 to-transparent border-amber-900/40'
                        }`}>
                          {/* Rank Number */}
                          <span className={`text-3xl sm:text-4xl font-bold font-mono tabular-nums ${
                            isWinner ? 'text-amber-400' :
                            isSilver ? 'text-zinc-400' :
                            'text-amber-600'
                          }`}>
                            {team.place}
                          </span>

                          {/* Dynamic Rating Capsule */}
                          <div className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono tabular-nums border bg-zinc-900/80 border-zinc-800 text-zinc-300">
                            Rating: {team.stats.overall}%
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="h-1 bg-zinc-800 rounded-full relative z-0 -mt-0.5" />
              </div>

              {/* FINAL LEAGUE STANDINGS TABLE */}
              <GlassCard className="p-6 md:p-8 border-zinc-800 text-left">
                <div className="flex items-center gap-2.5 mb-5">
                  <TrendingUp className="text-orange-400" size={18} />
                  <div>
                    <h2 className="text-base font-semibold text-white font-display">Final Standings</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">Overall rating and team statistics across all franchises</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-left">
                        <th className="py-3 px-3 w-12 text-center">Rank</th>
                        <th className="py-3 px-3">Franchise</th>
                        <th className="py-3 px-3">Manager</th>
                        <th className="py-3 px-3 text-center">Squad Size</th>
                        {room.auctionType !== 'draft' && <th className="py-3 px-3 text-right">Remaining Purse</th>}
                        <th className="py-3 px-3 text-center w-20">Batting</th>
                        <th className="py-3 px-3 text-center w-20">Bowling</th>
                        <th className="py-3 px-3 text-center w-28">Overall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {ratedParticipants.map((team, index) => {
                        const isCurrentUser = team.uid === user?.uid;
                        return (
                          <tr
                            key={team.uid}
                            className={`transition-colors text-xs ${
                              isCurrentUser
                                ? 'bg-orange-500/5'
                                : 'hover:bg-zinc-900/40'
                            }`}
                          >
                            {/* Rank Column */}
                            <td className="py-3.5 px-3 font-mono tabular-nums text-center text-zinc-400 font-medium">
                              {index + 1}
                            </td>

                            {/* Franchise Details */}
                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={team.teamDetail?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${team.teamDetail?.shortName}`}
                                  className="w-7 h-7 object-contain"
                                  alt=""
                                  referrerPolicy="no-referrer"
                                  onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.teamDetail?.shortName}`)}
                                />
                                <div>
                                  <span className="font-semibold text-zinc-100 block font-display">
                                    {team.teamDetail?.name || 'Draft Team'}
                                  </span>
                                  <span className="text-[10px] text-zinc-400 uppercase font-mono">
                                    {team.teamDetail?.shortName}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Manager Details */}
                            <td className="py-3.5 px-3">
                              <span className="font-medium text-zinc-300">
                                {team.displayName}
                                {isCurrentUser && (
                                  <span className="text-[10px] font-semibold text-orange-400 ml-2 border border-orange-500/20 px-1.5 py-0.5 rounded-full bg-orange-500/10">
                                    You
                                  </span>
                                )}
                              </span>
                            </td>

                            {/* Squad Size */}
                            <td className="py-3.5 px-3 text-center font-mono tabular-nums text-zinc-200">
                              {team.squad.length} <span className="text-zinc-500 font-normal text-[11px]">players</span>
                            </td>

                            {/* Purse Remaining */}
                            {room.auctionType !== 'draft' && (
                              <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-zinc-200">
                                ₹{team.budget.toFixed(2)} Cr
                              </td>
                            )}

                            {/* Batting Rating */}
                            <td className="py-3.5 px-3 text-center font-mono tabular-nums font-semibold text-amber-400">
                              {team.stats.batting}
                            </td>

                            {/* Bowling Rating */}
                            <td className="py-3.5 px-3 text-center font-mono tabular-nums font-semibold text-blue-400">
                              {team.stats.bowling}
                            </td>

                            {/* Overall Power Rating */}
                            <td className="py-3.5 px-3">
                              <div className="flex items-center gap-2 justify-center">
                                <div className="w-14 bg-zinc-800 h-1.5 rounded-full overflow-hidden shrink-0">
                                  <div
                                    className="h-full bg-orange-500 rounded-full"
                                    style={{ width: `${team.stats.overall}%` }}
                                  />
                                </div>
                                <span className="font-mono tabular-nums font-semibold text-zinc-200 text-xs">
                                  {team.stats.overall}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {activeTab === 'comparison' && (
            <motion.div
              key="comparison"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-8 text-left"
            >
              {/* SQUAD COMPARISON SELECTION PANEL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800">
                {/* TEAM A SELECTOR */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-400">Franchise A</label>
                  <div className="relative">
                    <select
                      value={compareTeamA}
                      onChange={(e) => setCompareTeamA(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 text-xs font-semibold text-zinc-100 outline-none cursor-pointer appearance-none shadow-sm focus:border-orange-500/50 transition-colors"
                    >
                      {participants.map(p => {
                        const teamDetail = TEAMS.find(t => t.id === p.teamId);
                        return (
                          <option key={p.uid} value={p.uid} className="bg-zinc-900 text-zinc-100">
                            {teamDetail?.name || p.teamId} ({p.displayName})
                          </option>
                        );
                      })}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
                      <ChevronRight size={16} className="rotate-90" />
                    </div>
                  </div>
                </div>

                {/* TEAM B SELECTOR */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-zinc-400">Franchise B</label>
                  <div className="relative">
                    <select
                      value={compareTeamB}
                      onChange={(e) => setCompareTeamB(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3.5 text-xs font-semibold text-zinc-100 outline-none cursor-pointer appearance-none shadow-sm focus:border-orange-500/50 transition-colors"
                    >
                      {participants.map(p => {
                        const teamDetail = TEAMS.find(t => t.id === p.teamId);
                        return (
                          <option key={p.uid} value={p.uid} className="bg-zinc-900 text-zinc-100">
                            {teamDetail?.name || p.teamId} ({p.displayName})
                          </option>
                        );
                      })}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
                      <ChevronRight size={16} className="rotate-90" />
                    </div>
                  </div>
                </div>
              </div>

              {/* COMPARATIVE METRICS RADAR/BARS */}
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 md:p-8 space-y-6">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider text-center mb-2">Head-to-head comparison</h3>

                {(() => {
                  const tA = participants.find(p => p.uid === compareTeamA);
                  const tB = participants.find(p => p.uid === compareTeamB);
                  if (!tA || !tB) return null;

                  const sA = getTeamStats(tA.squad);
                  const sB = getTeamStats(tB.squad);

                  const comparisonMetrics = [
                    { label: 'Overall Rating', valA: sA.overall, valB: sB.overall, colorClass: 'bg-orange-500' },
                    { label: 'Batting power', valA: sA.batting, valB: sB.batting, colorClass: 'bg-amber-500' },
                    { label: 'Bowling power', valA: sA.bowling, valB: sB.bowling, colorClass: 'bg-blue-500' },
                    { label: 'Squad balance', valA: sA.balance, valB: sB.balance, colorClass: 'bg-emerald-500' },
                    { label: 'Roster size', valA: tA.squad.length, valB: tB.squad.length, colorClass: 'bg-purple-500', isCount: true }
                  ];

                  return (
                    <div className="space-y-6">
                      {comparisonMetrics.map((metric, i) => {
                        const maxVal = metric.isCount ? 15 : 100;
                        const pctA = Math.round((metric.valA / maxVal) * 100);
                        const pctB = Math.round((metric.valB / maxVal) * 100);

                        return (
                          <div key={i} className="grid grid-cols-12 gap-4 items-center">
                            {/* Team A value */}
                            <div className="col-span-3 text-right">
                              <span className="font-mono tabular-nums text-sm font-semibold text-zinc-100">{metric.valA}</span>
                              {!metric.isCount && <span className="text-xs text-zinc-500 ml-0.5">%</span>}
                            </div>

                            {/* Comparison Slider */}
                            <div className="col-span-6">
                              <p className="text-xs font-medium text-zinc-400 text-center mb-1.5">{metric.label}</p>
                              <div className="flex h-2.5 bg-zinc-950/80 rounded-full overflow-hidden border border-zinc-800">
                                {/* Team A bar (extends from center to left) */}
                                <div className="w-1/2 flex justify-end pr-px bg-zinc-900/40">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pctA}%` }}
                                    className={`h-full rounded-l-full ${metric.colorClass} opacity-85`}
                                  />
                                </div>
                                {/* Center Divider */}
                                <div className="w-0.5 bg-zinc-800 z-10" />
                                {/* Team B bar (extends from center to right) */}
                                <div className="w-1/2 flex justify-start pl-px bg-zinc-900/40">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pctB}%` }}
                                    className={`h-full rounded-r-full ${metric.colorClass}`}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Team B value */}
                            <div className="col-span-3 text-left">
                              <span className="font-mono tabular-nums text-sm font-semibold text-zinc-100">{metric.valB}</span>
                              {!metric.isCount && <span className="text-xs text-zinc-500 ml-0.5">%</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* SIDE-BY-SIDE ROSTER SQUADS VIEW */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ROSTER A */}
                {(() => {
                  const tA = participants.find(p => p.uid === compareTeamA);
                  const teamDetail = TEAMS.find(t => t && t.id === tA?.teamId);
                  return (
                    <GlassCard className="p-6 text-left">
                      <div className="flex items-center gap-3.5 mb-5 border-b border-zinc-800/80 pb-4">
                        <img
                          src={teamDetail?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamDetail?.shortName}`}
                          className="w-10 h-10 object-contain"
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamDetail?.shortName}`)}
                        />
                        <div>
                          <h4 className="font-display text-base font-semibold text-zinc-100 leading-none">{teamDetail?.name || 'Franchise A'}</h4>
                          <span className="text-xs text-zinc-500 mt-1 block">Manager: {tA?.displayName}</span>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
                        {tA?.squad.length === 0 ? (
                          <p className="text-zinc-500 text-xs italic py-8 text-center">Roster is empty.</p>
                        ) : (
                          tA?.squad.map(player => (
                            <div key={player.id} className="flex items-center justify-between p-2.5 bg-zinc-900/60 hover:bg-zinc-900 rounded-xl border border-zinc-800/60 transition-colors">
                              <div className="flex items-center gap-3">
                                <img
                                  src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`}
                                  className="w-8 h-8 rounded-lg object-cover"
                                  alt=""
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <span className="font-medium text-zinc-100 text-xs block leading-tight">{player.name}</span>
                                  <span className="text-[11px] text-zinc-500">{player.role}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-mono tabular-nums text-xs font-semibold text-orange-400">
                                  {room.auctionType === 'draft' ? 'Drafted' : `₹${(player.soldPrice || player.basePrice)?.toFixed(2)} Cr`}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </GlassCard>
                  );
                })()}

                {/* ROSTER B */}
                {(() => {
                  const tB = participants.find(p => p.uid === compareTeamB);
                  const teamDetail = TEAMS.find(t => t && t.id === tB?.teamId);
                  return (
                    <GlassCard className="p-6 text-left">
                      <div className="flex items-center gap-3.5 mb-5 border-b border-zinc-800/80 pb-4">
                        <img
                          src={teamDetail?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamDetail?.shortName}`}
                          className="w-10 h-10 object-contain"
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamDetail?.shortName}`)}
                        />
                        <div>
                          <h4 className="font-display text-base font-semibold text-zinc-100 leading-none">{teamDetail?.name || 'Franchise B'}</h4>
                          <span className="text-xs text-zinc-500 mt-1 block">Manager: {tB?.displayName}</span>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-2">
                        {tB?.squad.length === 0 ? (
                          <p className="text-zinc-500 text-xs italic py-8 text-center">Roster is empty.</p>
                        ) : (
                          tB?.squad.map(player => (
                            <div key={player.id} className="flex items-center justify-between p-2.5 bg-zinc-900/60 hover:bg-zinc-900 rounded-xl border border-zinc-800/60 transition-colors">
                              <div className="flex items-center gap-3">
                                <img
                                  src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`}
                                  className="w-8 h-8 rounded-lg object-cover"
                                  alt=""
                                  referrerPolicy="no-referrer"
                                />
                                <div>
                                  <span className="font-medium text-zinc-100 text-xs block leading-tight">{player.name}</span>
                                  <span className="text-[11px] text-zinc-500">{player.role}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-mono tabular-nums text-xs font-semibold text-orange-400">
                                  {room.auctionType === 'draft' ? 'Drafted' : `₹${(player.soldPrice || player.basePrice)?.toFixed(2)} Cr`}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </GlassCard>
                  );
                })()}
              </div>
            </motion.div>
          )}

          {activeTab === 'awards' && (
            <motion.div
              key="awards"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* AWARD TILES FOR SPLURGE AND STEAL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                {/* Splurge Award */}
                <div className="p-6 rounded-2xl bg-zinc-900/80 border border-amber-500/20 shadow-sm relative overflow-hidden">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20">
                      <Star size={16} className="text-amber-400" />
                    </div>
                    <span className="text-xs font-semibold text-amber-400 tracking-wider uppercase">Golden gavel award</span>
                  </div>

                  {highlights.splurge ? (
                    <div className="flex flex-col sm:flex-row items-center gap-5 relative z-10">
                      <img
                        src={highlights.splurge.image || `https://api.dicebear.com/7.x/initials/svg?seed=${highlights.splurge.name}`}
                        className="w-24 h-24 rounded-xl object-cover border border-zinc-800 bg-zinc-900"
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                      <div className="space-y-1.5 text-center sm:text-left">
                        <span className="text-xs font-medium bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full inline-block">
                          Most expensive signing
                        </span>
                        <h4 className="font-display text-2xl font-semibold text-zinc-100 tracking-tight leading-none mt-1">
                          {highlights.splurge.name}
                        </h4>
                        <div className="flex items-center justify-center sm:justify-start gap-1">
                          <Coins className="text-amber-400" size={15} />
                          <p className="font-mono tabular-nums text-xl font-bold text-amber-400 tracking-tight">
                            ₹{highlights.splurge.soldPrice?.toFixed(2)} Cr
                          </p>
                        </div>
                        <p className="text-xs text-zinc-400">
                          Role: {highlights.splurge.role}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-xs italic py-8 text-center sm:text-left">No splurge recorded yet.</p>
                  )}
                </div>

                {/* Steal Award */}
                <div className="p-6 rounded-2xl bg-zinc-900/80 border border-emerald-500/20 shadow-sm relative overflow-hidden">
                  <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20">
                      <TrendingUp size={16} className="text-emerald-400" />
                    </div>
                    <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">Value master award</span>
                  </div>

                  {highlights.steal ? (
                    <div className="flex flex-col sm:flex-row items-center gap-5 relative z-10">
                      <img
                        src={highlights.steal.image || `https://api.dicebear.com/7.x/initials/svg?seed=${highlights.steal.name}`}
                        className="w-24 h-24 rounded-xl object-cover border border-zinc-800 bg-zinc-900"
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                      <div className="space-y-1.5 text-center sm:text-left">
                        <span className="text-xs font-medium bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full inline-block">
                          Top value signing
                        </span>
                        <h4 className="font-display text-2xl font-semibold text-zinc-100 tracking-tight leading-none mt-1">
                          {highlights.steal.name}
                        </h4>
                        <div className="flex items-center justify-center sm:justify-start gap-1">
                          <Coins className="text-emerald-400" size={15} />
                          <p className="font-mono tabular-nums text-xl font-bold text-emerald-400 tracking-tight">
                            ₹{highlights.steal.soldPrice?.toFixed(2)} Cr
                          </p>
                        </div>
                        <p className="text-xs text-zinc-400">
                          Base price: ₹{highlights.steal.basePrice} Cr Â· Role: {highlights.steal.role}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-xs italic py-8 text-center sm:text-left">No steal recorded yet.</p>
                  )}
                </div>
              </div>

              {/* RECENT REVOLUTION SQUAD HEADLINES */}
              <GlassCard className="p-6 md:p-8 text-left">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                    <Activity className="text-blue-400" size={16} />
                  </div>
                  <div>
                    <h2 className="font-display text-base font-semibold text-zinc-100">Auction transactions</h2>
                    <p className="text-xs text-zinc-400">Chronological log of finalized signings from this session</p>
                  </div>
                </div>

                <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-2">
                  {room.history.length === 0 ? (
                    <p className="text-zinc-500 text-xs italic py-8 text-center">No transactions recorded in the session history.</p>
                  ) : (
                    room.history.map((h, index) => {
                      const player = room.players.find(p => p.id === h.playerId);
                      const buyer = participants.find(p => p.uid === h.teamId);
                      const teamDetail = TEAMS.find(t => t.id === buyer?.teamId);
                      return (
                        <div key={index} className="flex items-center justify-between p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl hover:bg-zinc-900 transition-colors text-xs">
                          <div className="flex items-center gap-3">
                            <span className="font-mono tabular-nums text-zinc-500 text-xs">#{room.history.length - index}</span>
                            <img
                              src={player?.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player?.name}`}
                              className="w-8 h-8 rounded-lg object-cover bg-zinc-900 border border-zinc-800"
                              alt=""
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <span className="font-medium text-zinc-100 block leading-tight">{player?.name}</span>
                              <span className="text-[11px] text-zinc-500">{player?.role}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right hidden sm:block">
                              <span className="text-[11px] text-zinc-400 block">Acquired by</span>
                              <span className="text-xs font-semibold text-orange-400">{teamDetail?.shortName || buyer?.displayName}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono tabular-nums text-xs font-semibold text-zinc-100">₹{h.price.toFixed(2)} Cr</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-8 text-left"
            >
              {/* TACTICAL ANALYSIS CONTAINER */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* AI Analyst & Draft Rankings Column */}
                <div className="lg:col-span-5 space-y-6">
                  {/* AI INSIGHTS CARD */}
                  <GlassCard className="p-6 md:p-8 border-orange-500/20 bg-orange-500/[0.02]">
                    <div className="flex items-center gap-3 mb-5">
                      <Sparkles className="text-orange-400" size={18} />
                      <h2 className="font-display text-base font-semibold text-zinc-100">AI auction analyst</h2>
                    </div>

                    <div className="text-xs leading-relaxed text-zinc-300 italic">
                      {(isAnalyzing || (aiSummary === 'Analyzing the auction results...' && room.hostId !== user?.uid)) ? (
                        <div className="flex items-center gap-3 text-zinc-500 animate-pulse py-4">
                          <RefreshCw className="animate-spin text-orange-400" size={16} />
                          <span className="italic">Reviewing the tactical selections...</span>
                        </div>
                      ) : (
                        <p>"{aiSummary}"</p>
                      )}
                    </div>
                  </GlassCard>

                  {/* Draft Evaluation / Projected Winner */}
                  {room.auctionType === 'draft' && (isAnalyzing || draftAnalysis) && (
                    <GlassCard className="p-6 border-blue-500/15 bg-blue-500/[0.01] space-y-5">
                      <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
                        <Trophy className="text-blue-400" size={18} />
                        <div>
                          <h3 className="font-display text-sm font-semibold text-zinc-100 leading-none">Draft power analysis</h3>
                          <span className="text-xs text-zinc-400 block mt-1">AI evaluation summary</span>
                        </div>
                      </div>

                      {isAnalyzing && !draftAnalysis ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3 text-zinc-500">
                          <RefreshCw className="animate-spin text-blue-400" size={20} />
                          <span className="text-xs italic animate-pulse">Running model algorithms...</span>
                        </div>
                      ) : draftAnalysis ? (
                        <div className="space-y-4">
                          {/* Why Top */}
                          <div className="space-y-1">
                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Key strengths</span>
                            <p className="text-xs text-zinc-300 italic leading-relaxed bg-zinc-900/60 p-3 border border-zinc-800 rounded-xl">
                              "{draftAnalysis.bestTeamReason}"
                            </p>
                          </div>

                          {/* Dark Horse */}
                          <div className="space-y-1 p-3.5 bg-purple-500/5 rounded-xl border border-purple-500/15">
                            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider block mb-0.5">Dark horse</span>
                            <h4 className="text-xs font-semibold text-zinc-100">{draftAnalysis.darkHorse.name}</h4>
                            <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                              {draftAnalysis.darkHorse.reason}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </GlassCard>
                  )}
                </div>

                {/* SQUAD POWER ANALYSIS COMPONENT (INTERACTIVE SELECTOR) */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-zinc-900/60 p-4 rounded-xl border border-zinc-800">
                    <div>
                      <h3 className="font-display text-base font-semibold text-zinc-100 leading-none">Squad power breakdown</h3>
                      <p className="text-xs text-zinc-400 mt-1">Detailed ratings and estimated best XI per franchise</p>
                    </div>

                    {/* Interactive Dropdown to pick whose squad to evaluate */}
                    <div className="relative shrink-0 w-full sm:w-[220px]">
                      <select
                        value={selectedAnalysisUserId}
                        onChange={(e) => setSelectedAnalysisUserId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs font-medium text-zinc-200 outline-none cursor-pointer appearance-none shadow-sm focus:border-orange-500"
                      >
                        {participants.map(p => (
                          <option key={p.uid} value={p.uid} className="bg-zinc-900 text-zinc-200">
                            {p.displayName} ({TEAMS.find(t => t.id === p.teamId)?.shortName || 'Roster'})
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-zinc-400">
                        <ChevronRight size={14} className="rotate-90" />
                      </div>
                    </div>
                  </div>

                  <SquadPowerAnalysis
                    squad={room.teams[selectedAnalysisUserId]?.squad || []}
                    room={room}
                    userId={selectedAnalysisUserId}
                  />
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* BOTTOM GLOBAL ACTION PANEL */}
        <div className="mt-16 flex flex-col sm:flex-row justify-center items-center gap-4 border-t border-zinc-800/80 pt-8">
          <button
            onClick={() => navigate('/')}
            className="w-full sm:w-auto bg-white hover:bg-zinc-200 text-zinc-900 font-semibold py-3 px-8 rounded-xl text-xs transition-all duration-200 shadow-sm cursor-pointer active:scale-[0.98]"
          >
            Back to lobby
          </button>
          <button
            onClick={() => {
              try {
                const exportData = participants.map(p => {
                  const teamDetail = TEAMS.find(t => t.id === p.teamId);
                  return {
                    manager: p.displayName,
                    team: teamDetail?.name || p.teamId,
                    remainingBudgetCr: p.budget,
                    squad: p.squad.map(player => ({
                      name: player.name,
                      role: player.role,
                      priceCr: player.soldPrice || player.basePrice
                    }))
                  };
                });
                const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
                const downloadAnchor = document.createElement('a');
                downloadAnchor.setAttribute("href", dataStr);
                downloadAnchor.setAttribute("download", `squads_room_${room.id}.json`);
                document.body.appendChild(downloadAnchor);
                downloadAnchor.click();
                downloadAnchor.remove();
                toast.success("Squads exported successfully as JSON!");
              } catch (err) {
                console.error(err);
                toast.error("Failed to export squads.");
              }
            }}
            className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-semibold py-3 px-8 rounded-xl text-xs border border-zinc-800 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
          >
            <Download size={14} />
            Export squads JSON
          </button>
        </div>

      </div>
    </div>
  );
};

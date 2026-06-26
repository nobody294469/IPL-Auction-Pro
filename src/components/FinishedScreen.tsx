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
      <div className="h-screen flex items-center justify-center bg-[#030303] text-white font-black text-2xl animate-pulse">
        SYNCING RESULTS INTERFACE...
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
    <div className="relative min-h-screen bg-[#030303] text-white overflow-hidden pb-32">
      {/* Tactical Grid Background */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none z-0" style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '100px 100px' }} />
      
      {/* Visual Ambient Light Bursts */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[400px] bg-gradient-to-b from-orange-500/10 via-orange-500/2 to-transparent blur-3xl pointer-events-none z-0" />
      <div className="absolute top-[20%] left-0 w-[300px] h-[300px] bg-blue-500/5 blur-3xl pointer-events-none z-0" />
      <div className="absolute top-[40%] right-0 w-[300px] h-[300px] bg-purple-500/5 blur-3xl pointer-events-none z-0" />

      <div className="relative z-10 pt-20 px-4 md:px-8 max-w-7xl mx-auto">
        
        {/* GRAND FINALE PRESENTATION HEADER */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] rounded-full mb-6 shadow-xl"
          >
            <Sparkles size={12} className="animate-pulse" />
            IPL Grand Finale Awards Ceremony
          </motion.div>
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-5xl sm:text-6xl md:text-7xl font-black text-white tracking-tighter uppercase mb-3 drop-shadow-2xl"
          >
            Post-Match Presentation
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-zinc-500 text-sm sm:text-base font-semibold uppercase tracking-widest"
          >
            The hammer has hit the desk. Celebrate the ultimate squads built to conquer the season.
          </motion.p>
        </div>

        {/* SPORTS BROADCAST NAVIGATION TABS */}
        <div className="flex justify-center mb-12 border-b border-white/5 pb-px">
          <div className="flex items-center gap-1.5 bg-zinc-900/60 p-1.5 rounded-2xl border border-white/5 backdrop-blur-md overflow-x-auto max-w-full">
            {[
              { id: 'podium', label: '🏆 Champion Podium', icon: Trophy },
              { id: 'comparison', label: '⚔️ Squad Comparison', icon: Scale },
              { id: 'awards', label: '🏅 Market Awards', icon: Award },
              { id: 'analytics', label: '📊 Power Analytics', icon: BarChart3 }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap ${
                    isActive 
                      ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20 font-black' 
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
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
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-16"
            >
              {/* CHAMPIONSHIP PODIUM GRAPHIC */}
              <div className="relative max-w-4xl mx-auto pt-12 pb-6 px-4">
                <div className="grid grid-cols-3 gap-3 md:gap-6 items-end relative z-10">
                  {podiumOrder.map((team, index) => {
                    const isWinner = team.place === 1;
                    const isSilver = team.place === 2;
                    const isBronze = team.place === 3;
                    
                    return (
                      <motion.div
                        key={team.uid}
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.15, duration: 0.5, type: 'spring', stiffness: 80 }}
                        className="flex flex-col items-center"
                      >
                        {/* Manager Avatar with Team Badge Overlay */}
                        <div className="relative mb-4 group">
                          {isWinner && (
                            <motion.div 
                              animate={{ rotate: [0, 5, -5, 0] }}
                              transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                              className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 text-yellow-500 filter drop-shadow-[0_4px_10px_rgba(234,179,8,0.4)]"
                            >
                              <Trophy size={28} fill="currentColor" />
                            </motion.div>
                          )}
                          <div className={`rounded-full p-1 relative z-10 transition-transform duration-300 group-hover:scale-105 ${
                            isWinner ? 'bg-gradient-to-tr from-yellow-500 via-orange-500 to-yellow-600 ring-4 ring-orange-500/20' :
                            isSilver ? 'bg-gradient-to-tr from-zinc-300 via-zinc-500 to-zinc-400 ring-4 ring-zinc-500/10' :
                            'bg-gradient-to-tr from-amber-600 via-amber-800 to-amber-700 ring-4 ring-amber-700/10'
                          }`}>
                            <img 
                              src={team.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${team.uid}`} 
                              className="w-16 h-16 sm:w-24 sm:h-24 rounded-full object-cover bg-zinc-950 border-2 border-black" 
                              alt={team.displayName} 
                              referrerPolicy="no-referrer" 
                            />
                          </div>
                          {/* Team Logo Overlay */}
                          <div className="absolute -bottom-1 -right-1 z-20 w-8 h-8 sm:w-11 sm:h-11 bg-zinc-950 border border-white/10 p-1.5 rounded-xl shadow-2xl">
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
                        <div className="text-center mb-3">
                          <h3 className="text-white font-black text-sm sm:text-base leading-none mb-1 tracking-tight truncate max-w-[110px] sm:max-w-[180px]">
                            {team.displayName}
                          </h3>
                          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            {team.teamDetail?.name || 'Composing...'}
                          </p>
                        </div>

                        {/* Podium Pedestal */}
                        <div className={`w-full rounded-t-3xl flex flex-col items-center justify-between py-6 px-3 border-x border-t relative overflow-hidden transition-all duration-300 ${
                          isWinner 
                            ? 'h-[140px] sm:h-[180px] bg-gradient-to-t from-orange-500/15 via-orange-500/5 to-transparent border-orange-500/30 shadow-[0_-15px_30px_rgba(249,115,22,0.1)]' 
                            : isSilver
                              ? 'h-[110px] sm:h-[140px] bg-gradient-to-t from-zinc-500/10 via-zinc-500/2 to-transparent border-zinc-500/20'
                              : 'h-[90px] sm:h-[110px] bg-gradient-to-t from-amber-700/10 via-amber-700/2 to-transparent border-amber-700/20'
                        }`}>
                          {/* Rank Number */}
                          <span className={`text-4xl sm:text-5xl font-black ${
                            isWinner ? 'text-transparent bg-clip-text bg-gradient-to-b from-yellow-400 to-orange-500' :
                            isSilver ? 'text-zinc-400' :
                            'text-amber-600'
                          }`}>
                            {team.place}
                          </span>

                          {/* Dynamic Rating Capsule */}
                          <div className={`px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider border ${
                            isWinner ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                            isSilver ? 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20' :
                            'bg-amber-700/10 text-amber-500 border-amber-700/20'
                          }`}>
                            Rating: {team.stats.overall}%
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                {/* Simulated podium ground line */}
                <div className="h-2 bg-gradient-to-r from-zinc-900 via-white/5 to-zinc-900 rounded-full border border-white/5 shadow-2xl relative z-0 -mt-0.5" />
              </div>

              {/* FINAL LEAGUE STANDINGS TABLE */}
              <GlassCard className="p-6 md:p-8 border-white/5 bg-zinc-900/10 text-left">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-orange-500/10 rounded-xl border border-orange-500/25">
                    <TrendingUp className="text-orange-500" size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-wider">Final League Standings</h2>
                    <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Comprehensive power ranking and statistics of the War Room</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-left">
                        <th className="py-4 px-4 w-12 text-center">Rank</th>
                        <th className="py-4 px-4">Franchise</th>
                        <th className="py-4 px-4">Manager</th>
                        <th className="py-4 px-4 text-center">Squad Size</th>
                        {room.auctionType !== 'draft' && <th className="py-4 px-4 text-right">Purse Remaining</th>}
                        <th className="py-4 px-4 text-center w-24">Batting</th>
                        <th className="py-4 px-4 text-center w-24">Bowling</th>
                        <th className="py-4 px-4 text-center w-28">Overall Power</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {ratedParticipants.map((team, index) => {
                        const isCurrentUser = team.uid === user?.uid;
                        return (
                          <tr 
                            key={team.uid}
                            className={`transition-colors text-sm ${
                              isCurrentUser 
                                ? 'bg-orange-500/[0.02] hover:bg-orange-500/[0.04]' 
                                : 'hover:bg-white/[0.01]'
                            }`}
                          >
                            {/* Rank Column */}
                            <td className="py-4 px-4 font-black text-center text-zinc-400">
                              {index === 0 ? '🏆' : index + 1}
                            </td>

                            {/* Franchise Details */}
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                <img 
                                  src={team.teamDetail?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${team.teamDetail?.shortName}`} 
                                  className="w-8 h-8 object-contain" 
                                  alt="" 
                                  referrerPolicy="no-referrer"
                                  onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.teamDetail?.shortName}`)}
                                />
                                <div>
                                  <span className="font-black text-white block tracking-tight">
                                    {team.teamDetail?.name || 'Draft Team'}
                                  </span>
                                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">
                                    {team.teamDetail?.shortName}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Manager Details */}
                            <td className="py-4 px-4">
                              <span className="font-semibold text-zinc-300">
                                {team.displayName}
                                {isCurrentUser && (
                                  <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest ml-2 border border-orange-500/20 px-1.5 py-0.5 rounded-full bg-orange-500/5">
                                    YOU
                                  </span>
                                )}
                              </span>
                            </td>

                            {/* Squad Size */}
                            <td className="py-4 px-4 text-center font-bold text-white">
                              {team.squad.length} <span className="text-zinc-500 font-normal text-xs">players</span>
                            </td>

                            {/* Purse Remaining */}
                            {room.auctionType !== 'draft' && (
                              <td className="py-4 px-4 text-right font-black text-white">
                                ₹{team.budget.toFixed(2)} Cr
                              </td>
                            )}

                            {/* Batting Rating */}
                            <td className="py-4 px-4 text-center">
                              <span className="font-mono text-xs font-black text-orange-500/90">
                                {team.stats.batting}
                              </span>
                            </td>

                            {/* Bowling Rating */}
                            <td className="py-4 px-4 text-center">
                              <span className="font-mono text-xs font-black text-blue-500/90">
                                {team.stats.bowling}
                              </span>
                            </td>

                            {/* Overall Power Rating */}
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2 justify-center">
                                <div className="w-16 bg-white/5 h-1.5 rounded-full overflow-hidden shrink-0">
                                  <div 
                                    className="h-full bg-gradient-to-r from-orange-500 to-yellow-500 rounded-full" 
                                    style={{ width: `${team.stats.overall}%` }} 
                                  />
                                </div>
                                <span className="font-black text-white tracking-tight text-xs">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/20 p-6 rounded-3xl border border-white/5 backdrop-blur-xl">
                {/* TEAM A SELECTOR */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">COMMANDER TEAM A</label>
                  <div className="relative">
                    <select
                      value={compareTeamA}
                      onChange={(e) => setCompareTeamA(e.target.value)}
                      className="w-full bg-[#0a0a0a]/95 border border-white/10 rounded-2xl p-4 text-sm font-black uppercase tracking-wider text-white outline-none cursor-pointer appearance-none shadow-lg focus:border-orange-500/50 transition-colors"
                    >
                      {participants.map(p => {
                        const teamDetail = TEAMS.find(t => t.id === p.teamId);
                        return (
                          <option key={p.uid} value={p.uid} className="bg-black text-white">
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
                <div className="space-y-3">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest">COMMANDER TEAM B</label>
                  <div className="relative">
                    <select
                      value={compareTeamB}
                      onChange={(e) => setCompareTeamB(e.target.value)}
                      className="w-full bg-[#0a0a0a]/95 border border-white/10 rounded-2xl p-4 text-sm font-black uppercase tracking-wider text-white outline-none cursor-pointer appearance-none shadow-lg focus:border-orange-500/50 transition-colors"
                    >
                      {participants.map(p => {
                        const teamDetail = TEAMS.find(t => t.id === p.teamId);
                        return (
                          <option key={p.uid} value={p.uid} className="bg-black text-white">
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
              <div className="bg-zinc-900/10 border border-white/5 rounded-3xl p-6 md:p-8 space-y-6">
                <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest text-center mb-2">POWER HEAD-TO-HEAD</h3>
                
                {(() => {
                  const tA = participants.find(p => p.uid === compareTeamA);
                  const tB = participants.find(p => p.uid === compareTeamB);
                  if (!tA || !tB) return null;
                  
                  const sA = getTeamStats(tA.squad);
                  const sB = getTeamStats(tB.squad);

                  const comparisonMetrics = [
                    { label: 'Overall Rating', valA: sA.overall, valB: sB.overall, colorClass: 'bg-orange-500' },
                    { label: 'Batting power', valA: sA.batting, valB: sB.batting, colorClass: 'bg-yellow-500' },
                    { label: 'Bowling power', valA: sA.bowling, valB: sB.bowling, colorClass: 'bg-blue-500' },
                    { label: 'Squad balance', valA: sA.balance, valB: sB.balance, colorClass: 'bg-green-500' },
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
                              <span className="font-mono text-base font-black text-white">{metric.valA}</span>
                              {!metric.isCount && <span className="text-xs text-zinc-500 ml-0.5">%</span>}
                            </div>
                            
                            {/* Comparison Slider */}
                            <div className="col-span-6">
                              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider text-center mb-1.5">{metric.label}</p>
                              <div className="flex h-3 bg-zinc-950/60 rounded-full overflow-hidden border border-white/5">
                                {/* Team A bar (extends from center to left) */}
                                <div className="w-1/2 flex justify-end pr-px bg-zinc-900/10">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pctA}%` }}
                                    className={`h-full rounded-l-full ${metric.colorClass} opacity-85`}
                                  />
                                </div>
                                {/* Center Divider */}
                                <div className="w-0.5 bg-zinc-800 z-10" />
                                {/* Team B bar (extends from center to right) */}
                                <div className="w-1/2 flex justify-start pl-px bg-zinc-900/10">
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
                              <span className="font-mono text-base font-black text-white">{metric.valB}</span>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* ROSTER A */}
                {(() => {
                  const tA = participants.find(p => p.uid === compareTeamA);
                  const teamDetail = TEAMS.find(t => t && t.id === tA?.teamId);
                  return (
                    <GlassCard className="p-6 border-white/5 text-left bg-zinc-900/10">
                      <div className="flex items-center gap-3.5 mb-6 border-b border-white/5 pb-4">
                        <img 
                          src={teamDetail?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamDetail?.shortName}`} 
                          className="w-10 h-10 object-contain" 
                          alt="" 
                          referrerPolicy="no-referrer"
                          onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamDetail?.shortName}`)}
                        />
                        <div>
                          <h4 className="text-lg font-black text-white leading-none">{teamDetail?.name || 'Franchise A'}</h4>
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1 block">Manager: {tA?.displayName}</span>
                        </div>
                      </div>

                      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-2">
                        {tA?.squad.length === 0 ? (
                          <p className="text-zinc-500 text-sm italic py-8 text-center">Roster is empty.</p>
                        ) : (
                          tA?.squad.map(player => (
                            <div key={player.id} className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/[0.08] rounded-xl border border-white/5 transition-all">
                              <div className="flex items-center gap-3">
                                <img 
                                  src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`} 
                                  className="w-8 h-8 rounded-lg object-cover" 
                                  alt="" 
                                  referrerPolicy="no-referrer" 
                                />
                                <div>
                                  <span className="font-bold text-white text-xs block leading-tight">{player.name}</span>
                                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">{player.role}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-mono text-xs font-black text-orange-500">
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
                    <GlassCard className="p-6 border-white/5 text-left bg-zinc-900/10">
                      <div className="flex items-center gap-3.5 mb-6 border-b border-white/5 pb-4">
                        <img 
                          src={teamDetail?.logo || `https://api.dicebear.com/7.x/initials/svg?seed=${teamDetail?.shortName}`} 
                          className="w-10 h-10 object-contain" 
                          alt="" 
                          referrerPolicy="no-referrer"
                          onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${teamDetail?.shortName}`)}
                        />
                        <div>
                          <h4 className="text-lg font-black text-white leading-none">{teamDetail?.name || 'Franchise B'}</h4>
                          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1 block">Manager: {tB?.displayName}</span>
                        </div>
                      </div>

                      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-2">
                        {tB?.squad.length === 0 ? (
                          <p className="text-zinc-500 text-sm italic py-8 text-center">Roster is empty.</p>
                        ) : (
                          tB?.squad.map(player => (
                            <div key={player.id} className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/[0.08] rounded-xl border border-white/5 transition-all">
                              <div className="flex items-center gap-3">
                                <img 
                                  src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`} 
                                  className="w-8 h-8 rounded-lg object-cover" 
                                  alt="" 
                                  referrerPolicy="no-referrer" 
                                />
                                <div>
                                  <span className="font-bold text-white text-xs block leading-tight">{player.name}</span>
                                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">{player.role}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-mono text-xs font-black text-orange-500">
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
              className="space-y-12"
            >
              {/* AWARD TILES FOR SPLURGE AND STEAL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                {/* Splurge Award */}
                <div className="relative p-8 rounded-[36px] bg-gradient-to-br from-yellow-500/10 via-yellow-600/5 to-transparent border border-yellow-500/20 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                    <Trophy size={180} className="text-yellow-500" />
                  </div>
                  <div className="flex items-center gap-2.5 mb-6">
                    <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center border border-yellow-500/20">
                      <Star size={16} className="text-yellow-500 animate-pulse" />
                    </div>
                    <span className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.25em]">THE GOLDEN GAVEL AWARD</span>
                  </div>

                  {highlights.splurge ? (
                    <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
                      <img 
                        src={highlights.splurge.image || `https://api.dicebear.com/7.x/initials/svg?seed=${highlights.splurge.name}`} 
                        className="w-28 h-28 rounded-2xl object-cover border border-white/10 bg-zinc-900 shadow-xl" 
                        alt="" 
                        referrerPolicy="no-referrer" 
                      />
                      <div className="space-y-2 text-center sm:text-left">
                        <span className="text-[10px] font-black bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Most Expensive Buy
                        </span>
                        <h4 className="text-3xl font-black text-white tracking-tight leading-none mt-1">
                          {highlights.splurge.name}
                        </h4>
                        <div className="flex items-center justify-center sm:justify-start gap-1">
                          <Coins className="text-yellow-500" size={16} />
                          <p className="text-2xl font-black text-yellow-500 tracking-tighter">
                            ₹{highlights.splurge.soldPrice?.toFixed(2)} Cr
                          </p>
                        </div>
                        <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                          Role: {highlights.splurge.role}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-500 italic py-8 text-center sm:text-left">No splurge recorded yet.</p>
                  )}
                </div>

                {/* Steal Award */}
                <div className="relative p-8 rounded-[36px] bg-gradient-to-br from-emerald-500/10 via-emerald-600/5 to-transparent border border-emerald-500/20 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                    <TrendingUp size={180} className="text-emerald-500" />
                  </div>
                  <div className="flex items-center gap-2.5 mb-6">
                    <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/20">
                      <Zap size={16} className="text-emerald-500 animate-pulse" />
                    </div>
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.25em]">THE VALUE MASTER AWARD</span>
                  </div>

                  {highlights.steal ? (
                    <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
                      <img 
                        src={highlights.steal.image || `https://api.dicebear.com/7.x/initials/svg?seed=${highlights.steal.name}`} 
                        className="w-28 h-28 rounded-2xl object-cover border border-white/10 bg-zinc-900 shadow-xl" 
                        alt="" 
                        referrerPolicy="no-referrer" 
                      />
                      <div className="space-y-2 text-center sm:text-left">
                        <span className="text-[10px] font-black bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full uppercase tracking-wider">
                          Best Bargain Steal
                        </span>
                        <h4 className="text-3xl font-black text-white tracking-tight leading-none mt-1">
                          {highlights.steal.name}
                        </h4>
                        <div className="flex items-center justify-center sm:justify-start gap-1">
                          <Coins className="text-emerald-500" size={16} />
                          <p className="text-2xl font-black text-emerald-500 tracking-tighter">
                            ₹{highlights.steal.soldPrice?.toFixed(2)} Cr
                          </p>
                        </div>
                        <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">
                          Base Price: ₹{highlights.steal.basePrice} Cr | Role: {highlights.steal.role}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-500 italic py-8 text-center sm:text-left">No steal recorded yet.</p>
                  )}
                </div>
              </div>

              {/* RECENT REVOLUTION SQUAD HEADLINES */}
              <GlassCard className="p-6 md:p-8 border-white/5 bg-zinc-900/10 text-left">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/25">
                    <Activity className="text-blue-500" size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-wider">IPL Gavel Transactions</h2>
                    <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Full chronological log of finalized signings from the session</p>
                  </div>
                </div>

                <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-2">
                  {room.history.length === 0 ? (
                    <p className="text-zinc-500 text-sm italic py-8 text-center">No transactions recorded in the session history.</p>
                  ) : (
                    room.history.map((h, index) => {
                      const player = room.players.find(p => p.id === h.playerId);
                      const buyer = participants.find(p => p.uid === h.teamId);
                      const teamDetail = TEAMS.find(t => t.id === buyer?.teamId);
                      return (
                        <div key={index} className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.04] transition-colors text-sm">
                          <div className="flex items-center gap-3.5">
                            <span className="font-mono text-zinc-600 font-bold">#{room.history.length - index}</span>
                            <img 
                              src={player?.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player?.name}`} 
                              className="w-9 h-9 rounded-xl object-cover bg-zinc-900 border border-white/5" 
                              alt="" 
                              referrerPolicy="no-referrer" 
                            />
                            <div>
                              <span className="font-bold text-white block leading-tight">{player?.name}</span>
                              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">{player?.role}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right hidden sm:block">
                              <span className="font-semibold text-zinc-300 block text-xs">Acquired by</span>
                              <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{teamDetail?.shortName || buyer?.displayName}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono text-sm font-black text-white">₹{h.price.toFixed(2)} Cr</span>
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
              className="space-y-12 text-left"
            >
              {/* TACTICAL ANALYSIS CONTAINER */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* AI Analyst & Draft Rankings Column */}
                <div className="lg:col-span-5 space-y-8">
                  {/* AI INSIGHTS CARD */}
                  <GlassCard className="p-6 md:p-8 border-orange-500/20 bg-orange-500/[0.02]">
                    <div className="flex items-center gap-3 mb-6">
                      <Sparkles className="text-orange-500" size={20} />
                      <h2 className="text-lg font-black text-white uppercase tracking-wider">AI Auction Analyst</h2>
                    </div>
                    
                    <div className="prose prose-invert max-w-none text-sm leading-relaxed text-zinc-300 italic">
                      {(isAnalyzing || (aiSummary === 'Analyzing the auction results...' && room.hostId !== user?.uid)) ? (
                        <div className="flex items-center gap-3 text-zinc-500 animate-pulse py-4">
                          <RefreshCw className="animate-spin text-orange-500" size={18} />
                          <span className="italic">Reviewing the tactical selections...</span>
                        </div>
                      ) : (
                        <p>"{aiSummary}"</p>
                      )}
                    </div>
                  </GlassCard>

                  {/* Draft Evaluation / Projected Winner */}
                  {room.auctionType === 'draft' && (isAnalyzing || draftAnalysis) && (
                    <GlassCard className="p-6 border-blue-500/15 bg-blue-500/[0.01] space-y-6">
                      <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                        <Trophy className="text-blue-500" size={20} />
                        <div>
                          <h3 className="text-base font-black text-white uppercase tracking-wider leading-none">Draft Power analysis</h3>
                          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-black block mt-1">AI Evaluated Results</span>
                        </div>
                      </div>

                      {isAnalyzing && !draftAnalysis ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3 text-zinc-500">
                          <RefreshCw className="animate-spin text-blue-500" size={24} />
                          <span className="text-xs italic animate-pulse">Running model algorithms...</span>
                        </div>
                      ) : draftAnalysis ? (
                        <div className="space-y-5">
                          {/* Why Top */}
                          <div className="space-y-1.5">
                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">WHY CHAMPIONS EXCEL:</span>
                            <p className="text-xs text-zinc-300 italic leading-relaxed bg-white/[0.01] p-3 border border-white/5 rounded-xl">
                              "{draftAnalysis.bestTeamReason}"
                            </p>
                          </div>

                          {/* Dark Horse */}
                          <div className="space-y-1.5 p-3.5 bg-purple-500/5 rounded-xl border border-purple-500/10">
                            <span className="text-[9px] font-black text-purple-400 uppercase tracking-widest block mb-0.5">THE DARK HORSE:</span>
                            <h4 className="text-sm font-black text-white">{draftAnalysis.darkHorse.name}</h4>
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-zinc-900/40 p-5 rounded-2xl border border-white/5">
                    <div>
                      <h3 className="text-base font-black text-white uppercase tracking-wider leading-none">Squad Power Breakdown</h3>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mt-1">Explore detailed ratings and best XIs per commander</p>
                    </div>
                    
                    {/* Interactive Dropdown to pick whose squad to evaluate */}
                    <div className="relative shrink-0 w-full sm:w-[220px]">
                      <select
                        value={selectedAnalysisUserId}
                        onChange={(e) => setSelectedAnalysisUserId(e.target.value)}
                        className="w-full bg-zinc-950/90 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white outline-none cursor-pointer appearance-none shadow-lg focus:border-orange-500"
                      >
                        {participants.map(p => (
                          <option key={p.uid} value={p.uid}>
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
        <div className="mt-20 flex flex-col sm:flex-row justify-center items-center gap-4 border-t border-white/5 pt-10">
          <button 
            onClick={() => navigate('/')}
            className="w-full sm:w-auto bg-white hover:bg-zinc-200 text-black font-black py-4 px-10 rounded-2xl text-sm uppercase tracking-widest transition-all duration-200 shadow-xl shadow-white/5 cursor-pointer active:scale-[0.98]"
          >
            Back to Lobby
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
            className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 text-white font-black py-4 px-10 rounded-2xl text-sm border border-white/10 transition-all duration-200 flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.98]"
          >
            <Download size={15} />
            Export Squads JSON
          </button>
        </div>

      </div>
    </div>
  );
};

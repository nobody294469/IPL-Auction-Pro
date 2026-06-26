import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Star, TrendingUp, Zap } from 'lucide-react';
import { Player, AuctionRoom, SquadAnalysis } from '../types';
import { GlassCard } from './GlassCard';

export const SquadPowerAnalysis = ({ squad, room, userId }: { squad: Player[], room: AuctionRoom, userId: string }) => {
  const [analysis, setAnalysis] = useState<SquadAnalysis | null>(room.squadAnalyses?.[userId] || null);

  useEffect(() => {
    if (analysis) return;

    const calculateAnalysis = () => {
      if (squad.length === 0) return null;

      // 1. Best XI Logic
      const bestXI: string[] = [];
      const roles = {
        'Wicket-keeper': squad.filter(p => p.role === 'Wicket-keeper'),
        'Batters': squad.filter(p => ['Top Order', 'Middle Order', 'Finisher'].includes(p.role)),
        'All-rounders': squad.filter(p => p.role === 'All-rounder'),
        'Bowlers': squad.filter(p => ['Pacer', 'Spinner'].includes(p.role))
      };

      // Sort each role by a simple score: (runs + wickets * 20)
      const getScore = (p: Player) => (p.stats?.runs || 0) + (p.stats?.wickets || 0) * 20;
      Object.keys(roles).forEach(role => {
        roles[role as keyof typeof roles].sort((a, b) => getScore(b) - getScore(a));
      });

      // Selection
      if (roles['Wicket-keeper'][0]) bestXI.push(roles['Wicket-keeper'][0].id);
      bestXI.push(...roles['Batters'].slice(0, 4).map(p => p.id));
      bestXI.push(...roles['All-rounders'].slice(0, 2).map(p => p.id));
      bestXI.push(...roles['Bowlers'].slice(0, 4).map(p => p.id));

      // 2. Squad Balance
      const balance = {
        batting: Math.min(100, (roles['Batters'].length * 15 + roles['All-rounders'].length * 10 + roles['Wicket-keeper'].length * 10)),
        bowling: Math.min(100, (roles['Bowlers'].length * 20 + roles['All-rounders'].length * 10)),
        allRound: Math.min(100, (roles['All-rounders'].length * 30))
      };

      // 3. Value Picks
      const valuePicks = squad
        .filter(p => room.auctionType === 'draft' ? true : (p.soldPrice && p.soldPrice <= p.basePrice * 1.5))
        .sort((a, b) => getScore(b) - getScore(a))
        .slice(0, 3)
        .map(p => p.id);

      return { bestXI, balance, valuePicks };
    };

    const result = calculateAnalysis();
    if (result) {
      setAnalysis(result);
    }
  }, [squad, room.squadAnalyses, userId]);

  if (!analysis) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-12">
      <GlassCard className="p-8 border-orange-500/20 bg-orange-500/5">
        <div className="flex items-center gap-3 mb-6">
          <Star className="text-orange-500" size={24} />
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">Best Starting XI</h3>
        </div>
        <div className="space-y-3">
          {analysis.bestXI.map(id => {
            const p = squad.find(player => player.id === id);
            if (!p) return null;
            return (
              <div key={id} className="flex items-center gap-3 p-2 bg-white/5 rounded-xl border border-white/5">
                <img src={p.image || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`} className="w-10 h-10 rounded-lg object-cover" alt="" referrerPolicy="no-referrer" />
                <div className="text-left">
                  <p className="text-sm font-bold text-white leading-none">{p.name}</p>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-1">{p.role}</p>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-8 border-blue-500/20 bg-blue-500/5">
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="text-blue-500" size={24} />
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">Squad Balance</h3>
        </div>
        <div className="space-y-8">
          {Object.entries(analysis.balance).map(([key, value]) => (
            <div key={key} className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-black text-zinc-400 uppercase tracking-widest">{key}</span>
                <span className="text-xl font-black text-white">{value}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${value}%` }}
                  className={`h-full ${key === 'batting' ? 'bg-orange-500' : key === 'bowling' ? 'bg-blue-500' : 'bg-green-500'}`}
                />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-8 border-green-500/20 bg-green-500/5">
        <div className="flex items-center gap-3 mb-6">
          <Zap className="text-green-500" size={24} />
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">
            {room.auctionType === 'draft' ? 'Key Draft Picks' : 'Value Picks'}
          </h3>
        </div>
        <div className="space-y-4">
          {analysis.valuePicks.map(id => {
            const p = squad.find(player => player.id === id);
            if (!p) return null;
            return (
              <div key={id} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-4">
                <img src={p.image || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`} className="w-16 h-16 rounded-xl object-cover" alt="" referrerPolicy="no-referrer" />
                <div className="text-left">
                  <h4 className="text-lg font-black text-white">{p.name}</h4>
                  {room.auctionType !== 'draft' ? (
                    <>
                      <p className="text-green-500 font-black">₹{p.soldPrice?.toFixed(2)} Cr</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Base: ₹{p.basePrice} Cr</p>
                    </>
                  ) : (
                    <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">{p.role}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
};

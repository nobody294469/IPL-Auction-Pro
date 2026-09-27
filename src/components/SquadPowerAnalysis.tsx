import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Star, TrendingUp, BadgePercent } from 'lucide-react';
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10">
      <GlassCard className="p-6 border-zinc-800/80">
        <div className="flex items-center gap-2.5 mb-5">
          <Star className="text-amber-400" size={18} />
          <h3 className="text-base font-semibold text-white font-display">Best Starting XI</h3>
        </div>
        <div className="space-y-2.5">
          {analysis.bestXI.map(id => {
            const p = squad.find(player => player.id === id);
            if (!p) return null;
            return (
              <div key={id} className="flex items-center gap-3 p-2.5 bg-zinc-900/60 rounded-xl border border-zinc-800/70">
                <img src={p.image || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`} className="w-9 h-9 rounded-lg object-cover" alt="" referrerPolicy="no-referrer" />
                <div className="text-left">
                  <p className="text-sm font-medium text-zinc-100 leading-none">{p.name}</p>
                  <p className="text-xs text-zinc-400 mt-1">{p.role}</p>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-6 border-zinc-800/80">
        <div className="flex items-center gap-2.5 mb-5">
          <TrendingUp className="text-blue-400" size={18} />
          <h3 className="text-base font-semibold text-white font-display">Squad Balance</h3>
        </div>
        <div className="space-y-6">
          {Object.entries(analysis.balance).map(([key, value]) => (
            <div key={key} className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-medium text-zinc-400 capitalize">{key === 'allRound' ? 'All-round' : key}</span>
                <span className="text-sm font-semibold font-mono tabular-nums text-zinc-200">{value}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${value}%` }}
                  className={`h-full ${key === 'batting' ? 'bg-amber-500' : key === 'bowling' ? 'bg-blue-500' : 'bg-emerald-500'}`}
                />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-6 border-zinc-800/80">
        <div className="flex items-center gap-2.5 mb-5">
          <BadgePercent className="text-emerald-400" size={18} />
          <h3 className="text-base font-semibold text-white font-display">
            {room.auctionType === 'draft' ? 'Key Draft Picks' : 'Value Picks'}
          </h3>
        </div>
        <div className="space-y-3">
          {analysis.valuePicks.map(id => {
            const p = squad.find(player => player.id === id);
            if (!p) return null;
            return (
              <div key={id} className="p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-800/70 flex items-center gap-3.5">
                <img src={p.image || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`} className="w-12 h-12 rounded-lg object-cover" alt="" referrerPolicy="no-referrer" />
                <div className="text-left">
                  <h4 className="text-sm font-semibold text-zinc-100">{p.name}</h4>
                  {room.auctionType !== 'draft' ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-semibold font-mono tabular-nums text-emerald-400">Ã¢â€šÂ¹{p.soldPrice?.toFixed(2)} Cr</span>
                      <span className="text-[11px] text-zinc-400 font-mono tabular-nums">Base: Ã¢â€šÂ¹{p.basePrice} Cr</span>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 mt-1">{p.role}</p>
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

import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, YAxis, Tooltip, Line } from 'recharts';
import { AuctionRoom } from '../types';
import { TEAMS } from '../data/teams';

export const BudgetBurnGraph = ({ room }: { room: AuctionRoom }) => {
  const data = useMemo(() => {
    if (!room || !room.teams) return [];
    const teams = Object.values(room.teams);
    const initialBudgets: Record<string, number> = {};
    
    // Initialize all teams to the room's purse
    teams.forEach(t => {
      initialBudgets[t.uid] = room.purse;
    });

    const points: any[] = [{ name: 'Start', ...initialBudgets }];
    const currentBudgets = { ...initialBudgets };

    // Sort history by timestamp to ensure chronological order
    const sortedHistory = [...(room.history || [])].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    sortedHistory.forEach((h, i) => {
      // Ensure we only update if the team exists in our tracking
      if (currentBudgets.hasOwnProperty(h.teamId)) {
        currentBudgets[h.teamId] = Math.max(0, currentBudgets[h.teamId] - h.price);
      }
      points.push({ name: `P${i + 1}`, ...currentBudgets });
    });

    // Add a final point if history is empty to show a flat line
    if (points.length === 1) {
      points.push({ name: 'Now', ...currentBudgets });
    }

    return points;
  }, [room.history, room.teams, room.purse]);

  return (
    <div className="h-[120px] w-full mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: -30, bottom: 5 }}>
          <YAxis hide domain={[0, room.purse]} />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#09090b', 
              border: '1px solid rgba(255,255,255,0.1)', 
              borderRadius: '12px',
              padding: '8px'
            }}
            itemStyle={{ fontSize: '9px', fontWeight: 'bold', padding: '2px 0' }}
            labelStyle={{ display: 'none' }}
          />
          {Object.values(room.teams).map(t => (
            <Line 
              key={t.uid} 
              type="stepAfter" 
              dataKey={t.uid} 
              name={TEAMS.find(team => team.id === t.teamId)?.shortName || 'Team'}
              stroke={TEAMS.find(team => team.id === t.teamId)?.color || '#f97316'} 
              strokeWidth={2} 
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={1000}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

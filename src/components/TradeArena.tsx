import React, { useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { AuctionRoom } from '../types';
import { Chat } from './Chat';

export const TradeArena = ({ user, room, socket }: { user: any, room: AuctionRoom, socket: any }) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [myTradePlayers, setMyTradePlayers] = useState<string[]>([]);
  const [theirTradePlayers, setTheirTradePlayers] = useState<string[]>([]);
  const [myCash, setMyCash] = useState(0);
  const [theirCash, setTheirCash] = useState(0);

  const myProfile = room.teams[user.uid];
  const otherTeams = Object.entries(room.teams).filter(([uid]) => uid !== user.uid);
  const selectedTeam = selectedTeamId ? room.teams[selectedTeamId] : null;

  const proposeTrade = () => {
    if (!selectedTeamId) return;
    socket?.emit('propose-trade', {
      roomId: room.id,
      trade: {
        fromUserId: user.uid,
        toUserId: selectedTeamId,
        fromPlayerIds: myTradePlayers,
        toPlayerIds: theirTradePlayers,
        fromCash: myCash,
        toCash: theirCash
      }
    });
    // Reset
    setMyTradePlayers([]);
    setTheirTradePlayers([]);
    setMyCash(0);
    setTheirCash(0);
    toast.success("Trade proposal sent!");
  };

  const respondToTrade = (tradeId: string, response: 'accepted' | 'rejected') => {
    socket?.emit('respond-to-trade', { roomId: room.id, tradeId, response });
  };

  const pendingTrades = room.trades?.filter(t => t.status === 'pending' && (t.fromUserId === user.uid || t.toUserId === user.uid)) || [];

  return (
    <div className="h-screen h-[100dvh] bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-white/5 bg-zinc-900/80 backdrop-blur-xl flex items-center justify-between px-8 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <RefreshCw className="text-white" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter uppercase">Interactive Trade Window</h1>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Negotiate and swap players</p>
          </div>
        </div>
        {room.hostId === user.uid && (
          <button 
            onClick={() => socket?.emit('resume-auction', { roomId: room.id, userId: user.uid })}
            className="px-6 py-2 bg-orange-500 text-black font-black text-xs uppercase tracking-widest rounded-full hover:bg-orange-600 transition-all"
          >
            Close Trade Window
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Left: Trade Proposals */}
        <div className="lg:col-span-4 border-r border-white/5 flex flex-col bg-zinc-900/20">
          <div className="p-6 border-b border-white/5">
            <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4">Pending Proposals</h3>
            <div className="space-y-4 overflow-y-auto max-h-[400px] custom-scrollbar">
              {pendingTrades.length === 0 ? (
                <div className="text-center py-8 text-zinc-600 italic text-sm">No pending trades</div>
              ) : (
                pendingTrades.map(trade => {
                  const isIncoming = trade.toUserId === user.uid;
                  const otherUser = room.teams[isIncoming ? trade.fromUserId : trade.toUserId];
                  return (
                    <div key={trade.id} className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={otherUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.uid}`} className="w-6 h-6 rounded-full" alt="" />
                          <span className="text-xs font-bold text-white">{isIncoming ? 'From' : 'To'}: {otherUser.displayName}</span>
                        </div>
                        <span className="text-[8px] font-black text-orange-500 uppercase tracking-widest">Pending</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="space-y-1">
                          <p className="text-zinc-500 uppercase font-black">Giving</p>
                          <p className="text-white font-bold">{isIncoming ? trade.toPlayerIds.length : trade.fromPlayerIds.length} Players</p>
                          <p className="text-white font-bold">₹{isIncoming ? trade.toCash : trade.fromCash} Cr</p>
                        </div>
                        <div className="space-y-1 text-right">
                          <p className="text-zinc-500 uppercase font-black">Receiving</p>
                          <p className="text-white font-bold">{isIncoming ? trade.fromPlayerIds.length : trade.toPlayerIds.length} Players</p>
                          <p className="text-white font-bold">₹{isIncoming ? trade.fromCash : trade.toCash} Cr</p>
                        </div>
                      </div>

                      {isIncoming && (
                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <button 
                            onClick={() => respondToTrade(trade.id, 'rejected')}
                            className="py-2 bg-zinc-800 hover:bg-red-900/20 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                          >
                            Decline
                          </button>
                          <button 
                            onClick={() => respondToTrade(trade.id, 'accepted')}
                            className="py-2 bg-green-600 hover:bg-green-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all"
                          >
                            Accept
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          <div className="flex-1 p-6 overflow-hidden flex flex-col">
            <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest mb-4">Live Comms</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
              <Chat room={room} user={user} socket={socket} />
            </div>
          </div>
        </div>

        {/* Center: Trade Builder */}
        <div className="lg:col-span-8 p-8 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="flex items-center gap-6">
              <div className="flex-1 p-6 bg-zinc-900/50 border border-white/5 rounded-[32px] text-center space-y-4">
                <img src={myProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${myProfile.uid}`} className="w-16 h-16 rounded-full mx-auto border-2 border-orange-500" alt="" />
                <div>
                  <h4 className="text-lg font-black text-white">{myProfile.displayName}</h4>
                  <p className="text-orange-500 font-black text-xs">₹{myProfile.budget.toFixed(2)} Cr</p>
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-full">
                <RefreshCw size={24} className="text-zinc-500" />
              </div>
              <div className="flex-1 p-6 bg-zinc-900/50 border border-white/5 rounded-[32px] text-center space-y-4">
                {selectedTeam ? (
                  <>
                    <img src={selectedTeam.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedTeam.uid}`} className="w-16 h-16 rounded-full mx-auto border-2 border-blue-500" alt="" />
                    <div>
                      <h4 className="text-lg font-black text-white">{selectedTeam.displayName}</h4>
                      <p className="text-blue-500 font-black text-xs">₹{selectedTeam.budget.toFixed(2)} Cr</p>
                    </div>
                  </>
                ) : (
                  <div className="h-32 flex flex-col items-center justify-center gap-3 text-zinc-600">
                    <Users size={32} />
                    <p className="text-xs font-black uppercase tracking-widest">Select a Team</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
              {/* My Side */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Your Offer</h5>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-600 uppercase">Players to Give</p>
                  <div className="grid grid-cols-1 gap-2">
                    {myProfile.squad.map(player => (
                      <button 
                        key={player.id}
                        onClick={() => setMyTradePlayers(prev => prev.includes(player.id) ? prev.filter(id => id !== player.id) : [...prev, player.id])}
                        className={`flex items-center gap-3 p-2 rounded-xl border transition-all ${myTradePlayers.includes(player.id) ? 'bg-orange-500/10 border-orange-500' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                      >
                        <img src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`} className="w-8 h-8 rounded-lg object-cover" alt="" />
                        <span className="text-xs font-bold text-white">{player.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-600 uppercase">Cash to Give (Cr)</p>
                  <input 
                    type="number" 
                    value={myCash}
                    onChange={(e) => setMyCash(Math.min(myProfile.budget, parseFloat(e.target.value) || 0))}
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:border-orange-500 outline-none"
                  />
                </div>
              </div>

              {/* Their Side */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Select Target Team</h5>
                <div className="flex flex-wrap gap-2 mb-4">
                  {otherTeams.map(([uid, team]) => (
                    <button 
                      key={uid}
                      onClick={() => {
                        setSelectedTeamId(uid);
                        setTheirTradePlayers([]);
                      }}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${selectedTeamId === uid ? 'bg-blue-500 text-white border-blue-500' : 'bg-white/5 text-zinc-400 border-white/5 hover:border-white/10'}`}
                    >
                      {team.displayName}
                    </button>
                  ))}
                </div>
                
                {selectedTeam && (
                  <>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase">Players to Receive</p>
                      <div className="grid grid-cols-1 gap-2">
                        {selectedTeam.squad.map(player => (
                          <button 
                            key={player.id}
                            onClick={() => setTheirTradePlayers(prev => prev.includes(player.id) ? prev.filter(id => id !== player.id) : [...prev, player.id])}
                            className={`flex items-center gap-3 p-2 rounded-xl border transition-all ${theirTradePlayers.includes(player.id) ? 'bg-blue-500/10 border-blue-500' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                          >
                            <img src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`} className="w-8 h-8 rounded-lg object-cover" alt="" />
                            <span className="text-xs font-bold text-white">{player.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase">Cash to Receive (Cr)</p>
                      <input 
                        type="number" 
                        value={theirCash}
                        onChange={(e) => setTheirCash(Math.min(selectedTeam.budget, parseFloat(e.target.value) || 0))}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-2 text-sm font-bold focus:border-blue-500 outline-none"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <button 
              disabled={!selectedTeamId || (myTradePlayers.length === 0 && myCash === 0 && theirTradePlayers.length === 0 && theirCash === 0)}
              onClick={proposeTrade}
              className="w-full py-4 bg-white text-black font-black text-sm uppercase tracking-[0.2em] rounded-2xl hover:bg-zinc-200 transition-all disabled:opacity-50 mt-8"
            >
              PROPOSE TRADE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
    toast.success("Trade proposal sent");
  };

  const respondToTrade = (tradeId: string, response: 'accepted' | 'rejected') => {
    socket?.emit('respond-to-trade', { roomId: room.id, tradeId, response });
  };

  const pendingTrades = room.trades?.filter(t => t.status === 'pending' && (t.fromUserId === user.uid || t.toUserId === user.uid)) || [];

  return (
    <div className="h-screen h-[100dvh] bg-zinc-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-sm flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 rounded-lg flex items-center justify-center text-zinc-300">
            <RefreshCw size={16} />
          </div>
          <div className="text-left">
            <h1 className="text-base font-display font-semibold tracking-tight">Player trading</h1>
            <p className="text-xs text-zinc-400 font-normal">Propose and negotiate player transfers</p>
          </div>
        </div>
        {room.hostId === user.uid && (
          <button
            onClick={() => socket?.emit('close-trade-window', { roomId: room.id, userId: user.uid })}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer border border-zinc-700"
          >
            Close trade window
          </button>
        )}
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0">
        {/* Left: Trade Proposals */}
        <div className="lg:col-span-4 border-r border-zinc-800 flex flex-col bg-zinc-900/30">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="text-xs font-medium text-zinc-400 mb-3 text-left">Pending proposals</h3>
            <div className="space-y-3 overflow-y-auto max-h-[360px] custom-scrollbar">
              {pendingTrades.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs font-normal">No pending trade proposals</div>
              ) : (
                pendingTrades.map(trade => {
                  const isIncoming = trade.toUserId === user.uid;
                  const otherUser = room.teams[isIncoming ? trade.fromUserId : trade.toUserId];
                  return (
                    <div key={trade.id} className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-3 text-left">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={otherUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${otherUser.uid}`} className="w-5 h-5 rounded-md" alt="" />
                          <span className="text-xs font-medium text-white">{isIncoming ? 'From' : 'To'}: {otherUser.displayName}</span>
                        </div>
                        <span className="text-[10px] font-medium text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">Pending</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-0.5">
                          <p className="text-zinc-500 text-[11px] font-normal">Offering</p>
                          <p className="text-white font-medium">{isIncoming ? trade.toPlayerIds.length : trade.fromPlayerIds.length} players</p>
                          <p className="text-white font-mono tabular-nums">₹{isIncoming ? trade.toCash : trade.fromCash} Cr</p>
                        </div>
                        <div className="space-y-0.5 text-right">
                          <p className="text-zinc-500 text-[11px] font-normal">Receiving</p>
                          <p className="text-white font-medium">{isIncoming ? trade.fromPlayerIds.length : trade.toPlayerIds.length} players</p>
                          <p className="text-white font-mono tabular-nums">₹{isIncoming ? trade.fromCash : trade.toCash} Cr</p>
                        </div>
                      </div>

                      {isIncoming && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={() => respondToTrade(trade.id, 'rejected')}
                            className="py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => respondToTrade(trade.id, 'accepted')}
                            className="py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
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

          <div className="flex-1 p-4 overflow-hidden flex flex-col">
            <h3 className="text-xs font-medium text-zinc-400 mb-2 text-left">Room chat</h3>
            <div className="flex-1 overflow-hidden">
              <Chat room={room} user={user} socket={socket} />
            </div>
          </div>
        </div>

        {/* Center: Trade Builder */}
        <div className="lg:col-span-8 p-6 overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex-1 p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-2">
                <img src={myProfile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${myProfile.uid}`} className="w-12 h-12 rounded-full mx-auto border border-orange-500/50" alt="" />
                <div>
                  <h4 className="text-sm font-medium text-white">{myProfile.displayName}</h4>
                  <p className="text-orange-400 font-mono tabular-nums text-xs">₹{myProfile.budget.toFixed(2)} Cr</p>
                </div>
              </div>
              <div className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400">
                <RefreshCw size={18} />
              </div>
              <div className="flex-1 p-4 bg-zinc-900 border border-zinc-800 rounded-xl text-center space-y-2">
                {selectedTeam ? (
                  <>
                    <img src={selectedTeam.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedTeam.uid}`} className="w-12 h-12 rounded-full mx-auto border border-blue-500/50" alt="" />
                    <div>
                      <h4 className="text-sm font-medium text-white">{selectedTeam.displayName}</h4>
                      <p className="text-blue-400 font-mono tabular-nums text-xs">₹{selectedTeam.budget.toFixed(2)} Cr</p>
                    </div>
                  </>
                ) : (
                  <div className="h-20 flex flex-col items-center justify-center gap-2 text-zinc-500">
                    <Users size={24} />
                    <p className="text-xs font-normal">Select a team</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-left">
              {/* My Side */}
              <div className="space-y-3">
                <h5 className="text-xs font-medium text-zinc-400">Your offer</h5>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-normal text-zinc-500">Players offered</p>
                  <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                    {myProfile.squad.length === 0 ? (
                      <p className="text-xs text-zinc-500 italic py-2">No players in squad</p>
                    ) : (
                      myProfile.squad.map(player => (
                        <button
                          key={player.id}
                          onClick={() => setMyTradePlayers(prev => prev.includes(player.id) ? prev.filter(id => id !== player.id) : [...prev, player.id])}
                          className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors text-left cursor-pointer ${myTradePlayers.includes(player.id) ? 'bg-orange-500/10 border-orange-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}
                        >
                          <img src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`} className="w-7 h-7 rounded-md object-cover bg-zinc-800" alt="" />
                          <span className="text-xs font-medium text-white truncate">{player.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-normal text-zinc-500">Cash offered (₹ Cr)</p>
                  <input
                    type="number"
                    value={myCash}
                    onChange={(e) => setMyCash(Math.min(myProfile.budget, parseFloat(e.target.value) || 0))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono tabular-nums focus:border-orange-500/80 outline-none"
                  />
                </div>
              </div>

              {/* Their Side */}
              <div className="space-y-3">
                <h5 className="text-xs font-medium text-zinc-400">Target team</h5>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {otherTeams.map(([uid, team]) => (
                    <button
                      key={uid}
                      onClick={() => {
                        setSelectedTeamId(uid);
                        setTheirTradePlayers([]);
                      }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${selectedTeamId === uid ? 'bg-blue-500/20 text-blue-400 border-blue-500/40' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'}`}
                    >
                      {team.displayName}
                    </button>
                  ))}
                </div>

                {selectedTeam && (
                  <>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-normal text-zinc-500">Players requested</p>
                      <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                        {selectedTeam.squad.length === 0 ? (
                          <p className="text-xs text-zinc-500 italic py-2">No players in squad</p>
                        ) : (
                          selectedTeam.squad.map(player => (
                            <button
                              key={player.id}
                              onClick={() => setTheirTradePlayers(prev => prev.includes(player.id) ? prev.filter(id => id !== player.id) : [...prev, player.id])}
                              className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors text-left cursor-pointer ${theirTradePlayers.includes(player.id) ? 'bg-blue-500/10 border-blue-500' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}
                            >
                              <img src={player.image || `https://api.dicebear.com/7.x/initials/svg?seed=${player.name}`} className="w-7 h-7 rounded-md object-cover bg-zinc-800" alt="" />
                              <span className="text-xs font-medium text-white truncate">{player.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-normal text-zinc-500">Cash requested (₹ Cr)</p>
                      <input
                        type="number"
                        value={theirCash}
                        onChange={(e) => setTheirCash(Math.min(selectedTeam.budget, parseFloat(e.target.value) || 0))}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono tabular-nums focus:border-blue-500/80 outline-none"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <button
              disabled={!selectedTeamId || (myTradePlayers.length === 0 && myCash === 0 && theirTradePlayers.length === 0 && theirCash === 0)}
              onClick={proposeTrade}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-zinc-950 font-medium text-sm rounded-xl transition-colors disabled:opacity-40 cursor-pointer shadow-sm mt-4"
            >
              Propose trade
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

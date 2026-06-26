import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { AuctionRoom, Player, UserProfile, Trade, SquadAnalysis } from "./src/types";
import { PLAYERS } from "./src/data/players";
import { generateAuctionSummary, analyzeDraftTeams, getPlayerFacts, getTacticalAdvice } from "./src/services/ai";

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  const PORT = 3000;
  const rooms: Record<string, AuctionRoom> = {};
  const roomIntervals: Record<string, NodeJS.Timeout> = {};

  function shuffleArray<T>(array: T[]): T[] {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  }

  function structurePlayers(players: Player[], auctionType: string): Player[] {
    if (auctionType === 'draft') {
      return players;
    }

    const basePool = auctionType === 'mega' ? players.filter(p => !p.isRetired) : players;

    const marquee = shuffleArray(basePool.filter(p => p.auctionSet === 'Marquee'));
    const batters = shuffleArray(basePool.filter(p => p.auctionSet === 'Batters'));
    const wicketkeepers = shuffleArray(basePool.filter(p => p.auctionSet === 'Wicketkeepers'));
    const allrounders = shuffleArray(basePool.filter(p => p.auctionSet === 'All-rounders'));
    const bowlers = shuffleArray(basePool.filter(p => p.auctionSet === 'Bowlers'));

    return [...marquee, ...batters, ...wicketkeepers, ...allrounders, ...bowlers];
  }

  io.on("connection", (socket) => {
    socket.on("join-room", ({ roomId, user }: { roomId: string, user: UserProfile }) => {
      socket.join(roomId);
      
      if (!rooms[roomId]) {
        rooms[roomId] = {
          id: roomId,
          name: `Auction ${roomId.slice(0, 4)}`,
          hostId: user.uid,
          status: 'lobby',
          teams: {},
          players: structurePlayers(shuffleArray([...PLAYERS]), 'open'),
          currentPlayerIndex: 0,
          currentBid: 0,
          timer: 10,
          purse: 120,
          bidTime: 10,
          draftLimit: 15,
          history: [],
          auctionType: 'open',
          draftOrder: [],
          draftTurnIndex: 0,
          draftRound: 1,
          draftDirection: 'forward'
        };
      }

      if (!rooms[roomId].teams[user.uid]) {
        rooms[roomId].teams[user.uid] = { ...user, budget: rooms[roomId].purse, squad: [], rtmCards: 2 };
      } else {
        rooms[roomId].teams[user.uid] = {
          ...rooms[roomId].teams[user.uid],
          displayName: user.displayName || rooms[roomId].teams[user.uid].displayName,
          photoURL: user.photoURL || rooms[roomId].teams[user.uid].photoURL
        };
      }
      io.to(roomId).emit("room-update", rooms[roomId]);
    });

    socket.on("select-team", ({ roomId, userId, teamId }) => {
      if (rooms[roomId]) {
        rooms[roomId].teams[userId].teamId = teamId;
        io.to(roomId).emit("room-update", rooms[roomId]);
      }
    });

    socket.on("ready-up", ({ roomId, userId }) => {
      if (rooms[roomId]) {
        rooms[roomId].teams[userId].isReady = true;
        io.to(roomId).emit("room-update", rooms[roomId]);
      }
    });

    socket.on("update-room-settings", ({ roomId, userId, purse, bidTime, draftLimit, auctionType }) => {
      const room = rooms[roomId];
      if (room && room.status === 'lobby' && room.hostId === userId) {
        if (typeof purse === 'number') room.purse = purse;
        if (typeof bidTime === 'number') room.bidTime = bidTime;
        if (typeof draftLimit === 'number') room.draftLimit = draftLimit;
        if (auctionType) room.auctionType = auctionType;
        
        // Update all existing team budgets if purse changed
        Object.values(room.teams).forEach(team => {
          team.budget = room.purse;
        });
        
        io.to(roomId).emit("room-update", room);
      }
    });

    socket.on("start-auction", ({ roomId, auctionType }: { roomId: string, auctionType: 'open' | 'blind' | 'draft' | 'mega' }) => {
      const room = rooms[roomId];
      console.log(`Starting auction for room ${roomId}, type: ${auctionType}`);
      
      if (room && room.status === 'lobby' && room.players.length > 0 && Object.keys(room.teams).length >= 2) {
        room.auctionType = auctionType || 'open';
        
        if (room.auctionType === 'mega') {
          // Filter out retired players for Mega Auction and structure them
          room.players = structurePlayers([...PLAYERS], 'mega');
          room.status = 'retention';
          room.timer = 60; // 60 seconds for retention
          
          // Reset team retentions
          Object.values(room.teams).forEach(team => {
            team.retentions = [];
            team.retentionSubmitted = false;
          });
        } else if (room.auctionType === 'draft') {
          room.status = 'active';
          const numTeams = Math.max(1, Object.keys(room.teams).length);
          const draftLimit = room.draftLimit || 15;
          console.log(`Initializing draft mode for ${numTeams} teams, ${draftLimit} rounds`);

          // --- Phase Allocation (explicit design table, limits 5–20) ---
          const PHASE_TABLE: Record<number, { wk: number; bat: number; ar: number; bowl: number }> = {
            5:  { wk: 1, bat: 2, ar: 1, bowl: 1 },
            6:  { wk: 1, bat: 2, ar: 1, bowl: 2 },
            7:  { wk: 1, bat: 2, ar: 1, bowl: 3 },
            8:  { wk: 1, bat: 3, ar: 1, bowl: 3 },
            9:  { wk: 1, bat: 3, ar: 2, bowl: 3 },
            10: { wk: 1, bat: 3, ar: 2, bowl: 4 },
            11: { wk: 1, bat: 4, ar: 2, bowl: 4 },
            12: { wk: 1, bat: 4, ar: 2, bowl: 5 },
            13: { wk: 1, bat: 5, ar: 2, bowl: 5 },
            14: { wk: 1, bat: 5, ar: 3, bowl: 5 },
            15: { wk: 1, bat: 5, ar: 3, bowl: 6 },
            16: { wk: 1, bat: 6, ar: 3, bowl: 6 },
            17: { wk: 1, bat: 6, ar: 3, bowl: 7 },
            18: { wk: 1, bat: 6, ar: 4, bowl: 7 },
            19: { wk: 1, bat: 7, ar: 4, bowl: 7 },
            20: { wk: 2, bat: 7, ar: 4, bowl: 7 },
          };
          // Clamp to supported range and look up composition
          const clampedLimit = Math.max(5, Math.min(20, draftLimit));
          const phases = PHASE_TABLE[clampedLimit];
          const wkRounds   = phases.wk;
          const batRounds  = phases.bat;
          const arRounds   = phases.ar;
          const bowlRounds = phases.bowl;

          // --- Build Role Pools (freshly shuffled each draft) ---
          const wkPool  = shuffleArray([...PLAYERS].filter(p => p.draftCategory === 'Wicketkeeper'));
          const batPool = shuffleArray([...PLAYERS].filter(p => p.draftCategory === 'Batter'));
          const arPool  = shuffleArray([...PLAYERS].filter(p => p.draftCategory === 'All-rounder'));
          const bowlPool = shuffleArray([...PLAYERS].filter(p => p.draftCategory === 'Bowler'));

          const usedIds = new Set<string>();

          // Try to pick numTeams players from a pool; returns null if pool is exhausted
          const tryPick = (pool: Player[]): Player[] | null => {
            const available = pool.filter(p => !usedIds.has(p.id));
            if (available.length < numTeams) return null;
            const picked = shuffleArray(available).slice(0, numTeams);
            picked.forEach(p => usedIds.add(p.id));
            return picked;
          };

          // Flexible fallback: draw from all remaining unsold players
          const flexPick = (): Player[] => {
            const allRemaining = shuffleArray(
              [...wkPool, ...batPool, ...arPool, ...bowlPool].filter(p => !usedIds.has(p.id))
            );
            const picked = allRemaining.slice(0, numTeams);
            picked.forEach(p => usedIds.add(p.id));
            return picked;
          };

          const batchedPlayers: Player[] = [];
          const roundPhases: string[] = [];

          const phaseConfig = [
            { name: 'Wicketkeepers', count: wkRounds,   pool: wkPool   },
            { name: 'Batters',       count: batRounds,  pool: batPool  },
            { name: 'All-rounders',  count: arRounds,   pool: arPool   },
            { name: 'Bowlers',       count: bowlRounds, pool: bowlPool },
          ];

          for (const phase of phaseConfig) {
            for (let r = 0; r < phase.count; r++) {
              const picked = tryPick(phase.pool);
              if (picked) {
                batchedPlayers.push(...picked);
                roundPhases.push(phase.name);
              } else {
                // Phase pool exhausted — convert remaining rounds of this phase to Flexible
                const flex = flexPick();
                if (flex.length === numTeams) {
                  batchedPlayers.push(...flex);
                  roundPhases.push('Flexible');
                }
                // If not even flexible picks exist, skip the round silently
              }
            }
          }

          const actualRounds = roundPhases.length;
          console.log(`Draft built: ${actualRounds} rounds, ${batchedPlayers.length} players batched`);

          room.players = batchedPlayers;
          room.draftPool = room.players.splice(0, numTeams);
          room.draftRoundPhases = roundPhases;
          room.draftPhase = (roundPhases[0] || 'Wicketkeepers') as AuctionRoom['draftPhase'];
          room.draftOrder = shuffleArray(Object.keys(room.teams));
          room.draftTurnIndex = 0;
          room.draftRound = 1;
          room.draftLimit = actualRounds; // Clamp limit to actual rounds built
          room.draftDirection = 'forward';
          room.timer = 30;
        } else {
          room.players = structurePlayers([...PLAYERS], room.auctionType);
          room.currentPlayerIndex = 0;
          room.status = 'active';
          room.currentBid = room.players[0].basePrice;
          room.currentBidderId = undefined;
          room.timer = room.auctionType === 'blind' ? room.bidTime + 5 : room.bidTime;
          room.blindBids = {};
        }
        
        io.to(roomId).emit("room-update", room);
        startTimer(roomId);
      } else {
        console.log(`Failed to start auction: room=${!!room}, status=${room?.status}, players=${room?.players?.length}`);
      }
    });

    socket.on("submit-retentions", ({ roomId, userId, playerIds }: { roomId: string, userId: string, playerIds: string[] }) => {
      const room = rooms[roomId];
      if (room && room.status === 'retention' && room.teams[userId]) {
        room.teams[userId].retentions = playerIds;
        room.teams[userId].retentionSubmitted = true;
        
        const activeTeams = Object.values(room.teams).filter(t => t.teamId);
        const allSubmitted = activeTeams.length > 0 && activeTeams.every(t => t.retentionSubmitted);
        if (allSubmitted) {
          processRetentions(roomId);
        } else {
          io.to(roomId).emit("room-update", room);
        }
      }
    });

    socket.on("force-process-retentions", ({ roomId }: { roomId: string }) => {
      const room = rooms[roomId];
      if (room && room.status === 'retention') {
        processRetentions(roomId);
      }
    });

    socket.on("pick-player", ({ roomId, userId, playerId }) => {
      const room = rooms[roomId];
      if (room && room.status === 'active' && room.auctionType === 'draft') {
        const currentTurnUserId = room.draftOrder![room.draftTurnIndex!];
        if (userId === currentTurnUserId) {
          const playerIndex = room.draftPool?.findIndex(p => p.id === playerId);
          if (playerIndex !== undefined && playerIndex !== -1) {
            const player = room.draftPool![playerIndex];
            const team = room.teams[userId];
            team.squad.push(player);
            player.soldTo = userId;
            player.soldPrice = 0;
            
            // Remove from pool
            room.draftPool!.splice(playerIndex, 1);

            room.history.push({
              playerId: player.id,
              teamId: team.teamId || 'unknown',
              price: 0,
              timestamp: new Date().toISOString()
            });

            io.to(roomId).emit("player-sold", { 
              player, 
              teamName: team.displayName, 
              price: 0,
              userId: userId
            });

            room.status = 'transitioning';
            io.to(roomId).emit("room-update", room);
            
            setTimeout(() => {
              nextDraftTurn(roomId);
            }, 2000);
          }
        }
      }
    });

    socket.on("place-bid", ({ roomId, userId, amount }) => {
      const room = rooms[roomId];
      if (room && (room.status === 'active' || room.status === 'selling') && typeof amount === 'number' && !isNaN(amount)) {
        const team = room.teams[userId];
        if (team && team.budget >= amount) {
          if (room.auctionType === 'blind') {
            if (!room.blindBids) room.blindBids = {};
            room.blindBids[userId] = amount;
            // Don't emit room update for blind bids to keep them secret
            socket.emit("blind-bid-received", { amount });
          } else {
            room.status = 'active';
            room.currentBid = amount;
            room.currentBidderId = userId;
            room.timer = Math.max(5, Math.min(room.bidTime, room.timer + 5)); // Increment by 5s, guaranteed at least 5s, max bidTime
            io.to(roomId).emit("room-update", room);
            io.to(roomId).emit("bid-placed", { userId, amount, teamName: team.displayName });
          }
        }
      }
    });

    socket.on("rtm-decision", ({ roomId, userId, decision }: { roomId: string, userId: string, decision: 'match' | 'pass' }) => {
      const room = rooms[roomId];
      if (room && room.status === 'rtm' && room.rtmPending?.eligibleUserId === userId) {
        const pending = room.rtmPending;
        const player = room.players[room.currentPlayerIndex];
        if (!player) return;
        
        const useRtm = decision === 'match';
        if (useRtm) {
          const team = room.teams[userId];
          team.budget -= pending.amount;
          team.squad.push(player);
          team.rtmCards -= 1;
          player.soldTo = userId;
          player.soldPrice = pending.amount;
          
          room.history.push({
            playerId: player.id,
            teamId: team.teamId || 'unknown',
            price: pending.amount,
            timestamp: new Date().toISOString()
          });

          io.to(roomId).emit("player-sold", { 
            player, 
            teamName: team.displayName, 
            price: pending.amount,
            userId: userId,
            isRtm: true
          });
        } else {
          // Original winner gets the player
          const winner = room.teams[pending.originalWinnerId];
          winner.budget -= pending.amount;
          winner.squad.push(player);
          player.soldTo = pending.originalWinnerId;
          player.soldPrice = pending.amount;

          room.history.push({
            playerId: player.id,
            teamId: winner.teamId || 'unknown',
            price: pending.amount,
            timestamp: new Date().toISOString()
          });

          io.to(roomId).emit("player-sold", { 
            player, 
            teamName: winner.displayName, 
            price: pending.amount,
            userId: pending.originalWinnerId
          });
        }

        room.rtmPending = undefined;
        nextPlayer(roomId);
      }
    });

    socket.on("chat-message", ({ roomId, userId, message, userName }) => {
      io.to(roomId).emit("new-chat", { userId, message, userName, timestamp: new Date().toISOString() });
    });

    socket.on("start-accelerated", ({ roomId, userId }) => {
      const room = rooms[roomId];
      if (room && room.status === 'finished' && room.hostId === userId) {
        // Find all unsold players
        const unsoldPlayers = room.players.filter(p => !p.soldTo);
        if (unsoldPlayers.length > 0) {
          // Reset unsold players with 50% base price
          unsoldPlayers.forEach(p => {
            p.basePrice = Math.round((p.basePrice * 0.5) * 100) / 100;
          });
          
          room.players = [...room.players.filter(p => p.soldTo), ...unsoldPlayers];
          room.currentPlayerIndex = room.players.findIndex(p => !p.soldTo);
          room.status = 'active';
          room.currentBid = room.players[room.currentPlayerIndex].basePrice;
          room.currentBidderId = undefined;
          room.timer = room.bidTime;
          
          io.to(roomId).emit("room-update", room);
          io.to(roomId).emit("new-chat", { 
            userId: 'system', 
            message: "ACCELERATED ROUND STARTED! Unsold players return at 50% base price.", 
            userName: 'Auctioneer', 
            timestamp: new Date().toISOString() 
          });
          startTimer(roomId);
        }
      }
    });

    socket.on("start-trade-window", ({ roomId, userId }) => {
      const room = rooms[roomId];
      if (room && room.status === 'finished' && room.hostId === userId) {
        room.status = 'trade';
        if (!room.trades) room.trades = [];
        io.to(roomId).emit("room-update", room);
        io.to(roomId).emit("new-chat", { 
          userId: 'system', 
          message: "TRADE WINDOW OPEN! Propose trades to other teams now.", 
          userName: 'Auctioneer', 
          timestamp: new Date().toISOString() 
        });
      }
    });

    socket.on("propose-trade", ({ roomId, trade }: { roomId: string, trade: Omit<Trade, 'id' | 'status' | 'timestamp'> }) => {
      const room = rooms[roomId];
      if (room && room.status === 'trade') {
        const newTrade: Trade = {
          ...trade,
          id: Math.random().toString(36).substr(2, 9),
          status: 'pending',
          timestamp: new Date().toISOString()
        };
        if (!room.trades) room.trades = [];
        room.trades.push(newTrade);
        io.to(roomId).emit("room-update", room);
        
        const fromTeam = room.teams[trade.fromUserId];
        const toTeam = room.teams[trade.toUserId];
        io.to(roomId).emit("new-chat", { 
          userId: 'system', 
          message: `${fromTeam.displayName} proposed a trade to ${toTeam.displayName}`, 
          userName: 'Trade Bot', 
          timestamp: new Date().toISOString() 
        });
      }
    });

    socket.on("respond-to-trade", ({ roomId, tradeId, response }: { roomId: string, tradeId: string, response: 'accepted' | 'rejected' }) => {
      const room = rooms[roomId];
      if (room && room.status === 'trade' && room.trades) {
        const tradeIndex = room.trades.findIndex(t => t.id === tradeId);
        if (tradeIndex !== -1) {
          const trade = room.trades[tradeIndex];
          trade.status = response;
          
          if (response === 'accepted') {
            const fromTeam = room.teams[trade.fromUserId];
            const toTeam = room.teams[trade.toUserId];
            
            // Swap players
            const fromPlayers = fromTeam.squad.filter(p => trade.fromPlayerIds.includes(p.id));
            const toPlayers = toTeam.squad.filter(p => trade.toPlayerIds.includes(p.id));
            
            fromTeam.squad = [...fromTeam.squad.filter(p => !trade.fromPlayerIds.includes(p.id)), ...toPlayers];
            toTeam.squad = [...toTeam.squad.filter(p => !trade.toPlayerIds.includes(p.id)), ...fromPlayers];
            
            // Update player ownership
            fromPlayers.forEach(p => { p.soldTo = trade.toUserId; });
            toPlayers.forEach(p => { p.soldTo = trade.fromUserId; });
            
            // Swap cash
            fromTeam.budget -= trade.fromCash;
            fromTeam.budget += trade.toCash;
            toTeam.budget -= trade.toCash;
            toTeam.budget += trade.fromCash;

            io.to(roomId).emit("new-chat", { 
              userId: 'system', 
              message: `TRADE ACCEPTED! ${fromTeam.displayName} and ${toTeam.displayName} have swapped players.`, 
              userName: 'Trade Bot', 
              timestamp: new Date().toISOString() 
            });
          } else {
            const fromTeam = room.teams[trade.fromUserId];
            const toTeam = room.teams[trade.toUserId];
            io.to(roomId).emit("new-chat", { 
              userId: 'system', 
              message: `TRADE REJECTED: ${toTeam.displayName} declined the offer from ${fromTeam.displayName}`, 
              userName: 'Trade Bot', 
              timestamp: new Date().toISOString() 
            });
          }
          
          io.to(roomId).emit("room-update", room);
        }
      }
    });

    socket.on('update-squad-analysis', ({ roomId, userId, analysis }: { roomId: string, userId: string, analysis: SquadAnalysis }) => {
      const room = rooms[roomId];
      if (room) {
        if (!room.squadAnalyses) room.squadAnalyses = {};
        room.squadAnalyses[userId] = analysis;
        io.to(roomId).emit('room-update', room);
      }
    });

    socket.on('update-player-facts', ({ roomId, playerId, facts }) => {
      const room = rooms[roomId];
      if (room) {
        if (!room.playerFacts) room.playerFacts = {};
        room.playerFacts[playerId] = facts;
        io.to(roomId).emit('room-update', room);
      }
    });

    socket.on('update-draft-analysis', ({ roomId, analysis }) => {
      const room = rooms[roomId];
      if (room) {
        room.draftAnalysis = analysis;
        io.to(roomId).emit('room-update', room);
      }
    });

    socket.on('update-ai-summary', ({ roomId, summary }) => {
      const room = rooms[roomId];
      if (room) {
        room.aiSummary = summary;
        io.to(roomId).emit('room-update', room);
      }
    });

    socket.on('pause-auction', ({ roomId, userId }) => {
      const room = rooms[roomId];
      if (room && room.hostId === userId) {
        room.isPaused = true;
        io.to(roomId).emit('room-update', room);
        io.to(roomId).emit('new-chat', { 
          userId: 'system', 
          message: "AUCTION PAUSED BY HOST", 
          userName: 'Auctioneer', 
          timestamp: new Date().toISOString() 
        });
      }
    });

    socket.on('resume-auction', ({ roomId, userId }) => {
      const room = rooms[roomId];
      if (room && room.hostId === userId) {
        room.isPaused = false;
        io.to(roomId).emit('room-update', room);
        io.to(roomId).emit('new-chat', { 
          userId: 'system', 
          message: "AUCTION RESUMED", 
          userName: 'Auctioneer', 
          timestamp: new Date().toISOString() 
        });
      }
    });

    socket.on('finish-auction', ({ roomId, userId }) => {
      const room = rooms[roomId];
      if (room && room.hostId === userId && room.status !== 'finished') {
        room.status = 'finished';
        io.to(roomId).emit('room-update', room);
        io.to(roomId).emit('new-chat', { 
          userId: 'system', 
          message: "AUCTION FINISHED BY HOST", 
          userName: 'Auctioneer', 
          timestamp: new Date().toISOString() 
        });
      }
    });
  });

  function nextPlayer(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.auctionType === 'draft') {
      nextDraftTurn(roomId);
      return;
    }

    room.currentPlayerIndex += 1;
    room.playerFacts = {}; // Reset facts for new player
    
    if (room.currentPlayerIndex < room.players.length) {
      room.status = 'active';
      room.timer = room.bidTime;
      room.currentBid = room.players[room.currentPlayerIndex].basePrice;
      room.currentBidderId = undefined;
      room.blindBids = {};
      io.to(roomId).emit("room-update", room);
    } else {
      const unsoldPlayers = room.players.filter(p => !p.soldTo);
      if (!room.isAccelerated && unsoldPlayers.length > 0) {
        room.isAccelerated = true;
        unsoldPlayers.forEach(p => {
          p.basePrice = Math.round((p.basePrice * 0.5) * 100) / 100;
          p.auctionSet = 'Accelerated';
        });

        room.players = [...room.players.filter(p => p.soldTo), ...unsoldPlayers];
        room.currentPlayerIndex = room.players.findIndex(p => !p.soldTo);

        room.status = 'active';
        room.timer = room.bidTime;
        room.currentBid = room.players[room.currentPlayerIndex].basePrice;
        room.currentBidderId = undefined;
        room.blindBids = {};

        io.to(roomId).emit("room-update", room);
        io.to(roomId).emit("new-chat", { 
          userId: 'system', 
          message: "ACCELERATED ROUND STARTED AUTOMATICALLY! Unsold players return at 50% base price.", 
          userName: 'Auctioneer', 
          timestamp: new Date().toISOString() 
        });
      } else {
        room.status = 'finished';
        io.to(roomId).emit("room-update", room);
      }
    }
  }

  function processRetentions(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;

    Object.entries(room.teams).forEach(([uid, team]) => {
      const retentions = team.retentions || [];
      let cost = 0;
      let cappedCount = 0;
      let uncappedCount = 0;

      // IPL 2025 Retention Costs (Simplified)
      // Capped: 1st: 18, 2nd: 14, 3rd: 11, 4th: 18, 5th: 14
      // Uncapped: 4 each
      const cappedCosts = [18, 14, 11, 18, 14];

      retentions.forEach(pid => {
        const player = PLAYERS.find(p => p.id === pid);
        if (player) {
          let currentCost = 0;
          if (player.isUncapped) {
            currentCost = 4;
            cost += currentCost;
            uncappedCount++;
          } else {
            currentCost = cappedCosts[cappedCount] || 14;
            cost += currentCost;
            cappedCount++;
          }
          // Add to squad
          team.squad.push({ ...player, soldPrice: currentCost, soldTo: uid });
          // Add to history
          room.history.push({
            playerId: player.id,
            teamId: team.teamId || 'unknown',
            price: currentCost,
            timestamp: new Date().toISOString()
          });
          // Remove from room players
          const pIdx = room.players.findIndex(p => p.id === pid);
          if (pIdx !== -1) room.players.splice(pIdx, 1);
        }
      });

      team.budget -= cost;
      team.rtmCards = Math.max(0, 6 - (cappedCount + uncappedCount));
    });

    room.players = structurePlayers(room.players, room.auctionType);
    room.currentPlayerIndex = 0;

    room.status = 'active';
    room.timer = room.bidTime;
    room.currentBid = room.players[0].basePrice;
    room.currentBidderId = undefined;
    
    io.to(roomId).emit("room-update", room);
    io.to(roomId).emit("auction-started", { type: room.auctionType });
    startTimer(roomId);
  }

  function nextDraftTurn(roomId: string) {
    const room = rooms[roomId];
    if (!room || room.auctionType !== 'draft' || !room.draftOrder) return;

    const numTeams = room.draftOrder.length;
    if (numTeams === 0) return;
    
    // If pool is empty, start next round
    if (room.draftPool?.length === 0) {
      // Check if draft limit reached
      if (room.draftLimit && room.draftRound! >= room.draftLimit) {
        room.status = 'finished';
        io.to(roomId).emit("room-update", room);
        return;
      }

      room.draftDirection = room.draftDirection === 'forward' ? 'backward' : 'forward';
      room.draftRound! += 1;
      room.draftPool = room.players.splice(0, numTeams);
      room.playerFacts = {}; // Reset facts for new pool

      // Update draft phase based on pre-computed schedule
      const newPhase = room.draftRoundPhases?.[room.draftRound! - 1];
      if (newPhase && newPhase !== room.draftPhase) {
        room.draftPhase = newPhase as AuctionRoom['draftPhase'];
      }
      
      // If no more players, finish
      if (room.draftPool.length === 0) {
        room.status = 'finished';
        io.to(roomId).emit("room-update", room);
        return;
      }
      
      // Snake draft: last picker of previous round picks first in next round.
      // The draftTurnIndex stays the same at the round boundary.
    } else {
      // Move to next turn within the round
      if (room.draftDirection === 'forward') {
        room.draftTurnIndex! += 1;
      } else {
        room.draftTurnIndex! -= 1;
      }
    }

    room.status = 'active';
    room.timer = 30;
    io.to(roomId).emit("room-update", room);
  }

  function handleSold(roomId: string) {
    const room = rooms[roomId];
    if (!room) return;

    const currentPlayer = room.players[room.currentPlayerIndex];
    if (!currentPlayer || !room.currentBidderId) {
      room.status = 'transitioning';
      io.to(roomId).emit("room-update", room);
      setTimeout(() => nextPlayer(roomId), 2000);
      return;
    }

    const winner = room.teams[room.currentBidderId];
    if (!winner) {
      room.status = 'transitioning';
      io.to(roomId).emit("room-update", room);
      setTimeout(() => nextPlayer(roomId), 2000);
      return;
    }

    // Check for RTM Eligibility (Only for MEGA auctions)
    const prevTeamId = currentPlayer.previousTeamId;
    let rtmEligibleUserId = '';
    
    if (room.auctionType === 'mega' && prevTeamId) {
      for (const [uid, team] of Object.entries(room.teams)) {
        if (team.teamId === prevTeamId && team.rtmCards > 0 && uid !== room.currentBidderId) {
          rtmEligibleUserId = uid;
          break;
        }
      }
    }

    if (rtmEligibleUserId) {
      room.status = 'rtm';
      room.timer = 10; // 10 seconds for RTM decision
      room.rtmPending = {
        eligibleUserId: rtmEligibleUserId,
        amount: room.currentBid,
        playerId: currentPlayer.id,
        originalWinnerId: room.currentBidderId
      };
      io.to(roomId).emit("room-update", room);
      return; // Wait for rtm-decision
    }

    // Normal Sold
    winner.budget -= room.currentBid;
    winner.squad.push(currentPlayer);
    currentPlayer.soldTo = room.currentBidderId;
    currentPlayer.soldPrice = room.currentBid;

    io.to(roomId).emit("player-sold", { 
      player: currentPlayer, 
      teamName: winner.displayName, 
      price: room.currentBid,
      teamId: winner.teamId,
      userId: room.currentBidderId
    });

    room.history.push({
      playerId: currentPlayer.id,
      teamId: winner.teamId!,
      price: room.currentBid,
      timestamp: new Date().toISOString()
    });

    room.status = 'transitioning';
    io.to(roomId).emit("room-update", room);
    setTimeout(() => nextPlayer(roomId), 3000);
  }

  function startTimer(roomId: string) {
    if (roomIntervals[roomId]) clearInterval(roomIntervals[roomId]);

    roomIntervals[roomId] = setInterval(() => {
      const room = rooms[roomId];
      if (!room) {
        if (roomIntervals[roomId]) clearInterval(roomIntervals[roomId]);
        delete roomIntervals[roomId];
        return;
      }

      if (room.status === 'finished') {
        if (roomIntervals[roomId]) clearInterval(roomIntervals[roomId]);
        delete roomIntervals[roomId];
        return;
      }

      if (room.status !== 'active' && room.status !== 'rtm' && room.status !== 'selling' && room.status !== 'retention') {
        return;
      }

      if (room.isPaused) {
        return;
      }

      if (room.timer > 0) {
        room.timer -= 1;
        io.to(roomId).emit("timer-update", room.timer);
      } else {
        // Ensure room is still in a state that requires timer action
        if (room.status !== 'active' && room.status !== 'rtm' && room.status !== 'selling' && room.status !== 'retention') {
          return;
        }
        
        if (room.status === 'retention') {
          processRetentions(roomId);
          return;
        }
        
        if (room.status === 'selling') {
          handleSold(roomId);
          return;
        }

        if (room.status === 'rtm') {
          // Auto-pass RTM
          const pending = room.rtmPending;
          if (pending) {
            const player = room.players[room.currentPlayerIndex];
            if (player) {
              const winner = room.teams[pending.originalWinnerId];
              winner.budget -= pending.amount;
              winner.squad.push(player);
              player.soldTo = pending.originalWinnerId;
              player.soldPrice = pending.amount;

              room.history.push({
                playerId: player.id,
                teamId: winner.teamId || 'unknown',
                price: pending.amount,
                timestamp: new Date().toISOString()
              });

              io.to(roomId).emit("player-sold", { 
                player, 
                teamName: winner.displayName, 
                price: pending.amount,
                userId: pending.originalWinnerId
              });
            }
            room.rtmPending = undefined;
            nextPlayer(roomId);
          }
          return;
        }

        if (room.auctionType === 'draft') {
          const currentTurnUserId = room.draftOrder![room.draftTurnIndex!];
          const team = room.teams[currentTurnUserId];
          
          if (room.draftPool && room.draftPool.length > 0 && team) {
            const player = room.draftPool[0]; // Auto-pick first available in pool
            team.squad.push(player);
            player.soldTo = currentTurnUserId;
            player.soldPrice = 0;
            
            // Remove from pool
            room.draftPool.splice(0, 1);
            
            io.to(roomId).emit("player-sold", { 
              player, 
              teamName: team.displayName, 
              price: 0,
              userId: currentTurnUserId
            });

            room.status = 'transitioning';
            io.to(roomId).emit("room-update", room);
            setTimeout(() => nextDraftTurn(roomId), 2000);
          }
          return;
        }

        // Handle Blind Auction Reveal
        if (room.auctionType === 'blind' && room.blindBids && Object.keys(room.blindBids).length > 0) {
          let highestBid = 0;
          let winnerId = '';
          
          for (const [uid, bid] of Object.entries(room.blindBids)) {
            if (bid > highestBid) {
              highestBid = bid;
              winnerId = uid;
            }
          }
          
          if (winnerId) {
            room.currentBid = highestBid;
            room.currentBidderId = winnerId;
            room.status = 'selling';
            room.timer = 3; // 3 seconds for reveal
            io.to(roomId).emit("blind-reveal", { winnerId, amount: highestBid, bids: room.blindBids });
            io.to(roomId).emit("room-update", room);
            return;
          }
        }

        const currentPlayer = room.players[room.currentPlayerIndex];
        if (!currentPlayer) {
          room.status = 'finished';
          io.to(roomId).emit("room-update", room);
          return;
        }

        if (room.currentBidderId) {
          room.status = 'selling';
          room.timer = 2; // 2 seconds for "Going Once, Twice..."
          io.to(roomId).emit("room-update", room);
          return;
        } else {
          // Unsold
          io.to(roomId).emit("player-unsold", currentPlayer);
          room.status = 'transitioning';
          io.to(roomId).emit("room-update", room);
          setTimeout(() => nextPlayer(roomId), 3000);
          return;
        }
      }
    }, 1000);
  }

  app.post("/api/ai-summary", async (req, res) => {
    try {
      const { history, teams } = req.body;
      const summary = await generateAuctionSummary(history, teams);
      res.json({ summary });
    } catch (error) {
      console.error("Express API ai-summary error:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  app.post("/api/draft-analysis", async (req, res) => {
    try {
      const { teams } = req.body;
      const analysis = await analyzeDraftTeams(teams);
      res.json({ analysis });
    } catch (error) {
      console.error("Express API draft-analysis error:", error);
      res.status(500).json({ error: "Failed to analyze draft" });
    }
  });

  app.post("/api/player-facts", async (req, res) => {
    try {
      const { player } = req.body;
      const facts = await getPlayerFacts(player);
      res.json({ facts });
    } catch (error) {
      console.error("Express API player-facts error:", error);
      res.status(500).json({ error: "Failed to get player facts" });
    }
  });

  app.post("/api/tactical-advice", async (req, res) => {
    try {
      const { player, team } = req.body;
      const advice = await getTacticalAdvice(player, team);
      res.json({ advice });
    } catch (error) {
      console.error("Express API tactical-advice error:", error);
      res.status(500).json({ error: "Failed to get tactical advice" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  httpServer.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

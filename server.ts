import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { AuctionRoom, Player, UserProfile, Trade, SquadAnalysis } from "./src/types";
import { PLAYERS } from "./src/data/players";
import { generateAuctionSummary, analyzeDraftTeams, getPlayerFacts, getTacticalAdvice } from "./src/services/geminiServer";
import { verifyFirebaseIdToken } from "./src/services/authServer";
import {
  validateAISummaryPayload,
  validateDraftAnalysisPayload,
  validatePlayerFactsPayload,
  validateTacticalAdvicePayload,
  validateJoinRoomPayload,
  validateSelectTeamPayload,
  validateUpdateSettingsPayload,
  validatePlaceBidPayload,
  validateChatMessagePayload,
  validateProposeTradePayload
} from "./src/services/validation";
import { SimpleRateLimiter } from "./src/services/rateLimiter";

dotenv.config();

export interface ServerOptions {
  port?: number;
  customCerts?: Record<string, string>;
  customProjectId?: string;
  skipVite?: boolean;
  enableSignalHandlers?: boolean;
}

export async function startServer(options: ServerOptions = {}) {
  let isShuttingDown = false;
  const app = express();
  // Bound JSON payload size to 1MB to prevent memory exhaustion attacks
  app.use(express.json({ limit: "1mb" }));

  // Basic security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  // Rejection middleware when server is shutting down
  app.use((req, res, next) => {
    if (isShuttingDown && req.path !== "/health") {
      res.setHeader("Connection", "close");
      res.status(503).json({ error: "Server is shutting down" });
      return;
    }
    next();
  });

  // Lightweight health check endpoint for uptime monitoring and hosting platforms (e.g. Render)
  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "ipl-auction-pro"
    });
  });

  const httpServer = createServer(app);

  // Determine allowed origin: allow localhost and APP_URL in production
  const allowedOrigin = process.env.APP_URL || "*";
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigin, methods: ["GET", "POST"] }
  });

  // Dedicated rate limiters
  const aiRateLimiter = new SimpleRateLimiter(30, 60000); // 30 requests / min per IP
  const chatRateLimiter = new SimpleRateLimiter(20, 10000); // 20 messages / 10s per user

  io.use(async (socket, next) => {
    try {
      if (isShuttingDown) {
        return next(new Error("Server is shutting down"));
      }

      const token = socket.handshake.auth?.token;
      if (!token || typeof token !== "string") {
        return next(new Error("Authentication token missing"));
      }

      const result = await verifyFirebaseIdToken(token, {
        customCerts: options.customCerts,
        customProjectId: options.customProjectId
      });
      if (!result.valid || !result.uid) {
        return next(new Error(result.error || "Authentication failed"));
      }

      socket.data.userId = result.uid;
      next();
    } catch (error) {
      console.error("Socket authentication middleware error:", error);
      next(new Error("Authentication verification error"));
    }
  });

  const PORT = options.port || Number(process.env.PORT) || 3000;
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

  function clonePlayers(players: Player[]): Player[] {
    return players.map(p => ({
      ...p,
      soldTo: undefined,
      soldPrice: undefined,
    }));
  }

  function structurePlayers(players: Player[], auctionType: string): Player[] {
    const cleanPlayers = clonePlayers(players);
    if (auctionType === 'draft') {
      return cleanPlayers;
    }

    const basePool = auctionType === 'mega' ? cleanPlayers.filter(p => !p.isRetired) : cleanPlayers;

    const marquee = shuffleArray(basePool.filter(p => p.auctionSet === 'Marquee'));
    const batters = shuffleArray(basePool.filter(p => p.auctionSet === 'Batters'));
    const wicketkeepers = shuffleArray(basePool.filter(p => p.auctionSet === 'Wicketkeepers'));
    const allrounders = shuffleArray(basePool.filter(p => p.auctionSet === 'All-rounders'));
    const bowlers = shuffleArray(basePool.filter(p => p.auctionSet === 'Bowlers'));

    return [...marquee, ...batters, ...wicketkeepers, ...allrounders, ...bowlers];
  }

  io.on("connection", (socket) => {
    socket.on("join-room", (payload: any) => {
      const authenticatedUserId = socket.data.userId;
      if (!authenticatedUserId) {
        socket.disconnect(true);
        return;
      }

      const validation = validateJoinRoomPayload(payload);
      if (!validation.valid || !validation.data) {
        socket.emit("error-message", { message: validation.error || "Invalid join payload" });
        return;
      }

      const { roomId, displayName, photoURL } = validation.data;
      socket.join(roomId);
      socket.data.roomId = roomId;

      if (!rooms[roomId]) {
        rooms[roomId] = {
          id: roomId,
          name: `Auction ${roomId.slice(0, 4)}`,
          hostId: authenticatedUserId,
          status: 'lobby',
          teams: {},
          players: structurePlayers(shuffleArray(clonePlayers(PLAYERS)), 'open'),
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

      if (!rooms[roomId].teams[authenticatedUserId]) {
        rooms[roomId].teams[authenticatedUserId] = {
          uid: authenticatedUserId,
          displayName,
          photoURL,
          budget: rooms[roomId].purse,
          squad: [],
          rtmCards: 2,
          isConnected: true
        };
      } else {
        rooms[roomId].teams[authenticatedUserId] = {
          ...rooms[roomId].teams[authenticatedUserId],
          uid: authenticatedUserId,
          displayName: displayName || rooms[roomId].teams[authenticatedUserId].displayName,
          photoURL: photoURL || rooms[roomId].teams[authenticatedUserId].photoURL,
          isConnected: true
        };
      }
      io.to(roomId).emit("room-update", rooms[roomId]);
    });

    socket.on("select-team", (payload: any) => {
      const userId = socket.data.userId;
      const validation = validateSelectTeamPayload(payload);
      if (!validation.valid || !validation.data) {
        socket.emit("error-message", { message: validation.error || "Invalid select team payload" });
        return;
      }
      const { roomId, teamId } = validation.data;
      if (rooms[roomId] && rooms[roomId].teams[userId]) {
        rooms[roomId].teams[userId].teamId = teamId;
        io.to(roomId).emit("room-update", rooms[roomId]);
      }
    });

    socket.on("ready-up", (payload: any) => {
      const userId = socket.data.userId;
      const roomId = typeof payload?.roomId === "string" ? payload.roomId.trim() : "";
      if (!roomId || !rooms[roomId] || !rooms[roomId].teams[userId]) return;
      rooms[roomId].teams[userId].isReady = true;
      io.to(roomId).emit("room-update", rooms[roomId]);
    });

    socket.on("update-room-settings", (payload: any) => {
      const userId = socket.data.userId;
      const validation = validateUpdateSettingsPayload(payload);
      if (!validation.valid || !validation.data) {
        socket.emit("error-message", { message: validation.error || "Invalid room settings" });
        return;
      }
      const { roomId, purse, bidTime, draftLimit, auctionType } = validation.data;
      const room = rooms[roomId];
      if (room && room.status === 'lobby' && room.hostId === userId) {
        if (typeof purse === 'number') {
          room.purse = purse;
          // Update all existing team budgets if purse changed
          Object.values(room.teams).forEach(team => {
            team.budget = room.purse;
          });
        }
        if (typeof bidTime === 'number') room.bidTime = bidTime;
        if (typeof draftLimit === 'number') room.draftLimit = draftLimit;
        if (auctionType) room.auctionType = auctionType;

        io.to(roomId).emit("room-update", room);
      }
    });

    socket.on("start-auction", (payload: any) => {
      const userId = socket.data.userId;
      const roomId = typeof payload?.roomId === "string" ? payload.roomId.trim() : "";
      const rawType = payload?.auctionType;
      const validTypes = new Set(['open', 'blind', 'draft', 'mega']);
      const auctionType = (validTypes.has(rawType) ? rawType : 'open') as 'open' | 'blind' | 'draft' | 'mega';

      const room = rooms[roomId];
      if (!room || room.status !== 'lobby' || room.hostId !== userId || room.players.length === 0 || Object.keys(room.teams).length < 2) {
        console.log(`Failed to start auction: room=${!!room}, status=${room?.status}, players=${room?.players?.length}`);
        return;
      }

      console.log(`Starting auction for room ${roomId}, type: ${auctionType}, requested by: ${userId}`);
      room.auctionType = auctionType;
      room.history = [];
      room.isAccelerated = false;
      Object.values(room.teams).forEach(team => {
        team.budget = room.purse;
        team.squad = [];
        team.rtmCards = 2;
        team.retentions = [];
        team.retentionSubmitted = false;
      });

        if (room.auctionType === 'mega') {
          // Filter out retired players for Mega Auction and structure them
          room.players = structurePlayers(clonePlayers(PLAYERS), 'mega');
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

          // --- Phase Allocation (explicit design table, limits 5â€“20) ---
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
          const cleanPlayers = clonePlayers(PLAYERS);
          const wkPool  = shuffleArray(cleanPlayers.filter(p => p.draftCategory === 'Wicketkeeper'));
          const batPool = shuffleArray(cleanPlayers.filter(p => p.draftCategory === 'Batter'));
          const arPool  = shuffleArray(cleanPlayers.filter(p => p.draftCategory === 'All-rounder'));
          const bowlPool = shuffleArray(cleanPlayers.filter(p => p.draftCategory === 'Bowler'));

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
                // Phase pool exhausted â€” convert remaining rounds of this phase to Flexible
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
          room.players = structurePlayers(clonePlayers(PLAYERS), room.auctionType);
          room.currentPlayerIndex = 0;
          room.status = 'active';
          room.currentBid = room.players[0].basePrice;
          room.currentBidderId = undefined;
          room.timer = room.auctionType === 'blind' ? room.bidTime + 5 : room.bidTime;
          room.blindBids = {};
        }

        io.to(roomId).emit("room-update", room);
        startTimer(roomId);
    });

    socket.on("submit-retentions", ({ roomId, playerIds }: { roomId: string, playerIds: string[] }) => {
      const userId = socket.data.userId;
      const room = rooms[roomId];
      if (room && room.status === 'retention' && room.teams[userId] && Array.isArray(playerIds)) {
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
      const userId = socket.data.userId;
      const room = rooms[roomId];
      if (room && room.status === 'retention' && room.hostId === userId) {
        processRetentions(roomId);
      }
    });

    socket.on("pick-player", ({ roomId, playerId }: { roomId: string, playerId: string }) => {
      const userId = socket.data.userId;
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

    socket.on("place-bid", (payload: any) => {
      const userId = socket.data.userId;
      const validation = validatePlaceBidPayload(payload);
      if (!validation.valid || !validation.data) {
        socket.emit("error-message", { message: validation.error || "Invalid bid payload" });
        return;
      }
      const { roomId, amount } = validation.data;
      const room = rooms[roomId];
      if (room && (room.status === 'active' || room.status === 'selling') && !room.isPaused) {
        const team = room.teams[userId];
        if (team && team.budget >= amount) {
          if (room.auctionType === 'blind') {
            if (!room.blindBids) room.blindBids = {};
            room.blindBids[userId] = amount;
            // Don't emit room update for blind bids to keep them secret
            socket.emit("blind-bid-received", { amount });
          } else {
            const isFirstBid = !room.currentBidderId;
            const currentLot = room.players[room.currentPlayerIndex];
            const minRequired = isFirstBid ? (currentLot ? currentLot.basePrice : 0) : room.currentBid;

            if (isFirstBid ? amount < minRequired : amount <= minRequired) {
              socket.emit("error-message", { message: `Bid amount must exceed current bid of ${minRequired} Cr` });
              return;
            }

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

    socket.on("rtm-decision", ({ roomId, decision }: { roomId: string, decision: 'match' | 'pass' }) => {
      const userId = socket.data.userId;
      if (typeof roomId !== 'string' || (decision !== 'match' && decision !== 'pass')) return;
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

    socket.on("chat-message", (payload: any) => {
      const userId = socket.data.userId;
      if (!userId) return;

      if (!chatRateLimiter.check(userId).allowed) {
        socket.emit("error-message", { message: "Chat rate limit exceeded. Please slow down." });
        return;
      }

      const validation = validateChatMessagePayload(payload);
      if (!validation.valid || !validation.data) {
        socket.emit("error-message", { message: validation.error || "Invalid chat message" });
        return;
      }

      const { roomId, message, userName } = validation.data;
      const room = rooms[roomId];
      const displayName = room?.teams[userId]?.displayName || userName || 'Participant';
      io.to(roomId).emit("new-chat", {
        userId,
        message,
        userName: displayName,
        timestamp: new Date().toISOString()
      });
    });

    socket.on("start-accelerated", ({ roomId }: { roomId: string }) => {
      const userId = socket.data.userId;
      if (typeof roomId !== 'string') return;
      const room = rooms[roomId];
      if (room && room.status === 'finished' && room.hostId === userId) {
        // Find all unsold players
        const unsoldPlayers = room.players.filter(p => !p.soldTo);
        if (unsoldPlayers.length > 0) {
          // Reset unsold players with 50% base price
          unsoldPlayers.forEach(p => {
            p.basePrice = Math.round((p.basePrice * 0.5) * 100) / 100;
            p.soldTo = undefined;
            p.soldPrice = undefined;
          });

          room.players = [...room.players.filter(p => p.soldTo), ...unsoldPlayers];
          room.currentPlayerIndex = room.players.findIndex(p => !p.soldTo);
          room.status = 'active';
          room.currentBid = room.players[room.currentPlayerIndex].basePrice;
          room.currentBidderId = undefined;
          room.blindBids = {};
          room.timer = room.auctionType === 'blind' ? room.bidTime + 5 : room.bidTime;

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

    socket.on("start-trade-window", ({ roomId }: { roomId: string }) => {
      const userId = socket.data.userId;
      if (typeof roomId !== 'string') return;
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

    socket.on("propose-trade", (payload: any) => {
      const userId = socket.data.userId;
      const validation = validateProposeTradePayload(payload);
      if (!validation.valid || !validation.data) {
        socket.emit("error-message", { message: validation.error || "Invalid trade proposal" });
        return;
      }
      const { roomId, trade } = validation.data;
      const room = rooms[roomId];
      if (room && room.status === 'trade' && room.teams[trade.toUserId]) {
        const newTrade: Trade = {
          ...trade,
          fromUserId: userId,
          id: Math.random().toString(36).substr(2, 9),
          status: 'pending',
          timestamp: new Date().toISOString()
        };
        if (!room.trades) room.trades = [];
        room.trades.push(newTrade);
        io.to(roomId).emit("room-update", room);

        const fromTeam = room.teams[userId];
        const toTeam = room.teams[trade.toUserId];
        io.to(roomId).emit("new-chat", {
          userId: 'system',
          message: `${fromTeam?.displayName || 'A team'} proposed a trade to ${toTeam?.displayName || 'another team'}`,
          userName: 'Trade Bot',
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on("respond-to-trade", ({ roomId, tradeId, response }: { roomId: string, tradeId: string, response: 'accepted' | 'rejected' }) => {
      const userId = socket.data.userId;
      const room = rooms[roomId];
      if (room && room.status === 'trade' && room.trades) {
        const tradeIndex = room.trades.findIndex(t => t.id === tradeId);
        if (tradeIndex !== -1) {
          const trade = room.trades[tradeIndex];
          if (trade.toUserId !== userId || trade.status !== 'pending') return;
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

    socket.on('update-squad-analysis', ({ roomId, analysis }: { roomId: string, analysis: SquadAnalysis }) => {
      const userId = socket.data.userId;
      const room = rooms[roomId];
      if (room && userId) {
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

    socket.on('pause-auction', ({ roomId }: { roomId: string }) => {
      const userId = socket.data.userId;
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

    socket.on('close-trade-window', ({ roomId }: { roomId: string }) => {
      const userId = socket.data.userId;
      const room = rooms[roomId];
      if (room && room.status === 'trade' && room.hostId === userId) {
        room.status = 'finished';
        io.to(roomId).emit('room-update', room);
        io.to(roomId).emit('new-chat', {
          userId: 'system',
          message: "TRADE WINDOW CLOSED!",
          userName: 'Auctioneer',
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('resume-auction', ({ roomId }: { roomId: string }) => {
      const userId = socket.data.userId;
      const room = rooms[roomId];
      if (room && room.hostId === userId) {
        room.isPaused = false;
        if (room.status === 'trade') {
          room.status = 'finished';
        }
        io.to(roomId).emit('room-update', room);
        io.to(roomId).emit('new-chat', {
          userId: 'system',
          message: room.status === 'finished' ? "TRADE WINDOW CLOSED!" : "AUCTION RESUMED",
          userName: 'Auctioneer',
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('finish-auction', ({ roomId }: { roomId: string }) => {
      const userId = socket.data.userId;
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

    socket.on("disconnect", () => {
      if (isShuttingDown) return;
      const roomId = socket.data.roomId;
      const userId = socket.data.userId;
      if (!roomId || !userId) return;

      const room = rooms[roomId];
      if (!room) return;

      // Check if user still has another active socket connection in this room
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      let userHasOtherSocket = false;
      if (roomSockets) {
        for (const socketId of roomSockets) {
          const s = io.sockets.sockets.get(socketId);
          if (s && s.data.userId === userId && s.id !== socket.id) {
            userHasOtherSocket = true;
            break;
          }
        }
      }

      if (!userHasOtherSocket && room.teams[userId]) {
        room.teams[userId].isConnected = false;

        // If host disconnected, reassign to the first active connected participant
        if (room.hostId === userId) {
          const connectedUserIds = Object.keys(room.teams).filter(
            uid => uid !== userId && room.teams[uid].isConnected !== false
          );

          if (connectedUserIds.length > 0) {
            const nextHostId = connectedUserIds[0];
            room.hostId = nextHostId;
            io.to(roomId).emit("new-chat", {
              userId: 'system',
              message: `${room.teams[userId]?.displayName || 'Host'} disconnected. ${room.teams[nextHostId]?.displayName || 'A participant'} is now the host.`,
              userName: 'Auctioneer',
              timestamp: new Date().toISOString()
            });
          }
        }

        io.to(roomId).emit("room-update", room);
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
      room.timer = room.auctionType === 'blind' ? room.bidTime + 5 : room.bidTime;
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
          p.soldTo = undefined;
          p.soldPrice = undefined;
        });

        room.players = [...room.players.filter(p => p.soldTo), ...unsoldPlayers];
        room.currentPlayerIndex = room.players.findIndex(p => !p.soldTo);

        room.status = 'active';
        room.timer = room.auctionType === 'blind' ? room.bidTime + 5 : room.bidTime;
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
        const player = clonePlayers(PLAYERS).find(p => p.id === pid);
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

        const currentPlayer = room.players[room.currentPlayerIndex];
        if (!currentPlayer) {
          room.status = 'finished';
          io.to(roomId).emit("room-update", room);
          return;
        }

        // Handle Blind Auction Reveal
        if (room.auctionType === 'blind') {
          let highestBid = 0;
          let winnerId = '';

          if (room.blindBids && Object.keys(room.blindBids).length > 0) {
            for (const [uid, bid] of Object.entries(room.blindBids)) {
              const team = room.teams[uid];
              // Valid bid requires: participant has a registered team, team has sufficient budget, and bid meets base price
              if (team && team.budget >= bid && bid >= (currentPlayer?.basePrice || 0)) {
                if (bid > highestBid) {
                  highestBid = bid;
                  winnerId = uid;
                }
              }
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
          } else {
            // Explicitly UNSOLD: no valid secret bids submitted
            room.currentBidderId = undefined;
            currentPlayer.soldTo = undefined;
            currentPlayer.soldPrice = undefined;
            io.to(roomId).emit("player-unsold", currentPlayer);
            room.status = 'transitioning';
            io.to(roomId).emit("room-update", room);
            setTimeout(() => nextPlayer(roomId), 3000);
            return;
          }
        }

        if (room.currentBidderId) {
          room.status = 'selling';
          room.timer = 2; // 2 seconds for "Going Once, Twice..."
          io.to(roomId).emit("room-update", room);
          return;
        } else {
          // Unsold
          currentPlayer.soldTo = undefined;
          currentPlayer.soldPrice = undefined;
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
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!aiRateLimiter.check(clientIp).allowed) {
        res.status(429).json({ error: "Too many AI requests. Please try again shortly." });
        return;
      }
      const validation = validateAISummaryPayload(req.body);
      if (!validation.valid || !validation.data) {
        res.status(400).json({ error: validation.error || "Invalid payload" });
        return;
      }
      const summary = await generateAuctionSummary(validation.data.history, validation.data.teams);
      res.json({ summary });
    } catch (error) {
      console.error("Express API ai-summary error:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  app.post("/api/draft-analysis", async (req, res) => {
    try {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!aiRateLimiter.check(clientIp).allowed) {
        res.status(429).json({ error: "Too many AI requests. Please try again shortly." });
        return;
      }
      const validation = validateDraftAnalysisPayload(req.body);
      if (!validation.valid || !validation.data) {
        res.status(400).json({ error: validation.error || "Invalid payload" });
        return;
      }
      const analysis = await analyzeDraftTeams(validation.data.teams);
      res.json({ analysis });
    } catch (error) {
      console.error("Express API draft-analysis error:", error);
      res.status(500).json({ error: "Failed to analyze draft" });
    }
  });

  app.post("/api/player-facts", async (req, res) => {
    try {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!aiRateLimiter.check(clientIp).allowed) {
        res.status(429).json({ error: "Too many AI requests. Please try again shortly." });
        return;
      }
      const validation = validatePlayerFactsPayload(req.body);
      if (!validation.valid || !validation.data) {
        res.status(400).json({ error: validation.error || "Invalid payload" });
        return;
      }
      const facts = await getPlayerFacts(validation.data.player);
      res.json({ facts });
    } catch (error) {
      console.error("Express API player-facts error:", error);
      res.status(500).json({ error: "Failed to get player facts" });
    }
  });

  app.post("/api/tactical-advice", async (req, res) => {
    try {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!aiRateLimiter.check(clientIp).allowed) {
        res.status(429).json({ error: "Too many AI requests. Please try again shortly." });
        return;
      }
      const validation = validateTacticalAdvicePayload(req.body);
      if (!validation.valid || !validation.data) {
        res.status(400).json({ error: validation.error || "Invalid payload" });
        return;
      }
      const advice = await getTacticalAdvice(validation.data.player, validation.data.team);
      res.json({ advice });
    } catch (error) {
      console.error("Express API tactical-advice error:", error);
      res.status(500).json({ error: "Failed to get tactical advice" });
    }
  });

  if (!options.skipVite) {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }
  }

  const shutdown = async (signal?: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    if (signal) {
      console.log(`Received ${signal}. Starting graceful shutdown...`);
    }

    // Safety timeout: force exit if graceful shutdown doesn't complete within 5 seconds
    const forceExitTimer = setTimeout(() => {
      console.error("Graceful shutdown timeout exceeded (5s). Forcing termination.");
      if (signal) process.exit(1);
    }, 5000);
    forceExitTimer.unref();

    try {
      // 1. Clear application rate limiter timers & buckets
      aiRateLimiter.close();
      chatRateLimiter.close();

      // 2. Clear all active room timers/intervals
      Object.keys(roomIntervals).forEach((rid) => {
        clearInterval(roomIntervals[rid]);
        delete roomIntervals[rid];
      });

      // 3. Disconnect active sockets and close Socket.IO server
      io.disconnectSockets(true);
      await new Promise<void>((res) => io.close(() => res()));

      // 4. Stop accepting new HTTP connections and close HTTP server
      await new Promise<void>((res) => httpServer.close(() => res()));
      httpServer.closeAllConnections?.();

      clearTimeout(forceExitTimer);
      if (signal) {
        console.log("Graceful shutdown completed successfully.");
        process.exit(0);
      }
    } catch (err) {
      console.error("Error encountered during graceful shutdown:", err);
      clearTimeout(forceExitTimer);
      if (signal) process.exit(1);
      throw err;
    }
  };

  const sigtermHandler = () => shutdown("SIGTERM");
  const sigintHandler = () => shutdown("SIGINT");

  if (options.enableSignalHandlers || (process.env.NODE_ENV !== "test" && !process.env.TEST_RUNNER)) {
    process.once("SIGTERM", sigtermHandler);
    process.once("SIGINT", sigintHandler);
  }

  await new Promise<void>((resolve) => {
    httpServer.listen(PORT, "0.0.0.0", () => {
      if (!options.skipVite) {
        console.log(`IPL Auction Pro server listening on port ${PORT}`);
      }
      resolve();
    });
  });

  return {
    httpServer,
    io,
    app,
    port: PORT,
    rooms,
    aiRateLimiter,
    chatRateLimiter,
    get isShuttingDown() {
      return isShuttingDown;
    },
    shutdown,
    close: async () => {
      process.removeListener("SIGTERM", sigtermHandler);
      process.removeListener("SIGINT", sigintHandler);
      await shutdown();
    }
  };
}

// Auto-start server only when executed directly (not when imported in tests)
if (process.env.NODE_ENV !== 'test' && !process.env.TEST_RUNNER) {
  startServer().catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

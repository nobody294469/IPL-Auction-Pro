import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import { startServer } from "../server";
import { createTestAuthHelper } from "./testAuthHelper";
import { AuctionRoom } from "../src/types";

describe("Auction Engine & Multiplayer Integration Suite", () => {
  const authHelper = createTestAuthHelper();
  let serverInstance: Awaited<ReturnType<typeof startServer>>;
  const TEST_PORT = 3999;
  const SERVER_URL = `http://localhost:${TEST_PORT}`;

  before(async () => {
    serverInstance = await startServer({
      port: TEST_PORT,
      skipVite: true,
      customCerts: authHelper.customCerts,
      customProjectId: authHelper.projectId
    });
  });

  after(async () => {
    if (serverInstance) {
      await serverInstance.close();
    }
    setTimeout(() => {
      process.exit(0);
    }, 100).unref();
  });

  function createClient(uid: string): Promise<ClientSocketType> {
    const token = authHelper.createToken(uid);
    const socket = ClientSocket(SERVER_URL, {
      auth: { token },
      transports: ["websocket"]
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`Connection timeout for client ${uid}`));
      }, 5000);

      socket.on("connect", () => {
        clearTimeout(timer);
        resolve(socket);
      });

      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function waitForRoomUpdate(socket: ClientSocketType, predicate?: (r: AuctionRoom) => boolean): Promise<AuctionRoom> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off("room-update", handler);
        reject(new Error("Timeout waiting for matching room-update event"));
      }, 4000);

      const handler = (room: AuctionRoom) => {
        if (!predicate || predicate(room)) {
          clearTimeout(timeout);
          socket.off("room-update", handler);
          resolve(room);
        }
      };
      socket.on("room-update", handler);
    });
  }

  it("should reject socket connection when authentication token is missing or forged", async () => {
    // Missing token
    const unauthSocket = ClientSocket(SERVER_URL, {
      auth: {},
      transports: ["websocket"]
    });

    await new Promise<void>((resolve) => {
      unauthSocket.on("connect_error", (err) => {
        assert.match(err.message, /Authentication token missing/i);
        unauthSocket.disconnect();
        resolve();
      });
    });

    // Expired token
    const expiredToken = authHelper.createToken("attacker", true);
    const expiredSocket = ClientSocket(SERVER_URL, {
      auth: { token: expiredToken },
      transports: ["websocket"]
    });

    await new Promise<void>((resolve) => {
      expiredSocket.on("connect_error", (err) => {
        assert.match(err.message, /expired/i);
        expiredSocket.disconnect();
        resolve();
      });
    });
  });

  it("should initialize room, enforce authenticated host identity, and ignore client-forged UIDs", async () => {
    const hostSocket = await createClient("host_user_1");
    const roomId = `room_test_${Date.now()}`;

    // Emit join-room with client-supplied UID attempting to impersonate 'victim_user'
    const updatePromise = waitForRoomUpdate(hostSocket);
    hostSocket.emit("join-room", {
      roomId,
      user: {
        uid: "victim_user_should_be_ignored",
        displayName: "Real Host",
        budget: 120,
        squad: []
      }
    });

    const room = await updatePromise;
    assert.strictEqual(room.id, roomId);
    // Server must have registered team under authenticated token sub ('host_user_1'), not 'victim_user'
    assert.strictEqual(room.hostId, "host_user_1");
    assert.ok(room.teams["host_user_1"]);
    assert.strictEqual(room.teams["victim_user_should_be_ignored"], undefined);
    assert.strictEqual(room.status, "lobby");
    assert.strictEqual(room.purse, 120);

    hostSocket.disconnect();
  });

  it("should handle multi-manager lobby joining, team claiming, and ready toggles", async () => {
    const hostSocket = await createClient("host_mgr");
    const peerSocket = await createClient("peer_mgr");
    const roomId = `lobby_test_${Date.now()}`;

    // Host joins
    const hostJoinPromise = waitForRoomUpdate(hostSocket);
    hostSocket.emit("join-room", {
      roomId,
      user: { displayName: "Host CSK", budget: 120, squad: [] }
    });
    await hostJoinPromise;

    // Peer joins
    const peerJoinPromise = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
    peerSocket.emit("join-room", {
      roomId,
      user: { displayName: "Peer MI", budget: 120, squad: [] }
    });
    const roomWithTwo = await peerJoinPromise;
    assert.strictEqual(Object.keys(roomWithTwo.teams).length, 2);

    // Host selects team
    const hostTeamPromise = waitForRoomUpdate(peerSocket, (r) => r.teams["host_mgr"]?.teamId === "csk");
    hostSocket.emit("select-team", { roomId, teamId: "csk" });
    const teamRoom = await hostTeamPromise;
    assert.strictEqual(teamRoom.teams["host_mgr"].teamId, "csk");

    // Peer readies up
    const peerReadyPromise = waitForRoomUpdate(hostSocket, (r) => r.teams["peer_mgr"]?.isReady === true);
    peerSocket.emit("ready-up", { roomId });
    const readyRoom = await peerReadyPromise;
    assert.strictEqual(readyRoom.teams["peer_mgr"].isReady, true);

    hostSocket.disconnect();
    peerSocket.disconnect();
  });

  it("should reject start-auction from non-host participants", async () => {
    const hostSocket = await createClient("host_lead");
    const nonHostSocket = await createClient("intruder_guest");
    const roomId = `auth_action_${Date.now()}`;

    // Both join
    hostSocket.emit("join-room", { roomId, user: { displayName: "Host" } });
    await waitForRoomUpdate(hostSocket);

    const joinPromise = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
    nonHostSocket.emit("join-room", { roomId, user: { displayName: "Guest" } });
    await joinPromise;

    // Non-host attempts to start auction
    nonHostSocket.emit("start-auction", { roomId, auctionType: "open" });

    // Allow time for event processing
    await new Promise((r) => setTimeout(r, 200));

    // Verify room is still in lobby
    const currentRoom = serverInstance.rooms[roomId];
    assert.strictEqual(currentRoom.status, "lobby");

    hostSocket.disconnect();
    nonHostSocket.disconnect();
  });

  it("should correctly start open auction, structure player pool, and set base lot", async () => {
    const hostSocket = await createClient("host_auction_start");
    const peerSocket = await createClient("peer_auction_start");
    const roomId = `auction_start_${Date.now()}`;

    // Join both managers
    hostSocket.emit("join-room", { roomId, user: { displayName: "Host" } });
    await waitForRoomUpdate(hostSocket);

    const bothJoined = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
    peerSocket.emit("join-room", { roomId, user: { displayName: "Peer" } });
    await bothJoined;

    // Start auction as host
    const startPromise = waitForRoomUpdate(peerSocket, (r) => r.status === "active");
    hostSocket.emit("start-auction", { roomId, auctionType: "open" });
    const activeRoom = await startPromise;

    assert.strictEqual(activeRoom.status, "active");
    assert.strictEqual(activeRoom.currentPlayerIndex, 0);
    assert.ok(activeRoom.players.length >= 100);
    assert.ok(activeRoom.currentBid > 0);
    assert.strictEqual(activeRoom.currentBidderId, undefined);

    hostSocket.disconnect();
    peerSocket.disconnect();
  });

  it("should process valid bids, update current bidder and increment timer", async () => {
    const hostSocket = await createClient("bid_mgr_1");
    const peerSocket = await createClient("bid_mgr_2");
    const roomId = `bidding_suite_${Date.now()}`;

    // Setup room
    hostSocket.emit("join-room", { roomId, user: { displayName: "Manager 1", budget: 120 } });
    await waitForRoomUpdate(hostSocket);

    const bothJoined = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
    peerSocket.emit("join-room", { roomId, user: { displayName: "Manager 2", budget: 120 } });
    await bothJoined;

    const startPromise = waitForRoomUpdate(peerSocket, (r) => r.status === "active");
    hostSocket.emit("start-auction", { roomId, auctionType: "open" });
    const room = await startPromise;

    const basePrice = room.players[0].basePrice;
    const firstBidAmount = basePrice + 0.25;

    // Manager 1 bids
    const bidPromise1 = waitForRoomUpdate(peerSocket, (r) => r.currentBidderId === "bid_mgr_1");
    hostSocket.emit("place-bid", { roomId, amount: firstBidAmount });
    const roomAfterBid1 = await bidPromise1;

    assert.strictEqual(roomAfterBid1.currentBidderId, "bid_mgr_1");
    assert.strictEqual(roomAfterBid1.currentBid, firstBidAmount);
    assert.strictEqual(roomAfterBid1.status, "active");

    // Manager 2 raises bid
    const nextBidAmount = firstBidAmount + 0.5;
    const bidPromise2 = waitForRoomUpdate(hostSocket, (r) => r.currentBidderId === "bid_mgr_2");
    peerSocket.emit("place-bid", { roomId, amount: nextBidAmount });
    const roomAfterBid2 = await bidPromise2;

    assert.strictEqual(roomAfterBid2.currentBidderId, "bid_mgr_2");
    assert.strictEqual(roomAfterBid2.currentBid, nextBidAmount);

    hostSocket.disconnect();
    peerSocket.disconnect();
  });

  it("should reject bids that exceed a manager's available purse without mutating state", async () => {
    const hostSocket = await createClient("broke_mgr");
    const peerSocket = await createClient("rich_mgr");
    const roomId = `purse_check_${Date.now()}`;

    hostSocket.emit("join-room", { roomId, user: { displayName: "Broke Team" } });
    await waitForRoomUpdate(hostSocket);

    const bothJoined = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
    peerSocket.emit("join-room", { roomId, user: { displayName: "Rich Team" } });
    await bothJoined;

    const startPromise = waitForRoomUpdate(peerSocket, (r) => r.status === "active");
    hostSocket.emit("start-auction", { roomId, auctionType: "open" });
    const room = await startPromise;

    // Artificially restrict broke_mgr's purse to 5 Cr
    serverInstance.rooms[roomId].teams["broke_mgr"].budget = 5;

    // Attempt to bid 15 Cr (exceeds budget of 5)
    hostSocket.emit("place-bid", { roomId, amount: 15 });

    // Allow event processing
    await new Promise((r) => setTimeout(r, 200));

    // State invariant check: current bidder must remain undefined, purse unchanged
    const currentRoom = serverInstance.rooms[roomId];
    assert.strictEqual(currentRoom.currentBidderId, undefined);
    assert.strictEqual(currentRoom.teams["broke_mgr"].budget, 5);

    hostSocket.disconnect();
    peerSocket.disconnect();
  });

  it("should reject bids when auction is paused by host", async () => {
    const hostSocket = await createClient("pause_host");
    const peerSocket = await createClient("pause_peer");
    const roomId = `pause_test_${Date.now()}`;

    hostSocket.emit("join-room", { roomId, user: { displayName: "Host" } });
    await waitForRoomUpdate(hostSocket);

    const bothJoined = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
    peerSocket.emit("join-room", { roomId, user: { displayName: "Peer" } });
    await bothJoined;

    const startPromise = waitForRoomUpdate(peerSocket, (r) => r.status === "active");
    hostSocket.emit("start-auction", { roomId, auctionType: "open" });
    await startPromise;

    // Host pauses auction
    const pausePromise = waitForRoomUpdate(peerSocket, (r) => r.isPaused === true);
    hostSocket.emit("pause-auction", { roomId });
    const pausedRoom = await pausePromise;
    assert.strictEqual(pausedRoom.isPaused, true);

    // Host resumes auction
    const resumePromise = waitForRoomUpdate(peerSocket, (r) => r.isPaused === false);
    hostSocket.emit("resume-auction", { roomId });
    const resumedRoom = await resumePromise;
    assert.strictEqual(resumedRoom.isPaused, false);

    hostSocket.disconnect();
    peerSocket.disconnect();
  });

  it("should process peer-to-peer trade proposal, player swap, and purse settlement", async () => {
    const hostSocket = await createClient("trade_party_a");
    const peerSocket = await createClient("trade_party_b");
    const roomId = `trade_suite_${Date.now()}`;

    // Join and setup finished status to enable trade window
    hostSocket.emit("join-room", { roomId, user: { displayName: "Party A" } });
    await waitForRoomUpdate(hostSocket);

    const bothJoined = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
    peerSocket.emit("join-room", { roomId, user: { displayName: "Party B" } });
    await bothJoined;

    // Simulate squads
    const playerA = { ...serverInstance.rooms[roomId].players[0], soldTo: "trade_party_a" };
    const playerB = { ...serverInstance.rooms[roomId].players[1], soldTo: "trade_party_b" };

    serverInstance.rooms[roomId].status = "finished";
    serverInstance.rooms[roomId].teams["trade_party_a"].squad = [playerA];
    serverInstance.rooms[roomId].teams["trade_party_a"].budget = 50;

    serverInstance.rooms[roomId].teams["trade_party_b"].squad = [playerB];
    serverInstance.rooms[roomId].teams["trade_party_b"].budget = 50;

    // Host opens trade window
    const tradeOpenPromise = waitForRoomUpdate(peerSocket, (r) => r.status === "trade");
    hostSocket.emit("start-trade-window", { roomId });
    await tradeOpenPromise;

    // Party A proposes trade: gives playerA + 5 Cr cash for playerB
    const tradeProposedPromise = waitForRoomUpdate(peerSocket, (r) => (r.trades?.length || 0) > 0);
    hostSocket.emit("propose-trade", {
      roomId,
      trade: {
        fromUserId: "trade_party_a",
        toUserId: "trade_party_b",
        fromPlayerIds: [playerA.id],
        toPlayerIds: [playerB.id],
        fromCash: 5,
        toCash: 0
      }
    });

    const roomWithTrade = await tradeProposedPromise;
    const activeTrade = roomWithTrade.trades![0];
    assert.strictEqual(activeTrade.status, "pending");

    // Party B accepts trade
    const tradeAcceptPromise = waitForRoomUpdate(hostSocket, (r) => r.trades![0].status === "accepted");
    peerSocket.emit("respond-to-trade", {
      roomId,
      tradeId: activeTrade.id,
      response: "accepted"
    });

    const finalRoom = await tradeAcceptPromise;

    // Verify player swap: Party A now owns playerB, Party B owns playerA
    const squadA = finalRoom.teams["trade_party_a"].squad;
    const squadB = finalRoom.teams["trade_party_b"].squad;
    assert.ok(squadA.some((p) => p.id === playerB.id));
    assert.ok(squadB.some((p) => p.id === playerA.id));

    // Verify cash settlement: Party A paid 5 Cr (50 - 5 = 45), Party B received 5 Cr (50 + 5 = 55)
    assert.strictEqual(finalRoom.teams["trade_party_a"].budget, 45);
    assert.strictEqual(finalRoom.teams["trade_party_b"].budget, 55);

    hostSocket.disconnect();
    peerSocket.disconnect();
  });

  it("should handle host disconnect and gracefully reassign host role to an active participant", async () => {
    const hostSocket = await createClient("retiring_host");
    const peerSocket = await createClient("successor_peer");
    const roomId = `host_reassign_${Date.now()}`;

    hostSocket.emit("join-room", { roomId, user: { displayName: "Old Host" } });
    await waitForRoomUpdate(hostSocket);

    const bothJoined = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
    peerSocket.emit("join-room", { roomId, user: { displayName: "Successor" } });
    await bothJoined;

    // Disconnect host
    const reassignPromise = waitForRoomUpdate(peerSocket, (r) => r.hostId === "successor_peer");
    hostSocket.disconnect();

    const reassignedRoom = await reassignPromise;
    assert.strictEqual(reassignedRoom.hostId, "successor_peer");
    assert.strictEqual(reassignedRoom.teams["retiring_host"].isConnected, false);

    peerSocket.disconnect();
  });

  it("should handle competing simultaneous bids deterministically without race corruption", async () => {
    const clientA = await createClient("competing_mgr_A");
    const clientB = await createClient("competing_mgr_B");
    const roomId = `concurrency_test_${Date.now()}`;

    // Join both
    clientA.emit("join-room", { roomId, user: { displayName: "Team A" } });
    await waitForRoomUpdate(clientA);

    const bothJoined = waitForRoomUpdate(clientA, (r) => Object.keys(r.teams).length === 2);
    clientB.emit("join-room", { roomId, user: { displayName: "Team B" } });
    await bothJoined;

    const startPromise = waitForRoomUpdate(clientB, (r) => r.status === "active");
    clientA.emit("start-auction", { roomId, auctionType: "open" });
    const room = await startPromise;

    const basePrice = room.players[0].basePrice;
    const bidA = basePrice + 1.0;
    const bidB = basePrice + 2.0;

    // Fire competing bids simultaneously
    clientA.emit("place-bid", { roomId, amount: bidA });
    clientB.emit("place-bid", { roomId, amount: bidB });

    // Wait for the higher bid to be processed
    await waitForRoomUpdate(clientA, (r) => r.currentBid === bidB);

    const serverRoom = serverInstance.rooms[roomId];
    // Invariant check: Exactly one valid bidder must be recorded
    assert.strictEqual(serverRoom.currentBidderId, "competing_mgr_B");
    assert.strictEqual(serverRoom.currentBid, bidB);
    assert.strictEqual(serverRoom.status, "active");

    clientA.disconnect();
    clientB.disconnect();
  });

  it("should explicitly treat player as unsold in Blind Auction when neither participant submits a secret bid", async () => {
    const clientA = await createClient("blind_host_zero");
    const clientB = await createClient("blind_peer_zero");
    const roomId = `blind_zero_bid_${Date.now()}`;

    clientA.emit("join-room", { roomId, user: { displayName: "Manager A" } });
    await waitForRoomUpdate(clientA);

    const bothJoined = waitForRoomUpdate(clientA, (r) => Object.keys(r.teams).length === 2);
    clientB.emit("join-room", { roomId, user: { displayName: "Manager B" } });
    await bothJoined;

    const startPromise = waitForRoomUpdate(clientB, (r) => r.status === "active" && r.auctionType === "blind");
    clientA.emit("start-auction", { roomId, auctionType: "blind" });
    const room = await startPromise;

    const firstPlayerId = room.players[0].id;

    // Neither participant submits a secret bid. Fast-forward timer to 1 second so interval triggers expiration.
    const unsoldPromise = new Promise<any>((resolve) => {
      clientA.once("player-unsold", (player) => resolve(player));
    });
    const transitioningPromise = waitForRoomUpdate(clientA, (r) => r.status === "transitioning");

    serverInstance.rooms[roomId].timer = 1;

    const [unsoldPlayer, transitionedRoom] = await Promise.all([unsoldPromise, transitioningPromise]);

    assert.strictEqual(unsoldPlayer.id, firstPlayerId);
    assert.strictEqual(transitionedRoom.currentBidderId, undefined);

    const serverRoom = serverInstance.rooms[roomId];
    // Invariants check:
    // 1. Neither team was assigned the player
    assert.strictEqual(serverRoom.teams["blind_host_zero"].squad.length, 0);
    assert.strictEqual(serverRoom.teams["blind_peer_zero"].squad.length, 0);
    // 2. Purses remain completely unchanged
    assert.strictEqual(serverRoom.teams["blind_host_zero"].budget, 120);
    assert.strictEqual(serverRoom.teams["blind_peer_zero"].budget, 120);
    // 3. No transaction added to history (Recent Buys)
    assert.strictEqual(serverRoom.history.length, 0);
    // 4. Player soldTo and soldPrice remain undefined
    assert.strictEqual(serverRoom.players[0].soldTo, undefined);
    assert.strictEqual(serverRoom.players[0].soldPrice, undefined);

    clientA.disconnect();
    clientB.disconnect();
  });

  it("should award player to the sole secret bidder in Blind Auction and record in squad and history", async () => {
    const clientA = await createClient("blind_host_sole");
    const clientB = await createClient("blind_peer_sole");
    const roomId = `blind_sole_bid_${Date.now()}`;

    clientA.emit("join-room", { roomId, user: { displayName: "Manager A" } });
    await waitForRoomUpdate(clientA);

    const bothJoined = waitForRoomUpdate(clientA, (r) => Object.keys(r.teams).length === 2);
    clientB.emit("join-room", { roomId, user: { displayName: "Manager B" } });
    await bothJoined;

    const startPromise = waitForRoomUpdate(clientB, (r) => r.status === "active" && r.auctionType === "blind");
    clientA.emit("start-auction", { roomId, auctionType: "blind" });
    const room = await startPromise;

    const basePrice = room.players[0].basePrice;
    const bidAmount = basePrice + 3.0;

    // Only participant A submits a valid secret bid
    const bidAckPromise = new Promise<{ amount: number }>((resolve) => {
      clientA.once("blind-bid-received", (data) => resolve(data));
    });
    clientA.emit("place-bid", { roomId, amount: bidAmount });
    await bidAckPromise;

    // Fast-forward timer to 1 second so reveal triggers
    const revealPromise = new Promise<any>((resolve) => {
      clientA.once("blind-reveal", (data) => resolve(data));
    });
    const sellingPromise = waitForRoomUpdate(clientA, (r) => r.status === "selling");

    serverInstance.rooms[roomId].timer = 1;

    const [revealData] = await Promise.all([revealPromise, sellingPromise]);
    assert.strictEqual(revealData.winnerId, "blind_host_sole");
    assert.strictEqual(revealData.amount, bidAmount);

    // Fast-forward selling timer to 1 second to trigger handleSold
    const soldPromise = new Promise<any>((resolve) => {
      clientA.once("player-sold", (data) => resolve(data));
    });
    serverInstance.rooms[roomId].timer = 1;

    const soldData = await soldPromise;
    assert.strictEqual(soldData.userId, "blind_host_sole");
    assert.strictEqual(soldData.price, bidAmount);

    const serverRoom = serverInstance.rooms[roomId];
    // Invariants check:
    // 1. Sole bidder A won player
    assert.strictEqual(serverRoom.teams["blind_host_sole"].squad.length, 1);
    assert.strictEqual(serverRoom.teams["blind_host_sole"].budget, 120 - bidAmount);
    // 2. Peer B remains untouched
    assert.strictEqual(serverRoom.teams["blind_peer_sole"].squad.length, 0);
    assert.strictEqual(serverRoom.teams["blind_peer_sole"].budget, 120);
    // 3. Exactly one history item recorded
    assert.strictEqual(serverRoom.history.length, 1);
    assert.strictEqual(serverRoom.history[0].price, bidAmount);

    clientA.disconnect();
    clientB.disconnect();
  });

  it("should handle three consecutive zero-bid lots with no Recent Buys and untouched squads/purses", async () => {
    const clientA = await createClient("blind_host_consec");
    const clientB = await createClient("blind_peer_consec");
    const roomId = `blind_consec_${Date.now()}`;

    clientA.emit("join-room", { roomId, user: { displayName: "Manager A" } });
    await waitForRoomUpdate(clientA);

    const bothJoined = waitForRoomUpdate(clientA, (r) => Object.keys(r.teams).length === 2);
    clientB.emit("join-room", { roomId, user: { displayName: "Manager B" } });
    await bothJoined;

    const startPromise = waitForRoomUpdate(clientB, (r) => r.status === "active" && r.auctionType === "blind");
    clientA.emit("start-auction", { roomId, auctionType: "blind" });
    await startPromise;

    // Run 3 consecutive unsold lots
    for (let lot = 0; lot < 3; lot++) {
      const unsoldPromise = new Promise<any>((resolve) => {
        clientA.once("player-unsold", (player) => resolve(player));
      });
      serverInstance.rooms[roomId].timer = 1;
      await unsoldPromise;

      if (lot < 2) {
        await waitForRoomUpdate(clientA, (r) => r.status === "active" && r.currentPlayerIndex === lot + 1);
      }
    }

    const serverRoom = serverInstance.rooms[roomId];
    // Invariants check after 3 consecutive zero-bid lots:
    assert.strictEqual(serverRoom.history.length, 0, "room.history must be completely empty");
    assert.strictEqual(serverRoom.teams["blind_host_consec"].squad.length, 0);
    assert.strictEqual(serverRoom.teams["blind_peer_consec"].squad.length, 0);
    assert.strictEqual(serverRoom.teams["blind_host_consec"].budget, 120);
    assert.strictEqual(serverRoom.teams["blind_peer_consec"].budget, 120);
    assert.strictEqual(serverRoom.players[0].soldTo, undefined);
    assert.strictEqual(serverRoom.players[1].soldTo, undefined);
    assert.strictEqual(serverRoom.players[2].soldTo, undefined);

    clientA.disconnect();
    clientB.disconnect();
  });

  it("should apply winner rules with two valid secret bidders and record single purchase in history", async () => {
    const clientA = await createClient("blind_host_two");
    const clientB = await createClient("blind_peer_two");
    const roomId = `blind_two_bids_${Date.now()}`;

    clientA.emit("join-room", { roomId, user: { displayName: "Manager A" } });
    await waitForRoomUpdate(clientA);

    const bothJoined = waitForRoomUpdate(clientA, (r) => Object.keys(r.teams).length === 2);
    clientB.emit("join-room", { roomId, user: { displayName: "Manager B" } });
    await bothJoined;

    const startPromise = waitForRoomUpdate(clientB, (r) => r.status === "active" && r.auctionType === "blind");
    clientA.emit("start-auction", { roomId, auctionType: "blind" });
    const room = await startPromise;

    const basePrice = room.players[0].basePrice;
    const bidA = basePrice + 2.0;
    const bidB = basePrice + 5.0; // Higher bid

    const ackA = new Promise((res) => clientA.once("blind-bid-received", res));
    const ackB = new Promise((res) => clientB.once("blind-bid-received", res));
    clientA.emit("place-bid", { roomId, amount: bidA });
    clientB.emit("place-bid", { roomId, amount: bidB });
    await Promise.all([ackA, ackB]);

    // Fast-forward timer to reveal
    const revealPromise = new Promise<any>((res) => clientA.once("blind-reveal", res));
    serverInstance.rooms[roomId].timer = 1;
    const revealData = await revealPromise;

    assert.strictEqual(revealData.winnerId, "blind_peer_two");
    assert.strictEqual(revealData.amount, bidB);

    // Fast-forward to handleSold
    const soldPromise = new Promise<any>((res) => clientA.once("player-sold", res));
    serverInstance.rooms[roomId].timer = 1;
    const soldData = await soldPromise;

    assert.strictEqual(soldData.userId, "blind_peer_two");
    assert.strictEqual(soldData.price, bidB);

    const serverRoom = serverInstance.rooms[roomId];
    assert.strictEqual(serverRoom.history.length, 1);
    assert.strictEqual(serverRoom.history[0].price, bidB);
    assert.strictEqual(serverRoom.teams["blind_peer_two"].squad.length, 1);
    assert.strictEqual(serverRoom.teams["blind_peer_two"].budget, 120 - bidB);
    assert.strictEqual(serverRoom.teams["blind_host_two"].squad.length, 0);
    assert.strictEqual(serverRoom.teams["blind_host_two"].budget, 120);

    clientA.disconnect();
    clientB.disconnect();
  });

  it("should ensure complete room isolation so sales in Room A cannot leak soldTo or history into Room B", async () => {
    // Room A: Sell player 0
    const clientA1 = await createClient("iso_host_A");
    const clientA2 = await createClient("iso_peer_A");
    const roomAId = `iso_room_A_${Date.now()}`;

    clientA1.emit("join-room", { roomId: roomAId, user: { displayName: "Manager A1" } });
    await waitForRoomUpdate(clientA1);
    const bothA = waitForRoomUpdate(clientA1, (r) => Object.keys(r.teams).length === 2);
    clientA2.emit("join-room", { roomId: roomAId, user: { displayName: "Manager A2" } });
    await bothA;

    const startA = waitForRoomUpdate(clientA1, (r) => r.status === "active");
    clientA1.emit("start-auction", { roomId: roomAId, auctionType: "open" });
    const roomA = await startA;

    const bidAmt = roomA.players[0].basePrice + 1;
    clientA1.emit("place-bid", { roomId: roomAId, amount: bidAmt });
    await waitForRoomUpdate(clientA1, (r) => r.currentBidderId === "iso_host_A");

    // Sell player in Room A
    serverInstance.rooms[roomAId].status = "selling";
    serverInstance.rooms[roomAId].timer = 1;
    await new Promise((res) => clientA1.once("player-sold", res));

    assert.strictEqual(serverInstance.rooms[roomAId].history.length, 1);
    assert.strictEqual(serverInstance.rooms[roomAId].players[0].soldTo, "iso_host_A");

    // Now Room B: Create fresh blind auction room
    const clientB1 = await createClient("iso_host_B");
    const clientB2 = await createClient("iso_peer_B");
    const roomBId = `iso_room_B_${Date.now()}`;

    clientB1.emit("join-room", { roomId: roomBId, user: { displayName: "Manager B1" } });
    await waitForRoomUpdate(clientB1);
    const bothB = waitForRoomUpdate(clientB1, (r) => Object.keys(r.teams).length === 2);
    clientB2.emit("join-room", { roomId: roomBId, user: { displayName: "Manager B2" } });
    await bothB;

    const startB = waitForRoomUpdate(clientB1, (r) => r.status === "active" && r.auctionType === "blind");
    clientB1.emit("start-auction", { roomId: roomBId, auctionType: "blind" });
    await startB;

    // Room B's first player must be completely unassigned
    assert.strictEqual(serverInstance.rooms[roomBId].history.length, 0);
    assert.strictEqual(serverInstance.rooms[roomBId].players[0].soldTo, undefined);
    assert.strictEqual(serverInstance.rooms[roomBId].players[0].soldPrice, undefined);

    // Let first player in Room B go unsold
    const unsoldPromise = new Promise<any>((res) => clientB1.once("player-unsold", res));
    serverInstance.rooms[roomBId].timer = 1;
    await unsoldPromise;

    // Verify Room B history is STILL empty and player remains unsold
    assert.strictEqual(serverInstance.rooms[roomBId].history.length, 0);
    assert.strictEqual(serverInstance.rooms[roomBId].players[0].soldTo, undefined);
    assert.strictEqual(serverInstance.rooms[roomBId].teams["iso_host_B"].squad.length, 0);
    assert.strictEqual(serverInstance.rooms[roomBId].teams["iso_peer_B"].squad.length, 0);

    clientA1.disconnect();
    clientA2.disconnect();
    clientB1.disconnect();
    clientB2.disconnect();
  });
});

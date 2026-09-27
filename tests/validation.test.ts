import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { io as ClientSocket, Socket as ClientSocketType } from "socket.io-client";
import { startServer } from "../server";
import { createTestAuthHelper } from "./testAuthHelper";
import { AuctionRoom } from "../src/types";
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
} from "../src/services/validation";
import { SimpleRateLimiter } from "../src/services/rateLimiter";

describe("Input Validation & Rate Limiting Test Suite", () => {
  const authHelper = createTestAuthHelper();
  let serverInstance: Awaited<ReturnType<typeof startServer>>;
  const TEST_PORT = 3998;
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

  // ==========================================================================
  // 1. UNIT VALIDATION SCHEMAS
  // ==========================================================================
  describe("Unit Validation Schemas", () => {
    it("should validate and sanitize AI Summary payloads", () => {
      // Null or non-object
      assert.strictEqual(validateAISummaryPayload(null).valid, false);
      assert.strictEqual(validateAISummaryPayload("malformed").valid, false);

      // Missing or non-array fields
      assert.strictEqual(validateAISummaryPayload({ history: "not-an-array", teams: [] }).valid, false);
      assert.strictEqual(validateAISummaryPayload({ history: [], teams: "not-an-array" }).valid, false);

      // Oversized arrays
      const hugeHistory = new Array(501).fill({ playerId: "p1", price: 10 });
      assert.strictEqual(validateAISummaryPayload({ history: hugeHistory, teams: [] }).valid, false);

      const hugeTeams = new Array(51).fill({ displayName: "Team" });
      assert.strictEqual(validateAISummaryPayload({ history: [], teams: hugeTeams }).valid, false);

      // Valid payload
      const valid = validateAISummaryPayload({ history: [{ playerId: "p1" }], teams: [{ displayName: "MI" }] });
      assert.strictEqual(valid.valid, true);
      assert.ok(valid.data);
    });

    it("should validate Draft Analysis payloads", () => {
      assert.strictEqual(validateDraftAnalysisPayload(null).valid, false);
      assert.strictEqual(validateDraftAnalysisPayload({ teams: "invalid" }).valid, false);
      assert.strictEqual(validateDraftAnalysisPayload({ teams: [] }).valid, false); // empty teams rejected

      const valid = validateDraftAnalysisPayload({ teams: [{ name: "CSK", squad: [] }] });
      assert.strictEqual(valid.valid, true);
    });

    it("should validate Player Facts and Tactical Advice payloads", () => {
      // Player facts
      assert.strictEqual(validatePlayerFactsPayload(null).valid, false);
      assert.strictEqual(validatePlayerFactsPayload({ player: "not an object" }).valid, false);
      assert.strictEqual(validatePlayerFactsPayload({ player: { name: "x".repeat(105) } }).valid, false);
      assert.strictEqual(validatePlayerFactsPayload({ player: { name: "Virat Kohli", role: "Batter" } }).valid, true);

      // Tactical advice
      assert.strictEqual(validateTacticalAdvicePayload(null).valid, false);
      assert.strictEqual(validateTacticalAdvicePayload({ player: {} }).valid, false); // missing team
      assert.strictEqual(validateTacticalAdvicePayload({ player: {}, team: { budget: -10 } }).valid, false);
      assert.strictEqual(validateTacticalAdvicePayload({ player: {}, team: { budget: 1000 } }).valid, false); // over 500
      assert.strictEqual(validateTacticalAdvicePayload({ player: { name: "Bumrah" }, team: { budget: 45 } }).valid, true);
    });

    it("should validate Socket.IO Bid payloads against boundary constraints", () => {
      assert.strictEqual(validatePlaceBidPayload(null).valid, false);
      assert.strictEqual(validatePlaceBidPayload({ roomId: "", amount: 10 }).valid, false);
      assert.strictEqual(validatePlaceBidPayload({ roomId: "valid_room", amount: -5 }).valid, false);
      assert.strictEqual(validatePlaceBidPayload({ roomId: "valid_room", amount: 0 }).valid, false);
      assert.strictEqual(validatePlaceBidPayload({ roomId: "valid_room", amount: NaN }).valid, false);
      assert.strictEqual(validatePlaceBidPayload({ roomId: "valid_room", amount: Infinity }).valid, false);
      assert.strictEqual(validatePlaceBidPayload({ roomId: "valid_room", amount: 1000 }).valid, false); // exceeds 500 Cr cap
      assert.strictEqual(validatePlaceBidPayload({ roomId: "valid_room", amount: "10" }).valid, false); // string amount

      const valid = validatePlaceBidPayload({ roomId: "room_123", amount: 14.256 });
      assert.strictEqual(valid.valid, true);
      assert.strictEqual(valid.data?.amount, 14.26); // rounded to 2 decimals
    });

    it("should validate Room Settings and strip arbitrary untrusted properties", () => {
      // Out of bounds purse
      assert.strictEqual(validateUpdateSettingsPayload({ roomId: "r1", purse: 40 }).valid, false);
      assert.strictEqual(validateUpdateSettingsPayload({ roomId: "r1", purse: 350 }).valid, false);

      // Out of bounds bidTime
      assert.strictEqual(validateUpdateSettingsPayload({ roomId: "r1", bidTime: 2 }).valid, false);
      assert.strictEqual(validateUpdateSettingsPayload({ roomId: "r1", bidTime: 120 }).valid, false);

      // Invalid auctionType
      assert.strictEqual(validateUpdateSettingsPayload({ roomId: "r1", auctionType: "hacked_mode" }).valid, false);

      // Valid with extra junk fields
      const clean = validateUpdateSettingsPayload({
        roomId: "r1",
        purse: 150,
        bidTime: 15,
        auctionType: "open",
        maliciousAdminFlag: true,
        secretKey: "exploit"
      });
      assert.strictEqual(clean.valid, true);
      assert.strictEqual(clean.data?.purse, 150);
      assert.strictEqual(clean.data?.bidTime, 15);
      assert.strictEqual((clean.data as any).maliciousAdminFlag, undefined);
      assert.strictEqual((clean.data as any).secretKey, undefined);
    });

    it("should validate chat messages and reject empty, whitespace, or oversized text", () => {
      assert.strictEqual(validateChatMessagePayload(null).valid, false);
      assert.strictEqual(validateChatMessagePayload({ roomId: "r1", message: "" }).valid, false);
      assert.strictEqual(validateChatMessagePayload({ roomId: "r1", message: "     " }).valid, false);
      assert.strictEqual(validateChatMessagePayload({ roomId: "r1", message: "a".repeat(501) }).valid, false);

      const valid = validateChatMessagePayload({ roomId: "r1", message: "  Great bid!  " });
      assert.strictEqual(valid.valid, true);
      assert.strictEqual(valid.data?.message, "Great bid!");
    });
  });

  // ==========================================================================
  // 2. IN-MEMORY RATE LIMITER UNIT TESTS
  // ==========================================================================
  describe("Token-Bucket Rate Limiter", () => {
    it("should permit requests within capacity and block excessive requests", () => {
      const limiter = new SimpleRateLimiter(3, 1000); // 3 requests per second
      assert.strictEqual(limiter.check("user_a").allowed, true);
      assert.strictEqual(limiter.check("user_a").allowed, true);
      assert.strictEqual(limiter.check("user_a").allowed, true);

      // 4th request exceeds capacity
      const fourth = limiter.check("user_a");
      assert.strictEqual(fourth.allowed, false);
      assert.strictEqual(fourth.remaining, 0);
      assert.ok(fourth.resetMs > 0);

      // Different key has independent quota
      assert.strictEqual(limiter.check("user_b").allowed, true);

      limiter.close();
    });
  });

  // ==========================================================================
  // 3. HTTP / API BOUNDARY TESTS
  // ==========================================================================
  describe("HTTP API Validation & Endpoint Protection", () => {
    it("should reject malformed AI Summary requests with HTTP 400 before invoking AI", async () => {
      const res = await fetch(`${SERVER_URL}/api/ai-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: "not an array", teams: "not an array" })
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.match(json.error, /arrays/i);
    });

    it("should reject malformed Draft Analysis requests with HTTP 400", async () => {
      const res = await fetch(`${SERVER_URL}/api/draft-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams: "invalid" })
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.match(json.error, /array/i);
    });

    it("should reject malformed Player Facts and Tactical Advice requests with HTTP 400", async () => {
      // Player facts
      const factsRes = await fetch(`${SERVER_URL}/api/player-facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: "invalid_string" })
      });
      assert.strictEqual(factsRes.status, 400);

      // Tactical advice
      const adviceRes = await fetch(`${SERVER_URL}/api/tactical-advice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: null, team: null })
      });
      assert.strictEqual(adviceRes.status, 400);
    });

    it("should return HTTP 429 when AI endpoint rate limit is exceeded", async () => {
      // Exhaust the aiRateLimiter for this test IP address
      const testIp = "127.0.0.1";
      for (let i = 0; i < 35; i++) {
        serverInstance.aiRateLimiter.check(testIp);
      }

      const res = await fetch(`${SERVER_URL}/api/player-facts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": testIp
        },
        body: JSON.stringify({ player: { name: "Jasprit Bumrah" } })
      });

      assert.strictEqual(res.status, 429);
      const json = await res.json();
      assert.match(json.error, /Too many AI requests/i);

      // Reset limiter for test IP
      serverInstance.aiRateLimiter.reset(testIp);
    });

    it("should reject oversized JSON payloads via Express 1MB body limit", async () => {
      // Send 1.2MB payload
      const oversizedPayload = {
        history: new Array(50).fill({ note: "x".repeat(30000) }),
        teams: []
      };

      const res = await fetch(`${SERVER_URL}/api/ai-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(oversizedPayload)
      });

      // Express body-parser rejects with 413 Payload Too Large
      assert.strictEqual(res.status, 413);
    });
  });

  // ==========================================================================
  // 4. SOCKET.IO HARDENING & STATE INVARIANT TESTS
  // ==========================================================================
  describe("Socket.IO State Mutation Invariants & Hardening", () => {
    it("should reject invalid, negative, or NaN bids and preserve auction state invariants", async () => {
      const hostSocket = await createClient("bid_test_host");
      const peerSocket = await createClient("bid_test_peer");
      const roomId = `inv_bid_${Date.now()}`;

      // Join and start auction
      hostSocket.emit("join-room", { roomId, user: { displayName: "Host" } });
      await waitForRoomUpdate(hostSocket);

      const bothJoined = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
      peerSocket.emit("join-room", { roomId, user: { displayName: "Peer" } });
      await bothJoined;

      const started = waitForRoomUpdate(peerSocket, (r) => r.status === "active");
      hostSocket.emit("start-auction", { roomId, auctionType: "open" });
      const room = await started;

      const initialBid = room.currentBid;
      const initialBidder = room.currentBidderId;
      const initialBudget = serverInstance.rooms[roomId].teams["bid_test_peer"].budget;

      let errorMessageReceived = "";
      peerSocket.on("error-message", (err) => {
        errorMessageReceived = err.message;
      });

      // 1. Negative bid
      peerSocket.emit("place-bid", { roomId, amount: -10 });
      await new Promise((r) => setTimeout(r, 100));
      assert.match(errorMessageReceived, /Invalid bid/i);

      // Verify state invariant: currentBid, bidder, and budget unchanged
      assert.strictEqual(serverInstance.rooms[roomId].currentBid, initialBid);
      assert.strictEqual(serverInstance.rooms[roomId].currentBidderId, initialBidder);
      assert.strictEqual(serverInstance.rooms[roomId].teams["bid_test_peer"].budget, initialBudget);

      // 2. String bid
      errorMessageReceived = "";
      peerSocket.emit("place-bid", { roomId, amount: "fifty" });
      await new Promise((r) => setTimeout(r, 100));
      assert.match(errorMessageReceived, /Invalid bid/i);

      assert.strictEqual(serverInstance.rooms[roomId].currentBid, initialBid);
      assert.strictEqual(serverInstance.rooms[roomId].currentBidderId, initialBidder);

      // 3. Bid lower than required minimum
      errorMessageReceived = "";
      peerSocket.emit("place-bid", { roomId, amount: 0.1 });
      await new Promise((r) => setTimeout(r, 100));
      assert.match(errorMessageReceived, /must exceed current bid/i);

      assert.strictEqual(serverInstance.rooms[roomId].currentBid, initialBid);
      assert.strictEqual(serverInstance.rooms[roomId].currentBidderId, initialBidder);

      hostSocket.disconnect();
      peerSocket.disconnect();
    });

    it("should reject malformed room settings without mutating room configuration", async () => {
      const hostSocket = await createClient("settings_host");
      const roomId = `settings_test_${Date.now()}`;

      hostSocket.emit("join-room", { roomId, user: { displayName: "Host" } });
      const room = await waitForRoomUpdate(hostSocket);

      assert.strictEqual(room.purse, 120);
      assert.strictEqual(room.bidTime, 10);

      let settingsError = "";
      hostSocket.on("error-message", (err) => {
        settingsError = err.message;
      });

      // Attempt to set purse to 1000 Cr (valid max is 300)
      hostSocket.emit("update-room-settings", {
        roomId,
        purse: 1000
      });
      await new Promise((r) => setTimeout(r, 100));

      assert.match(settingsError, /purse/i);
      // State invariant check: purse remains 120
      assert.strictEqual(serverInstance.rooms[roomId].purse, 120);

      // Attempt to set invalid bidTime (e.g. 500s)
      settingsError = "";
      hostSocket.emit("update-room-settings", {
        roomId,
        bidTime: 500
      });
      await new Promise((r) => setTimeout(r, 100));

      assert.match(settingsError, /bidTime/i);
      assert.strictEqual(serverInstance.rooms[roomId].bidTime, 10);

      hostSocket.disconnect();
    });

    it("should throttle chat spam and enforce character limits", async () => {
      const client = await createClient("chat_spammer");
      const roomId = `chat_test_${Date.now()}`;

      client.emit("join-room", { roomId, user: { displayName: "Chatter" } });
      await waitForRoomUpdate(client);

      let chatError = "";
      client.on("error-message", (err) => {
        chatError = err.message;
      });

      // 1. Oversized chat message (> 500 chars)
      client.emit("chat-message", {
        roomId,
        message: "x".repeat(505)
      });
      await new Promise((r) => setTimeout(r, 100));
      assert.match(chatError, /exceeds maximum length/i);

      // 2. Chat rate limiting: send 25 messages rapidly
      chatError = "";
      for (let i = 0; i < 25; i++) {
        client.emit("chat-message", {
          roomId,
          message: `Hello message ${i}`
        });
      }
      await new Promise((r) => setTimeout(r, 150));
      assert.match(chatError, /Chat rate limit exceeded/i);

      client.disconnect();
    });

    it("should validate trade proposals and prevent spoofed fromUserId", async () => {
      const hostSocket = await createClient("trader_a");
      const peerSocket = await createClient("trader_b");
      const roomId = `trade_val_${Date.now()}`;

      hostSocket.emit("join-room", { roomId, user: { displayName: "Trader A" } });
      await waitForRoomUpdate(hostSocket);

      const bothJoined = waitForRoomUpdate(hostSocket, (r) => Object.keys(r.teams).length === 2);
      peerSocket.emit("join-room", { roomId, user: { displayName: "Trader B" } });
      await bothJoined;

      serverInstance.rooms[roomId].status = "trade";

      // Party A attempts to propose a trade spoofing fromUserId as 'trader_b'
      hostSocket.emit("propose-trade", {
        roomId,
        trade: {
          fromUserId: "trader_b", // Attacker trying to propose on behalf of B
          toUserId: "trader_a",
          fromPlayerIds: [],
          toPlayerIds: [],
          fromCash: 10,
          toCash: 0
        }
      });

      await new Promise((r) => setTimeout(r, 150));

      // Check the created trade: server MUST force fromUserId to be 'trader_a' (the authenticated user)
      const currentTrades = serverInstance.rooms[roomId].trades || [];
      assert.strictEqual(currentTrades.length, 1);
      assert.strictEqual(currentTrades[0].fromUserId, "trader_a");

      hostSocket.disconnect();
      peerSocket.disconnect();
    });
  });
});

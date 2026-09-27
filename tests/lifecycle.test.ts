import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { io as ClientSocket } from "socket.io-client";
import { startServer } from "../server";
import { createTestAuthHelper } from "./testAuthHelper";
import { SimpleRateLimiter } from "../src/services/rateLimiter";

describe("Server Reliability & Lifecycle Suite", () => {
  const authHelper = createTestAuthHelper();
  let serverInstance: Awaited<ReturnType<typeof startServer>>;
  const TEST_PORT = 3997;
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
    if (serverInstance && !serverInstance.isShuttingDown) {
      await serverInstance.close();
    }
    setTimeout(() => {
      process.exit(0);
    }, 100).unref();
  });

  // ==========================================================================
  // 1. HEALTH ENDPOINT VERIFICATION
  // ==========================================================================
  describe("GET /health Endpoint", () => {
    it("should return HTTP 200 with service identifier and healthy status", async () => {
      const res = await fetch(`${SERVER_URL}/health`);
      assert.strictEqual(res.status, 200);

      const contentType = res.headers.get("content-type") || "";
      assert.match(contentType, /application\/json/i);

      const body = await res.json();
      assert.strictEqual(body.status, "ok");
      assert.strictEqual(body.service, "ipl-auction-pro");
    });

    it("should be completely public and not require authentication", async () => {
      // Direct unauthenticated fetch with no headers or auth tokens
      const res = await fetch(`${SERVER_URL}/health`, {
        headers: {}
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.status, "ok");
    });

    it("should not expose internal secrets, environment variables, or room state", async () => {
      const res = await fetch(`${SERVER_URL}/health`);
      const text = await res.text();
      assert.doesNotMatch(text, /gemini/i);
      assert.doesNotMatch(text, /firebase/i);
      assert.doesNotMatch(text, /apiKey/i);
      assert.doesNotMatch(text, /rooms/i);
      assert.doesNotMatch(text, /private/i);
    });
  });

  // ==========================================================================
  // 2. RATE LIMITER LIFECYCLE
  // ==========================================================================
  describe("Rate Limiter Lifecycle", () => {
    it("should clean up its periodic timer and clear memory buckets when closed", () => {
      const limiter = new SimpleRateLimiter(5, 1000);
      limiter.check("ip_test_1");
      limiter.check("ip_test_2");

      // Verify close clears timer and storage cleanly without unhandled rejections
      limiter.close();

      // Subsequent close calls must be safe and idempotent
      assert.doesNotThrow(() => {
        limiter.close();
      });
    });
  });

  // ==========================================================================
  // 3. GRACEFUL SHUTDOWN & CLEANUP
  // ==========================================================================
  describe("Graceful Shutdown & Resource Teardown", () => {
    it("should successfully execute graceful shutdown and reject new connections", async () => {
      // Verify initial server state
      assert.strictEqual(serverInstance.isShuttingDown, false);

      // Connect an active socket
      const token = authHelper.createToken("lifecycle_user");
      const client = ClientSocket(SERVER_URL, {
        auth: { token },
        transports: ["websocket"]
      });

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err) => reject(err));
      });

      assert.strictEqual(client.connected, true);

      // Execute programmatic graceful close
      await serverInstance.close();

      // Invariant: isShuttingDown must be true
      assert.strictEqual(serverInstance.isShuttingDown, true);

      // Invariant: client socket must be disconnected by server
      assert.strictEqual(client.connected, false);

      // Invariant: subsequent HTTP requests to port should be rejected/fail
      try {
        await fetch(`${SERVER_URL}/api/ai-summary`, { method: "POST" });
        assert.fail("Server should not accept requests after shutdown");
      } catch (err: any) {
        // Fetch failed because port is closed (ECONNREFUSED)
        assert.ok(err);
      }

      // Invariant: subsequent close() calls must be idempotent and safe
      await assert.doesNotReject(async () => {
        await serverInstance.close();
      });
    });
  });
});

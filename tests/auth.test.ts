import { describe, it } from "node:test";
import assert from "node:assert";
import { verifyFirebaseIdToken } from "../src/services/authServer";
import { createTestAuthHelper } from "./testAuthHelper";

describe("Firebase Token Verification & Authorization Suite", () => {
  const authHelper = createTestAuthHelper();

  it("should successfully verify a cryptographically valid Firebase ID token", async () => {
    const validToken = authHelper.createToken("user_alpha_123");
    const result = await verifyFirebaseIdToken(validToken, {
      customCerts: authHelper.customCerts,
      customProjectId: authHelper.projectId
    });

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.uid, "user_alpha_123");
  });

  it("should reject an expired token", async () => {
    const expiredToken = authHelper.createToken("user_expired", true);
    const result = await verifyFirebaseIdToken(expiredToken, {
      customCerts: authHelper.customCerts,
      customProjectId: authHelper.projectId
    });

    assert.strictEqual(result.valid, false);
    assert.match(result.error || "", /expired/i);
  });

  it("should reject missing or empty token strings", async () => {
    const emptyResult = await verifyFirebaseIdToken("", {
      customCerts: authHelper.customCerts,
      customProjectId: authHelper.projectId
    });
    assert.strictEqual(emptyResult.valid, false);

    const nullResult = await verifyFirebaseIdToken(null as any, {
      customCerts: authHelper.customCerts,
      customProjectId: authHelper.projectId
    });
    assert.strictEqual(nullResult.valid, false);
  });

  it("should reject tokens with malformed structure", async () => {
    const malformed = "not.a.valid.jwt.token";
    const result = await verifyFirebaseIdToken(malformed, {
      customCerts: authHelper.customCerts,
      customProjectId: authHelper.projectId
    });

    assert.strictEqual(result.valid, false);
  });

  it("should reject tokens signed with an unknown or untrusted key", async () => {
    const validToken = authHelper.createToken("user_attacker");
    // Pass empty certs so kid cannot be resolved
    const result = await verifyFirebaseIdToken(validToken, {
      customCerts: {},
      customProjectId: authHelper.projectId
    });

    assert.strictEqual(result.valid, false);
    assert.match(result.error || "", /No matching public key found/i);
  });

  it("should reject tokens with mismatched project ID audience", async () => {
    const validToken = authHelper.createToken("user_target");
    const result = await verifyFirebaseIdToken(validToken, {
      customCerts: authHelper.customCerts,
      customProjectId: "completely-different-project-id"
    });

    assert.strictEqual(result.valid, false);
    assert.match(result.error || "", /Invalid audience/i);
  });
});

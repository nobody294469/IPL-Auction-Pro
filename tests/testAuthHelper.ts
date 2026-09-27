import crypto from "crypto";

export interface TestAuthHelper {
  projectId: string;
  customCerts: Record<string, string>;
  createToken: (uid: string, expired?: boolean) => string;
}

export function createTestAuthHelper(): TestAuthHelper {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  const kid = `test-kid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const customCerts = { [kid]: publicKey };
  const projectId = "test-auction-project";

  function createToken(uid: string, expired = false): string {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const exp = expired ? now - 100 : now + 3600;
    const payload = Buffer.from(JSON.stringify({
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
      sub: uid,
      exp,
      iat: now - 10,
      auth_time: now - 10
    })).toString("base64url");

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const signature = signer.sign(privateKey, "base64url");
    return `${header}.${payload}.${signature}`;
  }

  return {
    projectId,
    customCerts,
    createToken
  };
}

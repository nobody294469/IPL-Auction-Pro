import crypto from "crypto";
import fs from "fs";
import path from "path";

// Read project ID from env or firebase-applet-config.json
let defaultProjectId = "";
try {
  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    defaultProjectId = parsed.projectId || "";
  }
} catch {
  // Ignore error if config is missing or unreadable
}

export function getFirebaseProjectId(): string {
  return process.env.FIREBASE_PROJECT_ID || defaultProjectId;
}

interface DecodedHeader {
  alg: string;
  kid?: string;
  typ?: string;
}

interface DecodedPayload {
  aud: string;
  iss: string;
  sub: string;
  exp: number;
  iat: number;
  auth_time?: number;
  email?: string;
  [key: string]: unknown;
}

interface CertCache {
  certs: Record<string, string>;
  expiresAt: number;
}

let cachedCerts: CertCache | null = null;

const GOOGLE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export async function fetchGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedCerts && cachedCerts.expiresAt > now) {
    return cachedCerts.certs;
  }

  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google public certificates: HTTP ${response.status}`);
  }

  const certs = (await response.json()) as Record<string, string>;

  // Parse Cache-Control max-age header
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 21600; // default 6h

  cachedCerts = {
    certs,
    expiresAt: now + maxAgeSeconds * 1000
  };

  return certs;
}

export interface TokenVerificationResult {
  valid: boolean;
  uid?: string;
  email?: string;
  error?: string;
}

/**
 * Cryptographically verifies a Firebase ID Token using Google's public certificates.
 * Follows the official Google OIDC / Firebase ID token verification specification:
 * - Alg must be RS256
 * - Signature verified against Google's public x509 cert matching the header kid
 * - aud must match the Firebase project ID
 * - iss must be https://securetoken.google.com/<projectId>
 * - sub must be non-empty string <= 128 chars (Firebase UID)
 * - exp must be in the future
 * - iat and auth_time must be in the past (with reasonable clock skew)
 */
export async function verifyFirebaseIdToken(
  token: string,
  options?: {
    customProjectId?: string;
    customCerts?: Record<string, string>;
  }
): Promise<TokenVerificationResult> {
  if (!token || typeof token !== "string") {
    return { valid: false, error: "Token is missing or invalid" };
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "Malformed token: expected 3 dot-separated segments" };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Decode header
  let header: DecodedHeader;
  try {
    const rawHeader = Buffer.from(headerB64, "base64url").toString("utf-8");
    header = JSON.parse(rawHeader);
  } catch {
    return { valid: false, error: "Malformed token header" };
  }

  if (header.alg !== "RS256") {
    return { valid: false, error: `Unsupported algorithm: ${header.alg}. Expected RS256.` };
  }

  if (!header.kid || typeof header.kid !== "string") {
    return { valid: false, error: "Token header missing key identifier (kid)" };
  }

  // 2. Decode payload
  let payload: DecodedPayload;
  try {
    const rawPayload = Buffer.from(payloadB64, "base64url").toString("utf-8");
    payload = JSON.parse(rawPayload);
  } catch {
    return { valid: false, error: "Malformed token payload" };
  }

  // 3. Validate claims
  const projectId = options?.customProjectId || getFirebaseProjectId();
  if (!projectId) {
    return { valid: false, error: "Server misconfiguration: Firebase Project ID not found" };
  }

  if (payload.aud !== projectId) {
    return { valid: false, error: `Invalid audience (aud): expected ${projectId}` };
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    return { valid: false, error: `Invalid issuer (iss): expected ${expectedIssuer}` };
  }

  if (!payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128) {
    return { valid: false, error: "Invalid subject (sub): must be a non-empty string <= 128 characters" };
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const CLOCK_SKEW_TOLERANCE_SECONDS = 300; // 5 minutes

  if (typeof payload.exp !== "number" || payload.exp <= (nowInSeconds - 60)) {
    return { valid: false, error: "Token has expired" };
  }

  if (typeof payload.iat !== "number" || payload.iat > (nowInSeconds + CLOCK_SKEW_TOLERANCE_SECONDS)) {
    return { valid: false, error: "Token issued in the future" };
  }

  if (payload.auth_time && typeof payload.auth_time === "number" && payload.auth_time > (nowInSeconds + CLOCK_SKEW_TOLERANCE_SECONDS)) {
    return { valid: false, error: "Token authentication time in the future" };
  }

  // 4. Cryptographic signature verification using Google's public certificates (or custom test certs)
  try {
    let certs = options?.customCerts;
    if (!certs) {
      certs = await fetchGooglePublicCerts(false);
      let certPem = certs[header.kid];

      // If kid not found in cached certs, try a force refresh in case Google rotated keys
      if (!certPem) {
        certs = await fetchGooglePublicCerts(true);
        certPem = certs[header.kid];
      }
    }

    const certPem = certs[header.kid];
    if (!certPem) {
      return { valid: false, error: `No matching public key found for kid: ${header.kid}` };
    }

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const isSignatureValid = verifier.verify(certPem, signatureB64, "base64url");

    if (!isSignatureValid) {
      return { valid: false, error: "Cryptographic signature verification failed" };
    }

    return {
      valid: true,
      uid: payload.sub,
      email: payload.email
    };
  } catch (err) {
    return { valid: false, error: `Certificate verification error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

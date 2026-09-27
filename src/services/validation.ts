/**
 * Validation schemas and input sanitization helpers for IPL Auction Pro server.
 * Provides lightweight, zero-dependency validation for HTTP endpoints and Socket.IO events.
 */

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  error?: string;
}

export function isNonEmptyString(val: unknown, maxLen = 100): val is string {
  return typeof val === "string" && val.trim().length > 0 && val.length <= maxLen;
}

export function isValidId(val: unknown, maxLen = 100): val is string {
  return typeof val === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(val.trim());
}

export function isPositiveNumber(val: unknown, min = 0, max = 1000): val is number {
  return typeof val === "number" && !isNaN(val) && isFinite(val) && val >= min && val <= max;
}

export function sanitizeString(val: unknown, maxLen = 500, fallback = ""): string {
  if (typeof val !== "string") return fallback;
  return val.trim().slice(0, maxLen);
}

// ----------------------------------------------------------------------------
// HTTP / API Schemas
// ----------------------------------------------------------------------------

export function validateAISummaryPayload(body: any): ValidationResult<{ history: any[]; teams: any[] }> {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid payload: request body must be a JSON object" };
  }
  const { history, teams } = body;
  if (!Array.isArray(history) || !Array.isArray(teams)) {
    return { valid: false, error: "Invalid payload: history and teams must be arrays" };
  }
  if (history.length > 500) {
    return { valid: false, error: "Invalid payload: history array exceeds maximum allowed entries (500)" };
  }
  if (teams.length > 50) {
    return { valid: false, error: "Invalid payload: teams array exceeds maximum allowed entries (50)" };
  }
  return { valid: true, data: { history, teams } };
}

export function validateDraftAnalysisPayload(body: any): ValidationResult<{ teams: any[] }> {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid payload: request body must be a JSON object" };
  }
  const { teams } = body;
  if (!Array.isArray(teams)) {
    return { valid: false, error: "Invalid payload: teams must be an array" };
  }
  if (teams.length === 0 || teams.length > 50) {
    return { valid: false, error: "Invalid payload: teams must contain between 1 and 50 squads" };
  }
  return { valid: true, data: { teams } };
}

export function validatePlayerFactsPayload(body: any): ValidationResult<{ player: any }> {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid payload: request body must be a JSON object" };
  }
  const { player } = body;
  if (!player || typeof player !== "object") {
    return { valid: false, error: "Invalid payload: player must be an object" };
  }
  if (player.name && (typeof player.name !== "string" || player.name.length > 100)) {
    return { valid: false, error: "Invalid payload: player name exceeds 100 characters" };
  }
  return { valid: true, data: { player } };
}

export function validateTacticalAdvicePayload(body: any): ValidationResult<{ player: any; team: any }> {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid payload: request body must be a JSON object" };
  }
  const { player, team } = body;
  if (!player || typeof player !== "object" || !team || typeof team !== "object") {
    return { valid: false, error: "Invalid payload: player and team objects are required" };
  }
  if (team.budget !== undefined && (!isPositiveNumber(team.budget, 0, 500))) {
    return { valid: false, error: "Invalid payload: team budget must be a positive number up to 500" };
  }
  return { valid: true, data: { player, team } };
}

// ----------------------------------------------------------------------------
// Socket.IO Schemas
// ----------------------------------------------------------------------------

export function validateJoinRoomPayload(payload: any): ValidationResult<{ roomId: string; displayName: string; photoURL: string }> {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid join payload" };
  }
  const { roomId, user } = payload;
  if (!isValidId(roomId, 100)) {
    return { valid: false, error: "Invalid roomId format" };
  }
  const displayName = sanitizeString(user?.displayName, 50, "Anonymous");
  const photoURL = sanitizeString(user?.photoURL, 300, "");
  return { valid: true, data: { roomId, displayName, photoURL } };
}

export function validateSelectTeamPayload(payload: any): ValidationResult<{ roomId: string; teamId: string }> {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid select team payload" };
  }
  const { roomId, teamId } = payload;
  if (!isValidId(roomId, 100) || !isValidId(teamId, 50)) {
    return { valid: false, error: "Invalid roomId or teamId format" };
  }
  return { valid: true, data: { roomId, teamId } };
}

export function validateUpdateSettingsPayload(payload: any): ValidationResult<{
  roomId: string;
  purse?: number;
  bidTime?: number;
  draftLimit?: number;
  auctionType?: "open" | "blind" | "draft" | "mega";
}> {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid settings payload" };
  }
  const { roomId, purse, bidTime, draftLimit, auctionType } = payload;
  if (!isValidId(roomId, 100)) {
    return { valid: false, error: "Invalid roomId" };
  }

  const validTypes = new Set(["open", "blind", "draft", "mega"]);
  if (auctionType !== undefined && !validTypes.has(auctionType)) {
    return { valid: false, error: "Invalid auctionType" };
  }
  if (purse !== undefined && !isPositiveNumber(purse, 50, 300)) {
    return { valid: false, error: "Invalid purse: must be between 50 and 300 Cr" };
  }
  if (bidTime !== undefined && !isPositiveNumber(bidTime, 5, 60)) {
    return { valid: false, error: "Invalid bidTime: must be between 5 and 60 seconds" };
  }
  if (draftLimit !== undefined && !isPositiveNumber(draftLimit, 5, 25)) {
    return { valid: false, error: "Invalid draftLimit: must be between 5 and 25 rounds" };
  }

  return {
    valid: true,
    data: { roomId, purse, bidTime, draftLimit, auctionType }
  };
}

export function validatePlaceBidPayload(payload: any): ValidationResult<{ roomId: string; amount: number }> {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid bid payload" };
  }
  const { roomId, amount } = payload;
  if (!isValidId(roomId, 100)) {
    return { valid: false, error: "Invalid roomId" };
  }
  // Bids must be positive finite numbers, up to 500 Cr
  if (!isPositiveNumber(amount, 0.1, 500)) {
    return { valid: false, error: "Invalid bid amount" };
  }
  return { valid: true, data: { roomId, amount: Math.round(amount * 100) / 100 } };
}

export function validateChatMessagePayload(payload: any): ValidationResult<{ roomId: string; message: string; userName?: string }> {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid chat payload" };
  }
  const { roomId, message, userName } = payload;
  if (!isValidId(roomId, 100)) {
    return { valid: false, error: "Invalid roomId" };
  }
  if (typeof message !== "string" || !message.trim()) {
    return { valid: false, error: "Message cannot be empty" };
  }
  if (message.length > 500) {
    return { valid: false, error: "Message exceeds maximum length of 500 characters" };
  }
  return {
    valid: true,
    data: {
      roomId,
      message: message.trim(),
      userName: sanitizeString(userName, 50, "Participant")
    }
  };
}

export function validateProposeTradePayload(payload: any): ValidationResult<{
  roomId: string;
  trade: {
    fromUserId: string;
    toUserId: string;
    fromPlayerIds: string[];
    toPlayerIds: string[];
    fromCash: number;
    toCash: number;
  };
}> {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid trade payload" };
  }
  const { roomId, trade } = payload;
  if (!isValidId(roomId, 100) || !trade || typeof trade !== "object") {
    return { valid: false, error: "Invalid roomId or trade object" };
  }
  if (!isValidId(trade.toUserId, 128)) {
    return { valid: false, error: "Invalid trade counterparty ID" };
  }
  if (!Array.isArray(trade.fromPlayerIds) || !Array.isArray(trade.toPlayerIds)) {
    return { valid: false, error: "Player ID lists must be arrays" };
  }
  if (trade.fromPlayerIds.length > 10 || trade.toPlayerIds.length > 10) {
    return { valid: false, error: "Maximum 10 players allowed per trade offer" };
  }
  const fromCash = isPositiveNumber(trade.fromCash, 0, 200) ? trade.fromCash : 0;
  const toCash = isPositiveNumber(trade.toCash, 0, 200) ? trade.toCash : 0;

  return {
    valid: true,
    data: {
      roomId,
      trade: {
        fromUserId: trade.fromUserId || "",
        toUserId: trade.toUserId,
        fromPlayerIds: trade.fromPlayerIds.map(id => String(id).slice(0, 50)),
        toPlayerIds: trade.toPlayerIds.map(id => String(id).slice(0, 50)),
        fromCash,
        toCash
      }
    }
  };
}

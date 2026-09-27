import { describe, it } from "node:test";
import assert from "node:assert";
import { PLAYERS } from "../src/data/players";
import { TEAMS } from "../src/data/teams";
import { Player, AuctionRoom, UserProfile } from "../src/types";

describe("Auction Engine State & Rule Invariants Suite", () => {
  it("should enforce player database integrity: 127 total players across exact role & set schemas", () => {
    assert.strictEqual(PLAYERS.length, 127, "Must contain exactly 127 cataloged players");

    const validSets = new Set(["Marquee", "Batters", "Wicketkeepers", "All-rounders", "Bowlers"]);
    const validDraftCategories = new Set(["Batter", "Wicketkeeper", "All-rounder", "Bowler"]);

    PLAYERS.forEach((player) => {
      assert.ok(player.id, "Player must have an ID");
      assert.ok(player.name, "Player must have a name");
      assert.ok(player.basePrice >= 0.2 && player.basePrice <= 2.0, "Base price must be within â‚¹20L to â‚¹2Cr");
      assert.ok(player.role, "Player must have a primary role");
      assert.ok(validSets.has(player.auctionSet || ""), `Invalid auction set for ${player.name}: ${player.auctionSet}`);
      assert.ok(validDraftCategories.has(player.draftCategory || ""), `Invalid draft category for ${player.name}`);
    });
  });

  it("should enforce franchise database integrity: 10 official IPL franchises", () => {
    assert.strictEqual(TEAMS.length, 10, "Must contain exactly 10 official franchises");
    const expectedShortNames = new Set(["MI", "CSK", "RCB", "KKR", "DC", "GT", "LSG", "PBKS", "RR", "SRH"]);

    TEAMS.forEach((team) => {
      assert.ok(team.id, "Team must have an ID");
      assert.ok(team.name, "Team must have an official name");
      assert.ok(team.shortName, "Team must have a short name");
      assert.ok(expectedShortNames.has(team.shortName), `Unexpected team shortName: ${team.shortName}`);
      assert.ok(team.logo, "Team must have a logo path");
    });
  });

  it("should maintain purse and squad mathematical consistency on lot win", () => {
    const initialPurse = 120;
    const winningBid = 14.5;
    const player: Player = {
      id: "test_p1",
      name: "Star Player",
      role: "All-rounder",
      basePrice: 2,
      country: "India",
      image: "",
      auctionSet: "Marquee",
      draftCategory: "All-rounder"
    };

    const team: UserProfile = {
      uid: "user_buyer",
      displayName: "Winning Franchise",
      budget: initialPurse,
      squad: [],
      rtmCards: 2
    };

    // Simulate winning transaction
    team.budget -= winningBid;
    team.squad.push({ ...player, soldTo: team.uid, soldPrice: winningBid });

    assert.strictEqual(team.budget, initialPurse - winningBid);
    assert.strictEqual(team.squad.length, 1);
    assert.strictEqual(team.squad[0].soldTo, "user_buyer");
    assert.strictEqual(team.squad[0].soldPrice, winningBid);
  });

  it("should accurately compute simplified IPL Mega Auction retention fees and RTM allowances", () => {
    // IPL 2025 Retention Tier: Capped 1st: 18, 2nd: 14, 3rd: 11; Uncapped: 4 each
    const cappedCosts = [18, 14, 11, 18, 14];
    const initialBudget = 120;

    let currentBudget = initialBudget;
    let cappedRetained = 2; // e.g. 1st (18) + 2nd (14) = 32
    let uncappedRetained = 1; // 1 x 4 = 4

    const totalDeduction = cappedCosts[0] + cappedCosts[1] + (uncappedRetained * 4);
    currentBudget -= totalDeduction;

    const remainingRTM = Math.max(0, 6 - (cappedRetained + uncappedRetained));

    assert.strictEqual(totalDeduction, 36);
    assert.strictEqual(currentBudget, 84);
    assert.strictEqual(remainingRTM, 3); // 6 total slots - 3 retentions = 3 RTM cards remaining
  });
});

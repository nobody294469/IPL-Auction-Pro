import { describe, it } from "node:test";
import assert from "node:assert";
import { getPlayerFacts, analyzeDraftTeams, generateAuctionSummary } from "../src/services/geminiServer";
import { PRE_GENERATED_FACTS } from "../src/data/scoutingReports";

describe("AI Service & Offline Fallback Suite", () => {
  it("should return pre-generated scouting reports synchronously without calling external API", async () => {
    // Player ID 1 is Virat Kohli
    const facts = await getPlayerFacts({ id: "1", name: "Virat Kohli", role: "Top Order" });
    assert.ok(facts);
    assert.strictEqual(Array.isArray(facts.facts), true);
    assert.strictEqual(facts.facts.length >= 3, true);
    assert.strictEqual(facts.minPrice, PRE_GENERATED_FACTS['1'].minPrice);
    assert.strictEqual(facts.maxPrice, PRE_GENERATED_FACTS['1'].maxPrice);
  });

  it("should generate structured tactical fallback facts for an unknown or uncataloged player", async () => {
    const customPlayer = {
      id: "custom_999",
      name: "Rising Talent",
      role: "All-rounder",
      basePrice: 1.5
    };
    const facts = await getPlayerFacts(customPlayer);
    assert.ok(facts);
    assert.strictEqual(Array.isArray(facts.facts), true);
    assert.strictEqual(facts.facts.length >= 3, true);
    assert.strictEqual(facts.minPrice, 1.5);
    assert.strictEqual(facts.maxPrice, 1.5 * 1.5);
  });

  it("should execute robust local draft ranking fallback when AI service is unavailable or offline", async () => {
    // When GEMINI_API_KEY is dummy or unavailable, analyzeDraftTeams catches and generates fallback
    const mockTeams = [
      {
        displayName: "Mumbai Indians",
        squad: [{ name: "Bumrah", role: "Bowler" }, { name: "Rohit", role: "Batter" }]
      },
      {
        displayName: "Chennai Super Kings",
        squad: [{ name: "Dhoni", role: "Wicketkeeper" }]
      }
    ];

    const analysis = await analyzeDraftTeams(mockTeams);
    assert.ok(analysis);
    assert.ok(Array.isArray(analysis.rankings));
    // The fallback ranks by squad depth (2 players > 1 player)
    assert.strictEqual(analysis.rankings[0], "Mumbai Indians");
    assert.ok(analysis.bestTeamReason);
    assert.ok(analysis.darkHorse);
  });

  it("should provide safe fallback summary if auction summary call fails", async () => {
    const summary = await generateAuctionSummary([], []);
    assert.ok(typeof summary === "string");
    assert.strictEqual(summary.length > 0, true);
  });
});

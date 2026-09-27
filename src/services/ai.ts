import { PRE_GENERATED_FACTS } from "../data/scoutingReports";

export const generateAuctionSummary = async (history: any[], teams: any[]) => {
  try {
    const response = await fetch("/api/ai-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, teams })
    });
    if (!response.ok) throw new Error("HTTP error " + response.status);
    const data = await response.json();
    return data.summary;
  } catch (error) {
    console.error("Client API ai-summary error:", error);
    return "The auction was intense! Every team fought hard for their favorite stars.";
  }
};

export const analyzeDraftTeams = async (teams: any[]) => {
  try {
    const response = await fetch("/api/draft-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teams })
    });
    if (!response.ok) throw new Error("HTTP error " + response.status);
    const data = await response.json();
    return data.analysis;
  } catch (error) {
    console.error("Client API draft-analysis error:", error);
    // Robust local fallback generator if the endpoint fails
    if (teams && teams.length > 0) {
      const sorted = [...teams].sort((a, b) => (b.squad?.length || 0) - (a.squad?.length || 0));
      return {
        rankings: sorted.map(t => t.displayName),
        bestTeamReason: `${sorted[0]?.displayName || 'The top team'} has built a very balanced squad with great depth across roles.`,
        darkHorse: {
          name: sorted[1]?.displayName || (sorted[0] ? 'Another team' : 'Opponent'),
          reason: "They have acquired critical utility players at excellent value and can surprise everyone."
        }
      };
    }
    return null;
  }
};

export const getPlayerFacts = async (player: any) => {
  const playerId = String(player?.id || '');
  const report = PRE_GENERATED_FACTS[playerId];
  if (report) {
    return report;
  }

  // Robust fallback if a custom or new player is checked
  return {
    facts: [
      `${player?.name || 'This player'} is a key ${player?.role || 'cricketer'} for any T20 squad.`,
      `Known for consistent performances in domestic and international T20 leagues.`,
      `A highly valuable strategic asset who can change the course of the match.`
    ],
    minPrice: player?.basePrice || 2.0,
    maxPrice: (player?.basePrice || 2.0) * 1.5
  };
};

export const getTacticalAdvice = async (player: any, team: any) => {
  try {
    const response = await fetch("/api/tactical-advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, team })
    });
    if (!response.ok) throw new Error("HTTP error " + response.status);
    const data = await response.json();
    return data.advice;
  } catch (error) {
    console.error("Client API tactical-advice error:", error);
    return "Analyze your squad needs before bidding.";
  }
};

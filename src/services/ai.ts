import { GoogleGenAI, Type } from "@google/genai";
import { PRE_GENERATED_FACTS } from "../data/scoutingReports";

const isBrowser = typeof window !== "undefined";

const getAI = () => {
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();

  if (geminiKey) {
    return { 
      type: 'gemini', 
      client: new GoogleGenAI({ 
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      }),
      key: geminiKey
    };
  }

  throw new Error("AI API key is missing. Please ensure Gemini is configured.");
};

/**
 * Executes a Gemini content generation call with automatic fallback models to ensure high availability.
 */
const callGeminiWithFallback = async (
  prompt: string,
  config?: any
) => {
  const ai = getAI();
  const models = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.client.models.generateContent({
        model,
        contents: prompt,
        config
      });
      if (response && response.text) {
        return response;
      }
    } catch (err: any) {
      console.warn(`Gemini call failed with model ${model}, trying fallback. Error:`, err.message || err);
      lastError = err;
    }
  }
  throw lastError || new Error("All Gemini models failed");
};

export const generateAuctionSummary = async (history: any[], teams: any[]) => {
  if (isBrowser) {
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
  }

  try {
    const prompt = `Analyze this IPL auction history and provide a fun, expert summary in 3 short bullet points. 
    History: ${JSON.stringify(history)}
    Teams: ${JSON.stringify(teams)}
    Highlight the best buy, the biggest spender, and a witty remark about the overall competition.`;

    const response = await callGeminiWithFallback(prompt);
    return response.text;
  } catch (error) {
    console.error("Summary Error after fallbacks:", error);
    return "The auction was intense! Every team fought hard for their favorite stars.";
  }
};

export const analyzeDraftTeams = async (teams: any[]) => {
  if (isBrowser) {
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
      return null;
    }
  }

  try {
    const squadsData = teams.map(t => ({
      teamName: t.displayName,
      squad: t.squad.map((p: any) => ({ name: p.name, role: p.role, stats: p.stats }))
    }));

    const prompt = `You are an expert T20 cricket analyst. Analyze these squads from a draft and determine which team is the strongest for the T20 format.
    Squads: ${JSON.stringify(squadsData)}
    
    Provide:
    1. A "Power Ranking" (List of team names in order from 1st to last).
    2. A brief reason why the #1 team is the best (mention balance, finishers, or bowling depth).
    3. A "Dark Horse" team name and a short reason why.
    
    Format the response as JSON:
    {
      "rankings": ["Team Name 1", "Team Name 2", ...],
      "bestTeamReason": "string",
      "darkHorse": {
        "name": "Team Name",
        "reason": "string"
      }
    }`;

    const response = await callGeminiWithFallback(prompt, { responseMimeType: "application/json" });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Draft Analysis Error after fallbacks:", error);
    // Robust local fallback generator to keep the UI fully functional even if Gemini API is entirely offline
    if (teams && teams.length > 0) {
      const sorted = [...teams].sort((a, b) => b.squad.length - a.squad.length);
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
  if (isBrowser) {
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
  }

  try {
    if (!team) throw new Error("Team data is missing");
    
    const squad = team.squad || [];
    const budget = team.budget || 0;
    
    const squadSummary = squad.map((p: any) => `${p.name} (${p.role})`).join(", ");
    const prompt = `You are a professional cricket scout and auction strategist.
    Current Player up for auction: ${player.name} (${player.role}).
    Manager's current squad: ${squadSummary || "Empty"}.
    Manager's remaining budget: ₹${budget} Cr.
    
    Give a one-sentence tactical advice on whether they should buy this player or save their money. 
    Consider:
    1. Squad balance (do they need this role?).
    2. Budget constraints (is this player too expensive for their remaining purse?).
    3. Opportunity cost (should they wait for someone better?).
    
    Be specific and punchy. Keep it under 25 words.`;

    const response = await callGeminiWithFallback(prompt);
    return response.text;
  } catch (error: any) {
    console.error("Tactical Advice Error after fallbacks:", error);
    return "Analyze your squad needs before bidding.";
  }
};

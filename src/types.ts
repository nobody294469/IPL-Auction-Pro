export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  budget: number;
  squad: Player[];
  teamId?: string;
  isReady?: boolean;
  rtmCards: number;
  retentions?: string[];
  retentionSubmitted?: boolean;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  color: string;
  accent: string;
}

export interface Player {
  id: string;
  name: string;
  role: 'Top Order' | 'Middle Order' | 'Wicket-keeper' | 'Finisher' | 'All-rounder' | 'Pacer' | 'Spinner';
  country: string;
  basePrice: number;
  image: string;
  previousTeamId?: string;
  isUncapped?: boolean;
  isRetired?: boolean;
  auctionSet?: 'Marquee' | 'Batters' | 'Wicketkeepers' | 'All-rounders' | 'Bowlers' | 'Accelerated';
  stats?: {
    matches?: number;
    runs?: number;
    wickets?: number;
    strikeRate?: number;
    economy?: number;
    average?: number;
  };
  soldTo?: string;
  soldPrice?: number;
}

export interface PlayerFact {
  facts: string[];
  minPrice: number;
  maxPrice: number;
}

export interface SquadAnalysis {
  bestXI: string[];
  balance: {
    batting: number;
    bowling: number;
    allRound: number;
  };
  valuePicks: string[];
}

export interface Trade {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromPlayerIds: string[];
  toPlayerIds: string[];
  fromCash: number;
  toCash: number;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: string;
}

export interface AuctionRoom {
  id: string;
  name: string;
  hostId: string;
  status: 'lobby' | 'active' | 'finished' | 'transitioning' | 'rtm' | 'scouting' | 'selling' | 'retention' | 'trade';
  auctionType: 'open' | 'blind' | 'draft' | 'mega';
  teams: Record<string, UserProfile>; // userId -> profile with teamId
  players: Player[];
  currentPlayerIndex: number;
  currentBid: number;
  currentBidderId?: string;
  blindBids?: Record<string, number>;
  draftOrder?: string[];
  draftTurnIndex?: number;
  draftRound?: number;
  draftDirection?: 'forward' | 'backward';
  draftPool?: Player[];
  draftLimit?: number;
  draftAnalysis?: {
    rankings: string[];
    bestTeamReason: string;
    darkHorse: { name: string; reason: string };
  };
  aiSummary?: string;
  squadAnalyses?: Record<string, SquadAnalysis>;
  trades?: Trade[];
  playerFacts?: Record<string, PlayerFact>;
  rtmPending?: {
    eligibleUserId: string;
    amount: number;
    playerId: string;
    originalWinnerId: string;
  };
  timer: number;
  isPaused?: boolean;
  isAccelerated?: boolean;
  purse: number;
  bidTime: number;
  history: {
    playerId: string;
    teamId: string;
    price: number;
    timestamp: string;
  }[];
}

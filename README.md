# ðŸ IPL Auction Pro

[![CI](https://github.com/nobody294469/IPL-Auction-Pro-v1/actions/workflows/ci.yml/badge.svg)](https://github.com/nobody294469/IPL-Auction-Pro-v1/actions/workflows/ci.yml)

A real-time multiplayer cricket auction simulator and squad management platform designed around synchronized live bidding, server-authoritative state progression, and tactical intelligence.

---

## Overview

**IPL Auction Pro** recreates the high-stakes environment of a professional Indian Premier League auction. Users can create custom private auction rooms, join with arena codes, select and command official franchises, manage team budgets, and participate in four distinct auction formats in real time with peers.

The application is engineered around real-time WebSocket communication (Socket.IO) backed by a Node.js/Express server that acts as the single source of truth for auction timers, bidding increments, squad allocations, and room lifecycle phases. Firebase Authentication governs user identity and token-verified socket handshakes, while Google Gemini models provide automated scouting reports, tactical advice, and post-auction analytics through a secure server-side API bridge.

---

## Key Features

- **Real-Time Multiplayer Arena**: Synchronized live auction sessions across multiple managers with live bid broadcasts and countdown timers via Socket.IO.
- **Server-Authoritative Auction Engine**: The server strictly enforces bid increments, validates available purse balances, computes squad limits, advances timers, and resolves lots.
- **Official IPL Franchise Showcase**: Complete lineup of 10 official franchises (MI, CSK, RCB, KKR, DC, GT, LSG, PBKS, RR, SRH) with authentic branding and default â‚¹120 Cr purses.
- **Curated Dataset**: 127 professionally cataloged cricketers across specialized auction sets (Marquee, Batters, Wicketkeepers, All-rounders, Bowlers) with domestic and international T20 statistics.
- **Token-Authenticated Sockets**: Socket.IO connections verify Firebase Auth ID tokens directly against Google's public x509 certificates before permitting room participation.
- **Pre-Auction Squad Retentions**: Mega Auction rooms support pre-auction retention declarations with configurable slot caps and purse deductions.
- **In-Auction RTM (Right to Match)**: Interactive RTM prompts allowing matching rights for previous franchises during active player sales.
- **Post-Auction Mid-Season Trading**: Dedicated trade arena supporting asynchronous player-for-player and cash trade proposals between franchise managers.
- **Interactive Visualizations & Analytics**: Post-auction budget burn trajectory graphs (Recharts), squad balance radar/role breakdowns, and dynamic player ratings.
- **Tactical AI Integration**: Server-mediated Gemini AI generating live player scouting highlights, tactical squad advice, and post-auction recaps.

---

## Auction Formats

IPL Auction Pro implements four distinct competitive rulesets:

### 1. Open Auction
Classic live IPL hammer auction. Players from sequential auction sets are presented lot-by-lot. Managers place ascending live bids with real-time countdown resets upon each bid. When the timer expires without a higher offer, the lot is sold or passed to the unsold pool.

### 2. Blind Auction
Confidential tender bidding. All participants submit sealed bids for each presented player before an uncompromising global countdown expires. Once the timer elapses, the server evaluates all submitted bids simultaneously, awarding the player to the highest bidder at their submitted price.

### 3. Draft Mode
Turn-based snake draft format. Teams draft players in alternating round order without purse deductions. The draft progresses through dedicated role categories (Wicketkeepers, Batters, All-rounders, Bowlers) with configurable pick time limits and snake turnaround logic.

### 4. Mega Auction
Comprehensive multi-phase tournament auction. Features:
1. **Retention Phase**: Franchises choose up to 4 eligible players to retain prior to the gavel, deducting tiered retention fees from their purse.
2. **Main Auction Phase**: Long-form open bidding through all player sets with active Right-to-Match (RTM) challenge windows for former franchises.
3. **Trade Phase**: Completed auction rosters can initiate direct manager-to-manager player and cash trades.

---

## AI Features & Architecture

Gemini AI capabilities are exposed strictly through an authenticated Express backend proxy (`/api/*`). The client never has access to the `GEMINI_API_KEY`, ensuring API keys remain fully isolated in the server runtime.

```
React Client (SPA)
       â”‚
       â–¼ (HTTP POST /api/ai-summary, /api/draft-analysis, etc.)
Express API Layer (server.ts)
       â”‚
       â–¼
Gemini Server Service (geminiServer.ts)
       â”‚  (Iterates: gemini-2.5-flash â†’ gemini-2.0-flash â†’ gemini-1.5-flash)
       â–¼
Google Gemini API (@google/genai)
```

### Confirmed AI Capabilities:
- **Auction Summary (`/api/ai-summary`)**: Analyzes complete bidding history and final team rosters to generate concise, witty recaps highlighting top buys, biggest spenders, and draft steals.
- **Draft Team Analysis (`/api/draft-analysis`)**: Evaluates role distribution, squad depth, and tactical strengths across all drafted squads to rank team rosters and identify dark horse contenders.
- **Player Facts & Scouting (`/api/player-facts`)**: Delivers tactical bullet points and historical IPL performance context for active lots. Backed by 127 curated scouting records in `src/data/scoutingReports.ts` with dynamic fallback.
- **Tactical Advice (`/api/tactical-advice`)**: Evaluates team needs in real time against the current lot and suggests optimal bid limits based on remaining purse.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS v4, Motion (motion/react) |
| **Backend** | Node.js, Express 4, Socket.IO 4, tsx |
| **Real-Time Layer** | Socket.IO (bid events, timer ticks, lot resolution, trade sync) |
| **Authentication** | Firebase Authentication (Google OAuth, Client Token Verification) |
| **Database** | Cloud Firestore (persistent room creation and host metadata) |
| **AI & Intelligence** | Google Gemini API (`@google/genai` on server runtime with fallback routing) |
| **Data Visualization** | Recharts (LineChart, ResponsiveContainer) |
| **UI & Feedback** | Lucide React, Sonner (Toasts), Canvas Confetti |
| **Deployment** | Render (Unified Node.js web service serving static Vite SPA + Socket.IO) |

---

## System Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   React 19 Frontend                    â”‚
â”‚   (Vite + Tailwind CSS + Space Grotesk / Inter Typography)â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚                          â”‚
   Firebase ID â”‚ (Handshake Auth)         â”‚ API Requests
   Token       â–¼                          â–¼ (/api/*)
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   Node.js / Express                    â”‚
â”‚  - Socket.IO Server (Authenticated by Google Certs)     â”‚
â”‚  - Server-Authoritative Room & Bidding Memory Engine   â”‚
â”‚  - Gemini AI Proxy Service (Holds GEMINI_API_KEY)      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚                          â”‚
      Verifies â”‚ Firebase                 â”‚ Calls API
      Token    â–¼                          â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚   Google Public x509    â”‚    â”‚    Google Gemini API    â”‚
â”‚      Certificates       â”‚    â”‚     (@google/genai)     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Real-Time vs. Persistent State Separation
- **Firebase Authentication**: Manages user identity and issues cryptographically signed JWT tokens.
- **Cloud Firestore**: Stores persistent initial room configurations and creator IDs (`/rooms/{roomId}`). Governed by security rules (`firestore.rules`) enforcing authenticated read/write access.
- **In-Memory Server State (`rooms` record)**: Authoritative state for active auctions. All live timers, current bid increments, participant sockets, sold player lists, and squad purse deductions reside in server memory for zero-latency synchronization.

---

## Security Architecture

- **Server-Isolated AI Secrets**: `GEMINI_API_KEY` is completely absent from client bundles and Vite `define` configs. It is accessed only within Node.js process environment variables.
- **Cryptographic Socket Handshake Authentication**: `io.use()` middleware extracts the Firebase ID token from `socket.handshake.auth.token` and verifies its signature, expiration, issuer, and audience against Google's public certificates (`fetchGooglePublicCerts()`).
- **Verified Identity (`socket.data.userId`)**: Socket privilege checks (e.g. host start/pause, manager bids, ready state toggles) strictly bind to `socket.data.userId`, rejecting untrusted client payloads.
- **Granular Firestore Rules**: Only authenticated room hosts can modify room metadata, and user document updates require verified ownership.

---

## Project Structure

```
ipl-auction-pro/
â”œâ”€â”€ public/
â”‚   â””â”€â”€ images/               # Stadium backgrounds and format motif banners
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ components/           # UI screens & modular components
â”‚   â”‚   â”œâ”€â”€ AuctionArena.tsx  # Live bidding arena & real-time lot management
â”‚   â”‚   â”œâ”€â”€ AuthGuard.tsx     # Authentication route protection
â”‚   â”‚   â”œâ”€â”€ BudgetBurnGraph.tsx # Recharts budget spending curves
â”‚   â”‚   â”œâ”€â”€ FinishedScreen.tsx# Post-auction podium & AI analytics
â”‚   â”‚   â”œâ”€â”€ Home.tsx          # Broadcast landing page, stats, formats & room actions
â”‚   â”‚   â”œâ”€â”€ Lobby.tsx         # Franchise claiming & participant ready check
â”‚   â”‚   â”œâ”€â”€ Navbar.tsx        # Navigation bar & bespoke brand mark
â”‚   â”‚   â”œâ”€â”€ RetentionArena.tsx# Pre-auction retention interface
â”‚   â”‚   â”œâ”€â”€ RoomManager.tsx   # Socket coordinator & phase dispatcher
â”‚   â”‚   â”œâ”€â”€ SquadPowerAnalysis.tsx # Squad balance breakdown
â”‚   â”‚   â””â”€â”€ TradeArena.tsx    # Peer-to-peer manager trade desk
â”‚   â”œâ”€â”€ data/
â”‚   â”‚   â”œâ”€â”€ players.ts        # 127 cataloged IPL players with career stats
â”‚   â”‚   â”œâ”€â”€ scoutingReports.ts# Pre-generated tactical insights per player
â”‚   â”‚   â””â”€â”€ teams.ts          # 10 official IPL franchises
â”‚   â”œâ”€â”€ hooks/
â”‚   â”‚   â””â”€â”€ useTTS.ts         # Auctioneer text-to-speech engine
â”‚   â”œâ”€â”€ services/
â”‚   â”‚   â”œâ”€â”€ ai.ts             # Client-side API client for AI routes
â”‚   â”‚   â”œâ”€â”€ authServer.ts     # Google cert fetching & Firebase JWT verification
â”‚   â”‚   â””â”€â”€ geminiServer.ts   # Server-side Gemini GenAI client & fallback logic
â”‚   â”œâ”€â”€ utils/
â”‚   â”‚   â””â”€â”€ helpers.ts        # Currency formatting and flag helpers
â”‚   â”œâ”€â”€ App.tsx               # Root route setup & sonner toaster
â”‚   â”œâ”€â”€ firebase.ts           # Client Firebase initialization
â”‚   â”œâ”€â”€ index.css             # Design tokens, stadium backgrounds & custom cursor
â”‚   â”œâ”€â”€ main.tsx              # React DOM entrypoint
â”‚   â””â”€â”€ types.ts              # TypeScript interfaces for rooms, players, trades
â”œâ”€â”€ firestore.rules           # Cloud Firestore security rules
â”œâ”€â”€ server.ts                 # Express API + Socket.IO server + Vite static serving
â”œâ”€â”€ vite.config.ts            # Vite client build pipeline
â”œâ”€â”€ package.json              # Scripts and pinned dependencies
â””â”€â”€ .env.example              # Documented environment variables template
```

---

## Local Development

### Prerequisites
- Node.js 18+ (tested on Node.js 20 & 24)
- npm 9+
- A Google Gemini API key (optional for basic auctions; required for AI summaries)
- A Firebase project with Google Authentication enabled

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/nobody294469/IPL-Auction-Pro-v1.git
   cd IPL-Auction-Pro-v1
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Add your server secrets in `.env`:
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   APP_URL="http://localhost:3000"
   FIREBASE_PROJECT_ID="your-firebase-project-id"
   ```

4. Start the unified development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## Environment Variables

| Variable | Scope | Required | Description |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server-Only | Yes (for AI) | Google Gemini API key for server-side AI evaluation routes. Never exposed to browser. |
| `APP_URL` | Server | Optional | Public application URL. Defaults to `http://localhost:3000`. |
| `FIREBASE_PROJECT_ID` | Server | Optional | Overrides default Firebase project ID for token audience verification. Defaults to configuration in `firebase-applet-config.json`. |

---

## Build & Deployment

IPL Auction Pro is configured for single-service deployment on **Render**:

### Build Pipeline:
```bash
npm run build
```
This triggers:
1. `vite build` â€” Compiles the client React SPA into production static assets under `dist/`.
2. `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs` â€” Bundles the Node.js / Express / Socket.IO server into CommonJS.

### Start Command:
```bash
npm start
```
Runs `node dist/server.cjs`, serving both the real-time WebSocket server, Express `/api/*` endpoints, and static frontend assets under `dist/`.

---

## Verification & Quality Assurance

The codebase includes an automated test suite, static type checking, and production build verification:

```bash
# Execute full automated test suite (51 integration, invariant, and validation tests)
npm test

# Type check all TypeScript files without emitting
npm run lint

# Compile production client (Vite) & server (esbuild) bundles
npm run build

# Remove build artifacts
npm run clean
```

### Continuous Integration (CI)
A GitHub Actions workflow (`.github/workflows/ci.yml`) runs automatically on every push and pull request targeting `main`. It verifies:
- Clean dependency installation (`npm ci`)
- 46-test automated suite execution (`npm test`)
- TypeScript compilation and lint checks (`npm run lint`)
- Full production bundle compilation (`npm run build`)

---

## Known Architecture Characteristics & Limitations

- **In-Memory Live Auction Sessions**: Active room state (current lot, live bid history, participant socket connections) is managed in server memory to achieve low latency. As a result, active auction rooms do not survive a server process restart.
- **Single-Node Scalability**: Because room state is held in memory, horizontal scaling across multiple instances requires introducing a Redis adapter for Socket.IO and a persistent shared state store (planned for future major releases).
- **Stateless Room Restoration**: If a user refreshes during an auction, their client reconnects and syncs from the server's in-memory room state seamlessly. However, if the Node server restarts mid-auction, players must create a new room from the lobby.

---

## Author & License

- **Developer**: Sammyag Solanki
- **Project**: IPL Auction Pro V2

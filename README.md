<div align="center">
  <h1>🏏 IPL Auction Pro</h1>
  <p>A feature-rich, real-time multiplayer IPL Auction simulator built with React, Node.js, and Socket.io.</p>
</div>

---

## 🚀 Live Demo

**Experience the auction live:** [https://ipl-auction-pro-v1.onrender.com](https://ipl-auction-pro-v1.onrender.com)

---

## ✨ Features

- **Real-Time Bidding Engine:** Sub-second latency for placing and broadcasting bids across all connected clients.
- **Curated Player Database:** Features a carefully selected pool of **127 players**, complete with base prices, roles, and stats.
- **Team Management:** Track team purses, squad composition, and remaining slots dynamically.
- **Responsive UI:** A modern, mobile-friendly interface built with Tailwind CSS and Framer Motion.
- **Admin Dashboard:** Control the flow of the auction, manage timers, and resolve disputes.

---

## 🎲 Auction Modes

Bring different strategic flavors to your auction with multiple game modes:

- **Open Auction:** The classic format. Players are brought up one by one, and franchises engage in an open bidding war until the timer runs out.
- **Blind Auction:** Franchises submit sealed bids for a player. The highest bidder wins without knowing what others have offered.
- **Mega Auction:** Emulates the official mega auction rules with larger purses, right-to-match (RTM) cards, and strict squad constraints.
- **Draft Mode:** A turn-based selection system where franchises pick players in a snake-draft format without a bidding process.

---

## 🤖 AI Features

- **Scouting Reports:** Every player comes with a detailed, **pre-generated scouting report**, giving managers insights into strengths, weaknesses, and recent form.
- **Post-Auction Analysis:** (Where applicable) Uses **Gemini AI** to evaluate team performance, squad balance, and value-for-money buys at the end of the auction.

---

## 🛠️ Tech Stack

**Frontend:**
- React 19 + TypeScript (Vite)
- Tailwind CSS v4 for styling
- Framer Motion for animations
- Recharts for data visualization
- Lucide React for iconography

**Backend & Real-time:**
- Node.js & Express
- Socket.io for real-time bi-directional communication
- Firebase (Auth/Firestore/Realtime Database)

**AI Integration:**
- Google Gemini API (`@google/genai`)

---

## 🏗️ Architecture Overview

The application utilizes a client-server architecture tailored for real-time state synchronization:
1. **Clients (React):** Establish WebSocket connections to the server upon joining a room. They emit bidding actions and render state updates.
2. **Server (Express + Socket.io):** Acts as the single source of truth during the active auction. It validates bids, manages countdown timers, and broadcasts state changes to all clients in a room.
3. **Database (Firebase):** Persists user profiles, long-term auction results, and pre-generated player data (scouting reports, base stats).

---

## 💻 Installation

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/ipl-auction-pro.git
   cd ipl-auction-pro
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   # Starts both Vite frontend and local Node server
   npm run dev
   ```

---

## 🔑 Environment Variables

Create a `.env` file in the root directory and add the following variables:

```env
# Server
VITE_API_URL=http://localhost:3000

# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Gemini AI (for post-auction analysis)
GEMINI_API_KEY=your_gemini_api_key
```

---

## 📁 Project Structure

```text
ipl-auction-pro/
├── src/
│   ├── components/    # Reusable React components (UI, Modals, Cards)
│   ├── data/          # Static assets and pre-generated player lists (127 players)
│   ├── hooks/         # Custom React hooks (e.g., useSocket, useAuctionState)
│   ├── services/      # API clients and Firebase configuration
│   ├── utils/         # Helper functions (currency formatting, logic)
│   ├── App.tsx        # Main application routing and context providers
│   └── main.tsx       # Entry point
├── server.ts          # Express & Socket.io backend implementation
├── firebase.json      # Firebase rules and hosting config
└── package.json       # Project metadata and dependencies
```

---

## 📸 Screenshots

*(Replace the placeholder URLs with actual screenshots once deployed)*

| Auction Dashboard | Player Scouting Report |
| :---: | :---: |
| ![Dashboard](https://placehold.co/600x400/1e293b/ffffff?text=Auction+Dashboard+Here) | ![Scouting](https://placehold.co/600x400/1e293b/ffffff?text=Scouting+Report+Here) |

| Live Bidding | Post-Auction Analysis |
| :---: | :---: |
| ![Bidding](https://placehold.co/600x400/1e293b/ffffff?text=Live+Bidding+UI+Here) | ![Analysis](https://placehold.co/600x400/1e293b/ffffff?text=AI+Analysis+Here) |

---

## 🚀 Deployment

The project is configured for easy deployment on platforms like Render, Heroku, or Vercel.

**For Render (Combined Frontend/Backend):**
1. Set the Build Command to `npm run build`
2. Set the Start Command to `npm start`
3. Ensure all environment variables from `.env` are added to the Render dashboard.

---

## 🔮 Future Improvements

- Implementation of a player retention system.
- Historical auction data and statistics tracker.
- Integration with live cricket APIs for dynamically updating player base prices based on recent real-world performance.
- Support for custom, user-created player pools.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

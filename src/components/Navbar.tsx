import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  auth,
  googleProvider
} from '../firebase';
import {
  signInWithPopup,
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { Gavel, LogOut } from 'lucide-react';

export const Navbar = ({ user }: { user: FirebaseUser | null }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide Navbar in room phases for full-screen focus
  if (location.pathname.includes('/room/')) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 h-16 bg-zinc-950/85 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-4 sm:px-8 z-50 transition-colors">
      <div
        className="flex items-center gap-3 cursor-pointer select-none group"
        onClick={() => navigate('/')}
      >
        {/* Custom Cricket Auction Pro Brand Mark */}
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent border border-amber-500/30 flex items-center justify-center shadow-[0_0_15px_-3px_rgba(245,158,11,0.25)] group-hover:border-amber-400/50 group-hover:shadow-[0_0_20px_-2px_rgba(245,158,11,0.4)] transition-all">
          <svg viewBox="0 0 24 24" className="w-5 h-5 drop-shadow" fill="none">
            {/* Wooden gavel head tilted diagonally */}
            <path d="M14.5 4.5L19.5 9.5L17.5 11.5L12.5 6.5L14.5 4.5Z" fill="url(#gavel-wood)" stroke="#fbbf24" strokeWidth="1" strokeLinejoin="round" />
            {/* Gavel handle extending towards bottom-left */}
            <path d="M13.5 10.5L6.5 17.5C5.8 18.2 4.8 18.2 4.1 17.5C3.4 16.8 3.4 15.8 4.1 15.1L11.1 8.1" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" />
            {/* Sound block beneath gavel */}
            <path d="M15 17.5L20.5 17.5" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M13 20L22 20" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
            {/* Cricket ball accent badge on upper right */}
            <circle cx="7" cy="6.5" r="2.5" fill="#dc2626" stroke="#991b1b" strokeWidth="0.8" />
            <path d="M5.5 7.5C6.5 6.5 7.5 5.5 8.5 5.5" stroke="#ffffff" strokeWidth="0.6" strokeLinecap="round" opacity="0.9" />
            <defs>
              <linearGradient id="gavel-wood" x1="12" y1="4" x2="19" y2="11" gradientUnits="userSpaceOnUse">
                <stop stopColor="#f59e0b" />
                <stop offset="1" stopColor="#b45309" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display font-semibold text-lg text-white tracking-tight">IPL Auction</span>
          <span className="font-display font-bold text-lg text-orange-500 tracking-tight">Pro</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-medium text-zinc-200 leading-tight">{user.displayName}</span>
              <span className="text-xs text-zinc-400">Online</span>
            </div>
            <img
              src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`}
              className="w-8 h-8 rounded-lg border border-zinc-800 object-cover"
              alt="Avatar"
              referrerPolicy="no-referrer"
            />
            <button
              onClick={() => signOut(auth)}
              className="p-1.5 hover:bg-zinc-900 rounded-lg transition-colors text-zinc-400 hover:text-zinc-200 cursor-pointer"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="bg-white hover:bg-zinc-100 text-zinc-950 font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer text-xs sm:text-sm"
          >
            Sign in
          </button>
        )}
      </div>
    </nav>
  );
};

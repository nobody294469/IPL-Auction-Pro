import React, { useState } from 'react';
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
import { Trophy, LogOut } from 'lucide-react';

export const Navbar = ({ user }: { user: FirebaseUser | null }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide Navbar in the Arena or Retention phases for full-screen immersion
  if (location.pathname.includes('/room/')) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 h-20 bg-zinc-950/70 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-4 sm:px-8 z-50 transition-all duration-300">
      <div 
        className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none" 
        onClick={() => navigate('/')}
      >
        <div className="p-1.5 sm:p-2 bg-orange-500 rounded-xl group-hover:rotate-6 group-hover:scale-105 transition-all duration-300 shadow-lg shadow-orange-500/20">
          <Trophy className="text-black w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="flex flex-col">
          <span className="font-black text-lg sm:text-2xl tracking-tighter text-white leading-none">IPL AUCTION</span>
          <span className="text-[8px] sm:text-[10px] font-bold text-orange-500 tracking-[0.25em] sm:tracking-[0.3em] uppercase">Pro Arena</span>
        </div>
      </div>
      
      <div className="flex items-center gap-4 sm:gap-6">
        {user ? (
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-black text-white leading-tight">{user.displayName}</span>
              <div className="flex items-center gap-1 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Active</span>
              </div>
            </div>
            <img 
              src={user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl border border-white/10 shadow-xl object-cover hover:border-orange-500/50 transition-all duration-300"
              alt="Avatar"
              referrerPolicy="no-referrer"
            />
            <button 
              onClick={() => signOut(auth)}
              className="p-2 hover:bg-white/5 rounded-xl transition-all duration-200 text-zinc-500 hover:text-red-400 cursor-pointer active:scale-95"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        ) : (
          <button 
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="bg-white hover:bg-zinc-200 text-black font-black py-2.5 px-4 sm:py-3 sm:px-6 rounded-xl sm:rounded-2xl transition-all duration-200 transform hover:scale-[1.02] active:scale-95 shadow-xl shadow-white/5 cursor-pointer text-xs sm:text-sm"
          >
            Login with Google
          </button>
        )}
      </div>
    </nav>
  );
};

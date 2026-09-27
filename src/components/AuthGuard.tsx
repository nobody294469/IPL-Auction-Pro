import React from 'react';
import { signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Gavel, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';

export const AuthGuard = ({ children, user, loading }: { children: React.ReactNode, user: FirebaseUser | null, loading: boolean }) => {
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 font-medium text-base">
        Connecting to arena...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-zinc-950 p-6 text-center relative overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 max-w-lg mx-auto"
        >
          <div className="w-14 h-14 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-8 text-orange-500 shadow-sm">
            <Gavel size={26} strokeWidth={2} />
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-semibold text-white tracking-tight mb-4">
            IPL Auction Pro
          </h1>
          <p className="text-base text-zinc-400 max-w-md mx-auto mb-10 leading-relaxed font-normal">
            Real-time multiplayer IPL auction simulator and squad management platform.
          </p>
          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="bg-white hover:bg-zinc-100 text-zinc-950 font-medium py-3 px-6 rounded-xl transition-all text-sm shadow-md flex items-center gap-2.5 mx-auto cursor-pointer"
          >
            <UserIcon size={18} />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }
  return <>{children}</>;
};

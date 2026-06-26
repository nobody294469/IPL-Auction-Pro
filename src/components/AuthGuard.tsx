import React from 'react';
import { signInWithPopup, User as FirebaseUser } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { Trophy, User as UserIcon } from 'lucide-react';
import { motion } from 'motion/react';

export const AuthGuard = ({ children, user, loading }: { children: React.ReactNode, user: FirebaseUser | null, loading: boolean }) => {
  if (loading) return <div className="h-screen flex items-center justify-center bg-black text-white font-black text-2xl animate-pulse tracking-tighter uppercase">Initializing Pro Arena...</div>;
  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black p-8 text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-orange-500/10 blur-[200px] rounded-full" />
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10"
        >
          <div className="p-6 bg-orange-500 rounded-[40px] w-fit mx-auto mb-12 shadow-2xl shadow-orange-500/40 transform -rotate-12">
            <Trophy className="text-black w-24 h-24" />
          </div>
          <h1 className="text-9xl font-black text-white tracking-tighter mb-6 leading-[0.8]">IPL AUCTION <br /> <span className="text-orange-500">PRO ARENA</span></h1>
          <p className="text-2xl text-zinc-500 max-w-2xl mx-auto mb-16 font-medium">The world's most advanced real-time IPL auction simulator. Built for champions, powered by real data.</p>
          <button 
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="bg-white hover:bg-zinc-200 text-black font-black py-6 px-16 rounded-[32px] transition-all transform active:scale-95 text-2xl shadow-2xl shadow-white/20 flex items-center gap-4 mx-auto"
          >
            <UserIcon size={28} strokeWidth={3} />
            Enter the Arena
          </button>
        </motion.div>
      </div>
    );
  }
  return <>{children}</>;
};

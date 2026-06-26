import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection } from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Gavel, Trophy, ChevronRight, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../firebase';
import { TEAMS } from '../data/teams';
import { GlassCard } from './GlassCard';

export const Home = ({ user }: { user: FirebaseUser }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [customPurse, setCustomPurse] = useState(120);
  const [customBidTime, setCustomBidTime] = useState(10);
  const [customDraftLimit, setCustomDraftLimit] = useState(15);
  const [createAuctionType, setCreateAuctionType] = useState<'open' | 'blind' | 'draft' | 'mega'>('open');
  const navigate = useNavigate();

  const createRoom = async () => {
    if (!roomName.trim()) {
      toast.error('Please enter an arena name');
      return;
    }
    
    try {
      const docRef = await addDoc(collection(db, 'rooms'), {
        name: roomName,
        hostId: user.uid,
        status: 'lobby',
        purse: customPurse,
        bidTime: customBidTime,
        draftLimit: customDraftLimit,
        auctionType: createAuctionType,
        createdAt: new Date().toISOString()
      });
      navigate(`/room/${docRef.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error('Failed to create arena. Please try again.');
    }
  };

  const joinRoom = () => {
    if (joinCode.trim()) navigate(`/room/${joinCode}`);
  };

  return (
    <div className="relative min-h-screen bg-stadium overflow-hidden">
      {/* Floating Cricket Elements */}
      <motion.div 
        animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-40 left-10 opacity-20 pointer-events-none hidden lg:block"
      >
        <div className="w-24 h-24 bg-orange-500/20 rounded-full blur-xl absolute inset-0" />
        <Gavel size={80} className="text-orange-500" />
      </motion.div>

      <motion.div 
        animate={{ y: [0, 20, 0], rotate: [0, -5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-40 right-10 opacity-20 pointer-events-none hidden lg:block"
      >
        <div className="w-24 h-24 bg-blue-500/20 rounded-full blur-xl absolute inset-0" />
        <Trophy size={80} className="text-blue-500" />
      </motion.div>

      <div className="pt-24 pb-24 md:pt-32 px-6 md:px-12 lg:px-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center relative z-10">
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-8 text-left"
        >
          <div className="space-y-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-orange-500/10 text-orange-500 rounded-full text-xs font-black uppercase tracking-[0.2em] border border-orange-500/20"
            >
              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              Season 2026 Live Arena
            </motion.div>
            <h1 className="text-5xl md:text-6xl lg:text-8xl font-black text-white tracking-tighter leading-[0.95] md:leading-[0.85]">
              DOMINATE THE <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 via-yellow-500 to-orange-500 animate-gradient-x text-glow">AUCTION ARENA</span>
            </h1>
            <p className="text-lg md:text-xl text-zinc-400 max-w-lg leading-relaxed">
              Step into the high-stakes world of IPL bidding. Real-time competition, tactical drafting, and the ultimate squad building experience.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <button 
              onClick={() => setIsCreating(true)}
              className="bg-orange-500 hover:bg-orange-400 text-black font-black py-4 px-8 md:py-5 md:px-10 rounded-3xl transition-all duration-300 transform hover:scale-[1.03] active:scale-95 text-lg md:text-xl flex items-center gap-3 shadow-2xl shadow-orange-500/20 group cursor-pointer"
            >
              <Plus size={24} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-300" />
              Launch Arena
            </button>
            <div className="flex bg-zinc-900/90 backdrop-blur-md border border-white/10 rounded-3xl p-1.5 focus-within:border-orange-500/50 transition-all duration-300 group shadow-lg w-full sm:w-auto">
              <input 
                type="text" 
                placeholder="Arena Code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="bg-transparent px-5 py-3 text-white font-bold focus:outline-none w-full sm:w-40 tracking-wider placeholder:text-zinc-600 placeholder:font-medium"
              />
              <button 
                onClick={joinRoom}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-black px-6 sm:px-8 py-3 sm:py-0 rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                Join <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 md:gap-6 pt-8 border-t border-white/10">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all duration-300">
              <span className="block text-3xl md:text-4xl font-black text-white tracking-tighter">350+</span>
              <span className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-[0.20em]">Elite Players</span>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all duration-300">
              <span className="block text-3xl md:text-4xl font-black text-white tracking-tighter">10</span>
              <span className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-[0.20em]">Franchises</span>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-all duration-300">
              <span className="block text-3xl md:text-4xl font-black text-white tracking-tighter">₹120Cr</span>
              <span className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-[0.20em]">War Chest</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative"
        >
          <div className="absolute inset-0 bg-orange-500/10 blur-[120px] rounded-full animate-pulse-slow pointer-events-none" />
          <GlassCard className="aspect-square relative flex items-center justify-center p-8 border-white/10 bg-black/25 overflow-hidden rounded-[40px] shadow-3xl">
            {/* Tactical Grid Overlay */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            
            <div className="grid grid-cols-2 gap-6 w-full relative z-10">
              {TEAMS.slice(0, 4).map((team, idx) => (
                <motion.div 
                  key={team.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 + 0.3 }}
                  className="aspect-video bg-zinc-900/90 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-center p-6 group hover:border-orange-500/40 hover:bg-zinc-850 hover:shadow-xl hover:shadow-orange-500/5 transition-all duration-300 cursor-default"
                >
                  <img src={team.logo} className="w-full h-full object-contain transition-all duration-300 group-hover:scale-110" alt={team.name} referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.src = `https://api.dicebear.com/7.x/initials/svg?seed=${team.shortName}`)} />
                </motion.div>
              ))}
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div 
                animate={{ scale: [1, 1.05, 1], rotate: [0, 4, -4, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="w-36 h-36 md:w-40 md:h-40 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(249,115,22,0.4)] border-4 border-black/20"
              >
                <Gavel size={60} className="text-black drop-shadow-lg" />
              </motion.div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center z-[100] p-4 sm:p-8 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-zinc-900 border border-white/10 p-6 sm:p-10 md:p-12 rounded-3xl sm:rounded-[40px] w-full max-w-xl shadow-2xl relative"
            >
              <button 
                onClick={() => setIsCreating(false)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all duration-150 cursor-pointer"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>

              <h2 className="text-3xl sm:text-4xl font-black text-white mb-6 sm:mb-8 tracking-tighter text-left">Launch New Arena</h2>
              <div className="space-y-6">
                <div className="text-left">
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-[0.3em] mb-3">Arena Name</label>
                  <input 
                    type="text" 
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Mega Auction 2026"
                    className="w-full bg-black/80 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold text-lg focus:outline-none focus:border-orange-500/80 transition-all duration-200"
                  />
                </div>

                <div className="space-y-3 text-left">
                  <label className="block text-xs font-black text-zinc-500 uppercase tracking-[0.3em]">Auction Type</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['open', 'blind', 'draft', 'mega'] as const).map((type) => (
                      <button 
                        key={type}
                        onClick={() => setCreateAuctionType(type)}
                        className={`py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 cursor-pointer ${createAuctionType === type ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20' : 'bg-zinc-800 text-zinc-500 hover:text-white hover:bg-zinc-750'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {createAuctionType !== 'draft' ? (
                  <div className="grid grid-cols-2 gap-4 sm:gap-6">
                    <div className="text-left">
                      <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-3 text-center">Total Purse (₹ Cr)</label>
                      <div className="flex items-center justify-between bg-black/50 border border-white/10 rounded-2xl p-2">
                        <button 
                          onClick={() => setCustomPurse(prev => Math.max(80, prev - 5))}
                          className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center text-white font-black transition-all duration-150 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-xl font-black text-white w-12 text-center">{customPurse}</span>
                        <button 
                          onClick={() => setCustomPurse(prev => Math.min(200, prev + 5))}
                          className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center text-white font-black transition-all duration-150 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="text-left">
                      <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-3 text-center">Bid Time (Sec)</label>
                      <div className="flex items-center justify-between bg-black/50 border border-white/10 rounded-2xl p-2">
                        <button 
                          onClick={() => setCustomBidTime(prev => Math.max(5, prev - 1))}
                          className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center text-white font-black transition-all duration-150 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-xl font-black text-white w-12 text-center">{customBidTime}</span>
                        <button 
                          onClick={() => setCustomBidTime(prev => Math.min(30, prev + 1))}
                          className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center text-white font-black transition-all duration-150 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-left">
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-3 text-center">Draft Limit (Rounds)</label>
                    <div className="flex items-center justify-between bg-black/50 border border-white/10 rounded-2xl p-2 max-w-[240px] mx-auto">
                      <button 
                        onClick={() => setCustomDraftLimit(prev => Math.max(5, prev - 1))}
                        className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center text-white font-black transition-all duration-150 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="text-xl font-black text-white w-12 text-center">{customDraftLimit}</span>
                      <button 
                        onClick={() => setCustomDraftLimit(prev => Math.min(30, prev + 1))}
                        className="w-10 h-10 rounded-xl bg-zinc-800 hover:bg-zinc-700 hover:text-orange-500 flex items-center justify-center text-white font-black transition-all duration-150 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-6">
                  <button 
                    onClick={() => setIsCreating(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 rounded-2xl transition-all duration-150 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={createRoom}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-black py-4 rounded-2xl transition-all duration-200 shadow-xl shadow-orange-500/10 hover:shadow-orange-500/20 cursor-pointer"
                  >
                    Launch
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

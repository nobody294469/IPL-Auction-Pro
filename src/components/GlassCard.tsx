import React from 'react';

export const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-zinc-900/40 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden ${className}`}>
    {children}
  </div>
);

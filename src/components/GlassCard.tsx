import React from 'react';

export const GlassCard = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-zinc-900/70 border border-zinc-800/80 rounded-2xl overflow-hidden ${className}`}>
    {children}
  </div>
);

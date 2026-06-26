import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { AuctionRoom } from '../types';

export const Chat = ({ room, user, socket }: { room: AuctionRoom, user: any, socket: any }) => {
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<{ userName: string, message: string, timestamp: string, userId: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;
    const handleNewChat = (msg: any) => setChat(prev => [...prev, msg]);
    socket.on('new-chat', handleNewChat);
    return () => {
      socket.off('new-chat', handleNewChat);
    };
  }, [socket]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !socket) return;
    socket.emit('chat-message', { roomId: room.id, userId: user.uid, message, userName: user.displayName });
    setMessage('');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {chat.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.userId === user.uid ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{msg.userName}</span>
            <div className={`px-3 py-2 rounded-2xl text-[13px] max-w-[90%] ${msg.userId === user.uid ? 'bg-orange-500 text-black font-bold shadow-lg shadow-orange-500/20' : 'bg-white/5 text-zinc-300 border border-white/5'}`}>
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={sendMessage} className="p-4 bg-black/40 border-t border-white/5 flex gap-3">
        <input 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-all"
        />
        <button className="p-2.5 bg-orange-500 text-black rounded-xl hover:bg-orange-400 transition-all shadow-lg shadow-orange-500/20">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

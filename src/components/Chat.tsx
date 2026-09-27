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
            <span className="text-[11px] font-medium text-zinc-400 mb-1">{msg.userName}</span>
            <div className={`px-3 py-2 rounded-xl text-sm max-w-[85%] leading-relaxed ${msg.userId === user.uid ? 'bg-orange-500 text-zinc-950 font-medium' : 'bg-zinc-850 text-zinc-200 border border-zinc-800'}`}>
              {msg.message}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={sendMessage} className="p-3 bg-zinc-950 border-t border-zinc-800 flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500/80 transition-colors"
        />
        <button className="p-2 bg-orange-500 hover:bg-orange-400 text-zinc-950 rounded-lg transition-colors cursor-pointer" title="Send">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};

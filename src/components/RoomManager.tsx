import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { db } from '../firebase';
import { AuctionRoom } from '../types';
import { Lobby } from './Lobby';
import { AuctionArena } from './AuctionArena';
import { RetentionArena } from './RetentionArena';
import { TradeArena } from './TradeArena';
import { FinishedScreen } from './FinishedScreen';

export const RoomManager = ({ user }: { user: FirebaseUser }) => {
  const { roomId } = useParams();
  const [room, setRoom] = useState<AuctionRoom | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomId || !user) return;

    let isMounted = true;
    let socket: Socket | null = null;

    const initSocket = async () => {
      try {
        socket = io({
          auth: async (cb) => {
            try {
              const token = await user.getIdToken();
              cb({ token });
            } catch {
              cb({});
            }
          }
        });
        socketRef.current = socket;

        socket.on('connect_error', (err) => {
          console.error('Socket authentication/connection error:', err.message);
          toast.error(err.message || 'Authentication error connecting to arena');
        });

        const roomDoc = await getDoc(doc(db, 'rooms', roomId));
        if (!isMounted) return;

        if (roomDoc.exists()) {
          const roomData = roomDoc.data();

          socket.emit('join-room', {
            roomId,
            user: {
              uid: user.uid,
              displayName: user.displayName || 'Anonymous',
              photoURL: user.photoURL || '',
              budget: roomData.purse || 120.0,
              squad: []
            }
          });

          // If host, sync settings to server
          if (roomData.hostId === user.uid) {
            socket.emit('update-room-settings', {
              roomId,
              userId: user.uid,
              purse: roomData.purse,
              bidTime: roomData.bidTime,
              draftLimit: roomData.draftLimit,
              auctionType: roomData.auctionType
            });
          }
        } else {
          toast.error('Arena not found');
          navigate('/');
        }

        socket.on('room-update', (updatedRoom: AuctionRoom) => {
          if (isMounted) {
            setRoom(updatedRoom);
          }
        });
      } catch (error) {
        console.error('Error syncing room:', error);
        toast.error('Failed to connect to arena');
      }
    };

    initSocket();

    return () => {
      isMounted = false;
      if (socket) {
        socket.disconnect();
      }
    };
  }, [roomId, user, navigate]);

  if (!room) return <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-400 font-medium text-sm animate-pulse font-display">Syncing arena...</div>;

  if (room.status === 'lobby') return <Lobby user={user} room={room} socket={socketRef.current} />;
  if (room.status === 'active' || room.status === 'rtm' || room.status === 'transitioning' || room.status === 'selling') {
    return <AuctionArena user={user} room={room} socket={socketRef.current} />;
  }
  if (room.status === 'retention') {
    return <RetentionArena user={user} room={room} socket={socketRef.current} />;
  }
  if (room.status === 'trade') {
    return <TradeArena user={user} room={room} socket={socketRef.current} />;
  }
  return <FinishedScreen room={room} user={user} socket={socketRef.current} />;
};

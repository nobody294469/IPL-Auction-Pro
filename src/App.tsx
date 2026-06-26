import React, { useState, useEffect } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route 
} from 'react-router-dom';
import { auth } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { Toaster } from 'sonner';

import { Navbar } from './components/Navbar';
import { Home } from './components/Home';
import { RoomManager } from './components/RoomManager';
import { AuthGuard } from './components/AuthGuard';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-black text-zinc-200 selection:bg-orange-500 selection:text-black font-sans">
        <Toaster position="top-center" theme="dark" richColors closeButton />
        <Navbar user={user} />
        <Routes>
          <Route path="/" element={
            <AuthGuard user={user} loading={loading}>
              <Home user={user!} />
            </AuthGuard>
          } />
          <Route path="/room/:roomId" element={
            <AuthGuard user={user} loading={loading}>
              <RoomManager user={user!} />
            </AuthGuard>
          } />
        </Routes>
      </div>
    </Router>
  );
}

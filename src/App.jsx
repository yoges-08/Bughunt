import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import { socket } from './services/socket';
import LoginView from './components/LoginView';
import AdminDashboard from './components/AdminDashboard';
import StudentEditor from './components/StudentEditor';

export default function App() {
  const [user, setUser] = useState(api.getUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function verifySession() {
      if (api.token) {
        try {
          const data = await Promise.race([
            api.getMe(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Session verification timeout')), 2500))
          ]);
          if (isMounted && data?.user) {
            setUser(data.user);
            socket.connect();
          }
        } catch (err) {
          console.warn('Session verification failed or timed out:', err.message);
          api.clearSession();
          if (isMounted) setUser(null);
        }
      }
      if (isMounted) setLoading(false);
    }

    verifySession();

    // Absolute failsafe: loading screen must never block for more than 2.5 seconds
    const failsafeTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 2500);

    return () => {
      isMounted = false;
      clearTimeout(failsafeTimer);
    };
  }, []);

  const handleLoginSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    socket.connect();
  };

  const handleLogout = () => {
    try {
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } catch {}
    api.clearSession();
    socket.disconnect();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center text-emerald-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-mono text-slate-400">Loading Bug Hunt...</span>
        </div>
      </div>
    );
  }

  // Not logged in -> Render single login screen
  if (!user) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // Role-Based Interface Routing
  if (user.role === 'admin') {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }

  return <StudentEditor user={user} onLogout={handleLogout} />;
}

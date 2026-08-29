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
    async function verifySession() {
      if (api.token) {
        try {
          const data = await api.getMe();
          setUser(data.user);
          socket.connect();
        } catch {
          api.clearSession();
          setUser(null);
        }
      }
      setLoading(false);
    }
    verifySession();
  }, []);

  const handleLoginSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    socket.connect();
  };

  const handleLogout = () => {
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

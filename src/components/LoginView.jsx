import React, { useState, useEffect, useRef } from 'react';
import { Bug, ArrowRight, CheckCircle2, AlertCircle, Server, Lock, User } from 'lucide-react';
import { api } from '../services/api';

export default function LoginView({ onLoginSuccess }) {
  const [hostIp, setHostIp] = useState(api.getHostUrl().replace(/^https?:\/\//, ''));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverOnline, setServerOnline] = useState(null);
  const [error, setError] = useState('');

  const usernameInputRef = useRef(null);

  // Check server connection
  const checkConnection = async (targetUrl) => {
    try {
      const url = targetUrl || api.getHostUrl();
      const res = await fetch(`${url}/api/system/info`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        setServerOnline(true);
        setError('');
      } else {
        setServerOnline(false);
      }
    } catch {
      setServerOnline(false);
    }
  };

  useEffect(() => {
    checkConnection();

    // Programmatically focus the username input on mount/remount
    const focusTimer = setTimeout(() => {
      if (usernameInputRef.current) {
        usernameInputRef.current.focus();
      }
    }, 50);

    return () => clearTimeout(focusTimer);
  }, []);

  const handleHostIpChange = (e) => {
    const val = e.target.value;
    setHostIp(val);
    api.setHostUrl(val);
    checkConnection(`http://${val}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      api.setHostUrl(hostIp);
      const data = await api.login(username, password);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Login failed. Check username, password, or server connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-surface-950 p-6 relative overflow-hidden">
      {/* Background ambient gradient glow */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-md bg-surface-900 border border-slate-800 rounded-2xl shadow-2xl p-8 z-10 backdrop-blur">
        {/* Header / Logo */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Bug className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">BUG HUNT</h1>
            <p className="text-xs text-slate-400 font-medium">LAN Coding Contest Platform</p>
          </div>
        </div>

        {/* Server IP Connection */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              <span>Server Address (LAN IP)</span>
            </label>
            <div className="flex items-center gap-1.5 text-xs">
              {serverOnline === true && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Online
                </span>
              )}
              {serverOnline === false && (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <AlertCircle className="w-3.5 h-3.5" /> Unreachable
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={hostIp}
              onChange={handleHostIpChange}
              placeholder="e.g. 192.168.1.50:4000"
              className="flex-1 bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 transition cursor-text select-text"
            />
            <button
              type="button"
              onClick={() => checkConnection(`http://${hostIp}`)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition active:scale-[0.99]"
            >
              Test
            </button>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Username / Student Name / Team Name</span>
            </label>
            <input
              ref={usernameInputRef}
              type="text"
              required
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username, name, or team name"
              className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition cursor-text select-text"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>Password</span>
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition cursor-text select-text"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition active:scale-[0.99]"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Enter Bug Hunt</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, Server, Laptop, Bug, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

export default function LoginView({ onLoginSuccess }) {
  const [mode, setMode] = useState('host'); // 'host' or 'client'
  const [hostIp, setHostIp] = useState(api.getHostUrl().replace(/^http:\/\//, ''));
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [serverOnline, setServerOnline] = useState(null);
  const [error, setError] = useState('');

  // Check server connection whenever hostIp or mode changes
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
  }, []);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    if (newMode === 'host') {
      const defaultHost = window.location.port === '3000' ? 'http://localhost:4000' : window.location.origin;
      api.setHostUrl(defaultHost);
      setHostIp(defaultHost.replace(/^http:\/\//, ''));
      checkConnection(defaultHost);
    }
  };

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

  const setCredentials = (u, p, role = 'student') => {
    setUsername(u);
    setPassword(p);
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

        {/* Mode Selector: Host (Admin Server) vs Client (Student/LAN) */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
            Application Mode
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-surface-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleModeChange('host')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition ${
                mode === 'host'
                  ? 'bg-slate-800 text-emerald-400 shadow border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span>Host (Admin PC)</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('client')}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition ${
                mode === 'client'
                  ? 'bg-slate-800 text-emerald-400 shadow border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>Client (Student PC)</span>
            </button>
          </div>
        </div>

        {/* Server IP Input (when in Client mode or custom host) */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Server Address (LAN IP)
            </label>
            <div className="flex items-center gap-1.5 text-xs">
              {serverOnline === true && (
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Online
                </span>
              )}
              {serverOnline === false && (
                <span className="flex items-center gap-1 text-rose-400">
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
              className="flex-1 bg-surface-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-emerald-500 transition"
            />
            <button
              type="button"
              onClick={() => checkConnection(`http://${hostIp}`)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
            >
              Test
            </button>
          </div>
          {mode === 'client' && (
            <p className="text-[11px] text-slate-500 mt-1">
              Enter the Host IP shown on the Admin's computer.
            </p>
          )}
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-surface-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition"
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
            className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition"
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

        {/* Quick Demo Credentials */}
        <div className="mt-6 pt-6 border-t border-slate-800">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2.5 text-center">
            Quick Login Presets (Pre-Seeded Accounts)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCredentials('admin', 'admin123', 'admin')}
              className="p-2 bg-surface-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-200">Admin</div>
                <div className="text-[10px] text-slate-500 font-mono">admin123</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCredentials('student1', 'pass1', 'student')}
              className="p-2 bg-surface-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-200">Alice (Team A)</div>
                <div className="text-[10px] text-slate-500 font-mono">student1 / pass1</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCredentials('student2', 'pass2', 'student')}
              className="p-2 bg-surface-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-200">Bob (Team B)</div>
                <div className="text-[10px] text-slate-500 font-mono">student2 / pass2</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setCredentials('student3', 'pass3', 'student')}
              className="p-2 bg-surface-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-left transition flex items-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-blue-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-200">Charlie (Team C)</div>
                <div className="text-[10px] text-slate-500 font-mono">student3 / pass3</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

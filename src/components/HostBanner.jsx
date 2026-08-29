import React, { useState, useEffect } from 'react';
import { Network, Copy, Check, Radio } from 'lucide-react';
import { api } from '../services/api';

export default function HostBanner({ isHost = false }) {
  const [lanInfo, setLanInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchInfo() {
      try {
        const info = await api.getSystemInfo();
        setLanInfo(info);
      } catch (err) {
        // May fail if not connected to server yet
      }
    }
    fetchInfo();
  }, []);

  const copyIp = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const primaryIp = lanInfo?.lanAddresses?.[0]?.address || 'localhost';
  const port = lanInfo?.port || 4000;
  const fullUrl = `http://${primaryIp}:${port}`;

  return (
    <div className="bg-surface-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between text-xs text-slate-300">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
          <Radio className="w-3 h-3 animate-pulse text-emerald-400" />
          <span>LAN CONTEST LIVE</span>
        </div>
        
        <div className="flex items-center gap-1.5 text-slate-400">
          <Network className="w-3.5 h-3.5 text-slate-400" />
          <span>Server Address:</span>
          <span className="font-mono text-emerald-300 bg-surface-950 px-2 py-0.5 rounded border border-slate-800 font-semibold">
            {fullUrl}
          </span>
          <button
            onClick={() => copyIp(fullUrl)}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition"
            title="Copy server address"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-slate-400">
        <span>Share this IP with student computers to join over LAN</span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-400 font-medium">Port: {port}</span>
      </div>
    </div>
  );
}

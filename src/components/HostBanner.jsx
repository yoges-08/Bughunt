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
    <div className="bg-surface-900 border-b border-slate-800 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
      {/* Left group: Status Badge + Server Address Box */}
      <div className="flex items-center gap-6">
        {/* LAN Contest Live Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold tracking-wide">
          <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
          <span>LAN CONTEST LIVE</span>
        </div>
        
        {/* Server Address Box */}
        <div className="flex items-center gap-2 text-slate-400">
          <Network className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-300">Server Address:</span>
          <div className="inline-flex items-center gap-2 font-mono text-emerald-300 bg-surface-950 px-3 py-1 rounded-lg border border-slate-800 font-semibold shadow-inner">
            <span>{fullUrl}</span>
            <button
              onClick={() => copyIp(fullUrl)}
              className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-emerald-300 transition"
              title="Copy server address"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Right group: Helper text & Port */}
      <div className="flex items-center gap-4 text-slate-400">
        <span className="text-slate-400">Share this IP with student computers to join over LAN</span>
        <span className="w-1 h-1 rounded-full bg-slate-700" />
        <span className="font-mono text-slate-300 font-medium">Port {port}</span>
      </div>
    </div>
  );
}

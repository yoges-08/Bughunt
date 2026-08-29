/**
 * Central Server Entry Point for Bug Hunt
 * 
 * Runs in Host Mode on the Admin machine, hosting:
 * - REST APIs for Authentication, Problem Management, Execution, and Submissions
 * - WebSocket Server for real-time LAN file push and status streaming
 * - Local SQLite/JSON Database
 */

import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import { socketManager } from './socket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const app = express();
const server = http.createServer(app);

// CORS for LAN access
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// Helper to discover local LAN IP addresses
export function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
}

// System info endpoint (to display host LAN IP to clients)
app.get('/api/system/info', (req, res) => {
  res.json({
    status: 'online',
    appName: 'Bug Hunt LAN Contest Server',
    lanAddresses: getLocalIpAddresses(),
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Mount modular API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);

// Serve static frontend assets if built
const distPath = path.resolve(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Initialize WebSocket server
socketManager.init(server);

// Start listening on all network interfaces (0.0.0.0)
export function startServer(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      const ips = getLocalIpAddresses();
      console.log('====================================================');
      console.log('🚀 BUG HUNT: LAN CODING CONTEST SERVER RUNNING');
      console.log('====================================================');
      console.log(`📡 Local Port: ${port}`);
      if (ips.length > 0) {
        console.log('🌐 Connect other computers on LAN to:');
        ips.forEach(ip => console.log(`   👉 http://${ip.address}:${port} (${ip.name})`));
      } else {
        console.log(`   👉 http://localhost:${port}`);
      }
      console.log('====================================================\n');
      resolve({ server, port, ips });
    });
  });
}

// Run directly if called from command line
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}

export { app, server };

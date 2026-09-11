/**
 * Central Server Entry Point for Bug Hunt
 * 
 * Runs in Host Mode on the Admin machine, hosting:
 * - REST APIs for Authentication, Problem Management, Execution, and Submissions
 * - WebSocket Server for real-time LAN file push and status streaming
 * - Local SQLite/JSON Database
 */

import 'dotenv/config';
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
import { checkAllCompilers } from './compiler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const app = express();
const server = http.createServer(app);

// Configurable CORS for isolated LAN contest or restricted production environments
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : '*';

app.use(cors({
  origin: allowedOrigins,
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

let compilerStatusCache = null;
let compilerStatusCacheTime = 0;
const COMPILER_CACHE_TTL_MS = 30000; // 30-second TTL to refresh live compiler availability

// System info endpoint (to display host LAN IP and compiler status to clients)
app.get('/api/system/info', async (req, res) => {
  const now = Date.now();
  if (!compilerStatusCache || (now - compilerStatusCacheTime > COMPILER_CACHE_TTL_MS)) {
    try {
      compilerStatusCache = await checkAllCompilers();
      compilerStatusCacheTime = now;
    } catch {}
  }
  res.json({
    status: 'online',
    appName: 'Bug Hunt LAN Contest Server',
    lanAddresses: getLocalIpAddresses(),
    compilers: compilerStatusCache,
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

// Start listening on all network interfaces (0.0.0.0) with graceful EADDRINUSE handling
export function startServer(port = PORT) {
  return new Promise((resolve) => {
    // Handle error if port is already occupied
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`ℹ️  Port ${port} is already active. Using existing server instance.`);
        resolve({ server, port, ips: getLocalIpAddresses(), alreadyRunning: true });
      } else {
        console.error('Server error:', err);
        resolve({ server, port, error: err });
      }
    });

    server.listen(port, '0.0.0.0', async () => {
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

      // Startup compiler availability check
      try {
        const compStatus = await checkAllCompilers();
        compilerStatusCache = compStatus;
        console.log('\n🛠️  Compiler Toolchain Status:');
        console.log(`   • C (GCC/TCC): ${compStatus.c.available ? `✅ Available (${compStatus.c.version || compStatus.c.path})` : `❌ Missing (${compStatus.c.error || 'not found'})`}`);
        console.log(`   • C++ (G++):   ${compStatus.cpp.available ? `✅ Available (${compStatus.cpp.version || compStatus.cpp.path})` : `❌ Missing (${compStatus.cpp.error || 'not found'})`}`);
        console.log(`   • Python:      ${compStatus.python.available ? `✅ Available (${compStatus.python.version || compStatus.python.path})` : `❌ Missing (${compStatus.python.error || 'not found'})`}`);
      } catch (e) {
        console.warn('   ⚠️ Compiler status check failed:', e.message);
      }

      console.log('====================================================\n');
      resolve({ server, port, ips, alreadyRunning: false });
    });
  });
}

// Run directly if called from command line
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}

export { app, server };

import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { startServer, server } from '../server/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;

function getConfigPath() {
  try {
    return path.join(app.getPath('userData'), 'client-config.json');
  } catch {
    return path.join(__dirname, 'client-config.json');
  }
}

function getSavedHost() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return data.host || '';
    }
  } catch (err) {
    console.warn('Could not read client-config:', err.message);
  }
  return '';
}

function saveHost(host) {
  try {
    const p = getConfigPath();
    fs.writeFileSync(p, JSON.stringify({ host, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not save client-config:', err.message);
  }
}

function normalizeHostUrl(raw) {
  if (!raw) return '';
  let clean = raw.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = `http://${clean}`;
  }
  // If no port specified (and not a standard hostname with port), append :4000
  const urlObj = new URL(clean);
  if (!urlObj.port) {
    urlObj.port = '4000';
  }
  return urlObj.toString().replace(/\/$/, '');
}

async function createWindow() {
  const isClientOnly = process.argv.includes('--client') || process.env.BUGHUNT_MODE === 'client';

  // Check for --host=192.168.x.x CLI arg
  const hostArg = process.argv.find(arg => arg.startsWith('--host='));
  const cliHost = hostArg ? hostArg.split('=')[1] : null;

  // Start embedded backend LAN server on port 4000 only in host mode
  if (!isClientOnly) {
    try {
      await startServer(4000);
    } catch (err) {
      console.log('Server initialization note:', err.message);
    }
  }

  // Create native desktop application window
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0b0f17',
    title: 'Bug Hunt — LAN Coding Contest Platform',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false // DevTools disabled so students cannot inspect network traffic
    }
  });

  // Remove default window menu bar
  Menu.setApplicationMenu(null);

  // Prevent opening DevTools
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  // Block shortcut keys for DevTools (F12, Ctrl+Shift+I, Ctrl+U) and allow Ctrl+H for host connection in client mode
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const key = (input.key || '').toLowerCase();
    const isF12 = input.key === 'F12';
    const isDevToolsCombo = (input.control || input.meta) && input.shift && key === 'i';
    const isViewSourceCombo = (input.control || input.meta) && !input.shift && !input.alt && key === 'u';

    if (isF12 || isDevToolsCombo || isViewSourceCombo) {
      event.preventDefault();
      return;
    }

    // Ctrl+H shortcut: switch host server (client mode)
    if (isClientOnly && (input.control || input.meta) && key === 'h') {
      event.preventDefault();
      loadConnectScreen();
    }
  });

  const loadConnectScreen = (errorMessage = '', prefillIp = '') => {
    const connectFile = path.join(__dirname, 'connect.html');
    const query = new URLSearchParams();
    if (errorMessage) query.set('error', errorMessage);
    if (prefillIp) query.set('ip', prefillIp);
    mainWindow.loadFile(connectFile, { search: query.toString() });
  };

  const loadTargetUrl = (targetUrl, originalInput) => {
    mainWindow.loadURL(targetUrl).catch((err) => {
      console.warn(`Failed to connect to ${targetUrl}:`, err.message);
      if (isClientOnly) {
        loadConnectScreen(`Could not connect to host at ${targetUrl}. Please verify the host IP and ensure the Bug Hunt server is running.`, originalInput);
      } else {
        // Host mode fallback: load static built file if HTTP request fails
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(() => {
          setTimeout(() => loadTargetUrl('http://localhost:4000', 'localhost'), 500);
        });
      }
    });
  };

  // IPC communication for client connect screen
  ipcMain.on('bughunt:connect', (_event, hostInput) => {
    if (!hostInput || !hostInput.trim()) return;
    const normalized = normalizeHostUrl(hostInput);
    saveHost(hostInput.trim());
    loadTargetUrl(normalized, hostInput.trim());
  });

  ipcMain.handle('bughunt:get-saved-host', () => {
    return cliHost || getSavedHost();
  });

  // App launch navigation
  if (isClientOnly) {
    const targetHost = cliHost || getSavedHost();
    if (targetHost) {
      loadTargetUrl(normalizeHostUrl(targetHost), targetHost);
    } else {
      loadConnectScreen();
    }
  } else {
    loadTargetUrl('http://localhost:4000', 'localhost:4000');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Cleanly close server on exit
  try {
    if (server && server.close) {
      server.close();
    }
  } catch {}
  
  if (process.platform !== 'darwin') app.quit();
});

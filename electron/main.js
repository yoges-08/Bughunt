import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from '../server/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;

async function createWindow() {
  // Start embedded LAN server
  try {
    await startServer(4000);
  } catch (err) {
    console.log('Server already running or started on port 4000');
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 650,
    backgroundColor: '#0b0f17',
    title: 'Bug Hunt — LAN Coding Contest',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // If in dev environment, load Vite dev server; otherwise load static build
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      // If vite not ready yet, load localhost:4000
      mainWindow.loadURL('http://localhost:4000');
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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
  if (process.platform !== 'darwin') app.quit();
});

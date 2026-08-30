import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer, server } from '../server/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;

async function createWindow() {
  // Start embedded backend LAN server on port 4000
  try {
    await startServer(4000);
  } catch (err) {
    console.log('Server initialization note:', err.message);
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

  // Block shortcut keys for DevTools and inspect (F12, Ctrl+Shift+I, Ctrl+U)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      (input.control && input.key.toLowerCase() === 'u')
    ) {
      event.preventDefault();
    }
  });

  // Load the desktop application from the embedded server
  const loadApp = () => {
    mainWindow.loadURL('http://localhost:4000').catch(() => {
      // Fallback: load static built file if HTTP request fails
      mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html')).catch(() => {
        // Retry loading after 500ms
        setTimeout(loadApp, 500);
      });
    });
  };

  loadApp();

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

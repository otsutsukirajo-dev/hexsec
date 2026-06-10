'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  PointagePro — Processus Principal Electron (electron.js)
//  Version : 2.0.1 — Correction SyntaxError
// ═══════════════════════════════════════════════════════════════════════════

const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const IS_DEV = !app.isPackaged;

function resolveHtmlPath() {
  const candidates = [
    path.join(__dirname, 'index.html'),
    path.join(app.getAppPath(), 'index.html'),
    path.join(process.resourcesPath || __dirname, 'app', 'index.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function createWindow() {
  const ses = session.defaultSession;

  // CORRECTION ICI : Suppression du "r" parasite qui faisait planter le moteur
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const ALLOWED = ['media', 'mediaKeySystem', 'geolocation', 'notifications', 'fullscreen', 'pointerLock'];
    const granted = ALLOWED.includes(permission);
    callback(granted);
  });

  ses.setDevicePermissionHandler((_details) => true);

  ses.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: file:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
          "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; " +
          "img-src 'self' data: blob:; " +
          "media-src 'self' blob: mediastream:; " +
          "connect-src 'self' blob: data:;"
        ],
      },
    });
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'PointagePro',
    autoHideMenuBar: true,
    frame: true,
    show: true, // Affichage immédiat pour voir la console
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
      serviceWorkers: true,
    },
  });

  const htmlPath = resolveHtmlPath();
  if (!htmlPath) {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<h1>index.html introuvable</h1>')}`);
  } else {
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const experimentRoot = path.resolve(__dirname, '..', '..');
const logDirectory = path.join(experimentRoot, 'logs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDirectory, `startup-test-a-${timestamp}.jsonl`);

function scrub(value) {
  let text = String(value);
  const localPaths = [process.env.USERPROFILE, process.cwd(), experimentRoot]
    .filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
  for (const localPath of localPaths) {
    text = text.split(localPath).join('<LOCAL_PATH>');
  }
  return text;
}

function log(event, details = {}) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  });

  try {
    console.log(line);
  } catch {
    // Console failure must not stop application shutdown.
  }

  try {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(logFile, `${line}\n`, 'utf8');
  } catch (error) {
    try {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'diagnostic-file-log-failed',
        message: scrub(error?.message ?? error),
      }));
    } catch {
      // Logging is best-effort and must not block startup or close.
    }
  }
}

log('main-process-started', {
  electronVersion: process.versions.electron ?? null,
  nodeVersion: process.versions.node ?? null,
});

let electron;
try {
  log('electron-module-load-started');
  electron = require('electron');
  log('electron-module-loaded');
} catch (error) {
  log('electron-module-load-failed', {
    name: error?.name ?? 'Error',
    message: scrub(error?.message ?? error),
  });
  process.exitCode = 1;
  process.exit();
}

const { app, BrowserWindow, ipcMain } = electron;
let window = null;

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Electron startup diagnostic — Test A</title>
  <style>
    body { font: 16px Segoe UI, sans-serif; margin: 24px; color: #172033; }
    button { font: inherit; padding: 8px 14px; }
  </style>
</head>
<body>
  <h1>Electron startup test — OK</h1>
  <p>Test A: Electron only. No Koffi, Win32 API, or AppBar operation.</p>
  <button id="close" type="button">Close test window</button>
  <script>document.getElementById('close').addEventListener('click', () => window.startupDiagnostic.close());</script>
</body>
</html>`;

function createWindow() {
  try {
    window = new BrowserWindow({
      width: 480,
      height: 260,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.cjs'),
      },
    });
    log('browser-window-created');

    window.on('show', () => log('browser-window-shown'));
    window.on('close', () => log('browser-window-close-requested'));
    window.on('closed', () => {
      log('browser-window-closed');
      window = null;
    });
    window.webContents.on('did-finish-load', () => log('page-load-finished'));
    window.webContents.on('did-fail-load', (_event, code, description) => {
      log('page-load-failed', { code, description: scrub(description) });
    });
    window.webContents.on('render-process-gone', (_event, details) => {
      log('render-process-gone', { reason: details.reason, exitCode: details.exitCode });
    });
    window.once('ready-to-show', () => {
      log('browser-window-ready-to-show');
      window.show();
    });

    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .catch((error) => log('page-load-rejected', {
        name: error?.name ?? 'Error',
        message: scrub(error?.message ?? error),
      }));
  } catch (error) {
    log('browser-window-creation-failed', {
      name: error?.name ?? 'Error',
      message: scrub(error?.message ?? error),
    });
    process.exitCode = 1;
    app.quit();
  }
}

ipcMain.handle('startup-diagnostic:close', () => {
  log('close-button-requested');
  if (window && !window.isDestroyed()) window.close();
  return true;
});

app.on('before-quit', () => log('app-before-quit'));
app.on('will-quit', () => log('app-will-quit'));
app.on('window-all-closed', () => {
  log('all-windows-closed');
  app.quit();
});
process.on('exit', (code) => log('process-exit', { exitCode: code }));

app.whenReady()
  .then(() => {
    log('electron-ready');
    createWindow();
  })
  .catch((error) => {
    log('electron-ready-failed', {
      name: error?.name ?? 'Error',
      message: scrub(error?.message ?? error),
    });
    process.exitCode = 1;
    app.quit();
  });

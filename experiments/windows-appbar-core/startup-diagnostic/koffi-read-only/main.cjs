'use strict';

const fs = require('node:fs');
const path = require('node:path');

const experimentRoot = path.resolve(__dirname, '..', '..');
const logDirectory = path.join(experimentRoot, 'logs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDirectory, `startup-test-b-${timestamp}.jsonl`);

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
let koffi = null;
let monitorInfoForWindow = null;
let window = null;
let koffiVersion = null;

log('koffi-load-started', { expectedVersion: '3.3.7' });
try {
  koffi = require('koffi');
  log('koffi-loaded');
} catch (error) {
  koffi = null;
  log('koffi-load-failed', {
    name: error?.name ?? 'Error',
    message: scrub(error?.message ?? error),
  });
}

function createMonitorInfoReader() {
  const RECT = koffi.struct('StartupDiagnosticRECT', {
    left: 'int32_t',
    top: 'int32_t',
    right: 'int32_t',
    bottom: 'int32_t',
  });
  const MONITORINFO = koffi.struct('StartupDiagnosticMONITORINFO', {
    cbSize: 'uint32_t',
    rcMonitor: RECT,
    rcWork: RECT,
    dwFlags: 'uint32_t',
  });

  log('readonly-win32-binding-started');
  const user32 = koffi.load('user32.dll');
  const MonitorFromWindow = user32.func(
    'void * __stdcall MonitorFromWindow(void *hwnd, uint32_t dwFlags)',
  );
  const GetMonitorInfoW = user32.func(
    'int __stdcall GetMonitorInfoW(void *hMonitor, _Inout_ StartupDiagnosticMONITORINFO *lpmi)',
  );
  log('readonly-win32-binding-ready', { apiNames: ['MonitorFromWindow', 'GetMonitorInfoW'] });

  return (browserWindow, phase) => {
    const nativeHandle = browserWindow.getNativeWindowHandle();
    if (!Buffer.isBuffer(nativeHandle) || (nativeHandle.length !== 4 && nativeHandle.length !== 8)) {
      throw new Error('Electron returned an unexpected native window handle');
    }
    const hwnd = nativeHandle.length === 8
      ? nativeHandle.readBigUInt64LE(0)
      : BigInt(nativeHandle.readUInt32LE(0));
    const hMonitor = MonitorFromWindow(hwnd, 2);
    if (!hMonitor) throw new Error('MonitorFromWindow returned a null handle');

    const info = {
      cbSize: koffi.sizeof(MONITORINFO),
      rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 },
      rcWork: { left: 0, top: 0, right: 0, bottom: 0 },
      dwFlags: 0,
    };
    if (!GetMonitorInfoW(hMonitor, info)) throw new Error('GetMonitorInfoW returned FALSE');

    const measurement = {
      phase,
      monitor: { ...info.rcMonitor },
      workArea: { ...info.rcWork },
      primary: Boolean(info.dwFlags & 1),
    };
    log('readonly-monitor-measurement', measurement);
    return measurement;
  };
}

if (koffi) {
  try {
    const koffiPackagePath = path.join(path.dirname(require.resolve('koffi')), 'package.json');
    koffiVersion = JSON.parse(fs.readFileSync(koffiPackagePath, 'utf8')).version;
    log('koffi-runtime-version', { version: koffiVersion });
  } catch (error) {
    koffi = null;
    log('koffi-version-check-failed', {
      name: error?.name ?? 'Error',
      message: scrub(error?.message ?? error),
    });
  }
}

if (koffi && koffiVersion !== '3.3.7') {
  log('koffi-version-mismatch', { expectedVersion: '3.3.7', actualVersion: koffiVersion });
  koffi = null;
}

if (koffi) {
  try {
    if (typeof koffi.load !== 'function' || typeof koffi.struct !== 'function') {
      throw new TypeError('Koffi load/struct functions are unavailable');
    }
    monitorInfoForWindow = createMonitorInfoReader();
  } catch (error) {
    monitorInfoForWindow = null;
    log('readonly-win32-binding-failed', {
      name: error?.name ?? 'Error',
      message: scrub(error?.message ?? error),
    });
  }
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Electron startup diagnostic — Test B</title>
  <style>
    body { font: 16px Segoe UI, sans-serif; margin: 24px; color: #172033; }
    button { font: inherit; padding: 8px 14px; }
  </style>
</head>
<body>
  <h1>Electron startup test — Koffi read-only</h1>
  <p>Test B: Koffi load and read-only monitor query. No AppBar operation.</p>
  <p>See the PowerShell output and the JSONL log for the measured work area.</p>
  <button id="close" type="button">Close test window</button>
  <script>document.getElementById('close').addEventListener('click', () => window.startupDiagnostic.close());</script>
</body>
</html>`;

function createWindow() {
  try {
    window = new BrowserWindow({
      width: 520,
      height: 300,
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
    window.on('close', () => {
      log('browser-window-close-requested');
      if (monitorInfoForWindow && !window.isDestroyed()) {
        try {
          monitorInfoForWindow(window, 'before-normal-close');
        } catch (error) {
          log('readonly-monitor-measurement-failed', {
            phase: 'before-normal-close',
            name: error?.name ?? 'Error',
            message: scrub(error?.message ?? error),
          });
        }
      }
    });
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

    if (monitorInfoForWindow) {
      try {
        monitorInfoForWindow(window, 'after-window-created');
      } catch (error) {
        log('readonly-monitor-measurement-failed', {
          phase: 'after-window-created',
          name: error?.name ?? 'Error',
          message: scrub(error?.message ?? error),
        });
      }
    }

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

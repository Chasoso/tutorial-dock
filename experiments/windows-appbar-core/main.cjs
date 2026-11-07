const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const koffi = require('koffi');

const APPBAR = Object.freeze({
  NEW: 0x00000000,
  REMOVE: 0x00000001,
  QUERYPOS: 0x00000002,
  SETPOS: 0x00000003,
  TOP: 1,
  MONITOR_DEFAULTTOPRIMARY: 1,
  SWP_NOZORDER: 0x0004,
  SWP_NOACTIVATE: 0x0010,
  SWP_SHOWWINDOW: 0x0040,
});

const RECT = koffi.struct('SpikeRECT', {
  left: 'int32_t',
  top: 'int32_t',
  right: 'int32_t',
  bottom: 'int32_t',
});
const MONITORINFO = koffi.struct('SpikeMONITORINFO', {
  cbSize: 'uint32_t',
  rcMonitor: RECT,
  rcWork: RECT,
  dwFlags: 'uint32_t',
});
const APPBARDATA = koffi.struct('SpikeAPPBARDATA', {
  cbSize: 'uint32_t',
  hWnd: 'void *',
  uCallbackMessage: 'uint32_t',
  uEdge: 'uint32_t',
  rc: RECT,
  lParam: 'intptr_t',
});

const shell32 = koffi.load('shell32.dll');
const user32 = koffi.load('user32.dll');
const kernel32 = koffi.load('kernel32.dll');
const shcore = koffi.load('shcore.dll');
const SHAppBarMessage = shell32.func(
  'uintptr_t __stdcall SHAppBarMessage(uint32_t dwMessage, _Inout_ SpikeAPPBARDATA *pData)',
);
const RegisterWindowMessageW = user32.func(
  'uint32_t __stdcall RegisterWindowMessageW(str16 lpString)',
);
const MonitorFromWindow = user32.func(
  'void * __stdcall MonitorFromWindow(void *hwnd, uint32_t dwFlags)',
);
const GetMonitorInfoW = user32.func(
  'int __stdcall GetMonitorInfoW(void *hMonitor, _Inout_ SpikeMONITORINFO *lpmi)',
);
const GetWindowRect = user32.func(
  'int __stdcall GetWindowRect(void *hWnd, _Out_ SpikeRECT *lpRect)',
);
const FindWindowW = user32.func('void * __stdcall FindWindowW(str16 lpClassName, str16 lpWindowName)');
const SetWindowPos = user32.func(
  'int __stdcall SetWindowPos(void *hWnd, void *hWndInsertAfter, int32_t X, int32_t Y, int32_t cx, int32_t cy, uint32_t uFlags)',
);
const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int nIndex)');
const GetDpiForWindow = user32.func('uint32_t __stdcall GetDpiForWindow(void *hwnd)');
const GetLastError = kernel32.func('uint32_t __stdcall GetLastError()');

let mainWindow;
let callbackMessage = 0;
let appBarRegistered = false;
let releaseUnconfirmed = false;
let releaseConfirmed = false;
let cleanupInFlight = false;
let baselineWorkArea;
let nativeHandle;
let logFile;
let monitorCount = 0;
let windowDpi = 0;

function pointerFromWindowHandle(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('Expected Electron HWND Buffer');
  if (buffer.length === 8) return buffer.readBigUInt64LE(0);
  if (buffer.length === 4) return BigInt(buffer.readUInt32LE(0));
  throw new Error(`Unexpected HWND buffer length: ${buffer.length}`);
}

function rectCopy(rect) {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function sameRect(a, b) {
  return Boolean(a && b) && a.left === b.left && a.top === b.top &&
    a.right === b.right && a.bottom === b.bottom;
}

function record(event, details = {}) {
  const entry = { at: new Date().toISOString(), event, ...details };
  if (logFile) fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('spike:log', entry);
  }
  console.log(JSON.stringify(entry));
  return entry;
}

function monitorInfo() {
  const hMonitor = MonitorFromWindow(nativeHandle, APPBAR.MONITOR_DEFAULTTOPRIMARY);
  if (!hMonitor) throw new Error(`MonitorFromWindow failed; GetLastError=${GetLastError()}`);
  const info = {
    cbSize: koffi.sizeof(MONITORINFO),
    rcMonitor: { left: 0, top: 0, right: 0, bottom: 0 },
    rcWork: { left: 0, top: 0, right: 0, bottom: 0 },
    dwFlags: 0,
  };
  if (!GetMonitorInfoW(hMonitor, info)) {
    throw new Error(`GetMonitorInfoW failed; GetLastError=${GetLastError()}`);
  }
  return {
    monitor: rectCopy(info.rcMonitor),
    workArea: rectCopy(info.rcWork),
    primary: Boolean(info.dwFlags & 1),
  };
}

function taskbarBounds() {
  const taskbar = FindWindowW('Shell_TrayWnd', null);
  if (!taskbar) return null;
  const rect = {};
  if (!GetWindowRect(taskbar, rect)) {
    throw new Error(`GetWindowRect(taskbar) failed; GetLastError=${GetLastError()}`);
  }
  return rectCopy(rect);
}

function currentSnapshot(label) {
  const monitor = monitorInfo();
  const windowRect = { left: 0, top: 0, right: 0, bottom: 0 };
  if (!GetWindowRect(nativeHandle, windowRect)) {
    throw new Error(`GetWindowRect failed; GetLastError=${GetLastError()}`);
  }
  const snapshot = {
    label,
    monitorCount,
    dpi: windowDpi,
    monitor: monitor.monitor,
    workArea: monitor.workArea,
    taskbar: taskbarBounds(),
    window: rectCopy(windowRect),
    workAreaMatchesBaseline: baselineWorkArea ? sameRect(monitor.workArea, baselineWorkArea) : null,
  };
  record('measurement', snapshot);
  return snapshot;
}

function appBarData(rect = { left: 0, top: 0, right: 0, bottom: 0 }) {
  return {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: nativeHandle,
    uCallbackMessage: callbackMessage,
    uEdge: APPBAR.TOP,
    rc: { ...rect },
    lParam: 0n,
  };
}

function setReservationHeight(height) {
  if (!appBarRegistered) throw new Error('AppBar is not registered');
  if (![34, 90].includes(height)) throw new RangeError('Only the experiment values 34 and 90 are allowed');

  const before = monitorInfo();
  const proposed = {
    left: before.monitor.left,
    top: before.monitor.top,
    right: before.monitor.right,
    bottom: before.monitor.top + height,
  };
  const query = appBarData(proposed);
  const queryResult = SHAppBarMessage(APPBAR.QUERYPOS, query);
  const queriedRect = rectCopy(query.rc);
  if (queryResult === 0n || queryResult === 0) {
    throw new Error('ABM_QUERYPOS returned FALSE');
  }

  // Preserve the top edge selected by Windows and request the experiment height.
  const finalRect = {
    left: queriedRect.left,
    top: queriedRect.top,
    right: queriedRect.right,
    bottom: queriedRect.top + height,
  };
  const setPosition = appBarData(finalRect);
  const setResult = SHAppBarMessage(APPBAR.SETPOS, setPosition);
  if (setResult === 0n || setResult === 0) {
    record('ABM_SETPOS-unexpected-false', { returnValue: String(setResult), requestedHeight: height });
    throw new Error('ABM_SETPOS returned FALSE; keep the AppBar registered until Remove and verify succeeds');
  }
  const acceptedRect = rectCopy(setPosition.rc);
  const moved = Boolean(SetWindowPos(
    nativeHandle,
    null,
    acceptedRect.left,
    acceptedRect.top,
    acceptedRect.right - acceptedRect.left,
    acceptedRect.bottom - acceptedRect.top,
    APPBAR.SWP_NOZORDER | APPBAR.SWP_NOACTIVATE | APPBAR.SWP_SHOWWINDOW,
  ));
  const after = monitorInfo();
  const result = {
    requestedHeight: height,
    api: {
      ABM_QUERYPOS: String(queryResult),
      ABM_SETPOS: String(setResult),
      SetWindowPos: moved,
      SetWindowPosError: moved ? null : GetLastError(),
    },
    proposed,
    queriedRect,
    acceptedRect,
    beforeWorkArea: before.workArea,
    afterWorkArea: after.workArea,
    workAreaChanged: !sameRect(before.workArea, after.workArea),
    matchesExpectedTop: after.workArea.top === acceptedRect.bottom,
  };
  record('reservation-size', result);
  if (!moved) throw new Error(`SetWindowPos failed; GetLastError=${result.api.SetWindowPosError}`);
  return { ...result, snapshot: currentSnapshot(`height-${height}`) };
}

async function registerAppBar() {
  if (appBarRegistered) return { ok: false, message: 'Already registered' };
  if (monitorCount !== 1 || windowDpi !== 96) {
    const message = `Registration skipped: requires one monitor and 96 DPI; observed monitors=${monitorCount}, dpi=${windowDpi}`;
    record('registration-skipped', { message });
    return { ok: false, message };
  }

  const before = currentSnapshot('before-registration');
  if (!baselineWorkArea) baselineWorkArea = before.workArea;
  callbackMessage = RegisterWindowMessageW('TutorialDock.AppBar.Callback');
  if (!callbackMessage) {
    throw new Error(`RegisterWindowMessageW failed; GetLastError=${GetLastError()}`);
  }
  mainWindow.hookWindowMessage(callbackMessage, (_event, wParam, lParam) => {
    record('appbar-callback', {
      message: callbackMessage,
      wParam: Buffer.from(wParam).toString('hex'),
      lParam: Buffer.from(lParam).toString('hex'),
    });
  });

  const registration = appBarData();
  const result = SHAppBarMessage(APPBAR.NEW, registration);
  record('ABM_NEW', { returnValue: String(result), callbackMessage });
  if (result === 0n || result === 0) {
    return { ok: false, message: 'ABM_NEW returned FALSE; no reservation test was started' };
  }

  appBarRegistered = true;
  releaseUnconfirmed = false;
  releaseConfirmed = false;
  mainWindow.setAlwaysOnTop(true);
  try {
    const reservation = setReservationHeight(90);
    return { ok: true, reservation };
  } catch (error) {
    record('registration-position-error', { message: error.message });
    return { ok: false, message: `${error.message}; AppBar remains registered. Use Remove and verify before closing.` };
  }
}

async function removeAppBar() {
  if (!appBarRegistered && !releaseUnconfirmed) {
    return { ok: true, alreadyReleased: true, snapshot: currentSnapshot('already-released') };
  }

  const removal = appBarData();
  let removeResult;
  try {
    removeResult = SHAppBarMessage(APPBAR.REMOVE, removal);
  } catch (error) {
    record('ABM_REMOVE-error', { message: error.message });
    return { ok: false, message: error.message };
  }
  record('ABM_REMOVE', { returnValue: String(removeResult) });
  if (removeResult === 0n || removeResult === 0) {
    releaseUnconfirmed = true;
    return { ok: false, message: 'ABM_REMOVE returned FALSE; keep this window open and stop testing.' };
  }

  appBarRegistered = false;
  releaseUnconfirmed = true;
  releaseConfirmed = false;
  await new Promise((resolve) => setTimeout(resolve, 350));
  let after;
  try {
    after = currentSnapshot('after-removal');
  } catch (error) {
    record('release-verification-error', { message: error.message });
    return { ok: false, message: `ABM_REMOVE returned TRUE, but work-area verification failed: ${error.message}. Keep the window open and stop testing.` };
  }
  const restored = sameRect(after.workArea, baselineWorkArea);
  releaseConfirmed = restored;
  releaseUnconfirmed = !restored;
  record('release-verification', {
    apiAccepted: true,
    baselineWorkArea,
    finalWorkArea: after.workArea,
    restored,
  });

  if (!restored) {
    return {
      ok: false,
      message: 'ABM_REMOVE returned TRUE, but work area differs from baseline. State is unconfirmed; stop testing and keep the window open.',
      snapshot: after,
    };
  }

  mainWindow.setAlwaysOnTop(false);
  const bounds = mainWindow.getBounds();
  const primary = screen.getPrimaryDisplay().workArea;
  mainWindow.setBounds({
    x: Math.max(0, Math.round((primary.width - bounds.width) / 2)),
    y: Math.max(0, Math.round((primary.height - bounds.height) / 2)),
    width: Math.min(900, primary.width),
    height: Math.min(280, primary.height),
  });
  return { ok: true, snapshot: after };
}

function createWindow() {
  const primary = screen.getPrimaryDisplay().workArea;
  mainWindow = new BrowserWindow({
    x: Math.max(0, Math.round((primary.width - 900) / 2)),
    y: Math.max(0, Math.round((primary.height - 280) / 2)),
    width: Math.min(900, primary.width),
    height: Math.min(280, primary.height),
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: false,
    backgroundColor: '#101b2d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  nativeHandle = pointerFromWindowHandle(mainWindow.getNativeWindowHandle());
  monitorCount = GetSystemMetrics(80);
  windowDpi = GetDpiForWindow(nativeHandle);
  logFile = path.join(__dirname, 'logs', `session-${new Date().toISOString().replaceAll(':', '-')}.jsonl`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  mainWindow.on('close', (event) => {
    if (releaseConfirmed || (!appBarRegistered && !releaseUnconfirmed)) return;
    event.preventDefault();
    if (cleanupInFlight) return;
    cleanupInFlight = true;
    removeAppBar().then((result) => {
      cleanupInFlight = false;
      if (result.ok) {
        mainWindow.close();
      } else {
        record('close-blocked', { message: result.message });
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'AppBar release is unconfirmed',
          message: result.message,
          detail: 'Do not force-close this experiment. Stop further tests and record the displayed work-area values for human handling.',
          buttons: ['Keep window open'],
          defaultId: 0,
        });
      }
    }).catch((error) => {
      cleanupInFlight = false;
      record('close-cleanup-error', { message: error.message });
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    const snapshot = currentSnapshot('startup-baseline');
    baselineWorkArea = snapshot.workArea;
    record('environment', {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      windows: os.version(),
      platform: process.platform,
      arch: process.arch,
      monitorCount,
      dpi: windowDpi,
    });
  });
}

ipcMain.handle('spike:measure', () => currentSnapshot('manual-measurement'));
ipcMain.handle('spike:register', () => registerAppBar());
ipcMain.handle('spike:set-height', (_event, height) => {
  try {
    return setReservationHeight(height);
  } catch (error) {
    record('reservation-size-error', { height, message: error.message });
    throw error;
  }
});
ipcMain.handle('spike:remove', () => removeAppBar());
ipcMain.on('spike:close', () => mainWindow?.close());

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('before-quit', (event) => {
  if (releaseConfirmed || (!appBarRegistered && !releaseUnconfirmed)) return;
  event.preventDefault();
  mainWindow?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (!appBarRegistered && !releaseUnconfirmed)) app.quit();
});

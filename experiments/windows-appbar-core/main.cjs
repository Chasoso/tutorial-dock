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
  WINDOWPOSCHANGED: 0x00000009,
  TOP: 1,
  MONITOR_DEFAULTTOPRIMARY: 1,
  SWP_NOZORDER: 0x0004,
  SWP_NOACTIVATE: 0x0010,
  SWP_SHOWWINDOW: 0x0040,
});
const ABN_POSCHANGED = 0x00000001;
const WM_WINDOWPOSCHANGED = 0x0047;
const SM_CMONITORS = 80;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const SHOW_SETTLED_DIAGNOSTIC_DELAY_MS = 250;

const STATE = Object.freeze({
  UNREGISTERED: 'unregistered',
  REGISTERING: 'registering',
  REGISTERED: 'registered',
  UPDATING: 'updating',
  REMOVING: 'removing',
  RELEASED: 'released',
  UNKNOWN: 'release-unconfirmed',
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

let operatorWindow;
let appBarWindow;
let operatorHandle;
let appBarHandle;
let appBarWindowReady = false;
let callbackMessage = 0;
let appBarMessagesHooked = false;
let appBarState = STATE.UNREGISTERED;
let operationName = null;
let operationPromise = null;
let shutdownPromise = null;
let shutdownRequested = false;
let allowAppBarWindowClose = false;
let allowOperatorWindowClose = false;
let allowAppQuit = false;
let startupWorkArea;
let reservationBaselineWorkArea;
let operatorWindowBaseline;
let currentHeight = null;
let monitorCount = 0;
let windowDpi = 0;
let requestedAppBarCreationBounds;
let lastSetWindowPosRequest = null;
let logFile;
let logFileFailure = null;
let dwmGetWindowAttribute;
let dwmBindingFailure = null;

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

function stateSnapshot() {
  return {
    state: appBarState,
    operation: operationName,
    currentHeight,
    appBarWindowReady,
    shutdownRequested,
    logFileFailure,
  };
}

function markLogFileFailure(error) {
  if (!logFileFailure) {
    let message = String(error?.message ?? error);
    const localPaths = [process.env.USERPROFILE, process.cwd(), __dirname]
      .filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
    for (const localPath of localPaths) {
      message = message.split(localPath).join('<LOCAL_PATH>');
    }
    logFileFailure = { code: error?.code ?? null, message };
  }
  process.exitCode = 1;
}

function record(event, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    event,
    ...details,
    ...(logFileFailure ? { previousLogFileFailure: logFileFailure } : {}),
  };
  try {
    if (!logFile) throw new Error('JSONL log file has not been initialized');
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    markLogFileFailure(error);
    entry.logFileError = logFileFailure;
  }
  try {
    if (operatorWindow && !operatorWindow.isDestroyed()) {
      operatorWindow.webContents.send('spike:log', entry);
    }
  } catch (error) {
    entry.uiLogError = error.message;
  }
  return entry;
}

function announceState() {
  try {
    if (operatorWindow && !operatorWindow.isDestroyed()) {
      operatorWindow.webContents.send('spike:state', stateSnapshot());
    }
  } catch (error) {
    record('state-notification-failed', { message: error.message });
  }
}

function transition(nextState, details = {}) {
  const previous = appBarState;
  appBarState = nextState;
  record('appbar-state', { previous, state: nextState, ...details });
  announceState();
}

function startOperation(name, action, allowDuringShutdown = false) {
  if (operationPromise) {
    return Promise.reject(new Error(`Cannot start ${name}; ${operationName} is already in progress`));
  }
  if (shutdownRequested && !allowDuringShutdown) {
    return Promise.reject(new Error('The experiment is shutting down'));
  }

  operationName = name;
  const promise = Promise.resolve().then(action);
  operationPromise = promise;
  announceState();
  const finish = () => {
    if (operationPromise !== promise) return;
    operationPromise = null;
    operationName = null;
    announceState();
  };
  promise.then(finish, finish);
  return promise;
}

function monitorInfo() {
  const hMonitor = MonitorFromWindow(appBarHandle, APPBAR.MONITOR_DEFAULTTOPRIMARY);
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

function nativeWindowRect(hwnd, name) {
  const rect = {};
  if (!GetWindowRect(hwnd, rect)) {
    throw new Error(`GetWindowRect(${name}) failed; GetLastError=${GetLastError()}`);
  }
  return rectCopy(rect);
}

function diagnosticErrorText(error) {
  let message = String(error?.message ?? error);
  const localPaths = [process.env.USERPROFILE, process.cwd(), __dirname]
    .filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
  for (const localPath of localPaths) message = message.split(localPath).join('<LOCAL_PATH>');
  return message;
}

function diagnosticRead(read) {
  try {
    return { status: 'ok', value: read() };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: diagnosticErrorText(error),
    };
  }
}

function dwmExtendedFrameBounds(hwnd) {
  if (!dwmGetWindowAttribute && !dwmBindingFailure) {
    try {
      const dwmapi = koffi.load('dwmapi.dll');
      dwmGetWindowAttribute = dwmapi.func(
        'int32_t __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t dwAttribute, _Out_ SpikeRECT *pvAttribute, uint32_t cbAttribute)',
      );
    } catch (error) {
      dwmBindingFailure = diagnosticErrorText(error);
    }
  }
  if (!dwmGetWindowAttribute) {
    throw new Error(`DwmGetWindowAttribute binding unavailable: ${dwmBindingFailure || 'unknown binding error'}`);
  }

  const rect = {};
  const result = dwmGetWindowAttribute(
    hwnd,
    DWMWA_EXTENDED_FRAME_BOUNDS,
    rect,
    koffi.sizeof(RECT),
  );
  if (result !== 0) {
    throw new Error(`DwmGetWindowAttribute failed; HRESULT=0x${(result >>> 0).toString(16).padStart(8, '0')}`);
  }
  return { hresult: result, rect: rectCopy(rect) };
}

function diagnosticWindowMeasurements(window, hwnd, role) {
  let isDestroyed;
  try {
    isDestroyed = !window || window.isDestroyed();
  } catch (error) {
    const unavailable = {
      status: 'unavailable',
      reason: `BrowserWindow availability check failed: ${diagnosticErrorText(error)}`,
    };
    return {
      hwndRole: role,
      getWindowRect: unavailable,
      electronGetBounds: unavailable,
      electronGetContentBounds: unavailable,
      isVisible: unavailable,
      dwmExtendedFrameBounds: unavailable,
    };
  }
  if (isDestroyed) {
    const unavailable = { status: 'unavailable', reason: 'BrowserWindow is not available' };
    return {
      hwndRole: role,
      getWindowRect: unavailable,
      electronGetBounds: unavailable,
      electronGetContentBounds: unavailable,
      isVisible: unavailable,
      dwmExtendedFrameBounds: unavailable,
    };
  }

  return {
    hwndRole: role,
    getWindowRect: diagnosticRead(() => nativeWindowRect(hwnd, role)),
    electronGetBounds: diagnosticRead(() => window.getBounds()),
    electronGetContentBounds: diagnosticRead(() => window.getContentBounds()),
    isVisible: diagnosticRead(() => window.isVisible()),
    dwmExtendedFrameBounds: diagnosticRead(() => dwmExtendedFrameBounds(hwnd)),
  };
}

function positionDiagnosticSnapshot(label, details = {}) {
  try {
    const monitor = diagnosticRead(() => monitorInfo());
    record('position-diagnostic', {
      label,
      appBarState,
      registrationState: appBarState,
      currentHeight,
      requestedAppBarCreationBounds: requestedAppBarCreationBounds ?? null,
      lastSetWindowPosRequest,
      details,
      coordinateNotes: {
        getWindowRect: 'Win32 screen RECT; GetWindowRect may include invisible resize borders and is DPI-virtualized.',
        electronGetBounds: 'Raw Electron BrowserWindow outer Rectangle; Electron and Win32 coordinates may use different DPI spaces, and no conversion is applied.',
        electronGetContentBounds: 'Raw Electron BrowserWindow client/content Rectangle; Electron and Win32 coordinates may use different DPI spaces, and no conversion is applied.',
        dwmExtendedFrameBounds: 'DWM screen-space extended frame RECT; Microsoft documents that it is not DPI-adjusted.',
        comparison: 'Keep each API result separate. Differences are measurements, not a diagnosis until coordinate spaces and frame definitions are accounted for.',
      },
      measurements: {
        monitorAndWorkArea: monitor.status === 'ok'
          ? {
              status: 'ok',
              apiResults: { MonitorFromWindow: 'handle-returned', GetMonitorInfoW: true },
              monitor: monitor.value.monitor,
              workArea: monitor.value.workArea,
              primary: monitor.value.primary,
            }
          : monitor,
        appBarWindow: diagnosticWindowMeasurements(appBarWindow, appBarHandle, 'appbar-window'),
        operatorWindow: diagnosticWindowMeasurements(operatorWindow, operatorHandle, 'operator-window'),
      },
    });
  } catch (error) {
    record('position-diagnostic-capture-error', {
      label,
      reason: diagnosticErrorText(error),
      note: 'Diagnostic capture failed; AppBar operation flow continues without this sample.',
    });
  }
}

function hookAppBarWindowGeometryEvents() {
  for (const eventName of ['show', 'move', 'resize']) {
    appBarWindow.on(eventName, () => {
      positionDiagnosticSnapshot(`electron-event:${eventName}`, {
        source: 'BrowserWindow event',
        eventName,
      });
    });
  }
}

function taskbarBounds() {
  const taskbar = FindWindowW('Shell_TrayWnd', null);
  if (!taskbar) return null;
  return nativeWindowRect(taskbar, 'taskbar');
}

function currentSnapshot(label) {
  const monitor = monitorInfo();
  const appBarRect = nativeWindowRect(appBarHandle, 'AppBar window');
  const operatorRect = nativeWindowRect(operatorHandle, 'operator window');
  const snapshot = {
    label,
    appBarState,
    monitorCount,
    dpi: windowDpi,
    monitor: monitor.monitor,
    workArea: monitor.workArea,
    taskbar: taskbarBounds(),
    appBarWindow: appBarRect,
    operatorWindow: operatorRect,
    workAreaMatchesStartup: startupWorkArea ? sameRect(monitor.workArea, startupWorkArea) : null,
    workAreaMatchesReservationBaseline: reservationBaselineWorkArea
      ? sameRect(monitor.workArea, reservationBaselineWorkArea)
      : null,
    operatorWindowMatchesBaseline: operatorWindowBaseline
      ? sameRect(operatorRect, operatorWindowBaseline)
      : null,
  };
  record('measurement', snapshot);
  return snapshot;
}

function appBarData(rect = { left: 0, top: 0, right: 0, bottom: 0 }) {
  return {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: appBarHandle,
    uCallbackMessage: callbackMessage,
    uEdge: APPBAR.TOP,
    rc: { ...rect },
    lParam: 0n,
  };
}

function readUnsignedMessageValue(value) {
  if (!Buffer.isBuffer(value) || value.length < 4) return null;
  return value.readUInt32LE(0);
}

function hookAppBarMessages() {
  if (appBarMessagesHooked) return;
  appBarWindow.hookWindowMessage(callbackMessage, (_event, wParam, lParam) => {
    const notification = readUnsignedMessageValue(wParam);
    record('appbar-callback-observed', {
      hwndRole: 'appbar-window',
      message: callbackMessage,
      notification,
      notificationName: notification === ABN_POSCHANGED ? 'ABN_POSCHANGED' : 'other',
      wParam: Buffer.isBuffer(wParam) ? wParam.toString('hex') : String(wParam),
      lParam: Buffer.isBuffer(lParam) ? lParam.toString('hex') : String(lParam),
      handling: 'logged-only plus read-only position measurement; no ABM_QUERY/SETPOS or relocation is implemented',
    });
    positionDiagnosticSnapshot('win32-message:appbar-callback', {
      message: callbackMessage,
      notification,
      notificationName: notification === ABN_POSCHANGED ? 'ABN_POSCHANGED' : 'other',
      action: 'read-only measurement only',
    });
  });
  appBarWindow.hookWindowMessage(WM_WINDOWPOSCHANGED, (_event, wParam, lParam) => {
    record('wm-windowposchanged-observed', {
      hwndRole: 'appbar-window',
      message: WM_WINDOWPOSCHANGED,
      wParam: Buffer.isBuffer(wParam) ? wParam.toString('hex') : String(wParam),
      lParam: Buffer.isBuffer(lParam) ? lParam.toString('hex') : String(lParam),
      handling: 'logged-only plus read-only position measurement; ABM_WINDOWPOSCHANGED is not sent',
    });
    positionDiagnosticSnapshot('win32-message:WM_WINDOWPOSCHANGED', {
      message: WM_WINDOWPOSCHANGED,
      action: 'read-only measurement only',
    });
  });
  appBarMessagesHooked = true;
}

function setReservationHeightInternal(height) {
  if (appBarState !== STATE.REGISTERED) {
    throw new Error(`Cannot update reservation while AppBar state is ${appBarState}`);
  }
  if (![34, 90].includes(height)) {
    throw new RangeError('Only the experiment values 34 and 90 are allowed');
  }

  transition(STATE.UPDATING, { requestedHeight: height });
  try {
    const before = monitorInfo();
    const proposed = {
      left: before.monitor.left,
      top: before.monitor.top,
      right: before.monitor.right,
      bottom: before.monitor.top + height,
    };
    const query = appBarData(proposed);
    positionDiagnosticSnapshot('before-querypos', {
      operation: 'ABM_QUERYPOS',
      requestedHeight: height,
      proposedRect: proposed,
    });
    let queryResult;
    try {
      queryResult = SHAppBarMessage(APPBAR.QUERYPOS, query);
    } catch (error) {
      positionDiagnosticSnapshot('after-querypos', {
        operation: 'ABM_QUERYPOS',
        requestedHeight: height,
        proposedRect: proposed,
        callError: error?.message ?? String(error),
      });
      throw error;
    }
    const queriedRect = rectCopy(query.rc);
    positionDiagnosticSnapshot('after-querypos', {
      operation: 'ABM_QUERYPOS',
      requestedHeight: height,
      returnValue: String(queryResult),
      proposedRect: proposed,
      queriedRect,
    });
    if (queryResult === 0n || queryResult === 0) {
      throw new Error('ABM_QUERYPOS returned FALSE');
    }

    const finalRect = {
      left: queriedRect.left,
      top: queriedRect.top,
      right: queriedRect.right,
      bottom: queriedRect.top + height,
    };
    const setPosition = appBarData(finalRect);
    positionDiagnosticSnapshot('before-setpos', {
      operation: 'ABM_SETPOS',
      requestedHeight: height,
      finalRect,
    });
    let setResult;
    try {
      setResult = SHAppBarMessage(APPBAR.SETPOS, setPosition);
    } catch (error) {
      positionDiagnosticSnapshot('after-setpos', {
        operation: 'ABM_SETPOS',
        requestedHeight: height,
        submittedRect: finalRect,
        callError: error?.message ?? String(error),
      });
      throw error;
    }
    const accepted = !(setResult === 0n || setResult === 0);
    const acceptedRect = accepted ? rectCopy(setPosition.rc) : null;
    positionDiagnosticSnapshot('after-setpos', {
      operation: 'ABM_SETPOS',
      requestedHeight: height,
      returnValue: String(setResult),
      submittedRect: finalRect,
      acceptedRect: acceptedRect ?? { status: 'unavailable', reason: 'ABM_SETPOS returned FALSE' },
    });
    if (!accepted) {
      record('ABM_SETPOS-unexpected-false', {
        returnValue: String(setResult),
        requestedHeight: height,
      });
      throw new Error('ABM_SETPOS returned FALSE; retain the AppBar window until Remove is verified');
    }

    const setWindowPosRequest = {
      hwndRole: 'appbar-window',
      x: acceptedRect.left,
      y: acceptedRect.top,
      width: acceptedRect.right - acceptedRect.left,
      height: acceptedRect.bottom - acceptedRect.top,
      flags: APPBAR.SWP_NOZORDER | APPBAR.SWP_NOACTIVATE | APPBAR.SWP_SHOWWINDOW,
      acceptedRect,
    };
    lastSetWindowPosRequest = setWindowPosRequest;
    positionDiagnosticSnapshot('before-setwindowpos', {
      operation: 'SetWindowPos',
      requestedHeight: height,
      setWindowPosRequest,
    });
    let moved;
    try {
      moved = Boolean(SetWindowPos(
        appBarHandle,
        null,
        setWindowPosRequest.x,
        setWindowPosRequest.y,
        setWindowPosRequest.width,
        setWindowPosRequest.height,
        setWindowPosRequest.flags,
      ));
    } catch (error) {
      positionDiagnosticSnapshot('after-setwindowpos', {
        operation: 'SetWindowPos',
        requestedHeight: height,
        setWindowPosRequest,
        callError: error?.message ?? String(error),
      });
      throw error;
    }
    const setWindowPosError = moved ? null : GetLastError();
    positionDiagnosticSnapshot('after-setwindowpos', {
      operation: 'SetWindowPos',
      requestedHeight: height,
      setWindowPosRequest,
      returnValue: moved,
      getLastError: setWindowPosError,
    });
    const after = monitorInfo();
    const result = {
      requestedHeight: height,
      api: {
        ABM_QUERYPOS: String(queryResult),
        ABM_SETPOS: String(setResult),
        SetWindowPos: moved,
        SetWindowPosError: setWindowPosError,
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
    if (!moved) {
      throw new Error(`SetWindowPos failed; GetLastError=${setWindowPosError}`);
    }
    positionDiagnosticSnapshot('before-showinactive', {
      operation: 'BrowserWindow.showInactive',
      requestedHeight: height,
      setWindowPosRequest,
    });
    appBarWindow.showInactive();
    positionDiagnosticSnapshot('after-showinactive', {
      operation: 'BrowserWindow.showInactive',
      requestedHeight: height,
      setWindowPosRequest,
    });
    setTimeout(() => {
      positionDiagnosticSnapshot('after-show-settled', {
        trigger: 'BrowserWindow.showInactive',
        delayMs: SHOW_SETTLED_DIAGNOSTIC_DELAY_MS,
        requestedHeight: height,
        setWindowPosRequest,
        note: 'One finite read-only sample; this delay is a measurement point, not a guarantee that all OS/window processing has completed.',
      });
    }, SHOW_SETTLED_DIAGNOSTIC_DELAY_MS);

    currentHeight = height;
    const snapshot = currentSnapshot(`reservation-height-${height}`);
    transition(STATE.REGISTERED, { currentHeight: height });
    return { ...result, snapshot };
  } catch (error) {
    transition(STATE.UNKNOWN, { failedOperation: 'reservation-update', message: error.message });
    throw error;
  }
}

async function registerAppBarInternal() {
  if (appBarState !== STATE.UNREGISTERED) {
    return { ok: false, state: appBarState, message: 'Registration is only allowed when AppBar is unregistered' };
  }
  transition(STATE.REGISTERING);
  let newCallStarted = false;
  try {
    if (!appBarWindow || appBarWindow.isDestroyed() || !appBarWindowReady || !operatorWindow || operatorWindow.isDestroyed()) {
      throw new Error('Both the AppBar and operator windows must exist before registration');
    }
    if (monitorCount !== 1 || windowDpi !== 96) {
      transition(STATE.UNREGISTERED, { registrationSkipped: true, monitorCount, dpi: windowDpi });
      return {
        ok: false,
        state: appBarState,
        message: `Registration requires one monitor and 96 DPI; observed monitors=${monitorCount}, dpi=${windowDpi}`,
      };
    }

    const before = currentSnapshot('before-registration');
    reservationBaselineWorkArea = before.workArea;
    operatorWindowBaseline = before.operatorWindow;
    record('registration-baseline', {
      workArea: reservationBaselineWorkArea,
      operatorWindow: operatorWindowBaseline,
      source: 'captured immediately before ABM_NEW',
    });

    callbackMessage = RegisterWindowMessageW('TutorialDock.AppBar.Callback');
    if (!callbackMessage) {
      throw new Error(`RegisterWindowMessageW failed; GetLastError=${GetLastError()}`);
    }
    hookAppBarMessages();

    const registration = appBarData();
    newCallStarted = true;
    positionDiagnosticSnapshot('before-appbar-new', {
      operation: 'ABM_NEW',
      requestedRect: rectCopy(registration.rc),
      callbackMessage,
    });
    let result;
    try {
      result = SHAppBarMessage(APPBAR.NEW, registration);
    } catch (error) {
      positionDiagnosticSnapshot('after-appbar-new', {
        operation: 'ABM_NEW',
        callError: error?.message ?? String(error),
      });
      throw error;
    }
    record('ABM_NEW', { hwndRole: 'appbar-window', returnValue: String(result), callbackMessage });
    positionDiagnosticSnapshot('after-appbar-new', {
      operation: 'ABM_NEW',
      returnValue: String(result),
      acceptedOrRejected: result === 0n || result === 0 ? 'rejected' : 'accepted',
      requestedRect: rectCopy(registration.rc),
    });
    if (result === 0n || result === 0) {
      newCallStarted = false;
      transition(STATE.UNREGISTERED, { registrationAccepted: false });
      return { ok: false, state: appBarState, message: 'ABM_NEW returned FALSE; no reservation test was started' };
    }

    transition(STATE.REGISTERED, { registrationAccepted: true, hwndRole: 'appbar-window' });
    appBarWindow.setAlwaysOnTop(true);
    const reservation = setReservationHeightInternal(90);
    return { ok: true, state: appBarState, reservation };
  } catch (error) {
    if (newCallStarted || appBarState === STATE.REGISTERED || appBarState === STATE.UPDATING) {
      transition(STATE.UNKNOWN, { failedOperation: 'registration', message: error.message });
    } else if (appBarState === STATE.REGISTERING) {
      transition(STATE.UNREGISTERED, { failedOperation: 'registration-before-ABM_NEW', message: error.message });
    }
    record('registration-error', { message: error.message, state: appBarState });
    return {
      ok: false,
      state: appBarState,
      message: `${error.message}. Use Remove and verify before closing if registration may have succeeded.`,
    };
  }
}

async function removeAppBarInternal() {
  if (appBarState === STATE.UNREGISTERED || appBarState === STATE.RELEASED) {
    return { ok: true, alreadyReleased: true, state: appBarState };
  }
  if ([STATE.REGISTERING, STATE.UPDATING, STATE.REMOVING].includes(appBarState)) {
    return { ok: false, state: appBarState, message: `Cannot remove while AppBar state is ${appBarState}` };
  }

  transition(STATE.REMOVING);
  positionDiagnosticSnapshot('before-remove', {
    operation: 'ABM_REMOVE',
    hwndRole: 'appbar-window',
  });
  let removeResult;
  try {
    removeResult = SHAppBarMessage(APPBAR.REMOVE, appBarData());
  } catch (error) {
    positionDiagnosticSnapshot('after-remove', {
      operation: 'ABM_REMOVE',
      callError: error?.message ?? String(error),
    });
    transition(STATE.UNKNOWN, { failedOperation: 'ABM_REMOVE', message: error.message });
    record('ABM_REMOVE-error', { message: error.message });
    return { ok: false, state: appBarState, message: `ABM_REMOVE threw: ${error.message}` };
  }
  record('ABM_REMOVE', { hwndRole: 'appbar-window', returnValue: String(removeResult) });
  positionDiagnosticSnapshot('after-remove', {
    operation: 'ABM_REMOVE',
    returnValue: String(removeResult),
  });
  if (removeResult === 0n || removeResult === 0) {
    transition(STATE.UNKNOWN, { failedOperation: 'ABM_REMOVE', returnValue: String(removeResult) });
    return { ok: false, state: appBarState, message: 'ABM_REMOVE returned FALSE; release remains unconfirmed' };
  }

  try {
    appBarWindow.setAlwaysOnTop(false);
  } catch (error) {
    record('appbar-hide-error', { step: 'setAlwaysOnTop(false)', message: error.message });
  }
  try {
    appBarWindow.hide();
  } catch (error) {
    record('appbar-hide-error', { step: 'hide', message: error.message });
  }

  await new Promise((resolve) => setTimeout(resolve, 350));
  let after;
  try {
    after = currentSnapshot('after-removal');
  } catch (error) {
    transition(STATE.UNKNOWN, { failedOperation: 'release-verification', message: error.message });
    return {
      ok: false,
      state: appBarState,
      message: `ABM_REMOVE returned TRUE, but work-area verification failed: ${error.message}`,
    };
  }

  const workAreaRestored = sameRect(after.workArea, reservationBaselineWorkArea);
  const appBarHidden = !appBarWindow.isVisible();
  const operatorWindowUnchanged = sameRect(after.operatorWindow, operatorWindowBaseline);
  record('release-verification', {
    apiAccepted: true,
    reservationBaselineWorkArea,
    finalWorkArea: after.workArea,
    workAreaRestored,
    appBarHidden,
    operatorWindowUnchanged,
  });

  if (!workAreaRestored || !appBarHidden || !operatorWindowUnchanged) {
    transition(STATE.UNKNOWN, {
      failedOperation: 'release-verification',
      workAreaRestored,
      appBarHidden,
      operatorWindowUnchanged,
    });
    return {
      ok: false,
      state: appBarState,
      message: 'Release is unconfirmed: inspect the work area and both window bounds; stop further AppBar tests.',
      snapshot: after,
    };
  }

  currentHeight = null;
  transition(STATE.RELEASED, { workAreaRestored, appBarHidden, operatorWindowUnchanged });
  return { ok: true, state: appBarState, snapshot: after };
}

function showUnresolvedShutdown(result, reason) {
  const message = result?.message || 'The AppBar release state could not be confirmed.';
  record('safe-shutdown-blocked', { reason, state: appBarState, message });
  const owner = operatorWindow && !operatorWindow.isDestroyed() ? operatorWindow : undefined;
  return dialog.showMessageBox(owner, {
    type: 'error',
    title: 'AppBar release is unconfirmed',
    message,
    detail: 'The operator window remains available. Do not force-close this experiment or run more checks. Record the displayed work-area state and ask a human to inspect Windows.',
    buttons: ['Keep windows open'],
    defaultId: 0,
  });
}

async function requestSafeShutdown(reason) {
  if (shutdownPromise) return shutdownPromise;
  shutdownRequested = true;
  announceState();

  const task = (async () => {
    const pending = operationPromise;
    const pendingName = operationName;
    let pendingResult;
    let pendingError;
    if (pending) {
      try {
        pendingResult = await pending;
      } catch (error) {
        pendingError = error;
      }
      if (pendingName === 'remove' && (pendingError || pendingResult?.ok === false)) {
        await showUnresolvedShutdown(
          pendingResult || { message: pendingError?.message || 'The active release attempt failed.' },
          reason,
        );
        return false;
      }
    }

    if (appBarState !== STATE.UNREGISTERED && appBarState !== STATE.RELEASED) {
      let result;
      try {
        result = await startOperation('remove-for-shutdown', removeAppBarInternal, true);
      } catch (error) {
        result = { ok: false, state: appBarState, message: error.message };
      }
      if (!result?.ok) {
        await showUnresolvedShutdown(result, reason);
        return false;
      }
    }

    record('safe-shutdown-confirmed', { reason, state: appBarState });
    allowAppBarWindowClose = true;
    if (appBarWindow && !appBarWindow.isDestroyed()) appBarWindow.close();
    allowOperatorWindowClose = true;
    if (operatorWindow && !operatorWindow.isDestroyed()) operatorWindow.close();
    allowAppQuit = true;
    app.quit();
    return true;
  })();

  shutdownPromise = task;
  try {
    return await task;
  } catch (error) {
    await showUnresolvedShutdown({ message: error.message }, reason);
    return false;
  } finally {
    if (shutdownPromise === task) shutdownPromise = null;
    shutdownRequested = false;
    announceState();
  }
}

function createWindows() {
  const primary = screen.getPrimaryDisplay();
  const bounds = primary.bounds;
  const workArea = primary.workArea;

  requestedAppBarCreationBounds = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: 90,
  };
  appBarWindow = new BrowserWindow({
    ...requestedAppBarCreationBounds,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    backgroundColor: '#15345b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  appBarHandle = pointerFromWindowHandle(appBarWindow.getNativeWindowHandle());
  appBarWindow.on('close', (event) => {
    if (allowAppBarWindowClose) return;
    event.preventDefault();
    void requestSafeShutdown('appbar-window-close');
  });
  appBarWindow.once('ready-to-show', () => {
    appBarWindowReady = true;
    record('appbar-window-ready', { hwndRole: 'appbar-window' });
    announceState();
  });
  appBarWindow.loadFile(path.join(__dirname, 'appbar.html')).catch((error) => {
    record('appbar-window-load-error', { message: error.message });
  });

  operatorWindow = new BrowserWindow({
    x: Math.max(workArea.x, Math.round(workArea.x + (workArea.width - 900) / 2)),
    y: Math.max(workArea.y, Math.round(workArea.y + (workArea.height - 420) / 2)),
    width: Math.min(900, workArea.width),
    height: Math.min(420, workArea.height),
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
  operatorHandle = pointerFromWindowHandle(operatorWindow.getNativeWindowHandle());
  monitorCount = GetSystemMetrics(SM_CMONITORS);
  windowDpi = GetDpiForWindow(appBarHandle);
  logFile = path.join(__dirname, 'logs', `session-${new Date().toISOString().replaceAll(':', '-')}.jsonl`);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  hookAppBarWindowGeometryEvents();

  operatorWindow.on('close', (event) => {
    if (allowOperatorWindowClose) return;
    event.preventDefault();
    void requestSafeShutdown('operator-window-close');
  });
  operatorWindow.loadFile(path.join(__dirname, 'index.html')).catch((error) => {
    record('operator-window-load-error', { message: error.message });
    void requestSafeShutdown('operator-window-load-error');
  });
  operatorWindow.once('ready-to-show', () => {
    operatorWindow.show();
    const snapshot = currentSnapshot('startup-baseline');
    startupWorkArea = snapshot.workArea;
    positionDiagnosticSnapshot('startup-baseline');
    record('environment', {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      windows: os.version(),
      platform: process.platform,
      arch: process.arch,
      monitorCount,
      dpi: windowDpi,
      appBarWindowCreated: Boolean(appBarWindow && !appBarWindow.isDestroyed()),
      operatorWindowCreated: Boolean(operatorWindow && !operatorWindow.isDestroyed()),
    });
    transition(STATE.UNREGISTERED, { startupMeasurementCaptured: true });
  });
}

ipcMain.handle('spike:state', () => stateSnapshot());
ipcMain.handle('spike:measure', () => startOperation('measure', () => currentSnapshot('manual-measurement')));
ipcMain.handle('spike:register', () => startOperation('register', registerAppBarInternal));
ipcMain.handle('spike:set-height', (_event, height) => startOperation(
  'update-height',
  () => setReservationHeightInternal(height),
));
ipcMain.handle('spike:remove', () => startOperation('remove', removeAppBarInternal));
ipcMain.on('spike:close', () => { void requestSafeShutdown('operator-safe-close-button'); });

app.whenReady().then(createWindows).catch((error) => {
  record('startup-error', { message: error.message });
  process.exitCode = 1;
  void requestSafeShutdown('startup-error');
});

app.on('before-quit', (event) => {
  if (allowAppQuit) return;
  event.preventDefault();
  void requestSafeShutdown('application-before-quit');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && allowAppQuit) app.quit();
});

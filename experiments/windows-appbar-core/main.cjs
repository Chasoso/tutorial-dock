const {
  SWP_NOACTIVATE,
  SWP_NOZORDER,
  SWP_SHOWWINDOW,
  resolvePositionVariant,
} = require('./position-variant.cjs');
const positionVariantEnv = process.env.TUTORIAL_DOCK_SPIKE_POSITION_VARIANT;
const positionVariant = resolvePositionVariant(positionVariantEnv);
const { resolveShowInactiveMode } = require('./show-inactive-mode.cjs');
const showInactiveModeEnv = process.env.TUTORIAL_DOCK_SPIKE_SHOW_INACTIVE;
const showInactiveMode = resolveShowInactiveMode(showInactiveModeEnv, positionVariant.name);

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const koffi = require('koffi');
const { createBoundedDiagnosticQueue } = require('./deferred-diagnostic-queue.cjs');
const {
  WM_SETTINGCHANGE,
  WM_WINDOWPOSCHANGING,
  WM_WINDOWPOSCHANGED,
  describePositionMessage,
  positionMessageName,
  readUnsignedMessageValue,
} = require('./position-message.cjs');

const APPBAR = Object.freeze({
  NEW: 0x00000000,
  REMOVE: 0x00000001,
  QUERYPOS: 0x00000002,
  SETPOS: 0x00000003,
  WINDOWPOSCHANGED: 0x00000009,
  TOP: 1,
  MONITOR_DEFAULTTOPRIMARY: 1,
  SWP_NOZORDER,
  SWP_NOACTIVATE,
  SWP_SHOWWINDOW,
});
const ABN_POSCHANGED = 0x00000001;
const POSITION_DIAGNOSTIC_MESSAGES = Object.freeze([
  WM_SETTINGCHANGE,
  WM_WINDOWPOSCHANGING,
  WM_WINDOWPOSCHANGED,
]);
const SM_CMONITORS = 80;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const SHOW_SETTLED_DIAGNOSTIC_DELAY_MS = 250;
const DEFERRED_DIAGNOSTIC_MIN_INTERVAL_MS = 100;
const DEFERRED_DIAGNOSTIC_QUEUE_LIMIT = 8;
const DEFERRED_DIAGNOSTIC_BATCH_SIZE = 2;

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
let pendingReleaseNotificationFailure = null;
let dwmGetWindowAttribute;
let dwmBindingFailure = null;
const deferredPositionDiagnostics = createBoundedDiagnosticQueue(DEFERRED_DIAGNOSTIC_QUEUE_LIMIT);
let deferredDiagnosticImmediate = null;
let deferredDiagnosticTimer = null;
let showSettledDiagnosticTimer = null;
let lastDeferredDiagnosticBatchAt = 0;
let diagnosticEventSequence = 0;
let diagnosticCallbackFailureCount = 0;
let diagnosticEventsSuppressedAfterStop = 0;
let deferredDiagnosticsStopped = false;
let stoppedDiagnosticSummary = null;

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

function announceState({ recordErrors = true } = {}) {
  try {
    if (operatorWindow && !operatorWindow.isDestroyed()) {
      operatorWindow.webContents.send('spike:state', stateSnapshot());
    }
    return null;
  } catch (error) {
    if (recordErrors) record('state-notification-failed', { message: error.message });
    return { message: error.message };
  }
}

function transition(nextState, details = {}, { deferRecord = false } = {}) {
  const previous = appBarState;
  appBarState = nextState;
  const stateChange = {
    previous,
    state: nextState,
    ...details,
    ...(deferRecord ? { transitionObservedAt: new Date().toISOString() } : {}),
  };
  if (!deferRecord) record('appbar-state', stateChange);
  const notificationFailure = announceState({ recordErrors: !deferRecord });
  if (deferRecord && notificationFailure) {
    stateChange.stateNotificationFailure = notificationFailure.message;
  }
  return deferRecord ? stateChange : null;
}

function recordDeferredStateChange(stateChange) {
  if (!stateChange) return;
  record('appbar-state', {
    ...stateChange,
    recordMode: 'deferred-until-release-checks-complete',
  });
}

function deferReleaseStateNotificationFailure(error, source) {
  if (!error) return;
  pendingReleaseNotificationFailure = {
    source,
    failureCount: Math.min((pendingReleaseNotificationFailure?.failureCount ?? 0) + 1, Number.MAX_SAFE_INTEGER),
    latestMessage: error.message,
    latestObservedAt: new Date().toISOString(),
  };
}

function recordPendingReleaseStateNotificationFailure() {
  if (!pendingReleaseNotificationFailure) return;
  record('state-notification-failed', pendingReleaseNotificationFailure);
  pendingReleaseNotificationFailure = null;
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
  const isReleaseOperation = name === 'remove' || name === 'remove-for-shutdown';
  const notificationFailure = announceState({ recordErrors: !isReleaseOperation });
  if (isReleaseOperation) deferReleaseStateNotificationFailure(notificationFailure, `start-operation:${name}`);
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

function positionDiagnosticSnapshot(label, details = {}, capture = {}) {
  try {
    const monitor = diagnosticRead(() => monitorInfo());
    const measurements = {
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
    };
    const measurementCapturedAt = new Date().toISOString();
    record('position-diagnostic', {
      label,
      positionVariant: positionVariant.name,
      setWindowPosFlags: positionVariant.flags,
      setWindowPosFlagsHex: positionVariant.flagsHex,
      setWindowPosFlagNames: positionVariant.flagNames,
      ...capture,
      captureMode: capture.captureMode ?? 'synchronous',
      measurementCapturedAt,
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
      measurements,
    });
  } catch (error) {
    record('position-diagnostic-capture-error', {
      label,
      ...capture,
      captureMode: capture.captureMode ?? 'synchronous',
      captureFailedAt: new Date().toISOString(),
      reason: diagnosticErrorText(error),
      note: 'Diagnostic capture failed; AppBar operation flow continues without this sample.',
    });
  }
}

function copyMessageParameter(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value.subarray(0, 16));
  if (typeof value === 'string') return value.slice(0, 128);
  if (value === null || ['number', 'bigint', 'boolean'].includes(typeof value)) return value;
  return null;
}

function formatMessageParameter(value) {
  if (Buffer.isBuffer(value)) return value.toString('hex');
  return value === null ? null : String(value);
}

function scheduleDeferredDiagnosticFlush(delayMs = 0) {
  if (deferredDiagnosticsStopped || shutdownRequested || deferredDiagnosticImmediate || deferredDiagnosticTimer) return;
  const flush = () => {
    deferredDiagnosticImmediate = null;
    deferredDiagnosticTimer = null;
    flushDeferredPositionDiagnostics();
  };
  if (delayMs > 0) {
    deferredDiagnosticTimer = setTimeout(flush, delayMs);
  } else {
    deferredDiagnosticImmediate = setImmediate(flush);
  }
}

function suppressDiagnosticEventIfStopped() {
  if (!deferredDiagnosticsStopped && !shutdownRequested) return false;
  diagnosticEventsSuppressedAfterStop = Math.min(
    diagnosticEventsSuppressedAfterStop + 1,
    Number.MAX_SAFE_INTEGER,
  );
  return true;
}

function enqueueDeferredPositionDiagnostic(label, event) {
  try {
    if (suppressDiagnosticEventIfStopped()) return;
    deferredPositionDiagnostics.enqueue(label, event);
    scheduleDeferredDiagnosticFlush();
  } catch {
    // Native callbacks must not log, measure, or let a diagnostic failure escape.
    diagnosticCallbackFailureCount = Math.min(diagnosticCallbackFailureCount + 1, Number.MAX_SAFE_INTEGER);
  }
}

function deferredCaptureMetadata(entry) {
  const first = entry.first;
  const last = entry.last;
  const win32 = last.kind === 'win32-message';
  return {
    captureMode: 'deferred',
    eventObservedAt: last.observedAt,
    ...(win32 ? { messageObservedAt: last.observedAt } : {}),
    firstObservedAt: first.observedAt,
    lastObservedAt: last.observedAt,
    firstEventSequence: first.sequence,
    lastEventSequence: last.sequence,
    firstAppBarStateAtEvent: first.appBarStateAtEvent,
    lastAppBarStateAtEvent: last.appBarStateAtEvent,
    coalescedCount: entry.coalescedCount,
  };
}

function emitDeferredPositionDiagnostic(entry) {
  const { last } = entry;
  const capture = deferredCaptureMetadata(entry);
  if (last.kind === 'win32-message') {
    const payload = last.payload;
    const common = {
      hwndRole: 'appbar-window',
      message: payload.message,
      wParam: formatMessageParameter(payload.wParam),
      lParam: formatMessageParameter(payload.lParam),
      ...capture,
    };
    if (payload.message === callbackMessage) {
      record('appbar-callback-observed', {
        ...common,
        notification: payload.notification,
        notificationName: payload.notification === ABN_POSCHANGED ? 'ABN_POSCHANGED' : 'other',
        handling: 'logged-only plus deferred read-only position measurement; no ABM_QUERY/SETPOS or relocation is implemented',
      });
      positionDiagnosticSnapshot('win32-message:appbar-callback', {
        message: payload.message,
        notification: payload.notification,
        notificationName: payload.notification === ABN_POSCHANGED ? 'ABN_POSCHANGED' : 'other',
        action: 'deferred read-only measurement only',
      }, capture);
      return;
    }
    const description = describePositionMessage(payload.message, payload.wParamValue);
    const eventName = payload.message === WM_SETTINGCHANGE
      ? 'wm-settingchange-observed'
      : payload.message === WM_WINDOWPOSCHANGING
        ? 'wm-windowposchanging-observed'
        : 'wm-windowposchanged-observed';
    record(eventName, {
      ...common,
      messageName: description.messageName,
      wParamValue: payload.wParamValue,
      ...(description.systemParametersInfoAction !== undefined
        ? {
            systemParametersInfoAction: description.systemParametersInfoAction,
            systemParametersInfoActionName: description.systemParametersInfoActionName,
          }
        : {}),
      lParamHandling: description.lParamHandling,
      handling: 'logged-only plus deferred read-only position measurement; pointed-to data is not dereferenced and no AppBar relocation is performed',
    });
    positionDiagnosticSnapshot('win32-message:' + description.messageName, {
      message: payload.message,
      messageName: description.messageName,
      wParamValue: payload.wParamValue,
      ...(description.systemParametersInfoAction !== undefined
        ? {
            systemParametersInfoAction: description.systemParametersInfoAction,
            systemParametersInfoActionName: description.systemParametersInfoActionName,
          }
        : {}),
      lParamHandling: description.lParamHandling,
      action: 'deferred read-only measurement only',
    }, capture);
    return;
  }

  positionDiagnosticSnapshot(`electron-event:${last.eventName}`, {
    source: 'BrowserWindow event',
    eventName: last.eventName,
    ...capture,
  }, capture);
}

function deferredDiagnosticCaptureAllowed() {
  if (deferredDiagnosticsStopped || shutdownRequested ||
      [STATE.REMOVING, STATE.RELEASED].includes(appBarState)) return false;
  try {
    return Boolean(appBarWindow && !appBarWindow.isDestroyed());
  } catch {
    return false;
  }
}

function flushDeferredPositionDiagnostics() {
  if (!deferredDiagnosticCaptureAllowed()) {
    const discarded = deferredPositionDiagnostics.clear();
    if (deferredDiagnosticsStopped || shutdownRequested || appBarState === STATE.REMOVING) {
      if (stoppedDiagnosticSummary) {
        stoppedDiagnosticSummary.queuedLabelCount += discarded.queuedLabelCount;
        stoppedDiagnosticSummary.queuedEventCount += discarded.queuedEventCount;
        stoppedDiagnosticSummary.overflowDroppedCount += discarded.droppedCount;
      }
    } else if (discarded.queuedLabelCount || discarded.droppedCount || diagnosticEventsSuppressedAfterStop) {
      record('position-diagnostic-queue-discarded', {
        reason: 'capture-unavailable-or-lifecycle-ending',
        queuedLabelCount: discarded.queuedLabelCount,
        queuedEventCount: discarded.queuedEventCount,
        overflowDroppedCount: discarded.droppedCount,
        suppressedAfterStopCount: diagnosticEventsSuppressedAfterStop,
      });
      diagnosticEventsSuppressedAfterStop = 0;
    }
    return;
  }

  const elapsed = Date.now() - lastDeferredDiagnosticBatchAt;
  if (elapsed < DEFERRED_DIAGNOSTIC_MIN_INTERVAL_MS) {
    scheduleDeferredDiagnosticFlush(DEFERRED_DIAGNOSTIC_MIN_INTERVAL_MS - elapsed);
    return;
  }

  const batch = deferredPositionDiagnostics.take(DEFERRED_DIAGNOSTIC_BATCH_SIZE);
  if (batch.droppedCount) {
    record('position-diagnostic-queue-overflow', {
      droppedEventCount: batch.droppedCount,
      queueLimit: DEFERRED_DIAGNOSTIC_QUEUE_LIMIT,
    });
  }
  if (diagnosticCallbackFailureCount) {
    record('position-diagnostic-enqueue-error', { failureCount: diagnosticCallbackFailureCount });
    diagnosticCallbackFailureCount = 0;
  }

  if (batch.entries.length) lastDeferredDiagnosticBatchAt = Date.now();
  for (const entry of batch.entries) {
    if (!deferredDiagnosticCaptureAllowed()) break;
    try {
      emitDeferredPositionDiagnostic(entry);
    } catch (error) {
      record('position-diagnostic-deferred-error', {
        label: entry.key,
        reason: diagnosticErrorText(error),
        ...deferredCaptureMetadata(entry),
        note: 'Deferred diagnostic failed; AppBar operation and release flow remain in control.',
      });
    }
  }
  if (deferredPositionDiagnostics.size) scheduleDeferredDiagnosticFlush(DEFERRED_DIAGNOSTIC_MIN_INTERVAL_MS);
}

function stopDeferredPositionDiagnostics(reason) {
  if (deferredDiagnosticsStopped) return;
  deferredDiagnosticsStopped = true;
  if (deferredDiagnosticImmediate) clearImmediate(deferredDiagnosticImmediate);
  if (deferredDiagnosticTimer) clearTimeout(deferredDiagnosticTimer);
  if (showSettledDiagnosticTimer) clearTimeout(showSettledDiagnosticTimer);
  deferredDiagnosticImmediate = null;
  deferredDiagnosticTimer = null;
  showSettledDiagnosticTimer = null;
  const discarded = deferredPositionDiagnostics.clear();
  stoppedDiagnosticSummary = {
    reason,
    queuedLabelCount: discarded.queuedLabelCount,
    queuedEventCount: discarded.queuedEventCount,
    overflowDroppedCount: discarded.droppedCount,
    suppressedAfterStopCount: diagnosticEventsSuppressedAfterStop,
    enqueueFailureCount: diagnosticCallbackFailureCount,
  };
  diagnosticEventsSuppressedAfterStop = 0;
  diagnosticCallbackFailureCount = 0;
}

function recordStoppedDiagnosticSummary() {
  const pendingSummary = stoppedDiagnosticSummary ?? {
    reason: 'events-suppressed-after-diagnostics-stopped',
    queuedLabelCount: 0,
    queuedEventCount: 0,
    overflowDroppedCount: 0,
    suppressedAfterStopCount: 0,
    enqueueFailureCount: 0,
  };
  const summary = {
    ...pendingSummary,
    suppressedAfterStopCount: Math.min(
      pendingSummary.suppressedAfterStopCount + diagnosticEventsSuppressedAfterStop,
      Number.MAX_SAFE_INTEGER,
    ),
    enqueueFailureCount: Math.min(
      pendingSummary.enqueueFailureCount + diagnosticCallbackFailureCount,
      Number.MAX_SAFE_INTEGER,
    ),
  };
  if (summary.queuedLabelCount || summary.queuedEventCount || summary.overflowDroppedCount ||
      summary.suppressedAfterStopCount || summary.enqueueFailureCount) {
    record('position-diagnostic-queue-stopped', summary);
  }
  stoppedDiagnosticSummary = null;
  diagnosticEventsSuppressedAfterStop = 0;
  diagnosticCallbackFailureCount = 0;
}

function hookAppBarWindowGeometryEvents() {
  for (const eventName of ['show', 'move', 'resize']) {
    appBarWindow.on(eventName, () => {
      if (suppressDiagnosticEventIfStopped()) return;
      enqueueDeferredPositionDiagnostic(`electron-event:${eventName}`, {
        kind: 'electron-window-event',
        eventName,
        observedAt: new Date().toISOString(),
        sequence: ++diagnosticEventSequence,
        appBarStateAtEvent: appBarState,
      });
    });
  }
}

function taskbarBounds() {
  const taskbar = FindWindowW('Shell_TrayWnd', null);
  if (!taskbar) return null;
  return nativeWindowRect(taskbar, 'taskbar');
}

function currentSnapshot(label, { recordMeasurement = true } = {}) {
  const monitor = monitorInfo();
  const appBarRect = nativeWindowRect(appBarHandle, 'AppBar window');
  const operatorRect = nativeWindowRect(operatorHandle, 'operator window');
  const snapshot = {
    label,
    measurementCapturedAt: new Date().toISOString(),
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
  if (recordMeasurement) record('measurement', snapshot);
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

function hookAppBarMessages() {
  if (appBarMessagesHooked) return;
  appBarWindow.hookWindowMessage(callbackMessage, (_event, wParam, lParam) => {
    try {
      if (suppressDiagnosticEventIfStopped()) return;
      const notification = readUnsignedMessageValue(wParam);
      enqueueDeferredPositionDiagnostic('win32-message:appbar-callback', {
        kind: 'win32-message',
        observedAt: new Date().toISOString(),
        sequence: ++diagnosticEventSequence,
        appBarStateAtEvent: appBarState,
        payload: {
          message: callbackMessage,
          notification,
          wParam: copyMessageParameter(wParam),
          lParam: copyMessageParameter(lParam),
        },
      });
    } catch {
      diagnosticCallbackFailureCount = Math.min(diagnosticCallbackFailureCount + 1, Number.MAX_SAFE_INTEGER);
    }
  });
  for (const message of POSITION_DIAGNOSTIC_MESSAGES) {
    appBarWindow.hookWindowMessage(message, (_event, wParam, lParam) => {
      try {
        if (suppressDiagnosticEventIfStopped()) return;
        const copiedWParam = copyMessageParameter(wParam);
        const copiedLParam = copyMessageParameter(lParam);
        const wParamValue = readUnsignedMessageValue(copiedWParam);
        const messageName = positionMessageName(message);
        enqueueDeferredPositionDiagnostic('win32-message:' + messageName, {
          kind: 'win32-message',
          observedAt: new Date().toISOString(),
          sequence: ++diagnosticEventSequence,
          appBarStateAtEvent: appBarState,
          payload: { message, wParamValue, wParam: copiedWParam, lParam: copiedLParam },
        });
      } catch {
        diagnosticCallbackFailureCount = Math.min(diagnosticCallbackFailureCount + 1, Number.MAX_SAFE_INTEGER);
      }
    });
  }
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
      positionVariant: positionVariant.name,
      flags: positionVariant.flags,
      flagsHex: positionVariant.flagsHex,
      flagNames: positionVariant.flagNames,
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
    const showInactiveStep = {
      operation: 'BrowserWindow.showInactive',
      requestedHeight: height,
      setWindowPosRequest,
      showInactiveMode: showInactiveMode.name,
      showInactiveInvoked: showInactiveMode.invoke,
    };
    positionDiagnosticSnapshot('before-showinactive', {
      ...showInactiveStep,
      action: showInactiveMode.invoke ? 'invoke' : 'omitted by experiment mode',
    });
    record('show-inactive-experiment-step', { ...showInactiveStep, phase: 'before-action' });
    if (showInactiveMode.invoke) appBarWindow.showInactive();
    record('show-inactive-experiment-step', {
      ...showInactiveStep,
      phase: 'after-action',
      callReturned: showInactiveMode.invoke ? true : null,
    });
    positionDiagnosticSnapshot('after-showinactive', {
      ...showInactiveStep,
      action: showInactiveMode.invoke ? 'call returned' : 'omitted by experiment mode',
    });
    if (showSettledDiagnosticTimer) clearTimeout(showSettledDiagnosticTimer);
    showSettledDiagnosticTimer = setTimeout(() => {
      showSettledDiagnosticTimer = null;
      if (deferredDiagnosticsStopped || shutdownRequested) return;
      try {
        if (!appBarWindow || appBarWindow.isDestroyed()) return;
      } catch {
        return;
      }
      positionDiagnosticSnapshot('after-show-settled', {
        trigger: showInactiveMode.invoke
          ? 'BrowserWindow.showInactive'
          : 'showInactive omitted by experiment mode',
        showInactiveMode: showInactiveMode.name,
        showInactiveInvoked: showInactiveMode.invoke,
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
  record('appbar-registration-requested', {
    positionVariant: positionVariant.name,
    setWindowPosFlags: positionVariant.flags,
    showInactiveMode: showInactiveMode.name,
    showInactiveInvoked: showInactiveMode.invoke,
  });
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
      positionVariant: positionVariant.name,
      setWindowPosFlags: positionVariant.flags,
      setWindowPosFlagsHex: positionVariant.flagsHex,
      setWindowPosFlagNames: positionVariant.flagNames,
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
    record('ABM_NEW', {
      hwndRole: 'appbar-window',
      returnValue: String(result),
      callbackMessage,
      positionVariant: positionVariant.name,
      setWindowPosFlags: positionVariant.flags,
      setWindowPosFlagsHex: positionVariant.flagsHex,
      setWindowPosFlagNames: positionVariant.flagNames,
    });
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

  stopDeferredPositionDiagnostics('appbar-removal-started');
  const removingStateChange = transition(STATE.REMOVING, {}, { deferRecord: true });
  let removeResult;
  let removeObservedAt;
  try {
    removeResult = SHAppBarMessage(APPBAR.REMOVE, appBarData());
    removeObservedAt = new Date().toISOString();
  } catch (error) {
    const unknownStateChange = transition(
      STATE.UNKNOWN,
      { failedOperation: 'ABM_REMOVE', message: error.message },
      { deferRecord: true },
    );
    recordDeferredStateChange(removingStateChange);
    record('ABM_REMOVE-error', { message: error.message, observedAt: new Date().toISOString() });
    recordDeferredStateChange(unknownStateChange);
    recordPendingReleaseStateNotificationFailure();
    recordStoppedDiagnosticSummary();
    return { ok: false, state: appBarState, message: `ABM_REMOVE threw: ${error.message}` };
  }
  if (removeResult === 0n || removeResult === 0) {
    const unknownStateChange = transition(
      STATE.UNKNOWN,
      { failedOperation: 'ABM_REMOVE', returnValue: String(removeResult) },
      { deferRecord: true },
    );
    recordDeferredStateChange(removingStateChange);
    record('ABM_REMOVE', {
      hwndRole: 'appbar-window',
      returnValue: String(removeResult),
      observedAt: removeObservedAt,
    });
    recordDeferredStateChange(unknownStateChange);
    recordPendingReleaseStateNotificationFailure();
    recordStoppedDiagnosticSummary();
    return { ok: false, state: appBarState, message: 'ABM_REMOVE returned FALSE; release remains unconfirmed' };
  }

  const hideErrors = [];
  try {
    appBarWindow.setAlwaysOnTop(false);
  } catch (error) {
    hideErrors.push({
      step: 'setAlwaysOnTop(false)',
      message: error.message,
      observedAt: new Date().toISOString(),
    });
  }
  try {
    appBarWindow.hide();
  } catch (error) {
    hideErrors.push({ step: 'hide', message: error.message, observedAt: new Date().toISOString() });
  }

  await new Promise((resolve) => setTimeout(resolve, 350));
  let after;
  try {
    after = currentSnapshot('after-removal', { recordMeasurement: false });
  } catch (error) {
    const unknownStateChange = transition(
      STATE.UNKNOWN,
      { failedOperation: 'release-verification', message: error.message },
      { deferRecord: true },
    );
    recordDeferredStateChange(removingStateChange);
    record('ABM_REMOVE', {
      hwndRole: 'appbar-window',
      returnValue: String(removeResult),
      observedAt: removeObservedAt,
    });
    for (const hideError of hideErrors) record('appbar-hide-error', hideError);
    record('release-verification-error', {
      message: error.message,
      observedAt: new Date().toISOString(),
    });
    recordDeferredStateChange(unknownStateChange);
    recordPendingReleaseStateNotificationFailure();
    recordStoppedDiagnosticSummary();
    return {
      ok: false,
      state: appBarState,
      message: `ABM_REMOVE returned TRUE, but work-area verification failed: ${error.message}`,
    };
  }

  const workAreaRestored = sameRect(after.workArea, reservationBaselineWorkArea);
  const appBarHidden = !appBarWindow.isVisible();
  const operatorWindowUnchanged = sameRect(after.operatorWindow, operatorWindowBaseline);
  let finalStateChange;
  if (!workAreaRestored || !appBarHidden || !operatorWindowUnchanged) {
    finalStateChange = transition(
      STATE.UNKNOWN,
      {
        failedOperation: 'release-verification',
        workAreaRestored,
        appBarHidden,
        operatorWindowUnchanged,
      },
      { deferRecord: true },
    );
  } else {
    currentHeight = null;
    finalStateChange = transition(
      STATE.RELEASED,
      { workAreaRestored, appBarHidden, operatorWindowUnchanged },
      { deferRecord: true },
    );
  }

  // Complete release, hide, measurement, and state checks before writing these
  // JSONL entries. observedAt fields retain when each fact was actually captured.
  recordDeferredStateChange(removingStateChange);
  record('ABM_REMOVE', {
    hwndRole: 'appbar-window',
    returnValue: String(removeResult),
    observedAt: removeObservedAt,
  });
  for (const hideError of hideErrors) record('appbar-hide-error', hideError);
  record('measurement', after);
  record('release-verification', {
    verifiedAt: new Date().toISOString(),
    apiAccepted: true,
    reservationBaselineWorkArea,
    finalWorkArea: after.workArea,
    workAreaRestored,
    appBarHidden,
    operatorWindowUnchanged,
  });
  recordDeferredStateChange(finalStateChange);
  recordPendingReleaseStateNotificationFailure();
  recordStoppedDiagnosticSummary();

  if (!workAreaRestored || !appBarHidden || !operatorWindowUnchanged) {
    return {
      ok: false,
      state: appBarState,
      message: 'Release is unconfirmed: inspect the work area and both window bounds; stop further AppBar tests.',
      snapshot: after,
    };
  }

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
  stopDeferredPositionDiagnostics(`safe-shutdown-started:${reason}`);
  deferReleaseStateNotificationFailure(
    announceState({ recordErrors: false }),
    `safe-shutdown-started:${reason}`,
  );

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

    recordStoppedDiagnosticSummary();
    recordPendingReleaseStateNotificationFailure();
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
  record('position-variant-selected', {
    positionVariant: positionVariant.name,
    showInactiveMode: showInactiveMode.name,
    showInactiveSelectionSource: showInactiveMode.selectionSource,
    setWindowPosFlags: positionVariant.flags,
    setWindowPosFlagsHex: positionVariant.flagsHex,
    setWindowPosFlagNames: positionVariant.flagNames,
    selectionSource: positionVariantEnv === undefined ? 'default' : 'environment',
  });
  record('show-inactive-mode-selected', {
    showInactiveMode: showInactiveMode.name,
    invokeShowInactive: showInactiveMode.invoke,
    selectionSource: showInactiveMode.selectionSource,
    positionVariant: positionVariant.name,
  });
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
      positionVariant: positionVariant.name,
      showInactiveMode: showInactiveMode.name,
      showInactiveInvoked: showInactiveMode.invoke,
      setWindowPosFlags: positionVariant.flags,
      setWindowPosFlagsHex: positionVariant.flagsHex,
      setWindowPosFlagNames: positionVariant.flagNames,
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

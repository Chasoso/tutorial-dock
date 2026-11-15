#define _WIN32_WINNT 0x0A00
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX

#include <windows.h>
#include <shellapi.h>

#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <stdlib.h>

namespace {

constexpr wchar_t kAppBarClass[] = L"TutorialDockNativeAppBar";
constexpr wchar_t kOperatorClass[] = L"TutorialDockNativeOperator";
constexpr UINT kAppBarCallback = WM_APP + 0x401;
constexpr UINT kThreadDrain = WM_APP + 0x410;
constexpr UINT kThreadCommand = WM_APP + 0x411;
constexpr UINT kThreadPositionUpdate = WM_APP + 0x412;
constexpr UINT kThreadFullscreen = WM_APP + 0x413;
constexpr UINT kThreadSafeExit = WM_APP + 0x414;
constexpr UINT_PTR kSettleTimer = 0x1601;
constexpr UINT kRequestedHeight = 90;
constexpr UINT kMaxDeferredPositionUpdates = 4;
constexpr size_t kObservationCapacity = 256;
constexpr DWORD kMaxLogBytes = 2 * 1024 * 1024;
constexpr DWORD kMaxLogRecords = 10000;

constexpr int kButtonRegister = 1001;
constexpr int kButtonMeasure = 1002;
constexpr int kButtonRemove = 1003;
constexpr int kButtonExit = 1004;

enum class Lifecycle : uint8_t {
    Unregistered,
    Registering,
    Registered,
    Removing,
    RemovalUnverified,
    Released
};

enum class WindowRole : uint8_t { AppBar = 1, Operator = 2 };
enum class ObservationKind : uint8_t { WindowMessage, ShellCall };

struct Observation {
    uint64_t sequence;
    uint64_t monotonicMs;
    ObservationKind kind;
    WindowRole role;
    UINT message;
    UINT_PTR wParam;
    bool hasWParam;
    UINT shellCall;
    LRESULT shellResult;
};

struct Snapshot {
    bool monitorOk = false;
    bool appBarRectOk = false;
    bool operatorRectOk = false;
    MONITORINFO monitor{sizeof(MONITORINFO)};
    RECT appBarRect{};
    RECT operatorRect{};
    UINT dpi = 0;
    bool appBarVisible = false;
};

HINSTANCE g_instance = nullptr;
DWORD g_uiThreadId = 0;
HWND g_appBar = nullptr;
HWND g_operator = nullptr;
HWND g_status = nullptr;
HWND g_registerButton = nullptr;
HWND g_measureButton = nullptr;
HWND g_removeButton = nullptr;
HWND g_exitButton = nullptr;
HBRUSH g_barBrush = nullptr;

Lifecycle g_lifecycle = Lifecycle::Unregistered;
RECT g_baselineWork{};
RECT g_acceptedRect{};
bool g_baselineCaptured = false;
bool g_registrationAttempted = false;
bool g_removeAttempted = false;
bool g_closeAllowed = false;
bool g_appBarDestroyedUnexpectedly = false;
bool g_operatorDestroyedUnexpectedly = false;
bool g_operatorDestroyCleanupPending = false;
bool g_operatorWarningShown = false;
bool g_positionNotificationInProgress = false;
bool g_positionMessagePending = false;
bool g_drainMessagePending = false;
bool g_fullscreenActive = false;
bool g_loggerHealthy = false;
bool g_inconclusive = false;
HWND g_restoreZOrderAfterFullscreen = nullptr;
UINT g_deferredPositionUpdates = 0;
UINT g_coalescedPositionNotifications = 0;
UINT g_threadPostFailures = 0;
uint64_t g_sequence = 0;
uint64_t g_bytesWritten = 0;
DWORD g_recordsWritten = 0;
DWORD g_logError = ERROR_SUCCESS;
HANDLE g_logFile = INVALID_HANDLE_VALUE;
uint64_t g_settleTimerStarted = 0;
RECT g_removeOperatorRect{};
bool g_removeOperatorRectCaptured = false;

Observation g_observations[kObservationCapacity]{};
size_t g_observationHead = 0;
size_t g_observationCount = 0;
uint64_t g_droppedObservations = 0;

const char* LifecycleNameA(Lifecycle state) {
    switch (state) {
    case Lifecycle::Unregistered: return "unregistered";
    case Lifecycle::Registering: return "registering";
    case Lifecycle::Registered: return "registered";
    case Lifecycle::Removing: return "removing";
    case Lifecycle::RemovalUnverified: return "removal-unverified";
    case Lifecycle::Released: return "released";
    }
    return "unknown";
}

uint64_t UtcFileTime100ns() {
    FILETIME fileTime{};
    GetSystemTimeAsFileTime(&fileTime);
    ULARGE_INTEGER value{};
    value.LowPart = fileTime.dwLowDateTime;
    value.HighPart = fileTime.dwHighDateTime;
    return value.QuadPart;
}

bool WriteRecord(uint64_t sequence, uint64_t monotonicMs, const char* event,
                 const char* fields) {
    if (!g_loggerHealthy || g_logFile == INVALID_HANDLE_VALUE) {
        return false;
    }

    char line[2048]{};
    const int length = _snprintf_s(
        line, sizeof(line), _TRUNCATE,
        "{\"sequence\":%llu,\"utcFileTime100ns\":%llu,\"monotonicMs\":%llu,\"event\":\"%s\"%s%s}\r\n",
        static_cast<unsigned long long>(sequence),
        static_cast<unsigned long long>(UtcFileTime100ns()),
        static_cast<unsigned long long>(monotonicMs), event,
        (fields && fields[0]) ? "," : "",
        (fields && fields[0]) ? fields : "");
    if (length <= 0 || g_recordsWritten >= kMaxLogRecords ||
        g_bytesWritten + static_cast<uint64_t>(length) > kMaxLogBytes) {
        g_logError = ERROR_FILE_TOO_LARGE;
        g_loggerHealthy = false;
        g_inconclusive = true;
        return false;
    }

    DWORD written = 0;
    if (!WriteFile(g_logFile, line, static_cast<DWORD>(length), &written, nullptr) ||
        written != static_cast<DWORD>(length)) {
        g_logError = GetLastError();
        if (g_logError == ERROR_SUCCESS) {
            g_logError = ERROR_WRITE_FAULT;
        }
        g_loggerHealthy = false;
        g_inconclusive = true;
        return false;
    }
    g_bytesWritten += written;
    ++g_recordsWritten;
    return true;
}

bool LogEvent(const char* event, const char* fieldsFormat = nullptr, ...) {
    char fields[1400]{};
    if (fieldsFormat && fieldsFormat[0]) {
        va_list args;
        va_start(args, fieldsFormat);
        const int formatted = _vsnprintf_s(fields, sizeof(fields), _TRUNCATE,
                                           fieldsFormat, args);
        va_end(args);
        if (formatted < 0) {
            g_loggerHealthy = false;
            g_inconclusive = true;
            g_logError = ERROR_INSUFFICIENT_BUFFER;
            return false;
        }
    }
    return WriteRecord(++g_sequence, GetTickCount64(), event, fields);
}

bool OpenLog() {
    wchar_t executable[MAX_PATH]{};
    const DWORD length = GetModuleFileNameW(nullptr, executable, MAX_PATH);
    if (length == 0 || length >= MAX_PATH) {
        g_logError = GetLastError();
        return false;
    }

    wchar_t* separator = wcsrchr(executable, L'\\');
    if (!separator) {
        g_logError = ERROR_PATH_NOT_FOUND;
        return false;
    }
    separator[1] = L'\0';

    wchar_t logDirectory[MAX_PATH]{};
    if (wcscpy_s(logDirectory, _countof(logDirectory), executable) != 0 ||
        wcscat_s(logDirectory, _countof(logDirectory), L"logs") != 0) {
        g_logError = ERROR_INSUFFICIENT_BUFFER;
        return false;
    }
    if (!CreateDirectoryW(logDirectory, nullptr) && GetLastError() != ERROR_ALREADY_EXISTS) {
        g_logError = GetLastError();
        return false;
    }

    SYSTEMTIME now{};
    GetLocalTime(&now);
    for (unsigned suffix = 0; suffix < 10; ++suffix) {
        wchar_t path[MAX_PATH]{};
        const int pathLength = _snwprintf_s(
            path, sizeof(path) / sizeof(path[0]), _TRUNCATE,
            L"%s\\session-%04u%02u%02uT%02u%02u%02u-%03u-%u.jsonl",
            logDirectory, now.wYear, now.wMonth, now.wDay, now.wHour, now.wMinute,
            now.wSecond, now.wMilliseconds, suffix);
        if (pathLength < 0) {
            g_logError = ERROR_INSUFFICIENT_BUFFER;
            return false;
        }
        g_logFile = CreateFileW(path, FILE_APPEND_DATA, FILE_SHARE_READ, nullptr,
                                CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (g_logFile != INVALID_HANDLE_VALUE) {
            g_loggerHealthy = true;
            LogEvent("session-start", "\"processId\":%lu,\"dpiContext\":\"per-monitor-v2\"",
                     GetCurrentProcessId());
            return g_loggerHealthy;
        }
        g_logError = GetLastError();
        if (g_logError != ERROR_FILE_EXISTS && g_logError != ERROR_ALREADY_EXISTS) {
            return false;
        }
    }
    g_logError = ERROR_FILE_EXISTS;
    return false;
}

void CloseLog() {
    if (g_logFile != INVALID_HANDLE_VALUE) {
        FlushFileBuffers(g_logFile);
        CloseHandle(g_logFile);
        g_logFile = INVALID_HANDLE_VALUE;
    }
}

const char* MessageName(UINT message) {
    switch (message) {
    case WM_SETTINGCHANGE: return "WM_SETTINGCHANGE";
    case WM_WINDOWPOSCHANGING: return "WM_WINDOWPOSCHANGING";
    case WM_WINDOWPOSCHANGED: return "WM_WINDOWPOSCHANGED";
    case WM_ACTIVATE: return "WM_ACTIVATE";
    case WM_DISPLAYCHANGE: return "WM_DISPLAYCHANGE";
    case WM_DESTROY: return "WM_DESTROY";
    case kAppBarCallback: return "APPBAR_CALLBACK";
    default: return "OTHER";
    }
}

const char* ShellCallName(UINT call) {
    switch (call) {
    case ABM_ACTIVATE: return "ABM_ACTIVATE";
    case ABM_WINDOWPOSCHANGED: return "ABM_WINDOWPOSCHANGED";
    default: return "UNKNOWN";
    }
}

void RequestObservationDrain() {
    if (g_drainMessagePending) {
        return;
    }
    g_drainMessagePending = true;
    if (!PostThreadMessageW(g_uiThreadId, kThreadDrain, 0, 0)) {
        g_drainMessagePending = false;
        ++g_threadPostFailures;
        g_inconclusive = true;
    }
}

void QueueMessageObservation(WindowRole role, UINT message, WPARAM wParam,
                             bool captureWParam) {
    if (g_observationCount == kObservationCapacity) {
        ++g_droppedObservations;
        g_inconclusive = true;
        return;
    }
    const size_t index = (g_observationHead + g_observationCount) % kObservationCapacity;
    Observation& item = g_observations[index];
    item.sequence = ++g_sequence;
    item.monotonicMs = GetTickCount64();
    item.kind = ObservationKind::WindowMessage;
    item.role = role;
    item.message = message;
    item.wParam = captureWParam ? static_cast<UINT_PTR>(wParam) : 0;
    item.hasWParam = captureWParam;
    item.shellCall = 0;
    item.shellResult = 0;
    ++g_observationCount;
    RequestObservationDrain();
}

void QueueShellCallObservation(UINT call, LRESULT result) {
    if (g_observationCount == kObservationCapacity) {
        ++g_droppedObservations;
        g_inconclusive = true;
        return;
    }
    const size_t index = (g_observationHead + g_observationCount) % kObservationCapacity;
    Observation& item = g_observations[index];
    item.sequence = ++g_sequence;
    item.monotonicMs = GetTickCount64();
    item.kind = ObservationKind::ShellCall;
    item.role = WindowRole::AppBar;
    item.message = 0;
    item.wParam = 0;
    item.hasWParam = false;
    item.shellCall = call;
    item.shellResult = result;
    ++g_observationCount;
    RequestObservationDrain();
}

void DrainObservations() {
    g_drainMessagePending = false;
    while (g_observationCount > 0) {
        const Observation item = g_observations[g_observationHead];
        g_observationHead = (g_observationHead + 1) % kObservationCapacity;
        --g_observationCount;

        if (item.kind == ObservationKind::WindowMessage) {
            char fields[512]{};
            const char* settingAction = item.message == WM_SETTINGCHANGE &&
                                        item.hasWParam && item.wParam == SPI_SETWORKAREA
                ? "SPI_SETWORKAREA" : "other-or-not-applicable";
            _snprintf_s(fields, sizeof(fields), _TRUNCATE,
                        "\"windowRole\":\"%s\",\"messageName\":\"%s\",\"messageId\":%u,\"wParamCaptured\":%s,\"wParam\":%llu,\"settingActionName\":\"%s\",\"lParamRead\":false",
                        item.role == WindowRole::AppBar ? "appbar" : "operator",
                        MessageName(item.message), item.message,
                        item.hasWParam ? "true" : "false",
                        static_cast<unsigned long long>(item.wParam), settingAction);
            WriteRecord(item.sequence, item.monotonicMs, "win32-message-observed", fields);
        } else {
            char fields[256]{};
            _snprintf_s(fields, sizeof(fields), _TRUNCATE,
                        "\"api\":\"%s\",\"returnValue\":%lld",
                        ShellCallName(item.shellCall),
                        static_cast<long long>(item.shellResult));
            WriteRecord(item.sequence, item.monotonicMs, "wndproc-shell-api", fields);
        }
    }

    if (g_droppedObservations > 0 || g_threadPostFailures > 0) {
        const uint64_t dropped = g_droppedObservations;
        const UINT postFailures = g_threadPostFailures;
        g_droppedObservations = 0;
        g_threadPostFailures = 0;
        LogEvent("message-observation-overflow",
                 "\"droppedRecords\":%llu,\"threadPostFailures\":%u,\"interpretation\":\"INCONCLUSIVE\"",
                 static_cast<unsigned long long>(dropped), postFailures);
    }
    if (g_inconclusive) {
        if (g_lifecycle == Lifecycle::RemovalUnverified) {
            SetStatus(L"Removal is unverified and message evidence is incomplete. Keep both windows open and stop.");
        } else if (!g_loggerHealthy) {
            SetStatus(L"JSONL evidence is incomplete. Stop new tests; use Remove and Verify.");
        } else {
            SetStatus(L"Message evidence is incomplete. Stop new tests; use Remove and Verify.");
        }
        RefreshControls();
    }
    if (!g_loggerHealthy && g_lifecycle != Lifecycle::RemovalUnverified) {
        SetStatus(L"JSONL logging failed. Evidence is incomplete; cleanup remains available.");
        RefreshControls();
    }
}

bool EqualRectValue(const RECT& left, const RECT& right) {
    return left.left == right.left && left.top == right.top &&
           left.right == right.right && left.bottom == right.bottom;
}

Snapshot CaptureSnapshot() {
    Snapshot result{};
    HMONITOR monitor = g_operator
        ? MonitorFromWindow(g_operator, MONITOR_DEFAULTTOPRIMARY)
        : MonitorFromPoint(POINT{0, 0}, MONITOR_DEFAULTTOPRIMARY);
    result.monitor.cbSize = sizeof(result.monitor);
    result.monitorOk = monitor && GetMonitorInfoW(monitor, &result.monitor) != FALSE;
    if (g_appBar && IsWindow(g_appBar)) {
        result.appBarRectOk = GetWindowRect(g_appBar, &result.appBarRect) != FALSE;
        result.appBarVisible = IsWindowVisible(g_appBar) != FALSE;
        result.dpi = GetDpiForWindow(g_appBar);
    }
    if (g_operator && IsWindow(g_operator)) {
        result.operatorRectOk = GetWindowRect(g_operator, &result.operatorRect) != FALSE;
        if (result.dpi == 0) {
            result.dpi = GetDpiForWindow(g_operator);
        }
    }
    return result;
}

void LogSnapshot(const char* label) {
    const Snapshot s = CaptureSnapshot();
    const RECT work = s.monitor.rcWork;
    const RECT monitor = s.monitor.rcMonitor;
    const RECT accepted = g_acceptedRect;
    LogEvent("geometry-snapshot",
             "\"label\":\"%s\",\"state\":\"%s\",\"monitorInfoOk\":%s,\"monitorRect\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld},\"workArea\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld},\"appBarRectCaptured\":%s,\"appBarWindowRect\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld},\"appBarVisible\":%s,\"operatorRectCaptured\":%s,\"operatorWindowRect\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld},\"dpi\":%u,\"acceptedRect\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld},\"dwmFrame\":\"not-collected\"",
             label, LifecycleNameA(g_lifecycle), s.monitorOk ? "true" : "false",
             monitor.left, monitor.top, monitor.right, monitor.bottom,
             work.left, work.top, work.right, work.bottom,
             s.appBarRectOk ? "true" : "false", s.appBarRect.left, s.appBarRect.top,
             s.appBarRect.right, s.appBarRect.bottom,
             s.appBarVisible ? "true" : "false",
             s.operatorRectOk ? "true" : "false", s.operatorRect.left,
             s.operatorRect.top, s.operatorRect.right, s.operatorRect.bottom,
             s.dpi, accepted.left, accepted.top, accepted.right, accepted.bottom);
}

void SetStatus(const wchar_t* text) {
    if (g_status && IsWindow(g_status)) {
        SetWindowTextW(g_status, text);
    }
}

void RefreshControls() {
    if (!g_registerButton || !IsWindow(g_registerButton)) {
        return;
    }
    const bool canRegister = g_lifecycle == Lifecycle::Unregistered &&
                             !g_registrationAttempted && !g_removeAttempted &&
                             !g_inconclusive && g_loggerHealthy;
    EnableWindow(g_registerButton, canRegister);
    const bool canMeasure = !g_inconclusive &&
                            g_lifecycle != Lifecycle::Removing &&
                            g_lifecycle != Lifecycle::RemovalUnverified;
    EnableWindow(g_measureButton, canMeasure);
    EnableWindow(g_removeButton, g_lifecycle == Lifecycle::Registered &&
                                 !g_removeAttempted);
    EnableWindow(g_exitButton, TRUE);
}

BOOL CALLBACK CountMonitor(HMONITOR, HDC, LPRECT, LPARAM countPointer) {
    auto* count = reinterpret_cast<UINT*>(countPointer);
    ++(*count);
    return TRUE;
}

UINT GetMonitorCount() {
    UINT count = 0;
    EnumDisplayMonitors(nullptr, nullptr, CountMonitor,
                        reinterpret_cast<LPARAM>(&count));
    return count;
}

bool CaptureBaseline() {
    const Snapshot s = CaptureSnapshot();
    if (!s.monitorOk) {
        LogEvent("baseline-measurement-failed", "\"win32Error\":%lu", GetLastError());
        return false;
    }
    g_baselineWork = s.monitor.rcWork;
    g_baselineCaptured = true;
    LogSnapshot("before-abm-new-baseline");
    LogEvent("baseline-captured", "\"workAreaTop\":%ld,\"workAreaBottom\":%ld",
             g_baselineWork.top, g_baselineWork.bottom);
    return true;
}

bool MeetsRuntimeGate() {
    const UINT monitorCount = GetMonitorCount();
    const UINT dpi = g_operator ? GetDpiForWindow(g_operator) : 0;
    const Snapshot snapshot = CaptureSnapshot();
    LogEvent("registration-preconditions",
             "\"monitorCount\":%u,\"dpi\":%u,\"monitorInfoOk\":%s,\"singleMonitor96Dpi\":%s,\"taskbarLayout\":\"human-confirmed-only\"",
             monitorCount, dpi, snapshot.monitorOk ? "true" : "false",
             (monitorCount == 1 && dpi == 96 && snapshot.monitorOk) ? "true" : "false");
    return monitorCount == 1 && dpi == 96 && snapshot.monitorOk;
}

APPBARDATA MakeAppBarData() {
    APPBARDATA data{};
    data.cbSize = sizeof(data);
    data.hWnd = g_appBar;
    data.uCallbackMessage = kAppBarCallback;
    data.uEdge = ABE_TOP;
    return data;
}

void RemoveAndVerify();

bool QuerySetMove(const char* reason, bool showAfterPosition) {
    if (g_lifecycle != Lifecycle::Registered || !g_appBar || !IsWindow(g_appBar)) {
        LogEvent("position-update-refused", "\"reason\":\"not-registered-or-invalid-window\"");
        return false;
    }
    const Snapshot before = CaptureSnapshot();
    if (!before.monitorOk) {
        LogEvent("position-update-failed", "\"reason\":\"monitor-info-unavailable\",\"reasonTag\":\"%s\"", reason);
        return false;
    }
    const LONG height = static_cast<LONG>(g_acceptedRect.bottom - g_acceptedRect.top);
    const LONG desiredHeight = height > 0 ? height : static_cast<LONG>(kRequestedHeight);
    APPBARDATA data = MakeAppBarData();
    data.rc = before.monitor.rcMonitor;
    data.rc.bottom = data.rc.top + desiredHeight;
    if (!LogEvent("ABM_QUERYPOS-before",
             "\"reason\":\"%s\",\"proposedRect\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld}",
             reason, data.rc.left, data.rc.top, data.rc.right, data.rc.bottom)) {
        return false;
    }
    const LRESULT queryResult = SHAppBarMessage(ABM_QUERYPOS, &data);
    const RECT queried = data.rc;
    LogEvent("ABM_QUERYPOS-after",
             "\"reason\":\"%s\",\"returnValue\":%lld,\"queriedRect\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld}",
             reason, static_cast<long long>(queryResult), queried.left, queried.top,
             queried.right, queried.bottom);
    if (!queryResult) {
        return false;
    }
    if (!g_loggerHealthy || g_inconclusive) {
        return false;
    }

    // The Shell may adjust the edge position. Preserve only the requested top-edge thickness.
    if (data.rc.bottom - data.rc.top != desiredHeight) {
        data.rc.bottom = data.rc.top + desiredHeight;
    }
    if (!LogEvent("ABM_SETPOS-before",
             "\"reason\":\"%s\",\"rect\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld}",
             reason, data.rc.left, data.rc.top, data.rc.right, data.rc.bottom)) {
        return false;
    }
    const LRESULT setResult = SHAppBarMessage(ABM_SETPOS, &data);
    g_acceptedRect = data.rc;
    LogEvent("ABM_SETPOS-after",
             "\"reason\":\"%s\",\"returnValue\":%lld,\"acceptedRect\":{\"left\":%ld,\"top\":%ld,\"right\":%ld,\"bottom\":%ld}",
             reason, static_cast<long long>(setResult), data.rc.left, data.rc.top,
             data.rc.right, data.rc.bottom);
    if (!setResult || data.rc.right <= data.rc.left || data.rc.bottom <= data.rc.top) {
        return false;
    }
    if (!g_loggerHealthy || g_inconclusive) {
        return false;
    }

    if (!LogEvent("MoveWindow-before", "\"reason\":\"%s\",\"x\":%ld,\"y\":%ld,\"width\":%ld,\"height\":%ld",
                  reason, data.rc.left, data.rc.top, data.rc.right - data.rc.left,
                  data.rc.bottom - data.rc.top)) {
        return false;
    }
    SetLastError(ERROR_SUCCESS);
    const BOOL moved = MoveWindow(g_appBar, data.rc.left, data.rc.top,
                                  data.rc.right - data.rc.left,
                                  data.rc.bottom - data.rc.top, TRUE);
    const DWORD moveError = moved ? ERROR_SUCCESS : GetLastError();
    LogEvent("MoveWindow-after", "\"reason\":\"%s\",\"returnValue\":%s,\"win32Error\":%lu",
             reason, moved ? "true" : "false", moveError);
    if (!moved) {
        return false;
    }
    LogSnapshot("after-movewindow-immediate");
    if (!g_loggerHealthy || g_inconclusive) {
        return false;
    }

    if (showAfterPosition) {
        ShowWindow(g_appBar, SW_SHOWNOACTIVATE);
        UpdateWindow(g_appBar);
        LogEvent("appbar-show-requested", "\"visibleAfterShow\":%s",
                 IsWindowVisible(g_appBar) ? "true" : "false");
        LogSnapshot("after-show-immediate");
        const UINT_PTR timer = SetTimer(g_operator, kSettleTimer, 250, nullptr);
        g_settleTimerStarted = GetTickCount64();
        LogEvent("settle-measurement-scheduled",
                 "\"requestedDelayMs\":250,\"timerCreated\":%s",
                 timer ? "true" : "false");
        if (!timer) {
            g_inconclusive = true;
            SetStatus(L"The +250 ms measurement could not be scheduled. Stop and use Remove and Verify.");
            RefreshControls();
            return false;
        }
        if (!g_loggerHealthy || g_inconclusive) {
            return false;
        }
    } else {
        LogSnapshot("after-shell-position-update");
    }
    return true;
}

void HideAppBarAndVerify() {
    ShowWindow(g_appBar, SW_HIDE);
    const bool hidden = !IsWindowVisible(g_appBar);
    const Snapshot after = CaptureSnapshot();
    const bool workAreaRestored = g_baselineCaptured && after.monitorOk &&
                                  EqualRectValue(after.monitor.rcWork, g_baselineWork);
    const bool operatorUnchanged = g_removeOperatorRectCaptured && after.operatorRectOk &&
                                   EqualRectValue(after.operatorRect, g_removeOperatorRect);
    LogEvent("release-verification",
             "\"apiAccepted\":true,\"workAreaRestored\":%s,\"appBarHidden\":%s,\"operatorWindowUnchanged\":%s",
             workAreaRestored ? "true" : "false", hidden ? "true" : "false",
             operatorUnchanged ? "true" : "false");
    if (workAreaRestored && hidden && operatorUnchanged) {
        g_lifecycle = Lifecycle::Released;
        LogEvent("state-transition", "\"state\":\"released\"");
        SetStatus(g_loggerHealthy
            ? L"Released and verified. Safe Exit is available."
            : L"Released and verified; logging failed. Evidence is incomplete.");
    } else {
        g_lifecycle = Lifecycle::RemovalUnverified;
        LogEvent("state-transition", "\"state\":\"removal-unverified\"");
        SetStatus(L"Removal is not fully verified. Stop; keep both windows open and request human help.");
    }
    LogSnapshot("after-release-verification");
    RefreshControls();
}

void RemoveAndVerify() {
    if (g_lifecycle != Lifecycle::Registered || g_removeAttempted) {
        LogEvent("remove-refused", "\"state\":\"%s\",\"alreadyAttempted\":%s",
                 LifecycleNameA(g_lifecycle), g_removeAttempted ? "true" : "false");
        SetStatus(L"Remove is not available in this state. Do not retry automatically.");
        RefreshControls();
        return;
    }
    const Snapshot before = CaptureSnapshot();
    g_removeOperatorRectCaptured = before.operatorRectOk;
    g_removeOperatorRect = before.operatorRect;
    g_lifecycle = Lifecycle::Removing;
    g_removeAttempted = true;
    LogEvent("state-transition", "\"state\":\"removing\"");
    LogSnapshot("before-remove");

    APPBARDATA data = MakeAppBarData();
    const LRESULT removeResult = SHAppBarMessage(ABM_REMOVE, &data);
    g_lifecycle = Lifecycle::RemovalUnverified;
    LogEvent("ABM_REMOVE", "\"returnValue\":%lld", static_cast<long long>(removeResult));
    LogSnapshot("after-remove-before-verification");

    const Snapshot after = CaptureSnapshot();
    const bool workAreaRestored = g_baselineCaptured && after.monitorOk &&
                                  EqualRectValue(after.monitor.rcWork, g_baselineWork);
    if (removeResult && workAreaRestored) {
        HideAppBarAndVerify();
    } else {
        LogEvent("release-verification",
                 "\"apiAccepted\":%s,\"workAreaRestored\":%s,\"appBarHidden\":false,\"operatorWindowUnchanged\":%s",
                 removeResult ? "true" : "false", workAreaRestored ? "true" : "false",
                 (g_removeOperatorRectCaptured && after.operatorRectOk &&
                  EqualRectValue(after.operatorRect, g_removeOperatorRect)) ? "true" : "false");
        SetStatus(L"Removal is unverified. Stop; do not close or start another test.");
        RefreshControls();
    }
}

void RegisterAppBar() {
    DrainObservations();
    if (g_lifecycle != Lifecycle::Unregistered || g_registrationAttempted ||
        g_removeAttempted || g_inconclusive) {
        SetStatus(L"Registration is unavailable in this state.");
        return;
    }
    if (!g_loggerHealthy) {
        SetStatus(L"JSONL logging is unavailable. Registration is disabled; Safe Exit remains available.");
        return;
    }
    if (!MeetsRuntimeGate()) {
        SetStatus(L"Requires one monitor at 96 DPI. Do not change system settings for this run.");
        return;
    }
    if (!g_loggerHealthy || g_inconclusive) {
        SetStatus(L"Registration stopped because precondition evidence is incomplete. Safe Exit remains available.");
        RefreshControls();
        return;
    }
    if (!CaptureBaseline()) {
        SetStatus(L"Could not capture the work-area baseline. Registration was not started.");
        return;
    }
    if (!g_loggerHealthy || g_inconclusive) {
        SetStatus(L"Registration stopped because baseline evidence is incomplete. Safe Exit remains available.");
        RefreshControls();
        return;
    }

    g_lifecycle = Lifecycle::Registering;
    g_registrationAttempted = true;
    LogEvent("state-transition", "\"state\":\"registering\"");
    LogSnapshot("before-abm-new");
    if (!g_loggerHealthy || g_inconclusive) {
        g_lifecycle = Lifecycle::Unregistered;
        SetStatus(L"Registration stopped because pre-registration evidence is incomplete. No AppBar registration was attempted.");
        RefreshControls();
        return;
    }
    APPBARDATA data = MakeAppBarData();
    const LRESULT newResult = SHAppBarMessage(ABM_NEW, &data);
    LogEvent("ABM_NEW", "\"targetWindow\":\"appbar\",\"returnValue\":%lld",
             static_cast<long long>(newResult));
    if (!newResult) {
        g_lifecycle = Lifecycle::Unregistered;
        LogEvent("state-transition", "\"state\":\"unregistered\"");
        SetStatus(L"ABM_NEW failed. No reservation was started; inspect the log and stop.");
        RefreshControls();
        return;
    }

    g_lifecycle = Lifecycle::Registered;
    LogEvent("state-transition", "\"state\":\"registered\"");
    if (!g_loggerHealthy) {
        SetStatus(L"Logging failed after registration. Attempting one guarded removal.");
        RemoveAndVerify();
        return;
    }
    LogSnapshot("after-abm-new");
    if (!g_loggerHealthy || g_inconclusive) {
        SetStatus(L"Diagnostic recording failed after registration. Attempting one guarded removal.");
        RemoveAndVerify();
        return;
    }
    if (!QuerySetMove("explicit-register", true)) {
        SetStatus(L"Initial AppBar positioning failed. Attempting one guarded removal.");
        RemoveAndVerify();
        return;
    }
    if (g_loggerHealthy) {
        SetStatus(L"Registered. Record the visible position; then use Remove and Verify.");
    } else {
        SetStatus(L"Registered, but logging failed. Stop further tests and use Remove and Verify.");
    }
    RefreshControls();
}

void MeasureWorkArea() {
    DrainObservations();
    if (g_inconclusive || g_lifecycle == Lifecycle::Removing ||
        g_lifecycle == Lifecycle::RemovalUnverified) {
        SetStatus(L"Further measurements are stopped in this state. Removal and Safe Exit remain available.");
        RefreshControls();
        return;
    }
    LogSnapshot("operator-measure-work-area");
    SetStatus(g_loggerHealthy
        ? L"Read-only measurement recorded in JSONL."
        : L"Measurement attempted; JSONL logging failed. Cleanup remains available.");
}

void RequestSafeExit() {
    DrainObservations();
    if (g_lifecycle == Lifecycle::Registered) {
        SetStatus(L"Safe Exit is checking release first.");
        RemoveAndVerify();
    }
    if (g_lifecycle == Lifecycle::Unregistered || g_lifecycle == Lifecycle::Released) {
        if (g_appBarDestroyedUnexpectedly) {
            SetStatus(L"AppBar window was destroyed unexpectedly. Exit is blocked for human review.");
            return;
        }
        LogEvent("safe-shutdown-confirmed", "\"state\":\"%s\"",
                 LifecycleNameA(g_lifecycle));
        DrainObservations();
        g_closeAllowed = true;
        if (g_appBar && IsWindow(g_appBar)) {
            DestroyWindow(g_appBar);
            g_appBar = nullptr;
        }
        if (g_operator && IsWindow(g_operator)) {
            DestroyWindow(g_operator);
            g_operator = nullptr;
        }
        return;
    }
    SetStatus(L"Safe Exit is blocked because release is unverified. Keep both windows open and stop.");
    RefreshControls();
    if (g_operatorDestroyedUnexpectedly && !g_operatorWarningShown) {
        g_operatorWarningShown = true;
        MessageBoxW(nullptr,
                    L"The operator window was destroyed unexpectedly and release is not verified. The process will remain open. Do not force-close it or start another AppBar test; request human help.",
                    L"Native AppBar release requires human attention",
                    MB_OK | MB_ICONERROR | MB_SETFOREGROUND);
    }
}

void HandlePendingOperatorDestroy() {
    if (!g_operatorDestroyCleanupPending) {
        return;
    }
    g_operatorDestroyCleanupPending = false;
    RequestSafeExit();
}

bool PostUiThreadMessage(UINT message, WPARAM wParam = 0, LPARAM lParam = 0) {
    if (PostThreadMessageW(g_uiThreadId, message, wParam, lParam)) {
        return true;
    }
    ++g_threadPostFailures;
    return false;
}

void SchedulePositionUpdate() {
    if (g_positionMessagePending) {
        if (g_coalescedPositionNotifications < 65535) {
            ++g_coalescedPositionNotifications;
        } else {
            g_inconclusive = true;
        }
        return;
    }
    g_positionMessagePending = true;
    if (!PostUiThreadMessage(kThreadPositionUpdate)) {
        g_positionMessagePending = false;
        g_inconclusive = true;
    }
}

void HandlePositionUpdate() {
    g_positionMessagePending = false;
    if (g_lifecycle != Lifecycle::Registered) {
        LogEvent("ABN_POSCHANGED-ignored", "\"state\":\"%s\"", LifecycleNameA(g_lifecycle));
        return;
    }
    if (g_inconclusive || !g_loggerHealthy) {
        SetStatus(L"Position diagnostics are incomplete. Stop updates and use Remove and Verify.");
        RefreshControls();
        return;
    }
    LogEvent("ABN_POSCHANGED-deferred", "\"coalescedNotifications\":%u",
             g_coalescedPositionNotifications);
    g_coalescedPositionNotifications = 0;
    if (g_deferredPositionUpdates >= kMaxDeferredPositionUpdates) {
        g_inconclusive = true;
        LogEvent("ABN_POSCHANGED-update-cap-reached",
                 "\"maximumUpdates\":%u,\"interpretation\":\"INCONCLUSIVE\"",
                 kMaxDeferredPositionUpdates);
        SetStatus(L"AppBar position notifications exceeded the safety limit. Stop and remove once.");
        RefreshControls();
        return;
    }
    ++g_deferredPositionUpdates;
    if (!QuerySetMove("ABN_POSCHANGED", false)) {
        g_inconclusive = true;
        LogEvent("ABN_POSCHANGED-update-failed", "\"updateNumber\":%u",
                 g_deferredPositionUpdates);
        SetStatus(L"Shell position update failed. Stop; use Remove and Verify.");
        RefreshControls();
    }
}

void HandleFullscreenNotification(bool opening) {
    if (g_lifecycle != Lifecycle::Registered || !g_appBar || !IsWindow(g_appBar)) {
        LogEvent("ABN_FULLSCREENAPP-ignored", "\"opening\":%s,\"state\":\"%s\"",
                 opening ? "true" : "false", LifecycleNameA(g_lifecycle));
        return;
    }
    if (opening && !g_fullscreenActive) {
        g_restoreZOrderAfterFullscreen = GetWindow(g_appBar, GW_HWNDPREV);
        SetLastError(ERROR_SUCCESS);
        const BOOL moved = SetWindowPos(g_appBar, HWND_BOTTOM, 0, 0, 0, 0,
                                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE |
                                        SWP_NOOWNERZORDER);
        LogEvent("ABN_FULLSCREENAPP-zorder", "\"opening\":true,\"returnValue\":%s,\"win32Error\":%lu",
                 moved ? "true" : "false", moved ? ERROR_SUCCESS : GetLastError());
        g_fullscreenActive = true;
    } else if (!opening && g_fullscreenActive) {
        HWND insertAfter = IsWindow(g_restoreZOrderAfterFullscreen)
            ? g_restoreZOrderAfterFullscreen : HWND_TOP;
        SetLastError(ERROR_SUCCESS);
        const BOOL moved = SetWindowPos(g_appBar, insertAfter, 0, 0, 0, 0,
                                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE |
                                        SWP_NOOWNERZORDER);
        LogEvent("ABN_FULLSCREENAPP-zorder", "\"opening\":false,\"restoreTargetValid\":%s,\"returnValue\":%s,\"win32Error\":%lu",
                 IsWindow(g_restoreZOrderAfterFullscreen) ? "true" : "false",
                 moved ? "true" : "false", moved ? ERROR_SUCCESS : GetLastError());
        g_restoreZOrderAfterFullscreen = nullptr;
        g_fullscreenActive = false;
    }
}

void CreateOperatorControls(HWND window) {
    CreateWindowExW(0, L"STATIC", L"Pure Win32 AppBar baseline (90 physical px)",
                    WS_CHILD | WS_VISIBLE, 18, 16, 500, 24, window, nullptr,
                    g_instance, nullptr);
    g_registerButton = CreateWindowExW(0, L"BUTTON", L"Register 90 px top AppBar",
                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON, 18, 52, 240, 34,
                    window, reinterpret_cast<HMENU>(kButtonRegister), g_instance, nullptr);
    g_measureButton = CreateWindowExW(0, L"BUTTON", L"Measure work area",
                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON, 270, 52, 170, 34,
                    window, reinterpret_cast<HMENU>(kButtonMeasure), g_instance, nullptr);
    g_removeButton = CreateWindowExW(0, L"BUTTON", L"Remove and Verify",
                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON, 18, 96, 200, 34,
                    window, reinterpret_cast<HMENU>(kButtonRemove), g_instance, nullptr);
    g_exitButton = CreateWindowExW(0, L"BUTTON", L"Safe Exit",
                    WS_CHILD | WS_VISIBLE | BS_PUSHBUTTON, 230, 96, 120, 34,
                    window, reinterpret_cast<HMENU>(kButtonExit), g_instance, nullptr);
    g_status = CreateWindowExW(0, L"STATIC", L"Starting unregistered. Registration requires the button.",
                    WS_CHILD | WS_VISIBLE, 18, 148, 500, 64, window, nullptr,
                    g_instance, nullptr);
    RefreshControls();
}

LRESULT CALLBACK AppBarWindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_SETTINGCHANGE:
        QueueMessageObservation(WindowRole::AppBar, message, wParam, true);
        break;
    case WM_WINDOWPOSCHANGING:
        // lParam is a WINDOWPOS pointer. It is intentionally never dereferenced or retained.
        QueueMessageObservation(WindowRole::AppBar, message, wParam, false);
        break;
    case WM_WINDOWPOSCHANGED:
        // lParam is a WINDOWPOS pointer. Preserve default processing and notify the Shell once.
        QueueMessageObservation(WindowRole::AppBar, message, wParam, false);
        if (g_lifecycle == Lifecycle::Registered && !g_positionNotificationInProgress) {
            g_positionNotificationInProgress = true;
            APPBARDATA data = MakeAppBarData();
            const LRESULT result = SHAppBarMessage(ABM_WINDOWPOSCHANGED, &data);
            g_positionNotificationInProgress = false;
            QueueShellCallObservation(ABM_WINDOWPOSCHANGED, result);
        }
        break;
    case WM_ACTIVATE:
        QueueMessageObservation(WindowRole::AppBar, message, wParam, true);
        if (g_lifecycle == Lifecycle::Registered) {
            APPBARDATA data = MakeAppBarData();
            data.lParam = LOWORD(wParam) == WA_INACTIVE ? FALSE : TRUE;
            const LRESULT result = SHAppBarMessage(ABM_ACTIVATE, &data);
            QueueShellCallObservation(ABM_ACTIVATE, result);
        }
        break;
    case kAppBarCallback:
        QueueMessageObservation(WindowRole::AppBar, message, wParam, true);
        if (g_lifecycle == Lifecycle::Registered && wParam == ABN_POSCHANGED) {
            SchedulePositionUpdate();
        } else if (g_lifecycle == Lifecycle::Registered && wParam == ABN_FULLSCREENAPP) {
            // For ABN_FULLSCREENAPP, lParam is the documented BOOL state, not a pointer.
            PostUiThreadMessage(kThreadFullscreen, lParam ? TRUE : FALSE);
        }
        return DefWindowProcW(window, message, wParam, lParam);
    case WM_CLOSE:
        if (g_closeAllowed) {
            return DefWindowProcW(window, message, wParam, lParam);
        }
        PostUiThreadMessage(kThreadSafeExit);
        return 0;
    case WM_DESTROY:
        QueueMessageObservation(WindowRole::AppBar, message, wParam, false);
        if (!g_closeAllowed && g_lifecycle != Lifecycle::Unregistered &&
            g_lifecycle != Lifecycle::Released) {
            g_appBarDestroyedUnexpectedly = true;
            g_lifecycle = Lifecycle::RemovalUnverified;
        }
        break;
    case WM_PAINT: {
        PAINTSTRUCT paint{};
        HDC dc = BeginPaint(window, &paint);
        RECT client{};
        GetClientRect(window, &client);
        FillRect(dc, &client, g_barBrush ? g_barBrush : static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));
        EndPaint(window, &paint);
        return 0;
    }
    case WM_ERASEBKGND:
        return 1;
    }
    return DefWindowProcW(window, message, wParam, lParam);
}

LRESULT CALLBACK OperatorWindowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_CREATE:
        CreateOperatorControls(window);
        return 0;
    case WM_SETTINGCHANGE:
        QueueMessageObservation(WindowRole::Operator, message, wParam, true);
        break;
    case WM_COMMAND: {
        const int command = LOWORD(wParam);
        HWND expectedSource = nullptr;
        switch (command) {
        case kButtonRegister: expectedSource = g_registerButton; break;
        case kButtonMeasure: expectedSource = g_measureButton; break;
        case kButtonRemove: expectedSource = g_removeButton; break;
        case kButtonExit: expectedSource = g_exitButton; break;
        default: break;
        }
        if (expectedSource && HIWORD(wParam) == BN_CLICKED &&
            reinterpret_cast<HWND>(lParam) == expectedSource) {
            PostUiThreadMessage(kThreadCommand, static_cast<WPARAM>(command));
            return 0;
        }
        break;
    }
    case WM_CLOSE:
        if (!g_closeAllowed) {
            PostUiThreadMessage(kThreadSafeExit);
            return 0;
        }
        break;
    case WM_DESTROY:
        if (!g_closeAllowed && g_lifecycle != Lifecycle::Unregistered &&
            g_lifecycle != Lifecycle::Released) {
            QueueMessageObservation(WindowRole::Operator, message, wParam, false);
            g_operatorDestroyedUnexpectedly = true;
            g_operatorDestroyCleanupPending = true;
            g_operator = nullptr;
            return 0;
        }
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(window, message, wParam, lParam);
}

bool RegisterWindowClasses() {
    WNDCLASSEXW appBarClass{sizeof(appBarClass)};
    appBarClass.lpfnWndProc = AppBarWindowProc;
    appBarClass.hInstance = g_instance;
    appBarClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    appBarClass.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    appBarClass.lpszClassName = kAppBarClass;
    if (!RegisterClassExW(&appBarClass)) {
        return false;
    }

    WNDCLASSEXW operatorClass{sizeof(operatorClass)};
    operatorClass.lpfnWndProc = OperatorWindowProc;
    operatorClass.hInstance = g_instance;
    operatorClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    operatorClass.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    operatorClass.lpszClassName = kOperatorClass;
    return RegisterClassExW(&operatorClass) != 0;
}

void HandleOperatorCommand(WPARAM command) {
    DrainObservations();
    switch (command) {
    case kButtonRegister: RegisterAppBar(); break;
    case kButtonMeasure: MeasureWorkArea(); break;
    case kButtonRemove: RemoveAndVerify(); break;
    case kButtonExit: RequestSafeExit(); break;
    default: break;
    }
    RefreshControls();
}

void HandleSettleTimer() {
    KillTimer(g_operator, kSettleTimer);
    const uint64_t elapsed = GetTickCount64() - g_settleTimerStarted;
    LogEvent("settle-measurement-fired", "\"elapsedMs\":%llu",
             static_cast<unsigned long long>(elapsed));
    LogSnapshot("after-250ms");
}

void DispatchUiMessage(MSG& message) {
    if (message.hwnd == nullptr) {
        switch (message.message) {
        case kThreadDrain:
            DrainObservations();
            return;
        case kThreadCommand:
            HandleOperatorCommand(message.wParam);
            return;
        case kThreadPositionUpdate:
            DrainObservations();
            HandlePositionUpdate();
            return;
        case kThreadFullscreen:
            DrainObservations();
            HandleFullscreenNotification(message.wParam != 0);
            return;
        case kThreadSafeExit:
            RequestSafeExit();
            return;
        }
    }
    if (message.hwnd == g_operator && message.message == WM_TIMER &&
        message.wParam == kSettleTimer) {
        HandleSettleTimer();
        return;
    }
    TranslateMessage(&message);
    DispatchMessageW(&message);
}

} // namespace

// The UI message loop handles queued observations and Shell callbacks only after the
// corresponding window procedure has returned. No file I/O or geometry sampling occurs
// in the AppBar WndProc.
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int showCommand) {
    g_instance = instance;
    g_uiThreadId = GetCurrentThreadId();
    MSG bootstrap{};
    PeekMessageW(&bootstrap, nullptr, WM_USER, WM_USER, PM_NOREMOVE);

    if (!SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) {
        MessageBoxW(nullptr, L"Could not set per-monitor DPI awareness. No AppBar was registered.",
                    L"Native AppBar Spike", MB_OK | MB_ICONERROR);
        return 2;
    }

    const bool logOpened = OpenLog();
    if (!RegisterWindowClasses()) {
        LogEvent("startup-failed", "\"stage\":\"RegisterClassEx\",\"win32Error\":%lu",
                 GetLastError());
        CloseLog();
        return 3;
    }
    g_barBrush = CreateSolidBrush(RGB(38, 92, 154));

    // The AppBar HWND is hidden at startup. ABM_NEW is reachable only from an operator command.
    g_appBar = CreateWindowExW(WS_EX_CLIENTEDGE | WS_EX_TOOLWINDOW,
        kAppBarClass, L"Tutorial Dock native AppBar test",
        WS_POPUP | WS_THICKFRAME | WS_CLIPCHILDREN,
        0, 0, 320, static_cast<int>(kRequestedHeight), nullptr, nullptr,
        g_instance, nullptr);
    g_operator = CreateWindowExW(0, kOperatorClass, L"Tutorial Dock AppBar operator",
        WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, 560, 270,
        nullptr, nullptr, g_instance, nullptr);
    if (!g_appBar || !g_operator) {
        LogEvent("startup-failed", "\"stage\":\"CreateWindowEx\",\"win32Error\":%lu",
                 GetLastError());
        g_closeAllowed = true;
        if (g_appBar && IsWindow(g_appBar)) DestroyWindow(g_appBar);
        if (g_operator && IsWindow(g_operator)) DestroyWindow(g_operator);
        if (g_barBrush) DeleteObject(g_barBrush);
        CloseLog();
        return 4;
    }

    ShowWindow(g_operator, showCommand == SW_HIDE ? SW_SHOW : showCommand);
    UpdateWindow(g_operator);
    LogEvent("startup-state", "\"lifecycle\":\"unregistered\",\"automaticRegistration\":false,\"loggerReady\":%s",
             logOpened && g_loggerHealthy ? "true" : "false");
    LogSnapshot("startup-unregistered");
    if (g_loggerHealthy) {
        SetStatus(L"Unregistered. Confirm one monitor at 96 DPI and standard taskbar, then Register.");
    } else {
        wchar_t status[160]{};
        _snwprintf_s(status, _countof(status), _TRUNCATE,
                     L"JSONL log unavailable (error %lu). Registration disabled; Safe Exit is available.",
                     g_logError);
        SetStatus(status);
    }
    RefreshControls();

    MSG message{};
    int getMessageResult = 0;
    bool fallbackPump = false;
    for (;;) {
        if (!fallbackPump) {
            getMessageResult = GetMessageW(&message, nullptr, 0, 0);
            if (getMessageResult == 0) {
                break;
            }
            if (getMessageResult == -1) {
                const DWORD error = GetLastError();
                LogEvent("message-loop-error", "\"win32Error\":%lu", error);
                RequestSafeExit();
                if (g_lifecycle == Lifecycle::Unregistered ||
                    g_lifecycle == Lifecycle::Released) {
                    break;
                }
                fallbackPump = true;
                SetStatus(L"Message retrieval failed. A fallback message pump is keeping the windows available; release remains unverified.");
                LogEvent("fallback-message-pump-entered",
                         "\"lifecycle\":\"%s\"", LifecycleNameA(g_lifecycle));
                continue;
            }
            DispatchUiMessage(message);
            HandlePendingOperatorDestroy();
            continue;
        }

        if (!PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            if (!WaitMessage()) {
                Sleep(100);
            }
            continue;
        }
        if (message.message == WM_QUIT) {
            if (g_lifecycle == Lifecycle::Unregistered ||
                g_lifecycle == Lifecycle::Released) {
                getMessageResult = 0;
                break;
            }
            LogEvent("unsafe-quit-suppressed",
                     "\"lifecycle\":\"%s\"", LifecycleNameA(g_lifecycle));
            continue;
        }
        DispatchUiMessage(message);
        HandlePendingOperatorDestroy();
    }

    DrainObservations();
    const int exitCode = getMessageResult == -1 ? 5 : static_cast<int>(message.wParam);
    LogEvent("process-exit", "\"exitCode\":%d,\"lifecycle\":\"%s\",\"loggerHealthy\":%s",
             exitCode, LifecycleNameA(g_lifecycle), g_loggerHealthy ? "true" : "false");
    CloseLog();
    if (g_barBrush) DeleteObject(g_barBrush);
    return exitCode;
}

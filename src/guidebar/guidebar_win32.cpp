#define _WIN32_WINNT 0x0A00
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shellapi.h>
#include <commctrl.h>

#include "guide_model.h"
#include "reservation_update.h"

#include <algorithm>
#include <string>

namespace {

constexpr wchar_t kWindowClass[] = L"TutorialDockGuideBar";
constexpr UINT kAppBarCallback = WM_APP + 0x51;
constexpr UINT kDeferredPositionUpdate = WM_APP + 0x52;
constexpr int kNormalHeight = 90;
constexpr int kCollapsedHeight = 34;
constexpr unsigned int kMaxPositionUpdatesPerBurst = 4;
constexpr ULONGLONG kPositionBurstMs = 1000;

constexpr int kControlHeader = 1001;
constexpr int kControlDescription = 1002;
constexpr int kControlProgress = 1003;
constexpr int kControlProgressText = 1004;
constexpr int kControlStatus = 1005;
constexpr int kControlDemo = 1006;
constexpr int kControlPrevious = 1007;
constexpr int kControlNext = 1008;
constexpr int kControlSettings = 1009;
constexpr int kControlCollapse = 1010;

constexpr UINT kMenuLoadSample = 2001;
constexpr UINT kMenuReservationStatus = 2002;
constexpr UINT kMenuExit = 2003;

enum class Lifecycle {
    Unregistered,
    Registering,
    Registered,
    Updating,
    ReservationUnverified,
    Removing,
    RemovalUnverified,
    Released,
    Fallback
};

HINSTANCE g_instance = nullptr;
HWND g_window = nullptr;
HWND g_header = nullptr;
HWND g_description = nullptr;
HWND g_progress = nullptr;
HWND g_progressText = nullptr;
HWND g_statusControl = nullptr;
HWND g_demo = nullptr;
HWND g_previous = nullptr;
HWND g_next = nullptr;
HWND g_settings = nullptr;
HWND g_collapse = nullptr;
HBRUSH g_background = nullptr;
HMONITOR g_primaryMonitor = nullptr;
MONITORINFO g_monitorInfo{sizeof(MONITORINFO)};
RECT g_baselineWork{};
RECT g_acceptedRect{};

tutorial_dock::GuideModel g_model;
Lifecycle g_lifecycle = Lifecycle::Unregistered;
std::wstring g_status = L"Starting empty guide bar.";
int g_confirmedHeight = kNormalHeight;
int g_lastRequestedHeight = 0;
LRESULT g_abmNewResult = 0;
LRESULT g_queryPosResult = 0;
LRESULT g_setPosResult = 0;
LRESULT g_removeResult = 0;
BOOL g_moveResult = FALSE;
bool g_baselineCaptured = false;
bool g_mayBeRegistered = false;
bool g_removeAttempted = false;
bool g_destroyAllowed = false;
bool g_positionUpdatePending = false;
bool g_shellPositionNotificationInProgress = false;
bool g_positionUpdateInProgress = false;
ULONGLONG g_positionBurstStarted = 0;
unsigned int g_positionUpdatesInBurst = 0;

const wchar_t* LifecycleText(Lifecycle state) {
    switch (state) {
    case Lifecycle::Unregistered: return L"unregistered";
    case Lifecycle::Registering: return L"registering";
    case Lifecycle::Registered: return L"registered";
    case Lifecycle::Updating: return L"updating";
    case Lifecycle::ReservationUnverified: return L"reservation-unverified";
    case Lifecycle::Removing: return L"removing";
    case Lifecycle::RemovalUnverified: return L"removal-unverified";
    case Lifecycle::Released: return L"released";
    case Lifecycle::Fallback: return L"fallback (no confirmed reservation)";
    }
    return L"unknown";
}

bool RectEqual(const RECT& left, const RECT& right) {
    return left.left == right.left && left.top == right.top &&
           left.right == right.right && left.bottom == right.bottom;
}

std::wstring RectText(const RECT& rect) {
    return L"(" + std::to_wstring(rect.left) + L"," + std::to_wstring(rect.top) +
           L")- (" + std::to_wstring(rect.right) + L"," +
           std::to_wstring(rect.bottom) + L")";
}

void SetStatus(const std::wstring& text) {
    g_status = text;
    if (g_statusControl && IsWindow(g_statusControl)) {
        SetWindowTextW(g_statusControl, g_status.c_str());
    }
}

bool CanUseLessonControls() {
    return g_lifecycle == Lifecycle::Registered || g_lifecycle == Lifecycle::Fallback;
}

void LayoutControls() {
    if (!g_window || !IsWindow(g_window)) {
        return;
    }
    RECT client{};
    if (!GetClientRect(g_window, &client)) {
        return;
    }
    const int width = client.right - client.left;
    const int height = client.bottom - client.top;
    const int rightStart = std::max(16, width - 512);
    const int leftWidth = std::max(180, rightStart - 32);

    if (g_confirmedHeight == kCollapsedHeight) {
        MoveWindow(g_header, 16, 4, leftWidth, std::max(22, height - 8), TRUE);
        ShowWindow(g_description, SW_HIDE);
        ShowWindow(g_progress, SW_HIDE);
        ShowWindow(g_progressText, SW_HIDE);
        ShowWindow(g_statusControl, SW_HIDE);

        int x = rightStart;
        const int y = std::max(2, (height - 26) / 2);
        MoveWindow(g_demo, x, y, 106, 26, TRUE); x += 114;
        MoveWindow(g_previous, x, y, 74, 26, TRUE); x += 82;
        MoveWindow(g_next, x, y, 74, 26, TRUE); x += 82;
        MoveWindow(g_settings, x, y, 92, 26, TRUE); x += 100;
        MoveWindow(g_collapse, x, y, 100, 26, TRUE);
    } else {
        MoveWindow(g_header, 16, 7, leftWidth, 22, TRUE);
        MoveWindow(g_description, 16, 31, leftWidth, 22, TRUE);
        MoveWindow(g_progress, 16, 61, 170, 13, TRUE);
        MoveWindow(g_progressText, 194, 57, 102, 20, TRUE);
        MoveWindow(g_statusControl, 302, 57,
                   std::max(120, rightStart - 318), 20, TRUE);
        ShowWindow(g_description, SW_SHOW);
        ShowWindow(g_progress, SW_SHOW);
        ShowWindow(g_progressText, SW_SHOW);
        ShowWindow(g_statusControl, SW_SHOW);

        int x = rightStart;
        const int y = std::max(4, (height - 32) / 2);
        MoveWindow(g_demo, x, y, 106, 32, TRUE); x += 114;
        MoveWindow(g_previous, x, y, 74, 32, TRUE); x += 82;
        MoveWindow(g_next, x, y, 74, 32, TRUE); x += 82;
        MoveWindow(g_settings, x, y, 92, 32, TRUE); x += 100;
        MoveWindow(g_collapse, x, y, 100, 32, TRUE);
    }
}

void RefreshView() {
    if (!g_window || !IsWindow(g_window)) {
        return;
    }

    const auto* step = g_model.CurrentStep();
    if (!step) {
        SetWindowTextW(g_header, L"Tutorial Dock — No lesson loaded");
        SetWindowTextW(g_description,
                       L"Open Settings and choose Load sample lesson to begin.");
        SetWindowTextW(g_progressText, L"No lesson");
        SendMessageW(g_progress, PBM_SETPOS, 0, 0);
    } else {
        const std::wstring header = L"Step " +
            std::to_wstring(g_model.CurrentIndex() + 1) + L" / " +
            std::to_wstring(g_model.StepCount()) + L" — " + step->title;
        SetWindowTextW(g_header, header.c_str());
        SetWindowTextW(g_description, step->description.c_str());
        const int percent = static_cast<int>(
            ((g_model.CurrentIndex() + 1) * 100) / g_model.StepCount());
        const std::wstring progress =
            std::to_wstring(g_model.CurrentIndex() + 1) + L" / " +
            std::to_wstring(g_model.StepCount()) + L"  (" +
            std::to_wstring(percent) + L"%)";
        SetWindowTextW(g_progressText, progress.c_str());
        SendMessageW(g_progress, PBM_SETPOS, percent, 0);
    }

    SetWindowTextW(g_collapse,
        g_confirmedHeight == kCollapsedHeight ? L"Expand" : L"Collapse");
    LayoutControls();

    const bool canOperate = CanUseLessonControls();
    EnableWindow(g_demo, canOperate && step != nullptr);
    EnableWindow(g_previous, canOperate && g_model.CanGoPrevious());
    EnableWindow(g_next, canOperate && g_model.CanGoNext());
    EnableWindow(g_collapse, g_lifecycle == Lifecycle::Registered);
    EnableWindow(g_settings, TRUE);
}

HWND CreateChild(const wchar_t* className, const wchar_t* text, DWORD style,
                 int controlId) {
    return CreateWindowExW(0, className, text, WS_CHILD | WS_VISIBLE | style,
                           0, 0, 1, 1, g_window,
                           reinterpret_cast<HMENU>(static_cast<INT_PTR>(controlId)),
                           g_instance, nullptr);
}

bool CreateControls() {
    g_header = CreateChild(L"STATIC", L"Tutorial Dock — No lesson loaded",
                           SS_LEFT | SS_CENTERIMAGE, kControlHeader);
    g_description = CreateChild(L"STATIC",
        L"Open Settings and choose Load sample lesson to begin.", SS_LEFT,
        kControlDescription);
    g_progress = CreateChild(PROGRESS_CLASSW, L"", PBS_SMOOTH, kControlProgress);
    g_progressText = CreateChild(L"STATIC", L"No lesson", SS_LEFT,
                                 kControlProgressText);
    g_statusControl = CreateChild(L"STATIC", L"Starting empty guide bar.", SS_LEFT,
                                  kControlStatus);
    g_demo = CreateChild(L"BUTTON", L"Demo action", BS_PUSHBUTTON, kControlDemo);
    g_previous = CreateChild(L"BUTTON", L"Previous", BS_PUSHBUTTON, kControlPrevious);
    g_next = CreateChild(L"BUTTON", L"Next", BS_PUSHBUTTON, kControlNext);
    g_settings = CreateChild(L"BUTTON", L"Settings", BS_PUSHBUTTON, kControlSettings);
    g_collapse = CreateChild(L"BUTTON", L"Collapse", BS_PUSHBUTTON, kControlCollapse);

    return g_header && g_description && g_progress && g_progressText &&
           g_statusControl && g_demo && g_previous && g_next && g_settings &&
           g_collapse;
}

bool ReadMonitorInfo(MONITORINFO& info) {
    info = MONITORINFO{sizeof(MONITORINFO)};
    return g_primaryMonitor && GetMonitorInfoW(g_primaryMonitor, &info) != FALSE;
}

bool CaptureBaseline() {
    POINT origin{0, 0};
    g_primaryMonitor = MonitorFromPoint(origin, MONITOR_DEFAULTTOPRIMARY);
    MONITORINFO info{sizeof(MONITORINFO)};
    if (!ReadMonitorInfo(info)) {
        return false;
    }
    g_monitorInfo = info;
    g_baselineWork = info.rcWork;
    g_baselineCaptured = true;
    return true;
}

APPBARDATA MakeAppBarData() {
    APPBARDATA data{};
    data.cbSize = sizeof(data);
    data.hWnd = g_window;
    data.uCallbackMessage = kAppBarCallback;
    data.uEdge = ABE_TOP;
    return data;
}

bool ApplyAndVerifyHeight(int height) {
    if (!g_mayBeRegistered || !g_window || !IsWindow(g_window) ||
        !g_baselineCaptured) {
        return false;
    }
    g_lastRequestedHeight = height;

    MONITORINFO monitorInfo{sizeof(MONITORINFO)};
    if (!ReadMonitorInfo(monitorInfo)) {
        return false;
    }

    APPBARDATA data = MakeAppBarData();
    data.rc = monitorInfo.rcMonitor;
    data.rc.bottom = data.rc.top + height;
    g_queryPosResult = SHAppBarMessage(ABM_QUERYPOS, &data);
    if (!g_queryPosResult) {
        return false;
    }

    // Retain the shell-proposed top/width and request the selected thickness.
    data.rc.bottom = data.rc.top + height;
    g_setPosResult = SHAppBarMessage(ABM_SETPOS, &data);
    if (!g_setPosResult || data.rc.right <= data.rc.left ||
        data.rc.bottom - data.rc.top != height ||
        data.rc.left != monitorInfo.rcMonitor.left ||
        data.rc.top != monitorInfo.rcMonitor.top ||
        data.rc.right != monitorInfo.rcMonitor.right) {
        return false;
    }
    g_acceptedRect = data.rc;

    g_positionUpdateInProgress = true;
    g_moveResult = MoveWindow(g_window, data.rc.left, data.rc.top,
                              data.rc.right - data.rc.left,
                              data.rc.bottom - data.rc.top, TRUE);
    g_positionUpdateInProgress = false;
    if (!g_moveResult) {
        return false;
    }

    RECT actualWindow{};
    if (!GetWindowRect(g_window, &actualWindow) ||
        !RectEqual(actualWindow, g_acceptedRect)) {
        return false;
    }

    MONITORINFO after{sizeof(MONITORINFO)};
    if (!ReadMonitorInfo(after)) {
        return false;
    }
    RECT expectedWork = g_baselineWork;
    expectedWork.top = g_acceptedRect.bottom;
    return RectEqual(after.rcWork, expectedWork);
}

bool ShowFallback(const std::wstring& reason) {
    g_lifecycle = Lifecycle::Fallback;
    SetStatus(L"AppBar reservation is not confirmed; attempting a topmost fallback. " + reason);
    const int width = g_baselineCaptured
        ? g_monitorInfo.rcMonitor.right - g_monitorInfo.rcMonitor.left
        : GetSystemMetrics(SM_CXSCREEN);
    const int left = g_baselineCaptured ? g_monitorInfo.rcMonitor.left : 0;
    const int top = g_baselineCaptured ? g_monitorInfo.rcMonitor.top : 0;
    const BOOL fallbackPlaced = SetWindowPos(g_window, HWND_TOPMOST, left, top,
        width, kNormalHeight, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    if (!fallbackPlaced) {
        SetStatus(L"AppBar reservation and fallback placement are unconfirmed. " + reason);
    }
    ShowWindow(g_window, SW_SHOWNOACTIVATE);
    RefreshView();
    return IsWindowVisible(g_window) != FALSE;
}

bool RemoveAndVerify();

void RegisterAtStartup() {
    if (!CaptureBaseline()) {
        ShowFallback(L"The primary display work area could not be measured; no AppBar registration was attempted.");
        return;
    }

    g_lifecycle = Lifecycle::Registering;
    APPBARDATA data = MakeAppBarData();
    g_abmNewResult = SHAppBarMessage(ABM_NEW, &data);
    if (!g_abmNewResult) {
        g_lifecycle = Lifecycle::Unregistered;
        ShowFallback(L"ABM_NEW failed.");
        return;
    }

    g_mayBeRegistered = true;
    g_lifecycle = Lifecycle::Registered;
    g_removeAttempted = false;
    g_confirmedHeight = kNormalHeight;
    if (!ApplyAndVerifyHeight(kNormalHeight)) {
        g_lifecycle = Lifecycle::ReservationUnverified;
        SetStatus(L"Initial reservation or geometry could not be confirmed. Attempting one guarded removal.");
        if (RemoveAndVerify()) {
            ShowFallback(L"The initial AppBar setup was not confirmed and has been released.");
        } else {
            SetStatus(L"AppBar state is uncertain. Keep this window open; do not force-close or start another run.");
            ShowWindow(g_window, SW_SHOWNOACTIVATE);
        }
        RefreshView();
        return;
    }

    g_lifecycle = Lifecycle::Registered;
    g_positionUpdatesInBurst = 0;
    g_positionBurstStarted = GetTickCount64();
    SetStatus(L"AppBar registered; work-area and window rectangles are confirmed.");
    ShowWindow(g_window, SW_SHOWNOACTIVATE);
    UpdateWindow(g_window);
    RefreshView();
}

bool RemoveAndVerify() {
    if (!g_mayBeRegistered || !g_window || !IsWindow(g_window) ||
        g_removeAttempted) {
        return false;
    }
    g_removeAttempted = true;
    g_lifecycle = Lifecycle::Removing;

    APPBARDATA data = MakeAppBarData();
    g_removeResult = SHAppBarMessage(ABM_REMOVE, &data);
    g_lifecycle = Lifecycle::RemovalUnverified;

    MONITORINFO after{sizeof(MONITORINFO)};
    const bool workAreaRestored = g_baselineCaptured && ReadMonitorInfo(after) &&
                                  RectEqual(after.rcWork, g_baselineWork);
    if (!g_removeResult || !workAreaRestored) {
        SetStatus(L"AppBar removal is unverified. Keep this window open and request human help.");
        RefreshView();
        return false;
    }

    // Do not destroy the registered HWND until both shell removal and work-area
    // restoration have been observed.
    g_mayBeRegistered = false;
    ShowWindow(g_window, SW_HIDE);
    if (IsWindowVisible(g_window)) {
        g_lifecycle = Lifecycle::RemovalUnverified;
        SetStatus(L"The work area was restored, but hiding the AppBar window was not confirmed. Keep it open.");
        RefreshView();
        return false;
    }

    g_lifecycle = Lifecycle::Released;
    SetStatus(L"AppBar removed and the original work area restored.");
    return true;
}

void RequestSafeExit() {
    if (g_mayBeRegistered) {
        if (!g_removeAttempted) {
            RemoveAndVerify();
        }
        if (g_lifecycle != Lifecycle::Released) {
            SetStatus(L"Safe Exit is blocked because AppBar release is unverified. Keep this window open and request human help.");
            RefreshView();
            return;
        }
    }

    if (g_lifecycle == Lifecycle::Unregistered ||
        g_lifecycle == Lifecycle::Fallback ||
        g_lifecycle == Lifecycle::Released) {
        g_destroyAllowed = true;
        if (g_window && IsWindow(g_window)) {
            DestroyWindow(g_window);
        }
        return;
    }

    SetStatus(L"Safe Exit is blocked while the AppBar state is uncertain. Keep this window open.");
    RefreshView();
}

void ChangeHeight(int requestedHeight) {
    if (g_lifecycle != Lifecycle::Registered || g_positionUpdateInProgress ||
        (requestedHeight != kNormalHeight && requestedHeight != kCollapsedHeight)) {
        return;
    }

    const int previousHeight = g_confirmedHeight;
    g_lifecycle = Lifecycle::Updating;
    g_positionUpdatesInBurst = 0;
    const auto result = tutorial_dock::ApplyReservationUpdateWithRollback(
        previousHeight, requestedHeight,
        [](int height) { return ApplyAndVerifyHeight(height); });

    if (result == tutorial_dock::ReservationUpdateResult::Applied) {
        g_confirmedHeight = requestedHeight;
        g_lifecycle = Lifecycle::Registered;
        SetStatus(L"The new AppBar height and work area are confirmed.");
    } else if (result == tutorial_dock::ReservationUpdateResult::RolledBack) {
        g_confirmedHeight = previousHeight;
        g_lifecycle = Lifecycle::Registered;
        SetStatus(L"The size update failed; the previous confirmed reservation was restored.");
    } else {
        g_lifecycle = Lifecycle::ReservationUnverified;
        SetStatus(L"The size update and rollback are unconfirmed. Stop and use Safe Exit for guarded cleanup.");
    }
    RefreshView();
}

void ScheduleShellPositionUpdate() {
    if (g_lifecycle != Lifecycle::Registered || !g_mayBeRegistered ||
        g_positionUpdatePending) {
        return;
    }

    const ULONGLONG now = GetTickCount64();
    if (now - g_positionBurstStarted > kPositionBurstMs) {
        g_positionBurstStarted = now;
        g_positionUpdatesInBurst = 0;
    }
    if (g_positionUpdatesInBurst >= kMaxPositionUpdatesPerBurst) {
        g_lifecycle = Lifecycle::ReservationUnverified;
        SetStatus(L"Repeated Shell position notifications exceeded the bounded update limit. Stop and use Safe Exit.");
        RefreshView();
        return;
    }

    g_positionUpdatePending = true;
    if (!PostMessageW(g_window, kDeferredPositionUpdate, 0, 0)) {
        g_positionUpdatePending = false;
        g_lifecycle = Lifecycle::ReservationUnverified;
        SetStatus(L"A Shell position update could not be queued. Reservation state is unconfirmed; use Safe Exit.");
        RefreshView();
    }
}

void HandleShellPositionUpdate() {
    g_positionUpdatePending = false;
    if (g_lifecycle != Lifecycle::Registered || !g_mayBeRegistered) {
        return;
    }

    const ULONGLONG now = GetTickCount64();
    if (now - g_positionBurstStarted > kPositionBurstMs) {
        g_positionBurstStarted = now;
        g_positionUpdatesInBurst = 0;
    }
    if (g_positionUpdatesInBurst >= kMaxPositionUpdatesPerBurst) {
        g_lifecycle = Lifecycle::ReservationUnverified;
        SetStatus(L"Repeated Shell position notifications exceeded the bounded update limit. Stop and use Safe Exit.");
        RefreshView();
        return;
    }

    ++g_positionUpdatesInBurst;
    g_lifecycle = Lifecycle::Updating;
    g_positionUpdateInProgress = true;
    const bool confirmed = ApplyAndVerifyHeight(g_confirmedHeight);
    g_positionUpdateInProgress = false;
    if (confirmed) {
        g_lifecycle = Lifecycle::Registered;
    } else {
        g_lifecycle = Lifecycle::ReservationUnverified;
        SetStatus(L"A Shell position update could not be confirmed. Stop and use Safe Exit for cleanup.");
    }
    RefreshView();
}

void ShowReservationStatus() {
    MONITORINFO info{sizeof(MONITORINFO)};
    RECT windowRect{};
    const bool monitorOk = ReadMonitorInfo(info);
    const bool windowOk = g_window && GetWindowRect(g_window, &windowRect);

    std::wstring details = L"Lifecycle: ";
    details += LifecycleText(g_lifecycle);
    details += L"\nABM_NEW: "; details += std::to_wstring(g_abmNewResult);
    details += L"\nLast requested height: "; details += std::to_wstring(g_lastRequestedHeight);
    details += L"\nABM_QUERYPOS: "; details += std::to_wstring(g_queryPosResult);
    details += L"\nABM_SETPOS: "; details += std::to_wstring(g_setPosResult);
    details += L"\nMoveWindow: "; details += g_moveResult ? L"true" : L"false";
    details += L"\nAccepted AppBar rectangle: "; details += RectText(g_acceptedRect);
    details += L"\nWindow rectangle: ";
    details += windowOk ? RectText(windowRect) : L"unavailable";
    details += L"\nCurrent work area: ";
    details += monitorOk ? RectText(info.rcWork) : L"unavailable";
    details += L"\nBaseline work area: ";
    details += g_baselineCaptured ? RectText(g_baselineWork) : L"unavailable";
    details += L"\nABM_REMOVE: "; details += std::to_wstring(g_removeResult);
    details += L"\nStatus: "; details += g_status;

    MessageBoxW(g_window, details.c_str(), L"Tutorial Dock reservation status",
                MB_OK | MB_ICONINFORMATION);
}

void ShowSettingsMenu() {
    HMENU menu = CreatePopupMenu();
    if (!menu) {
        SetStatus(L"Settings menu could not be opened.");
        return;
    }
    AppendMenuW(menu, MF_STRING | (CanUseLessonControls() ? 0 : MF_GRAYED),
                kMenuLoadSample, L"Load sample lesson");
    AppendMenuW(menu, MF_STRING, kMenuReservationStatus, L"Reservation status");
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, kMenuExit, L"Safe Exit");

    RECT button{};
    GetWindowRect(g_settings, &button);
    const UINT selected = TrackPopupMenu(menu,
        TPM_RETURNCMD | TPM_RIGHTBUTTON | TPM_NONOTIFY,
        button.left, button.bottom, 0, g_window, nullptr);
    DestroyMenu(menu);

    switch (selected) {
    case kMenuLoadSample:
        if (CanUseLessonControls()) {
            g_model.LoadSampleLesson();
            SetStatus(L"Sample lesson loaded in memory.");
            RefreshView();
        }
        break;
    case kMenuReservationStatus:
        ShowReservationStatus();
        break;
    case kMenuExit:
        RequestSafeExit();
        break;
    default:
        break;
    }
}

void HandleButtonClick(int controlId) {
    if (!CanUseLessonControls()) {
        return;
    }
    switch (controlId) {
    case kControlDemo: {
        const auto* step = g_model.CurrentStep();
        if (step) {
            SetStatus(L"Demonstration action: local placeholder only.");
            MessageBoxW(g_window, step->demoActionLabel.c_str(),
                        L"Tutorial Dock demo action", MB_OK | MB_ICONINFORMATION);
        }
        break;
    }
    case kControlPrevious:
        if (g_model.Previous()) {
            SetStatus(L"Moved to the previous sample step.");
        }
        break;
    case kControlNext:
        if (g_model.Next()) {
            SetStatus(L"Moved to the next sample step.");
        }
        break;
    case kControlSettings:
        ShowSettingsMenu();
        return;
    case kControlCollapse:
        if (g_lifecycle == Lifecycle::Registered) {
            ChangeHeight(g_confirmedHeight == kNormalHeight
                ? kCollapsedHeight : kNormalHeight);
            return;
        }
        break;
    default:
        return;
    }
    RefreshView();
}

LRESULT CALLBACK GuideBarWindowProc(HWND window, UINT message,
                                    WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_NCCREATE:
        g_window = window;
        return TRUE;
    case WM_CREATE:
        if (!CreateControls()) {
            return -1;
        }
        RefreshView();
        return 0;
    case WM_COMMAND: {
        if (HIWORD(wParam) != BN_CLICKED) {
            break;
        }
        const int id = LOWORD(wParam);
        HWND expectedSource = nullptr;
        switch (id) {
        case kControlDemo: expectedSource = g_demo; break;
        case kControlPrevious: expectedSource = g_previous; break;
        case kControlNext: expectedSource = g_next; break;
        case kControlSettings: expectedSource = g_settings; break;
        case kControlCollapse: expectedSource = g_collapse; break;
        default: break;
        }
        if (expectedSource && reinterpret_cast<HWND>(lParam) == expectedSource) {
            HandleButtonClick(id);
            return 0;
        }
        break;
    }
    case kDeferredPositionUpdate:
        HandleShellPositionUpdate();
        return 0;
    case kAppBarCallback:
        if (wParam == ABN_POSCHANGED) {
            ScheduleShellPositionUpdate();
        }
        return DefWindowProcW(window, message, wParam, lParam);
    case WM_WINDOWPOSCHANGED:
        if (g_mayBeRegistered && !g_shellPositionNotificationInProgress) {
            g_shellPositionNotificationInProgress = true;
            APPBARDATA data = MakeAppBarData();
            SHAppBarMessage(ABM_WINDOWPOSCHANGED, &data);
            g_shellPositionNotificationInProgress = false;
        }
        break;
    case WM_ACTIVATE:
        if (g_mayBeRegistered) {
            APPBARDATA data = MakeAppBarData();
            data.lParam = LOWORD(wParam) == WA_INACTIVE ? FALSE : TRUE;
            SHAppBarMessage(ABM_ACTIVATE, &data);
        }
        break;
    case WM_SIZE:
        LayoutControls();
        return 0;
    case WM_CTLCOLORSTATIC: {
        HDC dc = reinterpret_cast<HDC>(wParam);
        SetBkMode(dc, TRANSPARENT);
        SetTextColor(dc, GetSysColor(COLOR_WINDOWTEXT));
        return reinterpret_cast<LRESULT>(g_background
            ? g_background : GetSysColorBrush(COLOR_WINDOW));
    }
    case WM_ERASEBKGND: {
        RECT client{};
        GetClientRect(window, &client);
        FillRect(reinterpret_cast<HDC>(wParam), &client,
                 g_background ? g_background : GetSysColorBrush(COLOR_WINDOW));
        return 1;
    }
    case WM_PAINT: {
        PAINTSTRUCT paint{};
        BeginPaint(window, &paint);
        EndPaint(window, &paint);
        return 0;
    }
    case WM_CLOSE:
        RequestSafeExit();
        return 0;
    case WM_DESTROY:
        if (!g_destroyAllowed && g_mayBeRegistered) {
            g_lifecycle = Lifecycle::RemovalUnverified;
            return 0;
        }
        g_window = nullptr;
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(window, message, wParam, lParam);
}

bool RegisterWindowClass() {
    WNDCLASSEXW windowClass{sizeof(WNDCLASSEXW)};
    windowClass.lpfnWndProc = GuideBarWindowProc;
    windowClass.hInstance = g_instance;
    windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    windowClass.hbrBackground = GetSysColorBrush(COLOR_WINDOW);
    windowClass.lpszClassName = kWindowClass;
    return RegisterClassExW(&windowClass) != 0;
}

bool IsSafeToExit() {
    return !g_mayBeRegistered &&
        (g_lifecycle == Lifecycle::Fallback ||
         g_lifecycle == Lifecycle::Released ||
         g_lifecycle == Lifecycle::Unregistered);
}

int RunMessageLoop() {
    MSG message{};
    bool fallbackPump = false;
    int exitCode = 0;
    for (;;) {
        if (!fallbackPump) {
            const BOOL result = GetMessageW(&message, nullptr, 0, 0);
            if (result > 0) {
                TranslateMessage(&message);
                DispatchMessageW(&message);
                continue;
            }
            if (result == 0) {
                if (IsSafeToExit()) {
                    return static_cast<int>(message.wParam);
                }
                SetStatus(L"An unsafe quit request was blocked because AppBar release is unverified.");
                fallbackPump = true;
                continue;
            }

            exitCode = 2;
            SetStatus(L"Windows message retrieval failed. Attempting guarded Safe Exit.");
            RequestSafeExit();
            if (IsSafeToExit() && !g_window) {
                return exitCode;
            }
            fallbackPump = true;
            continue;
        }

        if (!PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            WaitMessage();
            continue;
        }
        if (message.message == WM_QUIT) {
            if (IsSafeToExit()) {
                return exitCode;
            }
            continue;
        }
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
}

} // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    g_instance = instance;
    if (!SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) {
        MessageBoxW(nullptr,
            L"Per-monitor DPI awareness could not be established. No AppBar was registered.",
            L"Tutorial Dock", MB_OK | MB_ICONERROR);
        return 2;
    }

    INITCOMMONCONTROLSEX commonControls{sizeof(INITCOMMONCONTROLSEX), ICC_PROGRESS_CLASS};
    if (!InitCommonControlsEx(&commonControls) || !RegisterWindowClass()) {
        MessageBoxW(nullptr, L"The guide bar could not initialize its Windows controls.",
                    L"Tutorial Dock", MB_OK | MB_ICONERROR);
        return 3;
    }

    g_background = CreateSolidBrush(RGB(246, 247, 249));
    const int initialWidth = std::max(320, GetSystemMetrics(SM_CXSCREEN));
    g_window = CreateWindowExW(WS_EX_TOOLWINDOW, kWindowClass, L"Tutorial Dock",
        WS_POPUP | WS_CLIPCHILDREN, 0, 0, initialWidth, kNormalHeight,
        nullptr, nullptr, g_instance, nullptr);
    if (!g_window) {
        if (g_background) DeleteObject(g_background);
        MessageBoxW(nullptr, L"The guide bar window could not be created.",
                    L"Tutorial Dock", MB_OK | MB_ICONERROR);
        return 4;
    }

    RegisterAtStartup();
    const int exitCode = RunMessageLoop();

    if (g_mayBeRegistered || !IsSafeToExit()) {
        // Do not return from the process while a registered HWND may remain.
        SetStatus(L"Process exit is blocked because AppBar release is unverified. Keep the window open.");
        for (;;) {
            MSG message{};
            if (!GetMessageW(&message, nullptr, 0, 0)) {
                if (message.message == WM_QUIT && IsSafeToExit()) {
                    break;
                }
                continue;
            }
            TranslateMessage(&message);
            DispatchMessageW(&message);
            if (IsSafeToExit() && !g_window) {
                break;
            }
        }
    }

    if (g_background) {
        DeleteObject(g_background);
    }
    UnregisterClassW(kWindowClass, g_instance);
    return exitCode;
}

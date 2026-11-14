# Windows AppBar Native Architecture Review

**Status:** Proposal for review. Research snapshot: 2026-11-14.  
**Purpose:** Choose the smallest next experiment for the unresolved top-edge AppBar positioning failure. This report does not approve a production technology change.

## Executive summary

The Electron/Koffi runs establish that Windows accepted a 90-pixel reservation while the AppBar window later settled at Y=90 instead of occupying the reserved top strip. PR #14's human A/B observations show the same final Y for NoSendChanging runs with and without showInactive; the run source SHA was not recorded and the queued message timeline was incomplete. Those runs do not identify the cause.

The highest-information next test is an isolated C++/Win32 AppBar with a real AppBar HWND and its own WndProc, using the documented Shell sequence and a separate operator window. This removes Electron, Chromium, Node, and FFI from the first test. It tests whether a small native AppBar can reserve the work area and remain at Y=0. It does not prove that Windows universally behaves the same for every window or that the final product should use C++.

A public Stack Overflow report describes similar displacement in Electron and reports that its author later reproduced it with a plain WinForms/P/Invoke sample. The same author reports desktop icons disappearing in that run. This is a safety-relevant, single-user report, not an independently reproduced Windows rule. It makes the native baseline more important and adds a desktop-icon stop observation to Phase 1. No delayed corrective move or repeated repositioning should be tried in the first baseline.

## Authority and traceability

- Product behavior remains [docs/requirements.md](../../../docs/requirements.md), especially R-01, R-02, and R-09.
- The current AppBar feature proposal remains [specs/windows-appbar/spec.md](../../../specs/windows-appbar/spec.md), AB-001–AB-008. This spike does not edit or supersede it.
- [docs/design.md](../../../docs/design.md) still describes Electron as a candidate, not an approved final stack.
- PR #14 remains an open Draft and Issue #13 remains incomplete. Its run evidence is useful input but is not a merged specification or complete experiment record.
- Requirement IDs R-01–R-09 and AppBar Feature IDs AB-001–AB-008 remain unchanged.

## Evidence carried forward

| Evidence | What it establishes | What remains unknown |
|---|---|---|
| Prior Electron PoC: ABM_NEW / QUERYPOS / SETPOS succeeded; work-area top became 90; SetWindowPos returned true; accepted rect was top=0..90. | Reservation and API calls succeeded in the tested run. | API return values do not establish where the visible HWND settled. |
| Earlier A/B measurement: Baseline settled at Y=90; NoSendChanging first read Y=0 and later read Y=90. | Displacement occurred after the initial positioning call in at least one variant. | Which Windows, Chromium, or message path caused it. |
| PR #14 human A/B run: showInactive present and omitted both ended at Y=90; both visually appeared below the reserved strip. | Omitting showInactive alone did not prevent the observed final displacement in that pair. | Source SHA and complete ordered message evidence were not supplied; no universal causal conclusion. |
| Earlier in-process ABM_REMOVE/release verification/Safe exit logs were present. | The app's own cleanup path reported success. | Numeric external process exit code and independent post-process work-area measurement were not consistently supplied; do not claim full SC-006. |
| Issue #13 analysis reports Chromium work-area correction candidates and a pending Win32 message timeline. | Useful Chromium hypothesis and motivation to remove Electron from the first experiment. | Runtime proof that the named Chromium handlers caused this run's move. |

## Microsoft AppBar protocol

Microsoft's Application Desktop Toolbars guidance defines the protocol independently of a UI framework:

1. Register the actual bar HWND with ABM_NEW, including a callback message.
2. Propose the edge and rectangle with ABM_QUERYPOS; the Shell can adjust it around the taskbar and other appbars.
3. Commit with ABM_SETPOS; use the adjusted rectangle returned by this call.
4. Move the AppBar window to that accepted rectangle. The documentation names MoveWindow as an available operation.
5. When the AppBar receives ABN_POSCHANGED, query and commit its position again and move it if the resulting rectangle changed.
6. On WM_ACTIVATE, send ABM_ACTIVATE. On WM_WINDOWPOSCHANGED, send ABM_WINDOWPOSCHANGED; this informs the Shell for same-edge auto-hide z-order behavior.
7. Send ABM_REMOVE before destroying the registered window.

The classic sample's AppBar_QuerySetPos calls ABM_QUERYPOS, then ABM_SETPOS, then MoveWindow with the rect in APPBARDATA. Its AppBar_PosChanged recalculates desired thickness and repeats that protocol. Its WndProc forwards WM_WINDOWPOSCHANGED to the Shell, handles WM_ACTIVATE, routes the registered callback message, and unregisters on destruction. The sample creates its AppBar with WS_EX_CLIENTEDGE | WS_EX_TOOLWINDOW and WS_POPUP | WS_THICKFRAME | WS_CLIPCHILDREN; it is a feature-rich legacy sample, not a Windows 11 proof.

The current Electron PoC uses SetWindowPos to commit a rectangle after SETPOS. Win32 documentation allows MoveWindow for that step; the first native test will follow the Microsoft sample's MoveWindow path and record the exact HWND, style, accepted SETPOS rectangle, and resulting rectangles. This difference is part of the experiment context and must not be misreported as a single-variable comparison with Electron.

ABM_ACTIVATE and ABM_WINDOWPOSCHANGED are protocol notifications, not position-correction commands by themselves. ABN_POSCHANGED is the notification that calls for a fresh QUERYPOS/SETPOS and possible move. The first test must not add an unbounded “fight back” positioning loop.

## Implementation references

### Microsoft Windows-classic-samples

- The AppBar sample is under Samples/Win7Samples/.../appbar/ in Microsoft's Windows classic desktop samples repository.
- It demonstrates the complete C/C++ Shell protocol and WndProc integration, including MoveWindow, the callback message, ABM_ACTIVATE, ABM_WINDOWPOSCHANGED, ABN_POSCHANGED, and ABM_REMOVE.
- Microsoft says many classic samples target Windows 7/8.1 and Visual Studio 2013; later Windows may work, but platform-specific behavior is possible. Use the source as a protocol reference, then run a controlled Windows 11 test.
- The repository license is MIT, with individual sample notices taking precedence and some assets under other licenses. If code is copied, retain the applicable notices; prefer studying the call sequence and writing a deliberately smaller sample.

### mgaffigan/WpfAppBar

- Itp.WpfAppBar is a small WPF implementation published under MIT. Its source says it aims to handle monitor selection, resizing, layout/disconnection changes, cooperation with other appbars, and per-monitor DPI.
- It creates a borderless, non-resizable, topmost WPF window; obtains the HWND at source initialization; hooks the WPF message path; sends ABM_ACTIVATE and ABM_WINDOWPOSCHANGED; and handles ABN_POSCHANGED by querying/setting and moving the window.
- Its WndProc also modifies WM_WINDOWPOSCHANGING to suppress external move/size changes, except while its own AppBar resize is in progress. Its bounds logic accounts for DWM frame insets and can issue another positioning call when measured frame thickness changes. These are additional behaviors, not the first baseline.
- The current code registers automatically during SourceInitialized and unregisters on close. The explicit-registration Spike must adapt this lifecycle behind an operator action and retain a fail-closed close guard.
- The repository also contains a WinForms variant. Its README requires SystemEventsSafeAppContext to avoid an exit hang; test this guidance rather than assuming it prevents hangs in our app.
- Treat the repository's stated goals as implementation claims until verified in the same Windows 11 environment. Re-check package versions, target frameworks, active maintenance, dependencies, and license notices when Phase 2 is approved.

### adamecr/AppSwitcherBar

- This MIT-licensed .NET 6 WPF application describes itself as tested on Windows 10 and 11, uses a WPF AppBar window, and references the WpfAppBar work.
- Its documentation explains the custom HWND message hook, AppBar protocol, WM_WINDOWPOSCHANGING handling, shell notifications, and per-monitor DPI setup.
- It is a useful Windows 11 integration example but includes task-switcher enumeration, thumbnails, UI and periodic refresh logic irrelevant to a minimal reservation test. Do not reuse it wholesale or treat the maintainer's test statement as independent evidence for Tutorial Dock.

### Reported push-out case

The linked Stack Overflow question's author reports that an Electron/Koffi appbar was pushed away after reservation and later says a plain WinForms/P/Invoke reproduction showed a similar push-out. The author also reports desktop icons disappearing during that reproduction and describes a delayed corrective move as stable for their test. These are observations from that post, not a Microsoft protocol guarantee or an independently verified general Windows behavior. Do not copy the delayed move into Phase 1. Instead, record whether desktop icons remain visible and stop the test if they disappear.

## Phase and technology assessment

| Candidate | AppBar access / message ownership | UI and maintenance | R-09 portable distribution implications | Assessment |
|---|---|---|---|---|
| C++ / Pure Win32 | Direct HWND, WndProc, Shell APIs; no interop bridge. | Smallest dependency surface; more manual UI/layout work. | Native x64 executable can avoid bundling Electron/.NET, but compiler/runtime linkage, architecture, signing/SmartScreen, and release packaging must be verified. | Best Phase 1 isolator; not yet a product recommendation. |
| WPF | P/Invoke with WPF HWND source hook; existing MIT examples. | Rich XAML UI and Windows-specific integration. | .NET self-contained/single-file publishing is available in principle, but actual WPF output, size, startup and portable behavior must be tested. | Phase 2 candidate only after Pure Win32 succeeds. |
| WinForms | P/Invoke and WndProc; WpfAppBar sibling library exists. | Lower UI flexibility for polished guide/slide windows; exit behavior needs care. | .NET self-contained/single-file is available in principle; test actual form and native dependency output. | Phase 2 comparison candidate, not a presumed fallback. |
| WPF + WebView2 | WPF owns AppBar HWND; WebView2 supplies HTML/CSS UI. | UI flexibility, but adds browser runtime lifecycle and another boundary. | Fixed WebView2 runtime is over 250 MB per current Microsoft distribution guidance; Evergreen relies on a runtime installed/updated outside the app. Package and no-install interpretation need explicit R-09 review. | Phase 3 candidate if native WPF shell succeeds. |
| Electron + native AppBar host/bridge | Native HWND would own the reservation; Electron integration/embedding or window coordination remains to be designed. | Preserves existing UI investment but adds native-host IPC/window synchronization and error paths. | Electron/Chromium and native modules must remain bundled; current positioning issue is unresolved. | Phase 3 candidate. Do not assume a bridge fixes geometry. |
| WinUI 3 or other Windows UI | AppBar still needs a native HWND and Shell messaging. | New framework and Windows App SDK learning/packaging costs. | Runtime/package model and portable behavior require separate evidence. | Screen only if WPF/Electron findings show a concrete gap; no implementation now. |

Microsoft documents self-contained and single-file .NET deployment, but that describes a deployment capability, not proof that this application's WPF/WinForms package satisfies R-09. Microsoft describes WebView2 Evergreen and Fixed Version distribution; Fixed Version gives app-controlled versioning but its current binaries exceed 250 MB and require servicing with the app. These facts belong in the later package-size and clean-machine comparison.

## Recommended experiment sequence

1. **Phase 1: Pure Win32** — create a minimal C++ top-edge AppBar HWND plus a separate operator HWND. One explicit Register action. Use the Microsoft protocol and MoveWindow. Run only on the human-approved Windows desktop, one display at 96 DPI, standard bottom taskbar. Measure work area and three rectangles immediately and once at a fixed +250 ms observation point. Test one normal maximized app. Explicitly remove, verify baseline, Safe exit, and independently measure after process exit.
2. **Phase 1 failure gate** — do not proceed to WPF/WinForms. Compare the exact sample's style/message/position path against the minimal build, then propose one-variable follow-up tests. Investigate desktop icon side effects first if observed. No delayed reposition, repeated correction, Explorer restart or recovery script.
3. **Phase 2: WPF and WinForms** — only after Phase 1 meets all safety and geometry criteria. In the same host configuration, test WpfAppBar-derived WPF and WinForms candidates one at a time, with explicit registration, same measurements, and same external cleanup evidence. Record library adaptation from auto-registration and any WndProc move suppression.
4. **Phase 3: UI framework comparison** — only after at least one non-Electron AppBar path passes. Compare WPF, WPF+WebView2, Electron+native-host option, and a justified alternative against R-01..R-09, portability, security, content UI, and servicing.
5. **Phase 4: architecture Decision Gate** — produce an evidence matrix and ADR recommendation. A technology/runtime/native bridge change is Level 2 and requires explicit human approval. No implementation starts on a candidate stack before that approval.

## Open questions

- Does the native sample's AppBar HWND stay at Y=0 immediately and after the measured settle interval while work-area top is 90?
- Does the reported desktop-icon side effect reproduce, and does explicit removal restore all measured and visual state?
- Does a C++ sample using official style and message protocol differ from the report of a WinForms/P/Invoke push-out?
- Which WndProc messages accompany the movement on Windows 11, and does the move happen during the synchronous SETPOS/MoveWindow path or later?
- Does WPF's WM_WINDOWPOSCHANGING suppression explain its reported behavior, or does it share the same push-out?
- Can a runtime-free/native or self-contained .NET UI meet the strict interpretation of R-09 without unacceptable size or maintenance cost?
- What is the acceptable meaning of “portable exe” (single executable versus portable release folder/archive)? Do not resolve that by changing R-09 in this spike.

## Sources reviewed (2026-11-14)

- [Microsoft: Using Application Desktop Toolbars](https://learn.microsoft.com/en-us/windows/win32/shell/application-desktop-toolbars)
- [Microsoft: ABN_POSCHANGED](https://learn.microsoft.com/en-us/windows/win32/shell/abn-poschanged)
- [Microsoft: ABM_WINDOWPOSCHANGED](https://learn.microsoft.com/en-us/windows/win32/shell/abm-windowposchanged)
- [Microsoft: Windows-classic-samples AppBar.cpp](https://github.com/microsoft/Windows-classic-samples/blob/main/Samples/Win7Samples/winui/shell/legacysamples/appbar/AppBar.cpp)
- [Microsoft: Windows-classic-samples WndProc.cpp](https://github.com/microsoft/Windows-classic-samples/blob/main/Samples/Win7Samples/winui/shell/legacysamples/appbar/WndProc.cpp)
- [Microsoft: Windows-classic-samples license](https://github.com/microsoft/Windows-classic-samples/blob/main/LICENSE)
- [mgaffigan/WpfAppBar](https://github.com/mgaffigan/WpfAppBar)
- [adamecr/AppSwitcherBar](https://github.com/adamecr/AppSwitcherBar)
- [Stack Overflow report supplied for this investigation](https://stackoverflow.com/questions/80002486/shappbarmessage-my-own-window-gets-pushed-out-of-the-appbar-space-it-just-regis)
- [Microsoft: .NET deployment overview](https://learn.microsoft.com/en-us/dotnet/core/deploying/)
- [Microsoft: WebView2 distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)


# Windows AppBarによる作業領域の確保

**Status:** Proposal — human review required; not approved until merged to `main`.

## 1. Overview

Tutorial Dockは、Tableau Desktopなどの操作対象アプリを使った画面共有中に、画面上部のガイドバーを利用者へ提示する。ガイドバーを常に手前へ表示するだけでは、最大化した操作対象アプリの領域と重なり、操作や共有画面を妨げる可能性がある。本機能は、選択されたディスプレイ上端にガイドバー用の作業領域を予約し、通常の最大化ウィンドウがその領域を避ける状態を目指す。

最前面表示はAppBarによる作業領域の予約と同じではない。予約に失敗して最前面ウィンドウへフォールバックした状態は、AppBar機能の成功として扱わない。

この仕様は、既存のガイドバー表示（R-01）とディスプレイ選択（R-03）に対する作業領域予約の期待動作を定める。ガイドバーの内容・教材操作などは既存要求に従い、本書では重複定義しない。`docs/design.md`のElectron構成やネイティブ連携案は未検証の設計提案であり、実装方式を確定する根拠にはしない。

### Scope

- 選択ディスプレイ上端にガイドバーを配置し、その領域をWindowsの作業領域として予約する期待動作。
- 通常表示と折りたたみ表示の切り替え、表示先切り替え、正常終了に伴う予約の更新・解放。
- 予約の失敗状態、ディスプレイ切断など、利用者から観察できる例外と復旧境界。
- Windows実機で検証する受け入れ条件と、後続Technical Spikeで調べる技術事項。

### Out of scope

- Windows AppBar APIの具体的な選定、Win32連携方式、API呼び出し順序、クラスやプロセス構造。
- ガイドバーのステップ進行、教材・YAML処理、画像ビューア、配布方式。
- 完全非表示、会議アプリによる共有画面の自動検出、ディスプレイ選択の永続化。
- フルスクリーンアプリを含む、Windowsや他アプリが予約領域を無視する状況への保証。

## 2. Source requirements and traceability

`docs/requirements.md` is the product-wide requirements source. The IDs below are local feature-specification IDs; they do not replace or modify the source IDs.

| Feature ID | Source | Expected behavior in this specification |
|---|---|---|
| AB-001 | R-01, R-03 | Show the guide bar at the top of the selected display; the initial target is the Windows primary display. |
| AB-002 | R-02, `docs/requirements.md` §1 共有前提 | Reserve work area so ordinary maximized windows avoid the bar; standard taskbar placement, Tableau Desktop use, and whole-display sharing are MVP targets. |
| AB-003 | R-01, R-02 | Expanded/collapsed area changes update the reservation and retain the current step. On failed updates, prefer restoring the last confirmed state. Heights remain provisional. |
| AB-004 | R-02 | Distinguish initial reservation failure from failed updates. Prefer rollback to the prior confirmed state; otherwise show failure and use the R-02 topmost fallback without claiming uncertain reservation success. |
| AB-005 | R-02, R-03 | On a user-selected display change, release the old reservation and apply the new one; if the transition fails, prefer restoring the previous confirmed display/state. |
| AB-006 | R-03 | On selected-display disconnection, move to the currently available Windows primary display, reserve there, and do not automatically return on reconnection. |
| AB-007 | R-02, `docs/requirements.md` §3 復旧性 | Release the reservation on normal exit; after abnormal termination, aim to avoid a stale work-area reservation without promising automatic recovery or a time limit. |
| AB-008 | R-02, `docs/requirements.md` §3 継続性 | Failure handling prioritizes continued use of other applications. A fallback does not prove that an uncertain OS reservation has been released. |

`docs/requirements.md` §3 復旧性 calls for focused verification of abnormal-exit and display-configuration recovery. It does not define a recovery guarantee, timing, or exact behavior; those remain open rather than being promoted here to confirmed behavior.

### Human-approved clarifications in this revision

The following decisions refine the existing requirements without changing their IDs: (1) on a failed size/display update, prefer rollback to the last confirmed state, then show failure and use the topmost fallback if restoration cannot be confirmed; (2) test work-area geometry separately from maximized-window behavior, beginning with Windows 11, one display, and 100% scaling; (3) on selected-display disconnection, move to the currently available Windows primary display and do not auto-return on reconnection; (4) treat standard taskbar coexistence and whole-display sharing as MVP targets while documenting special taskbar, full-screen, and app-window-sharing limitations; and (5) treat abnormal-exit recovery as a quality goal without promising automatic recovery or a time limit. Technical feasibility remains unverified.

## 3. Functional requirements

### AB-001 — Guide bar target display

The guide bar is displayed at the top edge of the selected display. On initial launch, the target is the Windows primary display. The display-selection interaction itself follows R-03 and is not redesigned here.

### AB-002 — Work-area reservation

The feature reserves the guide bar's occupied top-edge area as Windows work area. The expected result is that ordinary maximized windows, including Tableau Desktop, avoid that area. Standard Windows taskbar placement must coexist with the reservation, and the instructor can use whole-display online sharing for the target display. A window merely appearing above other windows does not satisfy this requirement. These results are acceptance targets, not verified Windows behavior. App-window-only sharing and exclusive full-screen avoidance are not guaranteed.

### AB-003 — Expanded and collapsed area

When the guide bar changes between its normal and collapsed presentation, the reserved work area changes to correspond to the presentation, while the current tutorial step is retained. The normal height target of about 90 px and collapsed target of about 30–36 px are provisional values from R-01; this specification does not make either value final or define a pixel tolerance. If the requested update is not confirmed, apply AB-004's recovery preference rather than reporting the new size as active.

### AB-004 — Reservation failure is visible and degraded

If initial work-area reservation cannot be established, Tutorial Dock uses the ordinary topmost-window fallback described by R-02 and informs the user that reservation failed. If a later size or display update fails, the preferred outcome is restoration of the last confirmed guide-bar presentation and reservation. If that state cannot be maintained or confirmed, inform the user and move to the R-02 topmost-window fallback, prioritizing continued use of other applications. Do not report uncertain reservation state as normal AppBar operation.

The fallback window alone does not establish that Windows released an old or partially updated reservation. If OS reservation state is uncertain, record it as unconfirmed and do not claim that fallback resolved it. The feasibility of rollback, actual OS state, and any residual impact require Technical Spike verification. This policy does not prescribe rollback steps, API order, retry behavior, timing, or a specific way to clear an uncertain OS reservation.

### AB-005 — Selected display changes

When the user changes the target display, release the prior display's reservation and reserve the guide-bar area on the newly selected display. If the transition fails, prefer returning to the last confirmed display, guide-bar presentation, and reservation. If that state cannot be restored or confirmed, follow AB-004's visible degraded fallback policy. Do not silently represent a partial or uncertain transition as successful. Technical feasibility and safe rollback remain for a Technical Spike.

### AB-006 — Selected display disconnects

If the selected display becomes unavailable, move the guide bar to the currently available Windows primary display and reserve the area there. Release any reservation on the disconnected display. If that display reconnects, do not automatically move the guide bar back; a later user selection follows AB-005. If moving or reserving on the primary display fails, follow AB-004. Display-event handling and whether Windows actually clears the disconnected display's reservation remain unverified.

### AB-007 — Normal exit releases reservation

On normal application exit, release the reserved work area so Windows work area returns to its pre-reservation state. For abnormal termination, the quality goal is to avoid leaving the work area improperly occupied. This is a goal for focused verification, not a guarantee of automatic recovery. Recovery timing, required user action, and mechanism remain unconfirmed.

### AB-008 — Failure does not block other applications

Failure handling prioritizes continued operation of other applications. The R-02 topmost fallback does not count as satisfying AB-002 or prove the OS reservation has been released. When reservation state is uncertain, report it as unconfirmed and verify actual work-area and other-application effects; do not imply that displaying the fallback alone resolved a stale reservation. Normal AppBar/work-area operation remains an MVP requirement under R-02.

## 4. User scenarios

### US-01 — Use a maximized application with the guide bar

- **Given:** the guide bar is shown on the selected display and reservation is active.
- **When:** the user maximizes an ordinary application such as Tableau Desktop on that display.
- **Then:** the application is expected to occupy the work area below the guide bar without overlapping it.
**Evidence boundary:** this result requires Windows real-device verification; the applicable applications and Windows conditions must be recorded.

### US-02 — Collapse and expand the guide bar

- **Given:** the guide bar has reserved its normal display area at a tutorial step.
- **When:** the user collapses it and later expands it.
- **Then:** the reserved area changes in each direction to correspond to the current presentation, and the same tutorial step remains selected.
**Evidence boundary:** verify the work-area change and step retention on Windows; do not assume the provisional pixel targets are final.

### US-03 — Change the target display

- **Given:** more than one display is available and the bar has reserved area on the selected display.
- **When:** the user selects another display.
- **Then:** the old reservation is released and the new display receives the reservation.
**On failure:** prefer restoring the last confirmed target and reservation; otherwise use AB-004's visible degraded fallback policy.
**Evidence boundary:** inspect both displays' work areas; no stale reservation should be reported as cleared without evidence.

### US-04 — Disconnect or reconfigure a display

- **Given:** the guide bar is using one of multiple displays.
- **When:** that display is disconnected or the display configuration changes.
- **Then:** if the selected display becomes unavailable, move to the currently available Windows primary display and reserve the area there; do not automatically return if the disconnected display reconnects.
- **On relocation failure:** use AB-004; do not imply that the previous or new reservation is active unless confirmed.
**Evidence boundary:** display-event detection, reservation cleanup, and relocation behavior require Windows verification.

### US-05 — Exit normally

- **Given:** a reservation is active.
- **When:** the user exits Tutorial Dock normally.
- **Then:** the reservation is released and the work area returns to its prior state.

### US-06 — Reservation or update fails

- **Given:** Windows does not accept initial reservation or a later area update.
- **When:** the failure is detected.
- **Then, for an initial registration failure:** use the R-02 topmost fallback and present degraded operation, not an active reservation.
- **For a later size or display update failure:** first prefer restoration of the last confirmed guide-bar presentation and reservation. If it cannot be maintained or confirmed, show the failure and use the R-02 topmost fallback, prioritizing continued use of other applications.
- **Evidence boundary:** verify actual work-area state and other-application behavior. The fallback alone does not prove a stale or partial reservation was removed; do not represent uncertain state as normal AppBar success.
- **Open technical details:** rollback method/order, retry policy, recovery timing, and clearing an uncertain OS reservation remain for Technical Spike.

### US-07 — Standard taskbar and whole-display sharing

- **Given:** the baseline Windows configuration and the guide bar are active.
- **When:** the instructor uses the standard Windows taskbar placement and shares the whole target display while using Tableau Desktop.
- **Then:** the taskbar coexists with the reservation, and the shared display shows the guide bar and Tableau workflow.
- **Evidence boundary:** record the Windows build, taskbar configuration, sharing application, and observed work area.

### US-08 — Special taskbar, full-screen, and window-sharing behavior

Test taskbar auto-hide or nonstandard placement, borderless full-screen, exclusive full-screen where available, and app-window-only sharing as compatibility probes. Record limitations. Exclusive full-screen is not guaranteed to avoid the guide-bar region; app-window sharing is not guaranteed to include Tutorial Dock's separate window.

### US-09 — Abnormal process termination

- **Given:** the reservation is active or changing.
- **When:** Tutorial Dock is force-terminated or crashes.
- **Then:** the quality goal is to avoid leaving the Windows work area improperly occupied.
- **Evidence boundary:** determine actual reservation and work-area recovery, elapsed time, required user action, and effects on other AppBars/taskbar. No automatic recovery or timing guarantee is made in this specification.

## 5. Success criteria and evidence

These are acceptance targets derived from the current requirements. They are not test results. All require Windows verification; no AppBar implementation exists in this change, so their current result is `NOT_RUN`.

### Verification baseline

Start with Windows 11, one display, 100% scaling, and the standard visible Windows taskbar placement. This is the first test configuration, not a decision to limit product support to Windows 11. After the baseline, extend verification to multiple displays and different DPI scales. A work-area query through Windows APIs is an acceptable measurement approach, but no specific API or implementation method is selected here.

| Criterion | Covers | Verification target | Windows device required | Current result |
|---|---|---|---|---|
| SC-001 | AB-001 | On initial launch, the guide bar is at the primary display's top edge; after selection, it is at the selected display's top edge. Record the display used. | Yes | `NOT_RUN` |
| SC-002a | AB-002 | Before and after initial reservation, obtain the target display's Windows work-area bounds and verify they change to correspond to the guide-bar reservation. Record the measurements; no pixel target is finalized. | Yes | `NOT_RUN` |
| SC-002b | AB-002 | On the baseline, maximize an ordinary Windows application and Tableau Desktop. Verify each avoids the guide-bar region; record the OS build, application, window mode, and observed bounds. | Yes | `NOT_RUN` |
| SC-003 | AB-003 | Collapse and expand the bar; separately measure that Windows work-area bounds change with each presentation and verify the tutorial step is retained. Do not assert final pixel values. | Yes | `NOT_RUN` |
| SC-004 | AB-005 | Switch displays; verify the old display returns to its prior work-area bounds and the selected display receives the new reservation. | Yes | `NOT_RUN` |
| SC-005 | AB-006 | Disconnect the selected display; verify the bar moves to the currently available Windows primary display and the reservation is applied there. Reconnect the original display and verify the bar does not automatically return. Inspect both work areas for unintended reservations. | Yes | `NOT_RUN` |
| SC-006 | AB-007 | Exit normally; verify that the Windows work area returns to its pre-launch bounds. | Yes | `NOT_RUN` |
| SC-007 | AB-004, AB-008 | In a controlled initial-registration failure case, verify that the user can continue using another application, the fallback state is communicated, and the UI does not claim that work-area reservation succeeded. | Yes | `NOT_RUN` |
| SC-008 | AB-003, AB-004, AB-005, AB-008 | Induce a size/display update failure. Verify that rollback to the last confirmed guide-bar and reservation state is preferred and, if confirmed, restored. If it cannot be confirmed, verify the user sees failure and the UI uses the topmost fallback without claiming AppBar success; record actual work-area bounds and whether other apps remain usable. Do not assume fallback clears an uncertain OS reservation. | Yes | `NOT_RUN` |
| SC-009 | AB-002 | In the baseline configuration, verify the reservation coexists with the standard visible Windows taskbar placement. | Yes | `NOT_RUN` |
| SC-010 | AB-002 | In the baseline configuration, share the whole target display online and verify the shared image includes Tutorial Dock and the Tableau workflow. Record the sharing application/version. | Yes | `NOT_RUN` |

Special taskbar configurations, mixed-DPI behavior, full-screen exceptions, and abnormal-exit recovery remain Technical Spike probes. In particular, SC-010 covers whole-display sharing; it does not guarantee that app-window-only sharing includes Tutorial Dock's separate window. No criterion may be reported as passed without the required Windows evidence.

## 6. Conceptual states and transitions

These are user-observable feature states, not an internal class or API design.

| State | Meaning |
|---|---|
| Not reserved | No active work-area reservation is established. This includes the initial state before registration. |
| Reserved — expanded | Reservation is active for the normal guide-bar presentation. |
| Reserved — collapsed | Reservation is active for the collapsed presentation. |
| Display changing | The target is being changed; the old reservation is expected to be released and the new target applied. Intermediate implementation details are unspecified. |
| Reservation failed — fallback | Initial AppBar/work-area reservation is not established; the R-02 topmost fallback is used and failure is visible. |
| Reservation update failed | The requested change was not confirmed; rollback to the last confirmed presentation/reservation is preferred. If it cannot be confirmed, the user sees failure and topmost fallback is used. The OS reservation may remain uncertain and must not be claimed cleared without evidence. |
| Released | The application has exited normally and no reservation remains. |

Expected high-level transitions are `Not reserved → Reserved — expanded/collapsed`, expanded ↔ collapsed, reserved → `Display changing` → reserved on the new display, initial reservation failure → `Reservation failed — fallback`, and active reservation → `Released` on normal exit. If a later update fails, prefer returning to the last confirmed state; if that state cannot be confirmed, transition to visible degraded topmost fallback while recording the reservation as unconfirmed. Display disconnection and abnormal process exit require Spike evidence. Do not claim that fallback cleared a stale OS reservation without evidence.

## 7. Open questions and Technical Spike candidates

No implementation approach or technical feasibility is approved by this specification. The Electron and native API notes in `docs/design.md` are candidates only.

| Candidate | What is unknown / what to verify | Affected IDs |
|---|---|---|
| TS-01 Electron-to-Windows integration | Whether and how the chosen Electron application can interact with the required Windows work-area behavior; which Windows notifications/events and lifecycle constraints apply. Compare viable approaches without selecting one in Specify. | AB-002–AB-007 |
| TS-02 Reservation lifecycle and rollback | On Windows, verify registration, size/display updates, normal release, and observable status. For failed updates, test restoration of the last confirmed visible/reserved state; if not confirmed, test user notice and topmost fallback. Measure actual work area and other-application impact; do not assume fallback releases a stale reservation. Retry count, delay, rollback API order, and uncertain-state cleanup remain undecided. | AB-002–AB-008 |
| TS-03 Separate reservation and window checks | First retrieve target display work-area bounds before/after reservation and during expand/collapse/release. Separately maximize an ordinary Windows application and Tableau Desktop and verify whether each avoids the bar. Start with the baseline Windows 11/single-display/100%-scale configuration. | AB-002, AB-003 |
| TS-04 Multiple displays and DPI | After baseline testing, verify coordinates, scale conversion, mixed-DPI displays, resolution changes, and disconnect/reconnect. On disconnection verify relocation to the currently available Windows primary display, no unintended old reservation, and no automatic return after reconnection. | AB-001, AB-003, AB-005, AB-006 |
| TS-05 Taskbar coexistence | Standard visible taskbar placement is an MVP target and must be verified in the baseline configuration. Also probe auto-hide and nonstandard placement, recording conflicts and limitations without generalizing from the baseline. | AB-002, AB-004, AB-005 |
| TS-06 Sharing and full-screen limits | Verify whole-display online sharing with Tutorial Dock and Tableau as an MVP scenario. Separately probe screen-sharing software exceptions, app-window-only sharing, borderless full-screen, and exclusive full-screen. App-window sharing of Tutorial Dock's separate window and exclusive full-screen avoidance are not guaranteed. | AB-002 |
| TS-07 Abnormal termination and recovery | Probe normal exit, forced termination, process crash, and (if feasible) termination during reservation update. For each record whether a reservation remains, work-area recovery, elapsed time, need for restart or user action, and effects on other AppBars/taskbar. Abnormal recovery is a quality goal; no time or automatic-recovery guarantee or recovery process is decided. | AB-007, AB-008; recovery NFR |
| TS-08 Failure fallback and continuity | Exercise initial registration failure, failed resize, failed display switch, and failed relocation to the primary display. Verify rollback preference, visible error/degraded state, actual OS work-area state (including uncertainty), and that other applications remain usable. Do not infer that the topmost fallback alone clears OS state. | AB-004–AB-006, AB-008 |

If Spike evidence shows that an acceptance target cannot be met or requires changing R-01, R-02, or R-03 behavior, stop the affected decision and seek human approval. Do not redefine the requirement to match an implementation limitation.

## 8. Review boundary

This document is a generated specification proposal. It does not approve an implementation approach, establish Windows behavior, or authorize Plan, Tasks, Issue registration, or implementation. Until this proposal is merged, the requirements and any effective specifications on `main` remain authoritative.

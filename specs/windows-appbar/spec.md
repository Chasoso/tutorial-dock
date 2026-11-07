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
| AB-002 | R-02 | Reserve the guide-bar area so ordinary maximized applications are expected to avoid it. This is an acceptance target, not a claim of verified Windows behavior. |
| AB-003 | R-01, R-02 | Update the reserved area when the bar is expanded or collapsed, retaining the current step. Heights remain provisional. |
| AB-004 | R-02 | On reservation failure, use the specified ordinary topmost-window fallback and expose the failure state; do not report reservation success. |
| AB-005 | R-02, R-03 | When the target display changes, release the old reservation and apply the reservation to the new display. |
| AB-006 | R-03 | When the selected display is disconnected, move to an available display and do not leave an unintended reservation on the disconnected display. |
| AB-007 | R-02 | Release the reserved area on normal application exit. |
| AB-008 | R-02, `docs/requirements.md` §3 継続性 | A reservation failure must not prevent the user from continuing to operate other applications; the fallback remains degraded operation, not successful AppBar operation. |

`docs/requirements.md` §3 復旧性 calls for focused verification of abnormal-exit and display-configuration recovery. It does not define a recovery guarantee, timing, or exact behavior; those remain open rather than being promoted here to confirmed behavior.

## 3. Functional requirements

### AB-001 — Guide bar target display

The guide bar is displayed at the top edge of the selected display. On initial launch, the target is the Windows primary display. The display-selection interaction itself follows R-03 and is not redesigned here.

### AB-002 — Work-area reservation

The feature requests reservation of the guide bar's occupied top-edge area as Windows work area. The intended observable result is that an ordinary application maximized on that display does not overlap the reserved guide-bar area. A window merely appearing above other windows does not satisfy this requirement. The exact Windows and application conditions under which this result holds must be established by a Technical Spike and Windows testing.

### AB-003 — Expanded and collapsed area

When the guide bar changes between its normal and collapsed presentation, the reserved work area changes to correspond to the presentation, while the current tutorial step is retained. The normal height target of about 90 px and collapsed target of about 30–36 px are provisional values from R-01; this specification does not make either value final or define a pixel tolerance.

### AB-004 — Reservation failure is visible and degraded

If the work-area reservation cannot be established, Tutorial Dock uses the ordinary topmost-window fallback described by R-02 and informs the user that reservation failed. If a later size or display update fails, the user is informed that the requested reservation change did not succeed; the application must not imply that the requested new reservation is active without evidence. This does not decide whether the previous reservation remains, the topmost fallback is used, or a retry is offered. The precise message, display duration, and recovery interaction are not specified here.

### AB-005 — Selected display changes

When the user changes the target display, the prior display's reservation is released and the guide bar's area is reserved on the newly selected display. This is an expected transition, not a statement that the transition has been technically proven. Failure partway through the transition must not be silently represented as success; the exact recovery behavior is open for Spike validation.

### AB-006 — Selected display disconnects

If the selected display is disconnected, the guide bar moves to an available display as required by R-03. The disconnected display must not retain an unintended reservation. Which available display is selected when several remain, and how in-progress failures are surfaced, are not further defined by the current requirements.

### AB-007 — Normal exit releases reservation

On normal application exit, the reserved work area is released so the Windows work area returns to its pre-reservation state. The required timing and behavior following an abnormal process exit are unresolved and are not implied by this normal-exit requirement.

### AB-008 — Failure does not block other applications

If reservation fails and the fallback is used, the user can continue operating other applications. The fallback does not count as satisfying AB-002; normal AppBar/work-area operation remains an MVP requirement under R-02.

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
**Evidence boundary:** inspect both displays' work areas; no stale reservation should remain on the old display.

### US-04 — Disconnect or reconfigure a display

- **Given:** the guide bar is using one of multiple displays.
- **When:** that display is disconnected or the display configuration changes.
- **Then:** the R-03 disconnect expectation is to move the bar to an available display.
**Open behavior:** selection among multiple remaining displays, resolution-change behavior, and recovery after a failed transition require verification or a human decision if they change product behavior.

### US-05 — Exit normally

- **Given:** a reservation is active.
- **When:** the user exits Tutorial Dock normally.
- **Then:** the reservation is released and the work area returns to its prior state.

### US-06 — Reservation or update fails

- **Given:** Windows does not accept initial reservation or a later area update.
- **When:** the failure is detected.
- **Then, for an initial registration failure:** use the R-02 topmost fallback and present degraded operation, not an active reservation.
- **For a later size or display update failure:** show that the requested reservation change failed and do not imply that the requested new reservation is active unless the observed work-area bounds support it.
- **Open behavior:** the fallback, recovery action, and exact user message after a later update failure are not specified by the current requirements and remain for Spike evidence and human review.

### US-07 — Abnormal exit, taskbar, DPI, sharing, and full-screen use

These are verification scenarios rather than promises of behavior. A Technical Spike should capture the display configuration, Windows version, taskbar placement, DPI scale, application/window mode, observed work area, and recovery result. Requirements do not promise that exclusive full-screen applications or screen-sharing applications will respect or display the reserved area.

## 5. Success criteria and evidence

These are acceptance targets derived from the current requirements. They are not test results. All require Windows verification; no AppBar implementation exists in this change, so their current result is `NOT_RUN`.

| Criterion | Covers | Verification target | Windows device required | Current result |
|---|---|---|---|---|
| SC-001 | AB-001 | On initial launch, the guide bar is at the primary display's top edge; after selection, it is at the selected display's top edge. Record the display used. | Yes | `NOT_RUN` |
| SC-002 | AB-002 | With reservation active, maximize an ordinary window (including Tableau Desktop when available) and observe that its usable bounds do not overlap the guide-bar area. Record OS, app, and window mode. | Yes | `NOT_RUN` |
| SC-003 | AB-003 | Collapse and expand the bar; observe that Windows work-area bounds change in the corresponding direction and that the current tutorial step is unchanged. Do not assert final pixel values. | Yes | `NOT_RUN` |
| SC-004 | AB-005 | Switch displays; verify the old display returns to its prior work-area bounds and the selected display receives the new reservation. | Yes | `NOT_RUN` |
| SC-005 | AB-006 | Disconnect the selected display; verify the bar moves to an available display and no unintended reservation remains on the disconnected display when it becomes available for inspection. | Yes | `NOT_RUN` |
| SC-006 | AB-007 | Exit normally; verify that the Windows work area returns to its pre-launch bounds. | Yes | `NOT_RUN` |
| SC-007 | AB-004, AB-008 | In a controlled initial-registration failure case, verify that the user can continue using another application, the fallback state is communicated, and the UI does not claim that work-area reservation succeeded. | Yes | `NOT_RUN` |
| SC-008 | AB-004, AB-003, AB-005 | Induce or otherwise observe a later size/display update failure. Verify that the failure is visible to the user and the UI does not imply the requested new reservation is active unless observed Windows bounds support it. Record actual bounds. The fallback and recovery behavior remain open for human review. | Yes | `NOT_RUN` |

Abnormal-exit restoration, update-failure recovery, taskbar interactions, mixed-DPI behavior, screen sharing, and full-screen exceptions are required Spike probes, but their precise pass thresholds and guarantees are open. SC-008 verifies truthful reporting of an update failure; it does not prescribe the fallback or recovery action. No criterion may be reported as passed without the required Windows evidence.

## 6. Conceptual states and transitions

These are user-observable feature states, not an internal class or API design.

| State | Meaning |
|---|---|
| Not reserved | No active work-area reservation is established. This includes the initial state before registration. |
| Reserved — expanded | Reservation is active for the normal guide-bar presentation. |
| Reserved — collapsed | Reservation is active for the collapsed presentation. |
| Display changing | The target is being changed; the old reservation is expected to be released and the new target applied. Intermediate implementation details are unspecified. |
| Reservation failed — fallback | Initial AppBar/work-area reservation is not established; the R-02 topmost fallback is used and failure is visible. |
| Reservation update failed | A requested size/display change was not confirmed; the user is informed. Whether the previous reservation remains, fallback is used, or recovery is attempted is open. |
| Released | The application has exited normally and no reservation remains. |

Expected high-level transitions are `Not reserved → Reserved — expanded/collapsed`, expanded ↔ collapsed, reserved → `Display changing` → reserved on the new display, initial reservation failure → `Reservation failed — fallback`, a failed later update → `Reservation update failed`, and active reservation → `Released` on normal exit. Display disconnect and abnormal process exit may alter these transitions; their recovery behavior requires Spike evidence. The state following a failed update must not imply that the requested new reservation succeeded; the exact recovery is open.

## 7. Open questions and Technical Spike candidates

No implementation approach or technical feasibility is approved by this specification. The Electron and native API notes in `docs/design.md` are candidates only.

| Candidate | What is unknown / what to verify | Affected IDs |
|---|---|---|
| TS-01 Electron-to-Windows integration | Whether and how the chosen Electron application can interact with the required Windows work-area behavior; which Windows notifications/events and lifecycle constraints apply. Compare viable approaches without selecting one in Specify. | AB-002–AB-007 |
| TS-02 Reservation lifecycle | On Windows, verify registration, position/size updates, display changes, normal release, and failure reporting. Determine observable success/failure signals and whether a later update failure can be recovered safely. | AB-002–AB-007 |
| TS-03 Maximized-window behavior | Verify work-area reservation against ordinary maximized windows, including Tableau Desktop if available; record which window classes or applications honor or ignore it. | AB-002 |
| TS-04 Multiple displays and DPI | Verify coordinates, scale conversion, mixed-DPI displays, resolution changes, display ordering, and disconnection/reconnection. Confirm that old reservations do not remain. | AB-001, AB-003, AB-005, AB-006 |
| TS-05 Taskbar coexistence | Verify taskbar placement and reservation conflicts, including whether the requested top region can be reserved in each tested configuration. | AB-002, AB-004, AB-005 |
| TS-06 Full-screen and screen sharing | Compare ordinary maximized, borderless full-screen, exclusive full-screen where available, and shared-display behavior. Record limitations; no universal full-screen guarantee is specified. | AB-002, AB-004 |
| TS-07 Abnormal termination and recovery | Verify whether and how Windows work area returns after process crash or forced termination, recovery timing, and user-visible status. Current requirements call for focused verification but define no guarantee. | AB-007; recovery NFR |
| TS-08 Failure fallback | Verify an initial registration failure and a later resize/display-update failure. Confirm fallback continuity and user-visible state; determine what recovery choices, if any, need a product decision. | AB-004, AB-008 |

If Spike evidence shows that an acceptance target cannot be met or requires changing R-01, R-02, or R-03 behavior, stop the affected decision and seek human approval. Do not redefine the requirement to match an implementation limitation.

## 8. Review boundary

This document is a generated specification proposal. It does not approve an implementation approach, establish Windows behavior, or authorize Plan, Tasks, Issue registration, or implementation. Until this proposal is merged, the requirements and any effective specifications on `main` remain authoritative.

# Windows AppBar自律検証基盤 — Plan

**状態:** Proposal — Specify/Planは人間の承認前の提案。
**Feature:** [spec.md](spec.md)
**設計詳細:** [autonomous-validation-feasibility.md](../../docs/spikes/windows-appbar-core/autonomous-validation-feasibility.md)

## Summary

専用の使い捨てWindows環境とホスト外部監視を用意し、AppBar試験を隔離・直列化・制限時間付きで実行する。Codexはログ分析と隔離Spike差分作成に専念し、Electron/Win32実験はゲストの対話セッションで実行する。Electron外SentinelとHost Supervisorが解除、終了、work area復帰、VM復元を別々に検証する。

## Current evidence and constraints

- 現行PoCはAppBar API、Win32/DWM/Electron矩形、遅延JSONL診断、明示解除と終了ガードを持つ。
- 2026-11-12のBaseline/NoSendChanging A/Bでは予約は観測されたが、最終表示位置は双方Y=90。NoSendChangingは一時Y=0後にY=90となり、移動呼び出し元とフラグ因果は未確定。
- SC-006の外部終了コード/終了後測定が不足している。
- ホスト環境のCIM/VMMS情報は権限拒否、レジストリ製品名とビルド表示が不整合。Hyper-Vの利用可否を決めない。
- 既存仕様・4 SDD契約・Level 1/2/3・Issue登録/実装/人間承認境界は変更しない。

## Candidate architecture

1. **Investigation Agent (Codex):** 解析、仮説、単一変更の隔離diff、静的ゲート、manifest、結果判定と次候補。VM/host credentialsを保持しない。
2. **Test Runner (guest interactive session):** Electron PoCと許可操作、AppBar APIはElectron main process内、geometryとUI証拠を生成。
3. **Guest Sentinel:** Electronから独立したゲストプロセス。Electronプロセス終了コード、GUIセッション内work area、ログ・環境状態を測る。ゲスト停止は検知できない。
4. **External Supervisor (host):** 固定VM IDとcheckpointを許可リスト化し、排他run lock、baseline preflight、timeout/heartbeat、guest readiness、artifact回収、hash、限定VM restore、post-restore qualificationを実施する。

Guest SentinelはSupervisorの外部性を補う計測器であり、別のVM管理主体ではない。Host Supervisorがguest OS停止を検知し、ホストの作業領域と他VMを操作しない。

## Control and trust boundaries

- AgentからSupervisorへは構造化・バージョン付きmanifestだけ。任意shellやコマンド文字列は受け付けない。
- Supervisorからguestへは承認済みの固定アクションのみ。PowerShell Directは候補だがHost Hyper-V administratorとguest credentialsを要し、UIを操作する対話セッションとは分ける。
- Test RunnerからElectronへは固定テスト手順を選ぶ。任意native-callのRPCは作らない。テスト専用IPCが必要ならLevel 2承認、sender/input validation、許可操作、明示test buildを要求する。
- VMネットワーク・clipboard・mapped folderは原則無効。必要なartifact回収チャネルは最小化し、ACL/読み書き方向と対象ディレクトリを人間が承認する。
- AgentにはHyper-V管理者権限を直接付与しない。制限broker/JEA等の候補を、固定VM IDへのscopeと攻撃面を含めて別途検証する。
- RunnerやSupervisorでElectronを強制終了して解除成功と記録しない。releaseが不明なら保存後に停止し、承認済みの場合だけ対象test VMをcheckpointから復元する。

## Experiment lifecycle

UNQUALIFIED → READY → PREFLIGHTED → BASELINED → RUNNING → RELEASE_REQUESTED → RELEASE_VERIFIED → PROCESS_EXIT_VERIFIED → POST_EXIT_WORKAREA_VERIFIED → ARTIFACTS_SEALED → PASS/FAIL/INCONCLUSIVE → VM_CHECKPOINT_RESTORED → BASELINE_REVERIFIED

- Every state transition includes Experiment ID, timestamp, actor/component, and evidence reference.
- Release, process exit, external work-area restoration, and VM restore are separate booleans/statuses.
- AppBar release cannot be inferred from a checkpoint restore, process disappearance alone, or a visually normal host desktop.
- A hypothesis may fail while cleanup passes. That run can inform the next hypothesis. Any unknown safety/environment state, timeout, artifact loss, restore failure, or out-of-scope action stops the batch.
- Pre-restore artifact export/hash check is required. Restore can target only the approved VM GUID and named checkpoint. Restore failure is a human stop.

## Evidence schema (proposal)

Each immutable experiment directory contains:

- manifest.json: schema version, experiment ID, git SHA, hypothesis, manipulated variable, expected/stop criteria, variant, timeout, VM identifier alias, start time.
- environment.json: guest Windows SKU/build, monitor count/resolution/DPI/work area, taskbar configuration, Electron/Node/Chromium/Koffi, VM/checkpoint/image identity.
- runner.jsonl: AppBar calls/results, accepted rectangle, work area, Electron/Win32/DWM bounds, Windows messages, event and measurement times, UI/screenshot references.
- sentinel.jsonl: process identity/exit code, post-process work area, guest heartbeat and OS readiness.
- supervisor.jsonl: VM state, lock, timeout, artifact collection, checkpoint restore and post-restore baseline.
- screenshots/, artifact hashes, verdict with per-check statuses and brief evidence citations.

Sensitive username/path/token data is redacted or replaced with stable run-local IDs. Screenshots are restricted to the dedicated guest desktop and retained per human-approved retention.

## Session continuation and orchestration

Persist a batch manifest independently of the Codex conversation. It contains the approved scope, source SHA, ordered hypothesis list, run counters, finished Experiment IDs, and current stop/ready state. Each run directory is immutable and has an idempotency key. On resume, the agent reads the manifest and Supervisor ledger, compares them, and continues only from a verified safe state; a missing result or nonterminal run blocks automatic replay.

Initial implementation candidate: a Codex session runs the bounded batch and stores state between turns in the authorized workspace. Cross-session auto-resume is not assumed. OpenAI documents Agents API sessions, event/webhook status, self-hosted environments, and scheduled automations, so a separate application can implement persistent orchestration. That path also needs API credentials, an application server, event/recovery handling, a self-hosted executor lifecycle, and explicit data/cost review. It is not part of the current Codex Desktop thread and is not selected for Stage 2 by this plan.

## Runtime and test control options

| Option | Strength | Limitation | Use proposal |
|---|---|---|---|
| Playwright _electron | Can launch Electron, inspect/click renderer UI, capture its page, close app. | Official API calls it experimental; native OS dialogs are not intercepted; page screenshot is not proof of desktop placement. | Optional UI adapter after version-pinned pilot, never sole native/AppBar verdict source. |
| Existing PoC IPC | Reuses existing operation endpoints/UI state. | Renderer IPC is not an external test contract; requires secure runner access and sender validation. | Reuse only if test controller invokes fixed operations with narrow interface. |
| Test-only CLI/IPC | Deterministic registration/measure/remove sequences. | Adds a new security boundary and can diverge from user UI flow; Level 2. | Candidate if UI automation is not stable; human approval first. |
| Windows UI Automation | Drives visible controls in a guest desktop, tests real user flow. | Session-bound, timing/accessibility dependence; does not capture native internal state without separate measurement. | Compare during WP-3. |
| Separate native test driver | Rich Win32/VM/process observation. | Must not own or register a duplicate AppBar; HWND lifetimes/control are complex. | Use only for read-only Sentinel measurements; actual AppBar belongs to Electron main process. |

## Independent review wait policy proposal

- Classify review scope before launch. A normal review has a bounded file/scope list and focused criteria; allow up to 10 minutes. A large cross-layer review may use 15–20 minutes. Store the selected class and deadline with the exact target SHA.
- Poll at about 60-second intervals. A completed status/result is collected immediately. Store any exposed progress as timestamped milestone summaries; lack of progress alone does not trigger early termination.
- At the configured deadline, send one concise final-verdict request. Allow one separate 60-second finalization window; if no explicit verdict for the pinned SHA arrives, record NOT_COMPLETED and the last known status/reason. If the platform offers safe cancel/close, request it once after finalization and record its result; do not treat cancellation as a verdict. Do not automatically relaunch the same review.
- `wait_agent`'s currently documented call timeout is 10–3,600 seconds; `spawn_agent` exposes no worker runtime parameter, and the documented wait result has no progress payload. The review deadline is therefore an orchestrator policy, not a platform guarantee. The hard worker limit and progress/cancellation capabilities remain a commissioning question.
- Keep three CHANGES_REQUIRED fix/re-review loops separate from polling calls, wait duration, and post-deadline finalization. A new launch after infrastructure failure is a separate bounded retry policy; the proposal is at most one manual retry after preserving the first run record and diagnosing its state.
- The review record stores request/agent IDs, launch time, base/head SHA, scope class, deadline, every observed status/time, available progress summary, final request ID/time, verdict/time, total elapsed time, and termination reason. Missing data is NOT_CAPTURED. Do not store internal reasoning.

## Work Package sequence and gates

WPs are candidates, not approved Issues or implementation authorization. See [tasks.md](tasks.md) for IDs, acceptance and approvals.

1. **WP-1 Environment qualification and isolation.** Confirm Hyper-V eligibility/license/capacity and approved VM identity; establish baseline/checkpoint, interactive desktop, network/integration settings. Human approves every host/guest setting action.
2. **WP-2 Host Supervisor safety boundary.** Fixed VM allowlist, run lock, manifest validation, timeout, state monitoring, artifact quarantine, authorized checkpoint restoration. It must be demonstrated against a harmless no-AppBar fixture before any AppBar run.
3. **WP-3 Guest Runner and Sentinel.** Qualify GUI session launch, safe test controls, read-only work-area measurement, evidence output and shutdown, first without AppBar calls.
4. **WP-4 AppBar control and release lifecycle.** Bind existing PoC to fixed runner operations; validate one 90 px register/measure/remove sequence only after WP-1–3 gates. Preserve the existing AppBar HWND, release verification, and exit guard.
5. **WP-5 Evidence packaging and verdict.** Validate schema, hashes, per-signal statuses, exit/post-exit evidence and immutable run artifact collection.
6. **WP-6 Bounded hypothesis loop, durable resume and review.** Add the 3×2 cap, static gate, one-factor manifest, durable batch state, evidence-based next hypothesis and independent review status only after WPs 1–5 and explicit policy approvals. First candidate is showInactive isolation; no run is authorized by this plan.

## Validation strategy

- Static: schema and manifest validation; allowlist and VM-ID tests; single-run lock, deadline and failure-path tests; no uncontrolled process APIs; no operation on host display.
- Non-AppBar pilot: GUI and Runner/Sentinel handshake in test VM; verify timeouts, artifact hashing, process exit and checkpoint recovery without changing any AppBar state.
- AppBar pilot: human-approved one 90 px registration and explicit release; then safe-exit/abnormal branch only as separately approved. Record API result, OS work area, visible geometry, exit code, post-exit work area independently.
- Hypothesis automation: synthetic fixture tests first, bounded-batch stop checks, one factor, max 6 runs. Only dedicated VM AppBar runtime evidence qualifies.
- Independent review: exact SHA, read-only separate context, explicit verdict. No PASS by self-review.

## Decisions and approvals

### Stage 1 decisions captured as recommendations

- Recommended candidate: dedicated disposable Hyper-V Windows 11 VM, conditional on host/guest qualification.
- Agent has no VM-admin credentials; Supervisor is a fixed-scope privileged boundary; AppBar workarea measurements occur inside the guest session, outside Electron.
- VM restore is containment/recovery only, never an AppBar release PASS.
- First autonomous hypothesis after commissioning: isolate showInactive as a single-variable experiment; not executed now.

### Not decided

- Host/guest Windows SKU and licensing, Hyper-V enablement, CPU/RAM/storage.
- VMConnect/PowerShell Direct/broker/task/interactive-session control.
- Checkpoint type and restore policy; artifact retention; network, clipboard, mapping.
- GUI control/capture technology; test-only IPC; permissions.
- Experiment timeout/release grace and batch scheduling; reviewer wait deadline/runtime, progress capability, launch retry policy, and any reviewer fallback rule change.
- Whether one bounded Codex session is sufficient or an Agents API/self-hosted executor integration is justified; data/cost/account controls for that service.
- Whether VM results are representative enough to guide physical Windows product behavior.

All are human approval or Technical Spike items, mainly Level 2/3. No accepted decision here authorizes host changes or an Issue.

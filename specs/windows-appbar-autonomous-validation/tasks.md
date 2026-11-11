# Windows AppBar自律検証基盤 — Tasks / Work Package候補

**状態:** Proposal — Issue登録・実装の許可ではない。
**Specification:** [spec.md](spec.md)
**Plan:** [plan.md](plan.md)

ここでのTask IDはこの提案内の追跡IDであり、GitHub Issue IDではない。各WPのIssue候補は人間が内容・依存・承認条件を確認してから登録する。Issue登録は実装許可を意味しない。

## WP-1 — 専用Windows環境の資格確認と隔離

**Tasks:** AVT-001–AVT-005
**Depends on:** none. **Next:** WP-2, WP-3.
**Scope:** Windows host/guest要件、ライセンス、ハードウェア、Hyper-V/Sandbox/物理候補の適合確認。人間承認後にだけ専用Windows 11 VM、対話ユーザー、baseline、checkpoint、ネットワーク/integration設定を準備。PoC/AppBarは起動しない。

- AVT-001: host edition/build、CPU virtualization、RAM/storage、Hyper-V feature/service、権限を読み取り確認する。アクセス拒否は管理者権限で自動再試行せず未確認にする。
- AVT-002: Windows guest license、VM resource/cost、画面解像度/DPI/仮想monitor、taskbar、対話sessionの要件を決定候補にする。
- AVT-003: VM ID/名前、保存先、仮想switch、clipboard、shared folders、network、credential、remote connectionをscope限定設計する。
- AVT-004: baseline/checkpointの種類、artifact capture-before-restore、VM identity validation、restore/post-restore checkを設計・資格確認する。
- AVT-005: ホスト作業領域・別VMが操作対象外である証拠を記録し、無害なGUI起動/終了を検証する。

**Acceptance:** 人間がSKU/ライセンス/権限/資源/VM isolation/checkpoint/対話GUI境界を承認し、対象VMのみを識別できる。ゲストで単一画面・承認解像度/DPI・taskbar・再起動後baselineを確認。AppBar API未実行で、ホスト/他VMへの変更がない。

**Approvals:** Hyper-V feature enablementや管理者権限、Windows license、storage/network/integration、VM create/checkpoint/restoreは人間の明示承認。Stage 1では実施しない。

## WP-2 — Host External Supervisorと復元ガード

**Tasks:** AVT-006–AVT-010
**Depends on:** WP-1 approved test VM. **Next:** WP-3, WP-4.
**Scope:** Host-side fixed-VM broker/supervisor。AppBar APIは実行しない。

- AVT-006: schema-bound manifest、fixed VM/checkpoint allowlist、Experiment ID idempotency、single-run lockを実装候補として設計する。
- AVT-007: VM state/guest heartbeat/runner deadlineを監視し、timeoutsをboundedにする。
- AVT-008: Electron/Runnerへ一度だけ通常releaseを要求し、release unknownなら停止・証拠保全・結果UNKNOWNを保持する。
- AVT-009: artifact capture/hash成功後にのみ対象VMをstop/restore。VM ID/checkpoint ID一致・状態precondition・承認済み回数を検証し、失敗時は人間報告で停止。
- AVT-010: Host/別VMへ作用する操作のdeny tests、二重起動、broker crash、restore failureを無害なfixtureで検証する。

**Acceptance:** 試験manifestから任意コマンドを実行できず、未承認VM IDは拒否される。同時runは1。deadline/heartbeat異常でrun停止。artifact回収とhash記録が先行し、checkpoint restoreとAppBar release statusは別記録。未承認VM/host/別VMへのstop/restore経路がない。

**Approvals:** Hyper-V管理権限のbroker設計（JEA/専用account等）、Host supervisor実行権限、対象VMの停止/復元はLevel 2、明示人間承認。

## WP-3 — Guest RunnerとElectron外Sentinel

**Tasks:** AVT-011–AVT-015
**Depends on:** WP-1 qualified guest; WP-2監督境界の仕様確認. **Next:** WP-4.
**Scope:** AppBar APIなしの診断アプリ/fixtureを使い、対話session起動、process lifecycle、work area read-only測定、artifact channelを確認。

- AVT-011: UI-control options (existing UI, Playwright _electron, Windows UI Automation, narrow test IPC)をElectron version/interactive session/evidence/security criteriaで比較。
- AVT-012: approved runner action allowlist、input schema、guest user-session起動方法を定義。
- AVT-013: Guest SentinelでElectron PID/tree identity、exit code、work area、display/DPI、heartbeatをElectron外から取得する。
- AVT-014: guest-only desktop screenshot optionを検証。Electron-renderer captureとwhole-desktop imageを別種別にする。
- AVT-015: process crash surrogate (non-AppBar harmless fixture), guest unavailable, logging failure時にstatus分類・停止・回収を確認する。AppBarクラッシュ試験は含めない。

**Acceptance:** Electron起動/終了が対話sessionで自動化され、SentinelはElectron外でwork areaを測る。GUI操作/Win32測定がどのユーザー・sessionで行われたか追跡可能。スクリーンショットは専用guest内でのみ取得。Runnerは許可外操作を拒否。AppBar APIは呼ばない。

**Approvals:** IPC/security boundary、guest credentials、interactive-session automation、screenshot collection/retentionはLevel 2またはprivacy判断として人間承認。

## WP-4 — AppBar Runner integrationとrelease lifecycle

**Tasks:** AVT-016–AVT-020
**Depends on:** WP-1, WP-2, WP-3 PASS. **Next:** WP-5.
**Scope:** PoC内の固定操作をGuest Runnerから順序制御。最初はsingle 90 px register/measure/explicit remove/safe exit。製品コード不変更。

- AVT-016: fixed manifest operation map to existing AppBar UI/IPC; AppBar HWND ownership stays in existing Electron main process.
- AVT-017: ABM_NEW/QUERYPOS/SETPOS, accepted rect, work area, Electron/Win32/DWM bounds, notifications/time axis collect.
- AVT-018: ABM_REMOVE and in-process release verification; block safe exit on unknown state.
- AVT-019: Electron exit code and Sentinel post-exit work area are independently measured; all release signals preserved on log failure.
- AVT-020: only after explicit approval, one non-AppBar UI pilot then one AppBar run; failure stops batch, no forced host or unrelated process cleanup.

**Acceptance:** no concurrent run; explicit no-more-than-one registration. API return and work area/visible position separate. Release unknown triggers stop. Process exit 0, external work area restoration, VM restore all separate fields. No automatic position correction.

**Approvals:** AppBar API in dedicated VM is a Level 3 runtime behavior and requires human authorization after WP-1–3. Abnormal termination/recovery testing requires separate authorization.

## WP-5 — Evidence bundle and verdict validation

**Tasks:** AVT-021–AVT-024
**Depends on:** WP-2, WP-3, WP-4. **Next:** WP-6.

- AVT-021: versioned evidence schema including all fields from AV-005; redaction and artifact retention policy.
- AVT-022: immutability/hash of manifest, run logs, screenshot, environment and reviewer status.
- AVT-023: verdict function for PASS/FAIL/INCONCLUSIVE, missing value/inconsistent status=>INCONCLUSIVE, per-signal evidence references.
- AVT-024: regression fixtures show checkpoint restore cannot mutate AppBar release result and product acceptance criteria remain separate.

**Acceptance:** artifact directory reconstructs a run from commit SHA; tampering/incomplete artifacts identified; each verdict cites evidence; no inference of SC-006 PASS from process/restore alone.

**Approvals:** retention/location and screenshot handling human approval before real evidence collection.

## WP-6 — Bounded Codex investigation loop and independent review

**Tasks:** AVT-025–AVT-030
**Depends on:** WP-1–WP-5 PASS; independent review rules clarified. **Next:** human approves each batch policy before unattended use.

- AVT-025: persist an approved batch manifest with source SHA, scope, ordered hypotheses, completed Experiment IDs, run counters, and safe resume/stop state. Reconcile it with the Supervisor ledger before continuing; do not replay an ambiguous run.
- AVT-026: enforce max 3 hypotheses × max 2 runs, one primary variable/run, finite timeout, static test gate.
- AVT-027: evidence-only hypothesis update; disallow unjustified same-condition rerun and unapproved product code changes.
- AVT-028: route only approved experiment manifests to supervisor; Agent never directly calls VM-admin interface.
- AVT-029: record review request ID, launch time, exact base/head SHA, reviewer session/agent ID, scope class, configured deadline, status polls and timestamps, available progress milestones, one final-verdict request, final status/verdict/time, elapsed wait and termination reason. Record unavailable fields as NOT_CAPTURED; never store internal reasoning.
- AVT-030: evaluate optional separate Codex session fallback as a proposed AGENTS/workflow change, with human approval; until merged, only existing Review Subagent PASS satisfies contract. Separately decide whether an Agents API/self-hosted executor is justified for durable cross-session automation; do not add API credentials or schedule runs without approval.

**Acceptance:** a batch cannot exceed six runs or proceed after unknown safety/restore/evidence status. Resume does not duplicate a run with ambiguous state. Review polling is time-based (about 60 seconds), not capped by poll count; completed results are collected immediately. Normal/large review deadlines and one post-deadline final request/grace are recorded. A missing verdict after that process is NOT_COMPLETED, not a code finding or self-PASS. Polls and finalization do not consume the existing maximum three CHANGES_REQUIRED fix/re-review loops. Any new review launch after infrastructure failure follows a separately bounded policy. Separate-session fallback and external Agents API automation have no effect before their respective policy/data/permission approvals.

**Approvals:** unattended multi-run authority, first hypothesis showInactive isolation, reviewer fallback rule changes, runtime/dependency/IPC changes require human approval at the appropriate Level 2/3 gate.

## Proposed issue candidates (not registered)

| Candidate | Feature / Tasks | Depends on | Approval gate |
|---|---|---|---|
| Qualify and isolate dedicated Windows VM | AV-001; AVT-001–005 | none | host SKU/license/Hyper-V privileges/VM integration/checkpoint human approval |
| Build fixed-scope external supervisor | AV-002, AV-004; AVT-006–010 | VM candidate | Level 2 privileged boundary and restore authorization |
| Build guest Runner/Sentinel without AppBar | AV-003, AV-004; AVT-011–015 | VM + supervisor design | IPC/credentials/session/capture approval |
| Integrate bounded AppBar test and release verification | AV-002–005; AVT-016–020 | WP-1–3 PASS | Level 3 AppBar runtime approval |
| Package evidence and verdicts | AV-005; AVT-021–024 | WP-2–4 | artifact retention/privacy approval |
| Add bounded hypothesis exploration | AV-006–007; AVT-025–030 | WP-1–5 PASS | unattended batch + review-policy approval |

## Human approval checklist before any Stage 2 execution

- [ ] Choose Hyper-V VM as first environment or state an alternative; approve Windows host/guest edition, license, capacity, and storage.
- [ ] Explicitly authorize any Hyper-V enablement/admin role, creation of one named/ID-pinned disposable VM, and its checkpoint/restore lifecycle.
- [ ] Approve guest network, clipboard, mapped folders, PowerShell Direct/VMConnect, credentials, host broker permissions, and whether Codex may submit runs to it.
- [ ] Approve the first no-AppBar Runner/Sentinel commissioning WP and then separately authorize the first 90 px AppBar run.
- [ ] Approve maximum run timeout/release grace, artifact location/retention/screenshot boundary, and initial batch limit.
- [ ] Decide whether a separate Codex session may be an independent-review fallback; until then current AGENTS rule applies.
- [ ] Decide whether Codex Desktop with durable manifests is sufficient or a separate Agents API/self-hosted executor is worth its credentials, runtime, data-control, and maintenance scope.
- [ ] Approve WP order and which Work Packages may be registered as GitHub Issues. This does not approve implementation or merge.

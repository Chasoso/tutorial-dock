# GitHub Issue candidates (simulation only)

実際のIssueは作成していない。下記は修正版Tasksから模擬した候補である。GitHub拡張の現行Skillは、タスクIDをタイトルの `T001: ...` にし、既存IssueをタスクIDで重複確認してから作成する。要求IDを自動生成・自動継承する機能は確認できないため、タスク本文へ参照を残す必要がある。

## Candidate 1 — State and bounded navigation

- Task IDs: T001, T002
- Requirement refs: R-04, R-05
- Suggested title: `T001: Define guide-bar fixture state and bounded step transitions`
- Done when: loaded/unloaded state、current index、前/次の境界no-op、派生summaryがテスト可能。
- Dependency: none

## Candidate 2 — Guide bar rendering

- Task IDs: T003, T004, T005
- Requirement refs: R-01, R-04, R-09
- Suggested title: `T003: Render the fixed-height mouse-operated guide bar`
- Done when: 上部枠なし表示、番号/総数、タイトル/説明、未読み込み、固定heightが確認可能。
- Dependency: Candidate 1

## Candidate 3 — Component and UI verification

- Task IDs: T006, T007
- Requirement refs: R-01, R-04, R-05, R-09
- Suggested title: `T006: Verify guide-bar display, navigation, and boundary behavior`
- Done when: fixture、隣接遷移、先頭/末尾、未読み込み、マウス操作を自動検証。
- Dependency: Candidate 2

## Candidate 4 — Scope review

- Task IDs: T008
- Requirement refs: all exclusions
- Suggested title: `T008: Review guide-bar feature scope against excluded capabilities`
- Done when: AppBar等の対象外実装が混入していない。
- Dependency: Candidates 1–3

## 二重管理とImplement比較

GitHub拡張は `tasks.md` のタスクをIssueへ展開するが、Issue本文と`tasks.md`の完了状態を双方向同期するものではない。既存Codex Issue-to-PR方式ではIssueを作業入口、PRレビューを完了ゲートとする運用が自然である。推奨は、Issueを実行・レビューの正本、`tasks.md`を生成時点の計画スナップショットと定義し、完了更新はPRからIssueへ集約すること。Lean Implementを併用する場合は、タスクチェックとIssue状態の二重更新が発生し得るため、今回の既存フローではImplementを標準化しない。

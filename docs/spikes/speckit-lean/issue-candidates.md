# GitHub Issue candidates (simulation only)

実際のIssueは作成していない。以下は依頼文の対象範囲から人手で作った候補であり、Spec KitのTasks出力から変換したものではない。正式な仕様IDやIssue番号ではない。

## Candidate 1: Guide bar fixture and display state

- Suggested title: `TD-GUIDE-01/02/03/04/07: Render guide bar states from a fixed fixture`
- Scope: 上部表示、通常表示、番号/総数、タイトル/説明、未読み込み表示
- Done when: fixtureあり/なしの表示確認、約90pxを暫定値として固定しない、対象外機能を含めない
- Verification: UI tests for loaded and unloaded fixture states
- Dependencies: none in this spike; actual repository structure must be confirmed first

## Candidate 2: Step navigation and boundary behavior

- Suggested title: `TD-GUIDE-05/06/08: Add mouse navigation with boundary protection`
- Scope: 前/次クリック、先頭/末尾での不変性
- Done when: 中間ステップの前後遷移と両端の範囲外操作を検証できる
- Verification: sequential mouse interaction tests
- Dependencies: Candidate 1's state fixture and rendered controls

## 二重管理の評価

Spec Kit GitHub拡張は `tasks.md` のタスクIDをタイトル（例 `T001: ...`）に含め、既存Issueを検索して重複作成を避ける方式と説明されている。しかし、依頼中のTD-GUIDE-*要求IDが自動的にGitHub Issueへ引き継がれる保証は資料上確認できない。したがって、採用する場合はタスク本文へ要求ID、受入条件、依存関係、検証方法を明示し、Issueは実行単位の正本、`tasks.md` は生成時点の計画スナップショットとする運用規約が必要になる。

## Implementとの比較

Standard/LeanのImplement工程は `tasks.md` のタスクを順に実行し進捗を記録する前提だが、既存のCodex Issue-to-PR方式はIssueを作業の入口、PRレビューを完了ゲートとする。このSpikeではImplementを実行していないため、両者の実際の更新競合、タスク完了記録とIssue状態の同期、レビュー後の再計画は未検証である。Issue連携だけを採用する場合は、`tasks.md` の編集とIssue状態更新を誰が行うかを先に決める必要がある。

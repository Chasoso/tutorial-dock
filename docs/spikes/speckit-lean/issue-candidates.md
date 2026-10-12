# GitHub Issue candidates (simulation only)

実際のIssueは作成していない。以下は、Tutorial Dockの検証結果から導いた運用案であり、正式な開発ルールではない。`tasks.md` は計画時点の成果物、GitHub Issueは実装進捗の正本とする前提で、実装と対応テストを同じIssue・PRへ含める。

## Candidate 1 — Guide bar basic display implementation and verification

- Task IDs: T001–T007
- Requirement refs: R-01, R-04, R-05, R-09
- Suggested title: `T001: Implement and verify guide-bar basic display`
- Scope: 固定fixtureと状態、前/次のbounded transition、上部枠なし表示、番号/総数、タイトル/説明、固定高さ、未読み込み表示、マウス操作、境界条件テスト。
- Done when: 実装と対応するcomponent/UIテストが同じPRに含まれ、loaded/unloaded、中間遷移、先頭/末尾、固定高さ、マウス操作を検証できる。
- Dependencies: none within this feature; actual source/test paths remain repository-level decisions.
- Review boundary: one independently implementable, verifiable, and reviewable feature unit.

## PR quality gate — not a separate Issue

- Task: T008
- Requirement refs: scope exclusions
- Check: AppBar、作業領域予約、折りたたみ、マルチディスプレイ、画像ビューア、YAMLパーサー、ポータブルexe、グローバルショートカットをこのPRへ混入させない。
- Handling: 通常のPRレビュー・チェックリスト・CI品質ゲートに含める。独立Issueは作成しない。

## 推奨運用案（未承認）

- `tasks.md`: Specify/Plan/Tasksで生成される計画スナップショット。実装進捗の正本にはしない。
- GitHub Issue: 実装・テスト・レビューを束ねる作業単位とし、進捗の正本にする。
- PR: Issueの完了ゲート。実装と対応テストを同一PRへ含める。
- 要求ID: Spec Kitの自動継承を前提にせず、Issue本文または対応表でR-01等を手動参照する。
- T008相当のスコープ確認: Issueへ分離せず、PR品質ゲートとして扱う。

この運用案は今回の単一機能の検証結果に基づく推奨であり、正式採用・適用済みの開発ルールではない。

## GitHub拡張との関係

GitHub拡張は `tasks.md` のT###をIssueタイトルへ使い、既存IssueをタスクIDで重複確認してから作成する。しかし、要求IDの自動継承、実装とテストのIssue統合、`tasks.md`との双方向同期は提供方式から確認できない。そのため、上記の1 Issueへまとめる運用は、標準変換後に人間がレビュー・再編成する推奨案であり、自動変換結果そのものではない。

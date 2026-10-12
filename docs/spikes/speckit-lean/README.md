# Spec Kit Lean Technical Spike

## 目的

Tutorial Dockのガイドバー基本表示を題材に、GitHub Spec Kit Leanが既存要求、仕様、計画、タスク、検証方法を一貫してつなげられるかを評価する。これはアプリ実装ではなく、SDDフレームワークの評価である。

## 実施結果の要約

このcheckoutは `README.md` のみを含む初期コミットで、指定された `docs/requirements.md` と `docs/design.md` は存在しなかった。また、実行環境に `uv` と `specify` がインストールされていなかった。そのため、公式CLIを推測して代替実行せず、Specify/Plan/Tasksは未実行として記録した。以下の `generated/` は生成物ではなく、未実行理由を保存する監査用プレースホルダーである。

## 確認した環境

- Repository: `https://github.com/Chasoso/tutorial-dock`
- Starting revision: `25f5ef3` (`Initial commit`)
- Work branch: `spike/speckit-lean-evaluation`
- Host: Codex desktop, Windows, PowerShell, Asia/Tokyo
- Python: `3.13.7`
- `uv`: not found
- `specify`: not found
- Official Spec Kit latest release checked on 2026-10-12: `1.1.3`
- Lean preset manifest version: `1.0.0`; required Spec Kit: `>=0.6.0`

## 公式資料で確認した手順

Spec Kitの公式READMEは、CLI導入後に `specify init <project> --integration codex` を使い、Codexではエージェント内で `$speckit-specify`、`$speckit-plan`、`$speckit-tasks` を順に呼ぶ方式を示している。Leanは同梱プリセットであり、初期化済みプロジェクト内で `specify preset add lean` を実行する。GitHub Issue連携は、現在は `specify extension add github` 後の `$speckit-github-taskstoissues` が推奨されるオプトイン拡張である。

## 再現手順（未実行）

以下は公式資料に基づく手順であり、この作業ではCLI未導入のため実行していない。実行する場合は本リポジトリ外の一時ディレクトリを使い、成果物をこのリポジトリへ直接初期化しない。

```powershell
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.1.3
specify init <isolated-copy> --integration codex
Set-Location <isolated-copy>
specify preset add lean
# Codex agent chat:
$speckit-specify <explicit scope and requirements>
$speckit-plan
$speckit-tasks
```

GitHub Issue登録を伴うコマンドは今回の検証では実行しない。公式拡張を使う場合でも、`$speckit-github-taskstoissues` は登録前に模擬出力をレビューする段階を別途設ける必要がある。

## 成果物の読み方

- [baseline.md](baseline.md): 固定した比較基準。要求書不在のため、正本由来の確定要件とは扱わない。
- [generated/spec.md](generated/spec.md): Specify未実行の理由。
- [generated/plan.md](generated/plan.md): Plan未実行の理由。
- [generated/tasks.md](generated/tasks.md): Tasks未実行の理由。
- [traceability.md](traceability.md): ユーザー提示スコープからの暫定対応表。
- [issue-candidates.md](issue-candidates.md): Issue登録なしで作った候補。Spec Kit生成タスクの代替ではない。
- [evaluation.md](evaluation.md): 採点、未解決事項、推奨案。

## 制約遵守

本番ソース、既存仕様書、アプリ依存関係、実行ファイル、Issue、PR、main、開発ルールは変更していない。Pushも行っていない。

## 参照した公式資料

- https://github.com/github/spec-kit
- https://github.com/github/spec-kit/blob/main/presets/lean/README.md
- https://github.com/github/spec-kit/blob/main/presets/lean/preset.yml
- https://github.com/github/spec-kit/blob/main/docs/reference/presets.md
- https://github.com/github/spec-kit/blob/main/extensions/github/README.md
- https://github.github.com/spec-kit/reference/integrations.html

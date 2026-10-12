# Spec Kit Lean Technical Spike

## 目的

Tutorial Dockのガイドバー基本表示を題材に、GitHub Spec Kit Leanが既存要求、仕様、計画、タスク、検証方法を一貫してつなげられるかを評価する。これはアプリ実装ではなく、SDDフレームワークの評価である。

## 再実行結果

初回は `main` の取得漏れにより要求書不在として停止した。2026-10-12に `origin/main` をfetchし、検証ブランチへマージした後、要求書・設計書を確認できたため、隔離コピーでLeanを実行した。初回生成物は `generated/` に保存し、Issue追跡性を高めるための修正版Tasksを `revised/` に保存した。

## 確認した環境

- Repository: `https://github.com/Chasoso/tutorial-dock`
- Work branch: `spike/speckit-lean-evaluation`
- Base merged: `origin/main` at `0290714`
- Host: Codex desktop, Windows, PowerShell, Asia/Tokyo
- Python: `3.13.7`
- Spec Kit: `1.1.3` via `uvx --from git+https://github.com/github/spec-kit.git@v1.1.3`
- Lean preset: `1.0.0`, installed successfully with `specify preset add lean`
- Codex integration: initialized with `--integration codex --integration-options="--skills"`
- GitHub extension: `github` `1.0.2`, installed for inspection only
- Isolated copy: temporary directory outside the repository (not part of the repository)

## 実行した工程

1. `specify init --here --force --non-interactive --integration codex --integration-options="--skills"`
2. `specify preset add lean`
3. Codex Lean skill相当のSpecifyを `specs/guide-bar-basic-display/spec.md` へ実行
4. Planを同ディレクトリの `plan.md` へ実行
5. Tasksを同ディレクトリの `tasks.md` へ実行
6. `specify extension add github` を実行。Issue作成Skillは読んだが、Issue変換は実行していない

## スコープ入力

正本 `docs/requirements.md` のR-01、R-04、R-05、R-09から、ガイドバー基本表示、固定高さ、ステップ番号/総数、タイトル/説明、前後移動、境界防止、教材未読み込み、マウス操作だけを抽出した。AppBar、作業領域予約、折りたたみ、マルチディスプレイ、画像ビューア、YAMLパーサー、ポータブルexe、グローバルショートカットは明示的に除外した。

## 参照した公式資料

- https://github.com/github/spec-kit
- https://github.com/github/spec-kit/releases/tag/v1.1.3
- https://github.com/github/spec-kit/blob/main/presets/lean/README.md
- https://github.com/github/spec-kit/blob/main/presets/lean/preset.yml
- https://github.com/github/spec-kit/blob/main/docs/reference/presets.md
- https://github.com/github/spec-kit/blob/main/extensions/github/README.md
- https://github.github.com/spec-kit/reference/integrations.html

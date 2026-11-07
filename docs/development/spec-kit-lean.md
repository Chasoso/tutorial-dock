# Spec Kit Leanのセットアップと運用

この文書は、Tutorial DockでSpec Kit LeanのSpecify・Plan・Tasksを再現可能に利用するための手順を定める。開発工程と承認境界は[開発ワークフロー](workflow.md)および[仕様ポリシー](specification-policy.md)を正本とする。

## 固定バージョン

| 要素 | 固定値 | 用途 |
|---|---|---|
| Spec Kit CLI | `1.1.3` | CLIと同梱アセット |
| Lean preset | `1.0.0` | Specify・Plan・Tasks用プロンプト |
| Codex integration | `codex`、Skills形式 | `.agents/skills/`へのSkill配置 |

この組み合わせはPR #2の隔離検証を再現するために固定した。2026-11-07時点で公式リポジトリには`v1.3.2`が公開されているが、本リポジトリでは更新互換性を確認するまで`1.1.3`を使う。バージョンを上げる場合は、公式リリースノートとCodex integrationの変更を確認し、隔離コピーで生成物を比較してから別の変更として提案する。

## 確認した実行環境

- Codex Desktop上のWindows環境、PowerShell。
- Python `3.13.7`、ユーザー領域の`uv` / `uvx` `0.13.7`。
- `specify` CLI `1.1.3`。`specify check`ではCodex CLIが利用可能と報告された。
- `uv`のPython Scriptsディレクトリと`uv tool`のbinディレクトリをユーザーPATHへ追加した。システムPATHや管理者設定は変更していない。

この変更ではSkillファイルの配置、Codex integration状態、CLIのpreset解決を検証した。Skill名を実際のCodexチャットから呼び出す確認は、この変更前から開いているセッションでは行っていない。Skill追加後にCodexでワークスペースを再読み込みし、チャットから呼び出せることを確認する。

## リポジトリに含めるファイル

| パス | 役割 |
|---|---|
| `.agents/skills/speckit-specify/SKILL.md` | `spec.md`生成Skill |
| `.agents/skills/speckit-plan/SKILL.md` | `plan.md`生成Skill |
| `.agents/skills/speckit-tasks/SKILL.md` | `tasks.md`生成Skill |
| `.specify/presets/lean/` | Lean presetの公式メタデータとプロンプト |
| `.specify/presets/.registry` | presetの固定バージョンとCodexへ登録する工程 |
| `.specify/integration.json` | Codex Skills integrationのプロジェクト設定 |
| `.specify/integrations/codex.manifest.json` | Codex integrationの管理対象ファイル一覧 |
| `.specify/integrations/speckit.manifest.json` | 共通Spec Kit基盤の管理対象ファイル一覧 |
| `.specify/.gitignore` | feature切替時のローカル状態等を除外 |
| `.specify/scripts/powershell/` | CLI共通のfeature path・テンプレート準備支援 |
| `.specify/templates/` | CLI共通テンプレート |
| `.gitattributes` | 管理対象ファイルのLFを固定し、CLIのSHA-256 manifestを各OSで安定させる |

Lean 1.0.0の公式presetにはImplementとConstitutionのプロンプトも含まれるが、本リポジトリの登録対象はSpecify・Plan・Tasksの3つに限定する。`$speckit-implement`やIssue自動作成Skillは`.agents/skills/`へ含めず、標準工程にも加えない。preset内の公式ファイルはバージョン由来の参照用アセットとして保持する。

`.specify/scripts/powershell/`と`.specify/templates/`はLeanの3 Skillから直接呼び出されないが、Spec Kit CLIの共通基盤manifestが管理対象として要求し、欠けると`specify integration status`がエラーになるため、固定CLI版の生成物を含める。これらの存在は標準テンプレート方式への切替を意味しない。生成される`.specify/memory/constitution.md`は追加しない。プロジェクトの開発ルールは既存の`AGENTS.md`と`docs/development/`を参照し、ルールを重複させない。

## 新しいPCでのセットアップ

1. Windows用の[uv公式インストール手順](https://docs.astral.sh/uv/getting-started/installation/)に従い、ユーザー領域へ`uv`を導入する。管理者権限やシステムPATHは使わず、必要ならユーザーPATHにuvの実行ディレクトリを追加する。
2. PowerShellを開き、CLIを指定バージョンでインストールする。

   ```powershell
   uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v1.1.3
   specify --version
   ```

   バージョン表示が`specify 1.1.3`であることを確認する。Codex Skillsはリポジトリ管理下にあるため、通常の利用開始時に`specify init`や`specify integration install`を実行する必要はない。

3. Codexでこのリポジトリを開き直すか、ワークスペースを再読み込みする。Codexは`.agents/skills/`のSkillを読み込み、チャットで`$speckit-specify`、`$speckit-plan`、`$speckit-tasks`を選択できる。
4. CLIのpreset状態はリポジトリのルートで確認する。

   ```powershell
   specify integration status
   specify preset list
   specify preset resolve speckit.specify
   specify preset resolve speckit.plan
   specify preset resolve speckit.tasks
   ```

   3つのresolve結果が`.specify/presets/lean/commands/`を指し、presetが`1.0.0`として有効であることを確認する。確認のために`specify init --force`を実リポジトリで実行しない。

## Skillの利用

- Specifyには人間の作業指示と既存の要求・仕様を渡し、出力先を`specs/<feature-slug>/spec.md`とする。
- Planは現在有効な仕様と`docs/design.md`を基に`plan.md`を作る。
- Tasksは仕様・Planから`tasks.md`を作る。要求IDの自動継承を仮定せず、対応関係を確認する。
- 生成物は直ちに承認済みとはみなさない。未確定の製品判断やLevel 2/3技術判断を推測で確定しない。
- `specify init`は既存ファイルをマージ・上書きする場合がある。初期化やintegration再生成が必要な場合は、先に隔離コピーで差分を確認する。既存の`AGENTS.md`、要求、設計、開発ルールへ初期化結果を上書きしない。
- 実リポジトリで`specify preset add lean`を再実行しない。上流presetの全コマンドを登録し、Implementを含むSkillを生成・置換し得る。現在の選択状態は追跡済みのpreset registryで保つ。
- GitHub拡張、Issue自動登録、Spec Kit Implementを標準フローとして使わない。Issue登録と実装開始は[開発ワークフロー](workflow.md)の承認条件に従う。

## バージョンアップ

1. 公式Spec Kitのリリース、[Codex integration](https://github.com/github/spec-kit/blob/main/docs/integrations/codex.md)、Lean presetの変更を確認する。
2. CLIを更新する前に隔離コピーでCodex integrationとLean presetを生成する。
3. Skillの配置、`spec.md`・`plan.md`・`tasks.md`の保存先、既存の仕様ID・承認ルールとの整合性を確認する。
4. 新たなSkillや自動Issue作成、Implementを標準化する変更は含めず、必要な差分だけをレビュー可能なPRで提案する。

## 公式資料

- [Spec Kit repository](https://github.com/github/spec-kit)
- [Spec Kit v1.1.3 release](https://github.com/github/spec-kit/releases/tag/v1.1.3)
- [Codex integration guide](https://github.com/github/spec-kit/blob/main/docs/integrations/codex.md)
- [Lean preset README](https://github.com/github/spec-kit/blob/v1.1.3/presets/lean/README.md)
- [Lean preset manifest v1.0.0](https://github.com/github/spec-kit/blob/v1.1.3/presets/lean/preset.yml)

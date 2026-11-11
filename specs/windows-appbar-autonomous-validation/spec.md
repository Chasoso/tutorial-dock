# Windows AppBar自律検証基盤

**状態:** Proposal — human review required; merge前に承認済みの仕様として扱わない。
**段階:** Stage 1 Specify。VM、Runner、Supervisor、製品コードはまだ作らない。

## 1. Overview

Tutorial DockのWindows AppBarは、Windows作業領域の予約に成功する一方、Electronのバー表示位置が予約位置と一致しない問題を持つ。現在はPoCと人間による手動実験で調査している。目的は、専用の隔離Windows環境でCodexが仮説・一要素実験・測定・証拠整理を反復し、人間が毎回PowerShellを実行したり画面を撮影したりしなくても技術的原因の調査を進められるようにすることである。製品要求の正本は[docs/requirements.md](../../docs/requirements.md)、既存の機能期待値は[Windows AppBar仕様](../windows-appbar/spec.md)である。

この仕様は開発・検証基盤の期待動作を提案する。docs/requirements.mdおよびAppBar仕様の製品挙動を変更せず、PoC結果を製品受け入れ条件のPASSへ自動変換しない。現時点の環境候補は専用Hyper-V VMだが、その利用可否とAppBar意味論は未確認である。

### Scope

- Investigation Agent、Electron Test Runner、Electron外のExternal Supervisorの責任境界。
- 1件ずつの隔離AppBar実験、測定、証拠回収、停止と専用VMの復元。
- 再現可能な実験識別子・commit・環境・ログ・判定の記録。
- 事前承認後の上限付き仮説探索と独立レビューの完了記録。

### Out of scope

- Windows AppBarの位置修正、製品アーキテクチャ/仕様の変更。
- Hyper-V/Sandboxの有効化、VM作成、OS設定・ライセンス変更。
- このSpecifyでのElectron起動、AppBar API、実機検証。
- Issue登録、実装、PRマージ、Spec Kit Implement。
- まだ承認されていない任意ホストコマンド実行、権限拡大、レビュー規約変更。

## 2. Source traceability

この機能は検証基盤であり、新しい製品要求を追加しない。既存IDは変えない。

| Feature ID | Source | この基盤が支援すること |
|---|---|---|
| AV-001 | [docs/requirements.md](../../docs/requirements.md) R-02、安全性/復旧性NFR; AB-002, AB-007 | AppBar試験を専用Windows環境に閉じ込め、製品要件と試験環境の結果を区別する。 |
| AV-002 | R-02; AB-002–AB-008 | 1回のrunで環境、予約、作業領域、各window rect、メッセージ、終了、解除を観測する。 |
| AV-003 | R-02, R-03; AB-001–AB-008 | 対話Windowsデスクトップ上のElectron PoCを許可操作だけで試験する。マルチディスプレイは別承認まで必須にしない。 |
| AV-004 | 復旧性NFR; AB-007, AB-008 | Electron外の測定・監視と、VM単位の停止/復元を分離する。 |
| AV-005 | AB-002–AB-008; TS-01–TS-08 | JSON/JSONL等の根拠をcommit SHAに結び付け、個別runをPASS/FAIL/INCONCLUSIVEで判定する。 |
| AV-006 | [開発ワークフロー](../../docs/development/workflow.md)のIssue/承認境界、Technical Spike方針 | 仮説数・run数・変更変数を制限し、製品変更やLevel 2/3判断を人間へ戻す。 |
| AV-007 | [AGENTS.md](../../AGENTS.md) independent review contract; [workflow.md](../../docs/development/workflow.md) | 独立レビューの実施状態を証拠付きで保持し、自己レビューを代替にしない。 |

## 3. User scenarios

### Scenario 1: qualified VMでの実験

Given 人間が専用VM、権限、基準checkpoint、検証範囲を承認し、VMが既知baselineにある
When Codexが固定commitと1つの仮説を含むマニフェストを送る
Then Supervisorは対象VM IDと実行上限を検証し、1つのrunだけ許可し、実験後の証拠を回収する。

### Scenario 2: 通常のAppBar登録と終了

Given VM内の対話セッション、単一ディスプレイ、許可済み解像度/DPI、基準work areaが確認済み
When Runnerが許可された登録・測定・解除・Safe exit操作を行う
Then JSONL/API結果、work area、ウィンドウ矩形、解除状態、Electron外終了コード、終了後測定は個別に記録される。

### Scenario 3: AppBar解除または測定が不明

Given ABM_REMOVEが失敗、release verificationが不明、またはGuest Sentinelが終了後work areaを測定できない
When runが停止条件に到達する
Then Supervisorは次の実験を禁止し、release=UNKNOWNを保持し、証拠を回収できる範囲で保存する。checkpoint復元が成功しても正常解除とは記録しない。

### Scenario 4: Electron異常終了またはゲスト停止

Given Electronが異常終了、またはguest heartbeat/VM状態が期限内に戻らない
When Supervisorが異常を検知する
Then runは成功扱いされず、他VM/ホストに触れず、事前承認済み条件に合う場合だけ対象VMを停止・復元する。復元不能なら停止し人間に報告する。

### Scenario 5: bounded exploration

Given runの静的チェックと安全preflightがPASSし、直前runの解除・終了・baseline・artifact条件がすべて確認済み
When Agentが次の仮説を選ぶ
Then 1 batch最大3仮説、各最大2 run、主要変更1要素の範囲で進み、上限または不明状態で停止する。

### Scenario 6: independent reviewが完了しない

Given 独立Reviewerの起動または最終判定が確認できない
When Reviewerが処理中の間、承認済みreview deadlineまで状態を確認する
Then poll回数だけで打ち切らず、完了通知があれば直ちにverdictを取得する。期限後に最終判定を一度だけ要求し、追加の60秒以内に受領できなければ最後のstatusと終了理由を記録してNOT_COMPLETEDとし、self-reviewをPASSにしない。別Codexセッションは人間の承認前に正式な代替扱いされない。

## 4. Functional requirements

### AV-001 — 専用環境への隔離

AppBar登録を伴うrunは、明示的に識別された専用Windows test VMまたは別途人間承認された専用端末に限定する。開発ホストのデスクトップ、作業領域、他VMを実験対象にしない。Hyper-Vは第一候補だが、VMでのShell/AppBar挙動が仕様どおりとは仮定しない。

### AV-002 — runの単一実行と識別

各runに一意なExperiment ID、git commit SHA、仮説、変更変数、環境要件、開始/終了時刻、許可操作、timeout、成果物を持つマニフェストを付与する。同時AppBar runは1件までとし、Supervisorは二重起動を拒否する。

### AV-003 — 制限付きTest Runner

Runnerはゲストの対話デスクトップ内でElectron PoCを制御し、許可された操作のみ実行する。AppBarのHWNDとネイティブ呼出しはElectron main processが所有する。Runnerが任意Win32 APIや任意シェルを指定できない。GUI操作手段（Playwright Electron/UI Automation/狭いtest IPC）は技術選定前に比較し、追加IPCはLevel 2承認を要する。

### AV-004 — Electron外監視と復旧

Guest SentinelはElectronとは別プロセスとして、プロセス終了コードと終了後work areaを測る。Host SupervisorはVM状態と期限を監視し、ゲストOS停止をElectron異常終了と区別する。正常解除、Electron終了、終了後work area復帰、Hyper-V checkpoint復元を別々の状態として記録する。

### AV-005 — 根拠付きのrun結果

証拠にはExperiment ID、commit、Windows/仮想ディスプレイ情報、Electron/Node/Chromium/Koffi、仮説・変数、AppBar API結果、accepted rect、work area、Electron/Win32/DWM rect、Windowsメッセージと時刻、必要な画面画像、JSONL、解除結果、終了コード、終了後work area、VM lifecycle、判定根拠を含む。取得できない項目は理由と未確認状態を残す。

run verdictはPASS、FAIL、INCONCLUSIVE。API成功だけで表示位置や製品AcceptanceをPASSにしない。製品SC-006等は実験run verdictから独立させる。

### AV-006 — bounded、自動停止する探索

承認後のbatchは最大3仮説、各仮説最大2 run、合計最大6 run。主要な実験条件は1つだけ変更し、run前に静的検証を通す。timeoutは有限で事前設定する。解除/終了/外部測定/環境baseline/成果物のいずれかが失敗または不明なら、次のrunを止める。人間が承認した権限・VM・ネットワーク境界を超える操作は自動で行わない。

### AV-007 — 独立レビュー状態の正確な記録

別コンテキストのread-only Review Subagent、対象HEAD SHA、起動/実行/完了状態、明示的判定を記録する。レビュー基盤の無応答と実コードFindingを区別する。判定を受領できなければNOT_COMPLETEDであり、自己レビューや未承認の別セッションで補完しない。正式なfallback導入は人間の承認を要する。

待機は回数上限ではなく、起動時に定めた経過時間deadlineで管理する。通常規模のレビューは最大10分、大規模レビューは最大15〜20分を提案し、状態は約60秒ごとに確認する。期限後に最終判定を一度だけ要求し、最終化猶予を60秒とする。猶予後も実行中で、安全なcancel/close機能がある場合は一度だけ終了を要求し、終了応答をverdictと混同しない。レビュー期限、最終化猶予、CHANGES_REQUIREDへの修正・再レビュー最大3 loopは別々に記録し、poll数を修正loopとして数えない。具体的な実装は利用するreview基盤の実行時間・進捗通知の能力を確認してから決める。

## 5. Success criteria

| ID | Criteria | Evidence |
|---|---|---|
| AV-SC-001 | run中のAppBar操作が専用環境に限定され、開発ホストと他VMに対する操作がない。 | Supervisor監査ログに固定VM ID、操作allowlist、host baselineが記録される。 |
| AV-SC-002 | 同時runは最大1つで、実行期限が設定される。 | 競合要求の拒否と期限到達停止を専用VMで確認する。 |
| AV-SC-003 | Electronが異常終了しても、ゲストOSが稼働している場合はSentinelが終了状態とwork areaを測定する。 | Electron外から得たprocess status/exit codeおよびwork area記録。 |
| AV-SC-004 | guest OS停止をHost Supervisorが検知し、AppBar正常解除とは別判定にする。 | VM lifecycleログ、release=UNKNOWN、run=INCONCLUSIVE等の結果。 |
| AV-SC-005 | 証拠一式がcommit SHA・Experiment IDに追跡可能で、欠落/改ざん検知に必要なハッシュがある。 | 保存済みmanifest、JSONL、画像、hash検証結果。 |
| AV-SC-006 | 未確認の解除/終了/復帰または環境driftが次runをfail-closedで止める。 | 安全な失敗注入を隔離VMで行い、次run拒否と対象VM復元を確認する。 |
| AV-SC-007 | 3仮説×2 run上限、one-factor条件、事前静的ゲートを越えない。 | 上限境界テストと監査ログ。 |
| AV-SC-008 | checkpoint復元後も直前runはAppBar解除PASSと誤判定されない。 | 復元とreleaseを異なるrecord field/statusで確認。 |
| AV-SC-009 | Reviewerの処理中状態をpoll回数だけで早期終了せず、承認済みdeadline後の一度の最終判定要求と60秒の最終化猶予を経てもverdictが得られない場合にNOT_COMPLETEDとする。基盤未完了はコードFindingと区別される。 | review recordにrequest ID、起動時刻、base/head SHA、session/agent ID、scope分類、deadline、各pollの時刻/status、取得可能な進捗、最終要求ID/時刻、verdict/時刻、経過時間、終了理由を記録。欠落値はNOT_CAPTUREDとし、自己レビューで補わない。 |

Success criteriaのWindows実行確認は専用VMの承認後に限る。本書の作成はどのruntime criteriaのPASSも意味しない。

## 6. Assumptions and open questions

- Hyper-V VMが物理Windows AppBarの代表的な挙動を示すか未検証。
- ホストでHyper-Vが利用可能か、現在の読み取り環境では確定できない。
- Guest Runnerを既存UI・Playwright・Windows UI Automation・制限付きIPCのどれで制御するか未決定。
- PowerShell DirectはGUI制御セッションではない。対話デスクトップへの起動方法を別途検証する。
- 正確なrun timeout、release grace、ログ保持期間、VM資源/ライセンス/費用は未決定。
- checkpoint種類と異常時復元手順は、対象VM IDの固定と証拠保全を検証してから決める。
- 全画面画像の取得・回収・保存境界は未決定。
- reviewer fallbackを正式ルールへ入れるか未決定で、現行AGENTSを変更しない。
- 10分/15〜20分deadlineと60秒pollを現在のReview Subagent基盤で安定して運用できるか、workerのhard limitやprogress通知が提供されるか未確認。

## 7. Technical Spike candidates

1. Hyper-V guestの対話デスクトップ、1920×1080/96 DPI、標準taskbarの再現性とAppBar挙動を既知の物理実測と比較する。
2. Host SupervisorがPowerShell Direct等で固定VMだけを操作し、Guest SentinelをGUIセッションと分離して動かせるか調べる。
3. Electron main-process controlled test command、Playwright/UI Automation、画面全体captureの境界を検証する。
4. Electron crash / guest hangでの外部検知、ログ保全、限定VM checkpoint復元、再起動後baseline確認を検証する。
5. 対象commit・バージョン・測定値・JSONL・画像・終了結果を一 run packageとして封印し、判定を再現する。

## 8. Human approval boundary

本仕様のマージは自律実験の実行承認ではない。Stage 2開始前に、環境、権限、ゲストOSライセンス、ネットワーク/clipboard/共有フォルダ設定、VM固有の復元許可、時間・回数上限、試験可能API、レビューfallbackを人間が明示承認する。

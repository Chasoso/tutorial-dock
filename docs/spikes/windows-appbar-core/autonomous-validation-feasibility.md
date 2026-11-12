# Windows AppBar自律検証 — Stage 1 実現可能性・技術設計

**状態:** 提案。人間が承認するまで仕様・設計・計画は正本ではない。
**調査範囲:** 読み取り専用の環境確認と既存資料・公式文書の調査。VM作成、Windows設定変更、Electron起動、AppBar API実行はしていない。

## 1. 要約と推奨

推奨候補は、専用の破棄可能なWindows 11 Hyper-V VMを実験対象とし、Electronとは別のホスト側SupervisorがVM状態・タイムアウト・回収・復元を管理する構成である。ゲストには対話ログオンされた通常ユーザーのデスクトップを用意し、ゲスト内のRunnerがElectronを操作する。Investigation AgentにはHyper-V管理資格情報や任意のホストコマンド実行権限を与えない。

この候補はホストのWindows作業領域とゲストの作業領域をOS境界で分離し、チェックポイントから既知状態に戻せる点で最も適合する。ただし、現在のホストでHyper-Vを安全に利用できるか、VM上のAppBarと仮想ディスプレイの挙動が実機と同等か、無人GUI操作を安定して行えるかは未確認である。Hyper-V採用はStage 2の環境資格確認と人間の承認を条件とする。

最初の自律実験候補は、PR #10に残るshowInactive経路の切り分けである。AppBarの表示位置修正、フラグの既定変更、製品採用判断は本計画に含めない。

## 2. 現状と根拠

### 既存PoCと観測

- experiments/windows-appbar-core/にはElectron 45.2.3とKoffi 3.3.7を使う隔離PoCがある。AppBarウィンドウと操作ウィンドウは分離され、JSONL計測、作業領域・ウィンドウ矩形取得、明示的解除、解除未確認時の終了ガードがある。
- docs/spikes/windows-appbar-core/position-strategy-comparison.mdの人間実測では、BaselineとSWP_NOSENDCHANGINGの双方で90 px予約と解除確認が成功した一方、バーの最終表示はどちらも画面上端から90 px下であった。
- Baselineでは最初のafter-setwindowpos測定からY=90。NoSendChangingではafter-setwindowposで一時的にY=0、その後の遅延測定とafter-show-settledでY=90になった。これは後続移動の証拠であり、呼び出し元を特定しない。
- NoSendChanging側では移動イベント区間とABN_STATECHANGE相当の通知コード0の時刻が近接するが、因果関係は未確定。showInactiveは時間的に関連するものの単独試験されていない。
- 既存記録にはWM_WINDOWPOSCHANGINGの提案値を記録していないこと、ABM_WINDOWPOSCHANGED送信が実装されていないこと、SC-006の外部プロセス終了コード・終了後測定が未確認であることが残る。
- したがって現段階で確定できるのは、予約と内部解除確認が観測済みで、表示位置は失敗し、原因は未確定という範囲である。実験結果を製品仕様のPASSへ転用しない。

### ローカルA/B JSONLの確認（2026-11-11 UTC run）

指示にあった2ファイルを読み取り専用で解析した。これらは既存のignored session logsであり、今回の変更にコピー・再生成・編集していない。

| Log | Variant / flags | after-setwindowpos | after-showinactive | after-show-settled | 終了関連 |
|---|---|---|---|---|---|
| session-2026-11-11T18-56-04.099Z.jsonl | baseline / 84 (0x0054) | Electron (8,90,1920,90); GetWindowRect (0,90,1936,188); DWM (7,90,1929,181) | Y=90 | Y=90; same geometry | release-verification apiAccepted=true, workAreaRestored=true; safe-shutdown-confirmed state=released |
| session-2026-11-11T19-12-03.820Z.jsonl | nosendchanging / 1108 (0x0454) | Electron (8,0,1904,82); GetWindowRect (0,0,1920,90); DWM (7,0,1913,83) | Y=0 | Y=90; same final native/DWM geometry as baseline | release-verification apiAccepted=true, workAreaRestored=true; safe-shutdown-confirmed event absent |

両ログのafter-setposおよびbefore-setwindowposはElectron (0,0,1920,90)。両方でaccepted rectangleは上端の90 pxで、work area topは90 pxへ変化している。手動の画面報告では最終表示位置は両方式とも90 px下であり、JSONLの遅延sampleもその表示報告と一致する。NoSendChangingはSetWindowPos直後とshowInactive直後の一時的な座標を変えているが、後続の移動が同じY=90へ収束する。

この証拠は、NoSendChangingが安定した位置修正にならなかったことと、後続の位置変化があったことを支持する。どのWindows/Electron/Chromium処理が移動を発生させたかはログだけでは分からない。2 runのcommit SHAや全環境条件も揃って記録されていないため、フラグの因果を分離した比較とは扱わない。BaselineにはSafe exit確認イベントがあるが、NoSendChangingにはない。いずれもPowerShell終了コードと、Electron終了後に別プロセスで測ったwork areaは確認できないため、SC-006全体をPASSにしない。

### 位置ずれの原因仮説と次の識別順

| 仮説 | 現時点の根拠 | 分からないこと / 反証できる観測 |
|---|---|---|
| Electron/ChromiumまたはWindowsがAppBar登録後のwork areaを使い、後続のwindow-position処理でバーを移動する。 | BaselineはSetWindowPos直後からY=90。NoSendChangingではSetWindowPos直後とshowInactive直後のY=0から、後続move/deferred sampleでY=90。 | WM_WINDOWPOSCHANGINGのWINDOWPOS提案値・処理主体を記録していない。showInactiveを一要素だけ省いた同条件runでもY=90へ動けば、その呼出しが必要原因という仮説は弱まる。 |
| showInactiveが、同期ではなく後続のElectron/Windows移動を誘発する。 | NoSendChangingのafter-showinactiveはY=0で、その後の遅延sampleがY=90。時系列上候補。 | 同時刻にSetWindowPos由来の非同期処理・move通知が続いている。showInactiveだけを外した比較なしでは因果を判断できない。次の最小仮説試験はこの呼出しの有無を比較する。 |
| Shell/AppBar通知または未実装のAppBarプロトコル処理が再配置へ関与する。 | NoSendChangingログでmove eventの最初の観測は19:12:10.947Z、ABN_STATECHANGE相当のコード0は19:12:11.111Z、WM_WINDOWPOSCHANGED観測は19:12:11.093Z。時刻は重なる。PoCは通知を記録するが自動移動しない。 | 通知は最初のmove観測より後であり、発生元や位置変更との因果は未確定。WM_WINDOWPOSCHANGED後のABM_WINDOWPOSCHANGED送信も未実装だが、その欠落がYずれを生んだ証拠はない。showInactive試験と混ぜず、別runで検証する。 |
| Electron、GetWindowRect、DWMが異なる座標/枠を表すため、見かけの差がある。 | 起動前からWin32矩形に余白があり、Bの一時Y=0でもElectron/DWMの幅・高さは異なる。 | settled時はDWMのtopも90で、利用者の画面報告も90 px下。枠の違いだけでは最終Yずれを説明しない。X/寸法の差は別問題として残る。 |

現在の根本原因判定は**未確定**。最初にshowInactive有無だけを切り替える有限runを提案する。その次に、WM_WINDOWPOSCHANGINGのWINDOWPOS値を安全に記録し、Shell/AppBar通知とABM_WINDOWPOSCHANGEDのプロトコルを別条件で検証する。どの段階でも新しい実測前に座標補正を加えない。

### Stage 1で確認したホスト環境

以下はStage 1初回調査時点の履歴である。CIMとVMMS照会の拒否結果はその時点の観測として残す。2026-11-12のWP-1再資格確認ではCIMの一部とVMMSサービス状態を読み取れた一方、Hyper-V機能・VM一覧・仮想スイッチは引き続き権限拒否となった。新しい測定・容量評価・候補再評価は[WP-1 Windowsホスト資格確認レポート](wp1-host-qualification.md)を参照する。

| 観測 | 結果 | 解釈 |
|---|---|---|
| .NET OS version | 10.0.26300.0 | OSビルド値。単独でWindows製品名を確定しない。 |
| Windows CurrentVersion registry | ProductName=Windows 10 Pro, DisplayVersion=26H2, CurrentBuild=26300, EditionID=Professional | 表示名とビルド／表示バージョンの組み合わせに不整合があり、ホストSKUを確定できない。 |
| CIM Win32_OperatingSystem / Win32_ComputerSystem | access denied | マシン種別、HypervisorPresent、完全なOS情報は未確認。 |
| Hyper-V PowerShell module / Get-VM command | 検出 | 管理ツールが見つかったことだけを示し、Hyper-V機能の有効化やVMMS稼働を証明しない。 |
| VMMS service query | access denied | サービス状態は未確認。管理者権限で再試行していない。 |
| 読み取り専用desktop probe | DISPLAY1, 1920×1080, primary; working area 1920×1032; system DPI 96×96 | 現在の作業セッションの値。仮想化環境やguestで同じ表示条件になる証拠ではない。 |
| VM作成・起動・設定変更 | 未実施 | Stage 1の範囲外。 |

この初回確認時点では、PCが推奨環境として利用可能とは判断できなかった。後日の権限のない読み取り専用再確認は次節に記録する。必要な権限を増やさず、Stage 2の人間承認後に確認する。

### WP-1資格確認の更新 (2026-11-12)

後続の非昇格確認では、`systeminfo`がWindows 11 Pro build 26300とHypervisor検出を報告し、VBSが稼働中、VMMSがRunning、Hyper-V PowerShell moduleが存在することを確認した。`Get-ComputerInfo`/レジストリには製品名の不一致が残り、Hyper-V optional feature、`Get-VM`、`Get-VMSwitch`はアクセス拒否だった。RAMは総容量約7.91 GiB、空きの測定値は異なる時点で約1.03–1.30 GiB、C:空き容量は約86.6 GiBだった。これらはVM運用余力を確認するのに不足しており、現在のホストはVM構築候補として保留とする。詳細値、公式資料、代替候補、承認事項は[資格確認レポート](wp1-host-qualification.md)を参照。権限昇格やVM/OS変更は行っていない。

## 3. 環境候補の比較

| 候補 | 分離・ホスト影響 | GUI / AppBar | 再現・復元 | 自動化・保守 | 費用・制約 | Stage 1評価 |
|---|---|---|---|---|---|---|
| 専用Hyper-V Windows 11 VM | ゲスト内の作業領域はホストと別。ホスト側Supervisorが対象VM IDを固定すれば他VMを保護できる。共有クリップボード・ドライブ・ネットワークは無効を基本にする。 | VMConnect等で対話デスクトップを利用できる候補。AppBar APIの仮想ディスプレイ上の挙動とGUI自動操作はSpikeで確認が必要。 | 固定ゲスト構成とチェックポイントを再利用できる。復元はVM単位で対象を固定する。画面解像度・DPI・タスクバー状態は毎回ゲスト内で検証する。 | ホスト側監視とゲスト側GUI Runnerを分けられる。PowerShell Directはネットワーク設定に依存しないが、ホスト側Hyper-V管理者権限とゲスト資格情報を要求する。 | Windows SKU・ゲストライセンス、CPU/RAM/SSD余力、管理権限が必要。Hyper-V要件にはPro/Enterprise等とCPU仮想化要件がある。 | 第一候補（条件付き）。専用VM上のAppBar意味論と管理権限をStage 2で資格確認。 |
| Windows Sandbox | ゲストの作業領域はSandbox内。終了時に内容を破棄できる。 | GUIはSandboxウィンドウ越し。内部Win32 APIは実行可能な候補だが、実際のExplorer/AppBarと表示測定を確認する必要がある。 | 起動ごとの初期化が容易。ただし既定でネットワークとクリップボードが有効、Sandbox表示サイズは構成ファイルで指定できないと公式資料に記載。ログ回収用の書き込み共有はホスト境界を広げる。 | ゲスト消滅の検知は可能でも、ゲスト内プロセス終了コード・作業領域の外部測定・証拠回収を一貫させにくい。 | 対応SKU/機能有効化が必要。使い捨ての短いGUI試験には有力だが、長期の対話デスクトップとSupervisor連携は別途検証。 | Hyper-Vの条件が満たせない場合の限定比較候補。最初の反復基盤には推奨しない。 |
| 専用物理Windows端末 | 開発PCと物理的に分離できる。対象端末以外のVM/ホストへ触れない設計にできる。 | 実機のWindows shell・表示デバイスで最も現実に近い。画面・タスクバー・DPIの制御が可能。 | 端末構成を固定できるが、スナップショット相当の復旧やハードウェア状態の再現がVMより難しい。 | リモート接続、対話ログオン、保守・電源制御が必要。無人化は別途構築。 | 端末購入・Windowsライセンス・保守費用が必要。 | VMと実機との差が重要と判明した場合の比較対象。初期案にはしない。 |
| 他の独立GUI環境（クラウドWindows VM等） | 開発PCと別ホストにできる。接続サービスやリモート管理権限の境界が必要。 | RDP/仮想GPU/リモートセッション上のGUI。ローカルVMConnectと同様、AppBar挙動が物理コンソールと同一とは限らない。 | イメージ・スナップショットで再現できる候補。解像度/DPI・GPU・ログオン方式の差を測る。 | リモート制御・ログ回収・ゲスト停止の監視は構築可能だが、サービス固有の権限・接続・費用を要する。 | 利用料、ライセンス、ネットワーク、アカウント管理が必要。価格は選択肢・利用時間により変わるため未算定。 | Hyper-Vが不可で、隔離済みの既存環境が利用可能な場合に再評価。 |

Windows Sandboxは使い捨てという利点がある一方、既定統合機能と画面サイズ制約、外部監視・証拠回収の難しさが今回の長時間・反復要件に合いにくい。Hyper-Vのチェックポイントは復旧に使えるが、AppBarの正常解除を証明するものではない。VMConnectの拡張セッション等のリダイレクト機能を用いる場合、クリップボード・ドライブ等を無効にできる設定を選び、VM接続経路自体は別途確認する。

## 4. 3要素の責任分界

~~~mermaid
flowchart LR
  Agent[Investigation Agent: 仮説・差分・評価] -->|検証マニフェスト: 制限付き要求| Supervisor[External Supervisor: ホスト側・VM固定ID]
  Supervisor -->|許可済み操作だけ| Guest[専用Windows VM]
  Guest --> Runner[Test Runner: 対話セッションのElectron]
  Runner -->|結果・ログ| Sentinel[Guest Sentinel: Electron外の監視・測定]
  Sentinel -->|構造化結果| Supervisor
  Supervisor -->|証拠回収・隔離VMの復元| Guest
  Supervisor -->|結果セット| Agent
~~~

### Investigation Agent（Codex）

- mainの仕様、PoC、過去の証拠を読み、競合する仮説と一要素実験を作る。
- 静的検証を通した隔離Spike差分と、commit SHAを固定した実験マニフェストを出す。
- VM資格情報、ホスト管理資格情報、任意のホストコマンド実行経路は持たない。
- 生ログ・測定値からPASS/FAIL/INCONCLUSIVEを評価し、次の仮説候補を提示する。
- 製品仕様変更、権限拡大、Level 2/3採用判断、本番変更、Issue登録、PRマージは行わない。

### Test RunnerとGuest Sentinel

- Test Runnerはゲストの対話ログオンデスクトップ上で、固定バージョンのElectron PoCを1つだけ起動する。HWND所有・Koffi/Win32呼出し・AppBar登録/解除はアプリ側main processに限定する。
- Runnerが送る操作はバージョン付きの許可リスト（例：baseline測定、90 px登録、作業領域測定、解除、Safe exit）に限る。任意スクリプト文字列や任意Win32関数呼出しをマニフェストから実行しない。
- Guest SentinelはElectronとは別プロセスで、起動前後のOS/ディスプレイ情報、Electronプロセス終了コード、終了後の作業領域を測る。Electronが落ちてもOSが応答する間は測定を続ける。ゲストOS停止時には動作できず、ホストSupervisorがVM状態から異常を検出する。
- PlaywrightのElectron連携はrenderer UIの操作・DOM確認・ページのスクリーンショットの候補とする。公式API文書はElectron対応をexperimentalとし、OSネイティブdialogをインターセプトしないと明記する。これだけをテスト制御・画面全体の証拠取得に使わない。
- Windowsデスクトップ全体のスクリーンショットはゲスト内の対話セッションだけで取得し、Electron内容のキャプチャと区別する。空の専用VM以外の画面を収集しない。キャプチャ方式と権限はStage 2で決める。

### External Supervisor（ホスト側）

- Investigation AgentおよびElectron processから分離したホスト側コンポーネント。固定された単一のVM ID、許可されたベースチェックポイント、同時実行数1のみを操作する。
- 起動前にVM識別、電源状態、チェックポイント、ゲスト準備完了、基準環境、前回プロセス不在、作業領域baseline、出力先空き/容量を確認する。
- 一意なExperiment IDでリース/ロックを保持し、実行期限と心拍停止を監視する。実行後はゲストのログ・JSONL・画像・終了状態を回収し、マニフェストとcommit SHAを結び付けてハッシュ検証する。
- Host側Hyper-V管理APIは強力な権限を持つ。CodexにHyper-V Administrators権限や秘密情報を直接渡す設計は避ける。最小の固定アクションbroker/JEA等を候補とし、対象VM以外を指定できない境界と、broker侵害時の影響をStage 2で承認する。
- PowerShell Directはネットワークを介さずVM内でコマンドを実行・ファイルを転送できるが、公式要件はローカルHyper-Vホスト、起動中のVM、ゲスト資格情報、ホストのHyper-V管理者である。UI操作は別の対話ログオンセッションが必要であり、PowerShell DirectだけでGUI操作が成立するとは扱わない。
- Supervisorはホストの作業領域や別VMのGUIにAppBar APIを実行しない。管理対象VMの停止/復元以外のホスト操作を許可リストに含めない。

## 5. 通信、権限、成果物

1. Agentは実験マニフェスト（Experiment ID、対象commit、仮説、変数、固定環境、許可操作、timeout、成果物一覧）をSupervisorへ提出する。未定義キー・任意コマンド・複数同時runは拒否する。
2. Supervisorはローカルの認証された制限付きbrokerで要求を受ける案を優先する。ゲスト内起動とファイル転送の候補はPowerShell Directだが、UI Runnerはログオン中のゲストデスクトップに接続またはそのセッション内で起動しなければならない。方式選択はStage 2で小さく実証する。
3. GuestからHostの成果物は最初は認証済みVM制御チャネル経由で回収する。共有フォルダ、clipboard、networkを既定有効にしない。必要な場合でも、読み取り専用のソース入力と専用の書き込み出力先を分け、出力先の対象・ACL・容量上限を承認する。
4. 各runの成果物は不変ディレクトリへ保存する：manifest、commit SHA、環境スナップショット、Electron/Node/Chromium/Koffi、PoC JSONL、Sentinel測定、画像、プロセス/終了コード、VM lifecycle、判定理由、artifact hashes。
5. Sensitiveなusername/path/tokenデータはredactまたはrun-local IDへ置換する。Electron rendererへ広いIPCや任意コマンド実行を公開しない。テスト専用IPCは許可リスト、入力検証、sender検証、状態機械に制限し、既存の本番IPC/セキュリティ境界と混ぜない。これはLevel 2判断を伴う。

## 6. 実験状態、復旧、停止

~~~text
UNQUALIFIED → READY → PREFLIGHTED → BASELINED → RUNNING
  → RELEASE_REQUESTED → RELEASE_VERIFIED → PROCESS_EXIT_VERIFIED
  → POST_EXIT_WORKAREA_VERIFIED → ARTIFACTS_SEALED → VERDICT
  → VM_CHECKPOINT_RESTORED → BASELINE_REVERIFIED → NEXT_RUN_ALLOWED
~~~

- AppBarの解除状態は、少なくともAPIの結果、PoC内部のrelease-verification、Electronプロセス終了、Electron外Sentinelによる終了後work area測定を別項目として扱う。チェックポイント復元やゲスト再起動は正常解除の証拠ではない。
- 異常時は直ちに新しい実験を拒否し、追加の位置変更操作を止め、最後の証拠を保存する。可能なら許可された通常のrelease IPCを一度実行し、期限内に解除を確認する。
- 解除が未確認、Electronが異常終了、ゲストが応答しない場合は結果をINCONCLUSIVEまたは必要に応じて個別条件FAILとし、release=UNKNOWNを保持する。外部作業領域復帰が不明ならPASSしない。
- 人間が事前承認した時だけ、Supervisorは指定VM IDに対し、ログ回収後に指定済みチェックポイントを適用できる。対象名/IDまたはcheckpoint ID不一致、実行状態の競合、回収不整合、復元エラーなら停止して報告する。別VM/ホスト/本番アプリを停止・復元しない。
- VM復元後に新しいrunを許可するには、VMが起動し、ゲストバージョン・解像度/DPI・タスクバー・基準work area・Runner応答を再確認する。復元成功とAppBar解除成功は別の証拠欄にする。
- 続行可能な仮説上のFAILと、安全状態不明を区別する。テスト仮説がFAILでも解除・終了・baseline回復・証拠保存がPASSなら次の異なる仮説へ進める。安全条件のFAIL/INCONCLUSIVE、異常終了、環境drift、artifact欠落時はバッチを停止する。

## 7. 実験単位の判定と自律探索上限

各runはPASS、FAIL、INCONCLUSIVEのいずれかとし、判定根拠と個別チェックを保存する。未取得値を成功へ補完しない。SC-006など製品受け入れ条件はrun verdictとは別台帳で管理し、単一PoC実験から製品全体をPASSにしない。

承認後のバッチ上限案：最大3仮説、各仮説最大2 run（合計最大6）。各runで変更する主要条件は1つ。実験前に静的検証PASSが必須。timeoutは有限で事前設定する。run timeoutと解除graceはベースラインpilotで見積もり、人間が固定上限を承認する。初回の時間値は証拠がないため本Stageでは決めない。

## 8. Codexセッション継続とオーケストレーション

まずは1つのCodex実行内で上限付きbatchを進め、再開用の正本はCodexの暗黙コンテキストではなく、Git管理外または追跡可能なrun manifestと不変の実験記録に置く。batch stateにはbatch ID、承認済みscope、対象commit、仮説/試行数、完了済みExperiment ID、次に実行できる状態、停止理由を保存する。resume時にSupervisorとrun結果を照合し、状態が確定しないrunを再実行せず停止する。これにより、新しいCodexセッションからの再開は可能になるが、無人でCodexを自動再起動するものではない。

OpenAI公式資料には、Agents API sessionの保存状態・継続、stream/webhookによる実行状態、self-hosted environment、scheduled automationの仕組みが記載されている。これを使えばCodex harnessとWindows test environmentの接続をアプリケーション側で管理する実装経路はある。しかし、これは現在のCodex Desktopの独立Review Subagentが自動的に持つ機能ではなく、API key、session/event処理、アプリケーションserver、self-hosted executorの起動・再接続・shutdown管理を新たに実装する選択肢である。費用、アカウント利用可否、データ保持/居住要件、Windows GUI executorとの適合性も未確認。OpenAIの公式資料はself-hosted環境では利用者側がprovisioning/reconnection/shutdownを所有するとしている。

したがってStage 1ではAgents API/SDKやscheduled automationを導入せず、まず永続batch manifestと実験run recordsを設計する。Codexセッション間の自動継続が必須になった段階で、既存Desktopの手動再開とAgents API/self-hosted executorを、権限・保守・費用・データ制御とともに人間が選択する。

## 9. Reviewer不成立の扱い

- 既存契約どおり、Main Agentと別コンテキストの読み取り専用Review Subagentに、正確なPR HEAD SHA、対象ファイル、レビュー範囲、短い判定形式を渡す。
- 待機回数では打ち切らず、起動からの経過時間で管理する案とする。通常規模（限定されたファイル・観点のレビュー）は最大10分、大規模（複数層・広い差分や証拠を横断するレビュー）は最大15〜20分を目安に分類し、分類と期限を起動時に記録する。60秒程度ごとに状態を確認し、完了が通知されたら次のpollを待たずに直ちに最終結果を取得する。進捗イベントが提供される場合は、時刻付きの短い状態要約だけを保存して停滞判断に使う。進捗がないことだけを理由に期限前に打ち切らない。
- 期限到達後は最終判定を一度だけ要求し、追加の最終化猶予は60秒を提案する。猶予内に対象SHAを明記したverdictが届かなければNOT_COMPLETEDとし、その後に同じ依頼を自動再起動しない。基盤に安全なcancel/close操作があれば最終化猶予後に一度だけ要求し、その結果を記録する。cancel/closeをverdictやレビューFindingとして扱わず、機能がない場合は実行状態を不明として記録する。最終化猶予はレビュー期限と区別して記録する。基盤が明示的にerror/cancelled/not_foundを返した場合は、期限切れと別の終了理由にする。
- 現在確認できたmulti-agent tool schemaでは、`wait_agent`は1回あたり10秒〜3,600秒を受け付ける一方、`spawn_agent`に全体実行時間を指定する引数はない。`wait_agent`の説明は完了状態または待機timeoutを返すが、進捗ストリームの提供を保証していない。したがって10分・15〜20分は呼び出し側で実装する運用deadline案であり、Reviewer workerの実行継続を保証する基盤上の上限ではない。実際のworker hard limit、進捗チャネル、cancel後の扱いは未確認で、利用環境ごとに確認が必要。
- 3つの`CHANGES_REQUIRED`修正・再レビューloop上限はコード/文書の指摘修正回数を指す。60秒pollの回数や最終化待ちはこのloopを消費しない。レビュー起動の再試行上限は別の運用設定として管理し、提案は基盤障害の原因を記録してから新しい依頼を最大1回行うこと。再試行は自動化せず、既存ルールと人間の判断に従う。
- レビュー記録には、request ID、起動時刻（UTC）、対象base/head SHA、Reviewer session/agent ID、依頼scopeと規模分類、deadline、各状態確認時刻・最終status、取得できた進捗要約、最終判定要求の時刻/ID、verdict/完了時刻、経過時間、終了理由を保存する。取得できなかった値は`NOT_CAPTURED`とし、推定で補わない。内部思考過程は保存せず、進捗要約と判定根拠のみを記録する。
- **PR #11での実例:** HEAD `62d0706ab3cd3916c28d0aacc3eb3f3457ab896a`を対象に別コンテキストReviewerを起動（agent ID `01a1ccab-0931-7a60-a027-85e2b7388150`）。起動時刻は記録されていない。60秒上限の待機を3回行い、すべて`timed_out`で最終status/進捗は返らなかった。最終判定を促す追加連絡（submission ID `01a1ccad-4012-70e1-8ea8-f52ab47f8fa4`）後もverdictは届かず、終了要求時の前状態は`running`、その後`shutdown`通知を受けた。終了理由はMain Agentによる終了要求、verdictは`NOT_COMPLETED`。これは新しい通常レビュー期限案の10分を待った事例ではなく、180秒程度の短い待機で止めていた従来運用の失敗例である。基盤障害かレビュー処理の長さかは、この出力だけでは特定できない。
- 明示的な最終verdictが返らなければNOT_COMPLETED。これはレビュー完了証拠の欠落であり、レビュー上の問題が見つかったことを意味しない。コード指摘はReviewerが実際に返したFindingとして別記録する。
- 独立した別Codexセッションは代替候補だが、現在のAGENTS.mdはReview Subagentを要求する。別セッションを正式に受け入れるには、人間がルール変更を承認する必要がある。変更案は同等のread-only制約、別の会話/コンテキスト、固定SHA、明示的verdict、証拠保存、bounded retries、self-review不可を条件とする。承認前は代替レビューもNOT_COMPLETEDを解消しない。
- ReviewerがCHANGES_REQUIREDを返す場合はレビュー基盤失敗と混同しない。既存の最大3回の修正・再レビュー契約に従い、その他の判定は現行停止条件に従う。既存AGENTS.md・開発規約は本案では変更しない。

## 10. 残る未知事項とStage 2判断

1. ホストがHyper-V対応SKU/ハードウェア/設定で、管理者介入なしに承認済み権限brokerを使えるか。
2. Hyper-Vの対話Windows 11 guestでAppBarの作業領域・ウィンドウ位置・シェル通知が実機と同等か。仮想モニター解像度、96 DPI、タスクバー位置を再現できるか。
3. PowerShell Directのホスト権限を限定brokerに閉じ込められるか。どのアカウントがGUIユーザーセッションを所有するか。
4. 画面キャプチャをVM guest内で行い、ホスト/他デスクトップの画面を含まずに取得・回収できるか。
5. 採用するHyper-V checkpoint type、capture-before-restore、復元後のログオン/初期状態を安全に自動化できるか。
6. Electronのバージョン・OS更新・仮想ディスプレイ差をenvironment manifestでどう許容し、どのdriftで停止するか。
7. Runner制御を既存UIのPlaywright/UI Automationで行うか、狭いtest IPC/CLIを追加するか。追加IPCはLevel 2承認対象。
8. Reviewerが完了しない場合の別Codexセッションを、AGENTSの正式な代替として認めるか。
9. CPU/RAM/ディスク、Windows guestライセンス、ホスト常時稼働、run timeout、artifact保持期間、1バッチ総時間。

## 11. 公式資料とローカル根拠

- [Hyper-V on Windows requirements](https://learn.microsoft.com/en-us/virtualization/hyper-v-on-windows/reference/hyper-v-requirements)
- [Install Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/get-started/install-hyper-v)
- [Use Hyper-V checkpoints](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/checkpoints)
- [PowerShell Direct](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/powershell-direct)
- [Windows Sandbox configuration](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file)
- [Windows Sandbox overview](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron) — API documentation labels Electron support experimental.
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [OpenAI Agents API sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [OpenAI Agents API architecture](https://developers.openai.com/api/docs/guides/agents-api/architecture)
- [OpenAI scheduled automations](https://developers.openai.com/api/docs/guides/agents-api/sessions/automations)
- Local: [docs/requirements.md](../../requirements.md) R-02 / recovery NFR; [AppBar feature specification](../../../specs/windows-appbar/spec.md) AB-002–AB-008 and TS-01–TS-08; [Spike record](README.md); [position strategy comparison](position-strategy-comparison.md).

これらの公式資料は機能可否や権限条件を示すものであり、Tutorial Dock PoCがその環境で成功する証拠ではない。実測はStage 2以降のSpikeで得る。

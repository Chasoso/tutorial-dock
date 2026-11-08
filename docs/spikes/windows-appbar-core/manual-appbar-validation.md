# Windows AppBar 実機検証手順

この手順は、PR #7で追加した隔離PoCを使い、Windows 11の単一ディスプレイ環境でAppBar登録・作業領域・解除を人間が確認するためのものです。これは製品機能の実装ではありません。CodexはElectronを起動せず、AppBar APIを呼び出しません。

期待動作と受け入れ条件は[Windows AppBar仕様](../../../specs/windows-appbar/spec.md)を参照してください。PoCは[実験用ディレクトリ](../../../experiments/windows-appbar-core/)に限定されています。

## 安全上の原則

- 初回条件はWindows 11、単一ディスプレイ、Windows設定上の100%スケーリング、画面下部に表示された標準タスクバーです。異なる条件で登録しないでください。
- APIの戻り値、Windows作業領域の数値、AppBarウィンドウの表示状態は別々に記録します。最前面表示や`ABM_NEW`成功だけでは予約成功ではありません。
- Phase 1がPASSするまで登録せず、Phase 2AとPhase 2Bの両方がPASSするまで高さ変更へ進まず、Phase 3もPASSするまでアプリ最大化試験へ進みません。
- 解除が確認できない、画面状態が想定外、またはどの予約状態か不明になった場合は、その場で追加検証を止めます。PoCや他のプロセスを強制終了しません。
- Explorer再起動、Windows再起動、レジストリ変更、管理者権限による復旧を自動実行しないでください。未検証の復旧策を確立済みとして扱いません。
- 強制終了、クラッシュ、マルチモニター、混在DPI、ディスプレイ切断、特殊タスクバー、フルスクリーン、画面共有ソフトの互換性はこの手順の対象外です。

## Phase 0 — 環境と起動前状態

通常のWindows 11デスクトップ上でPowerShell 5.1/7またはVS Codeターミナルを開きます。リポジトリ内の任意のサブディレクトリから開始できます。各Phaseを別ターミナルで行う場合も、毎回この共通ブートストラップを最初に実行してください。Gitが特定したリポジトリルートから絶対パスを作るため、同じ相対パスを二度連結しません。

```powershell
$ErrorActionPreference = 'Stop'
$initialDirectory = (Get-Location).Path
$repoRootOutput = & git -C $initialDirectory rev-parse --show-toplevel
$gitExitCode = $LASTEXITCODE
if ($gitExitCode -ne 0) { throw '現在位置からGitリポジトリのルートを特定できません。リポジトリ内からやり直してください。' }
$repoRootText = (@($repoRootOutput) -join [Environment]::NewLine).Trim()
if ([string]::IsNullOrWhiteSpace($repoRootText)) { throw 'Gitリポジトリのルートが空です。停止してください。' }
$repoRoot = [System.IO.Path]::GetFullPath($repoRootText)

foreach ($marker in @('AGENTS.md', 'docs\requirements.md', 'specs\windows-appbar\spec.md')) {
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $marker) -PathType Leaf)) {
    throw "Tutorial Dock repository markers are missing at the detected root. Stop: $marker"
  }
}

$experimentDir = Join-Path $repoRoot 'experiments\windows-appbar-core'
$experimentPackagePath = Join-Path $experimentDir 'package.json'
foreach ($file in @('main.cjs', 'preload.cjs', 'renderer.js', 'index.html', 'appbar.html')) {
  if (-not (Test-Path -LiteralPath (Join-Path $experimentDir $file) -PathType Leaf)) {
    throw "Required PoC file is missing. Do not launch Electron. Stop: $file"
  }
}
if (-not (Test-Path -LiteralPath $experimentPackagePath -PathType Leaf)) {
  throw 'PoC package.json is missing. Do not launch Electron.'
}
$experimentPackage = Get-Content -LiteralPath $experimentPackagePath -Raw | ConvertFrom-Json
if ($experimentPackage.name -ne 'tutorial-dock-windows-appbar-core-spike' -or
    $experimentPackage.main -ne 'main.cjs' -or
    $experimentPackage.devDependencies.electron -ne '45.2.3' -or
    $experimentPackage.devDependencies.koffi -ne '3.3.7') {
  throw 'The detected directory is not the expected pinned AppBar PoC. Do not launch Electron.'
}

Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber
$PSVersionTable.PSVersion
node --version
npm --version

$electronExe = Join-Path $experimentDir 'node_modules\electron\dist\electron.exe'
$electronPackage = Join-Path $experimentDir 'node_modules\electron\package.json'
$koffiPackage = Join-Path $experimentDir 'node_modules\koffi\package.json'
if (-not (Test-Path -LiteralPath $electronExe -PathType Leaf)) { throw '既存electron.exeがありません。ダウンロードや再インストールをせず停止してください。' }
if (-not (Test-Path -LiteralPath $electronPackage -PathType Leaf)) { throw 'Electron package.jsonがありません。再インストールせず停止してください。' }
if (-not (Test-Path -LiteralPath $koffiPackage -PathType Leaf)) { throw 'Koffi package.jsonがありません。再インストールせず停止してください。' }
$electronVersion = (Get-Content -LiteralPath $electronPackage -Raw | ConvertFrom-Json).version
$koffiVersion = (Get-Content -LiteralPath $koffiPackage -Raw | ConvertFrom-Json).version
Write-Output "Electron package: $electronVersion"
Write-Output "Koffi package: $koffiVersion"
if ($electronVersion -ne '45.2.3') { throw 'Electron version mismatch. Stop.' }
if ($koffiVersion -ne '3.3.7') { throw 'Koffi version mismatch. Stop.' }
Set-Location -LiteralPath $experimentDir
Write-Output "Repository root: $repoRoot"
Write-Output "Experiment directory: $experimentDir"
```

`node_modules`がない場合も`npm ci`、`npm install`、`npm start`やインストーラーを実行せず、状態を報告してください。既存のバージョン固定を再利用します。

### ディスプレイと作業領域の読取り

次はWindows Formsの読み取り専用`Screen`情報から、画面数・境界・Windows作業領域を表示します。OS設定は変更しません。

```powershell
Add-Type -AssemblyName System.Windows.Forms
$beforeRun = @([System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  [pscustomobject]@{
    Device = $_.DeviceName
    Primary = $_.Primary
    Bounds = "($($_.Bounds.Left),$($_.Bounds.Top))-($($_.Bounds.Right),$($_.Bounds.Bottom))"
    WorkArea = "($($_.WorkingArea.Left),$($_.WorkingArea.Top))-($($_.WorkingArea.Right),$($_.WorkingArea.Bottom))"
  }
})
$beforeRun | Format-Table -AutoSize
if ($beforeRun.Count -ne 1) { throw '単一ディスプレイではありません。AppBarを登録せず停止してください。' }
```

PowerShell 7で`System.Windows.Forms`を読み込めない場合は、代替APIやダウンロードを試さず停止し、読み取り専用の数値測定方法を人間が用意してください。画面設定でスケーリングが100%、タスクバーが標準の画面下部配置で自動非表示ではないことも目視確認して記録します。PoCは`GetDpiForWindow`でDPIを記録し、単一モニターかつ96 DPIでなければ登録ボタンを無効にします。条件を回避しないでください。

以前の読取り記録はモニター`(0,0)-(1920,1080)`、作業領域`(0,0)-(1920,1032)`です。これは普遍的な固定値ではありません。同じ画面・解像度・タスクバー条件なのに値が異なる場合は、既存の予約や表示設定などの原因を特定するまで登録しないでください。異なる解像度の場合も、起動前の実測値と差の理由を記録してください。

### 既存プロセスとログ

タスクマネージャー、または利用可能なら次の読取りで、PoCが既に起動していないことを確認します。`electron.exe`を一括終了してはいけません。

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" |
  Where-Object { $_.CommandLine -like '*windows-appbar-core*' } |
  Select-Object ProcessId, CommandLine
```

PoCの既存プロセスが見つかった場合、所有者を確認して通常操作で閉じてもらいます。プロセスを特定できない場合も停止してください。

ログは`experiments/windows-appbar-core/logs/session-<timestamp>.jsonl`です。`logs/`はGit管理対象外です。既存ログは削除せず、各セッションで新しいファイルが作られたことを確認してください。ログにはローカルパス等が含まれる可能性があるため、共有前に伏せます。

## PoCの起動方法

Phase 0と同じPowerShellターミナルを使う場合は、ブートストラップで設定した変数をそのまま使います。Phase 2A、2B、3、4を別のターミナル／セッションで開始するときは、リポジトリ内の任意の場所からPhase 0の共通ブートストラップ全体を先に実行してください。ブートストラップが絶対パスを確認し、作業場所を実験ディレクトリに設定します。起動時は下記の直接実行コマンドを使い、出力をパイプやファイルへリダイレクトせず、対話ターミナルを表示したままにします。

```powershell
if (-not (Test-Path -LiteralPath $experimentDir -PathType Container) -or
    -not (Test-Path -LiteralPath $electronExe -PathType Leaf) -or
    -not (Test-Path -LiteralPath (Join-Path $experimentDir 'main.cjs') -PathType Leaf)) {
  throw 'Bootstrap variables or validated PoC files are missing. Rerun the Phase 0 bootstrap from inside the repository; do not launch elsewhere.'
}
& $electronExe $experimentDir
$exitCode = $LASTEXITCODE
Write-Output "Electron exit code: $exitCode"
```

ウィンドウの**Safe exit**を使うと、AppBar状態に応じて解除確認を行ってからプロセスが終了します。プロセスが戻った後にPowerShellで表示される終了コードを記録します。PoC JSONLは`process-exit`イベントを出力しないため、終了コードはPowerShellの結果で確認してください。

## Phase 1 — 未登録起動と正常終了

Phase 0がすべて確認できた場合のみ実施します。**Registerボタンを押さないでください。**

1. Phase 0の作業領域値を記録し、起動コマンドを実行します。
2. 操作用ウィンドウが表示され、状態が`unregistered`（AppBar未登録）であることを確認します。起動時の`startup-baseline`測定も確認してください。
3. **Measure work area**を押し、表示されたモニター・作業領域・DPI・ウィンドウ境界と`manual-measurement` JSONLイベントを記録します。
4. 起動前に測ったWindows作業領域とPoC測定が一致することを確認します。
5. **Safe exit**を押します。状態が未登録のまま終了し、対話ターミナルへ戻ることを確認します。
6. Phase 0と同じ読み取りコマンドをもう一度実行し、作業領域が起動前の値と一致することを確認します。
7. 最新のsession JSONLで初期`appbar-state`が`unregistered`、`measurement`に`startup-baseline`と`manual-measurement`、終了時に`safe-shutdown-confirmed`があることを確認します。`ABM_NEW`がないことも確認します。

ウィンドウ表示、計測、通常終了、プロセス終了、前後の作業領域一致がすべて確認できた場合だけPhase 1をPASSにします。どれかがFAILまたは不明ならPhase 2へ進みません。問題がある場合は追加操作せず、状態とログを記録してください。

## Phase 2A — 明示的な解除

Phase 1がPASSし、Phase 0の環境条件を再確認した場合のみ、Phase 0のブートストラップを実行したうえで**新しい起動セッション**で実施します。登録は1回だけ行います。

1. 起動前のWindows作業領域を記録し、PoCを起動します。UI状態が`unregistered`で、初期測定が起動前の値と一致することを確認します。
2. **Register 90 px top AppBar**を一度だけ押します。連打や再登録はしません。
3. UIとJSONLの`ABM_NEW.returnValue`を確認します。`ABM_NEW`がFALSEなら位置設定・予約試験へ進まず、下の「ABM_NEWがFALSEの場合」の手順を実施します。
4. 登録が受理された場合、`registration-baseline`と`reservation-size`の`ABM_QUERYPOS`・`ABM_SETPOS`・`SetWindowPos`結果を個別に記録します。
5. **Measure work area**を押し、登録前と登録後のWindows作業領域を比較します。`measurement`の`reservation-height-90`、`workAreaChanged`、`matchesExpectedTop`、AppBar/操作ウィンドウ境界も記録します。
6. `ABM_NEW`/位置設定APIの成功と、Windows作業領域の実測変化を別々に判定します。予約として続行できるのは、作業領域が予約領域に対応して変化し、UI・ログ・窓境界と矛盾しない場合だけです。最前面表示やAPI戻り値だけでは成功としません。
7. 登録済み、または登録が成功した可能性がある場合は**Remove and verify**を一度押して、明示的な解除を確認します。`ABM_REMOVE.returnValue`、`release-verification.apiAccepted`、`workAreaRestored`、`appBarHidden`、`operatorWindowUnchanged`、`after-removal`の作業領域を記録します。
8. UIが`released`で、解除確認値がすべてtrue、作業領域が登録前へ戻った場合だけ、**Safe exit**で正常終了します。PowerShellの終了コードと終了後の作業領域も記録します。

**ABM_NEWがFALSEの場合：** UI/JSONLで未登録状態を確認し、**Measure work area**で起動前の作業領域が維持されていることを確認してから、未登録状態で**Safe exit**します。値が変わった、API結果が不明、またはログ欠落があれば状態不明として停止してください。この分岐では`ABM_REMOVE`を呼ばず、Phase 2A全体をPASSにせず、Phase 2Bへ進みません。登録が受理された可能性がある場合は、この分岐を使わず、他の試験を止めて**Remove and verify**による解除確認を優先します。

Phase 2Aは明示解除の試験です。これだけではSC-006（予約中の正常終了による自動解除）をPASSにできません。

## Phase 2B — 予約状態からの正常終了

Phase 2AがすべてPASSし、終了後の作業領域が登録前へ戻った場合のみ実施します。Phase 0の共通ブートストラップを実行し、別の新しい起動セッションを使います。

1. 起動前の作業領域を記録し、PoCを起動します。初期状態が`unregistered`で、PoCの初期測定が起動前値と一致することを確認します。
2. **Register 90 px top AppBar**を一度だけ押します。`ABM_NEW`が受理されなかった場合は未登録状態を確認してPhase 2Aの「ABM_NEWがFALSEの場合」に従い、Phase 2Bは`NOT_RUN`とします。
3. 登録が受理された場合、位置設定結果を記録し、**Measure work area**で作業領域が予約に対応して変化したことを確認します。
4. 登録が受理され、作業領域の変化を実測できた場合に限り、**Remove and verifyは押さずに**、予約が有効な状態で**Safe exit**を一度押します。
5. 正常に画面が閉じ、PowerShellに制御が戻った後、`$LASTEXITCODE`を直ちに記録します。PoC JSONLには`process-exit`イベントがありません。終了コードはJSONLで代用せず、PowerShellの実測値で確認します。
6. JSONLでSafe exitに伴う`ABM_REMOVE.returnValue`、`release-verification.apiAccepted`、`workAreaRestored`、`appBarHidden`、`operatorWindowUnchanged`、`safe-shutdown-confirmed`を確認します。`release-verification`の記録が欠落している場合はPASSにしません。
7. プロセス終了後、Phase 0の読み取り専用Windows Forms測定を再実行し、作業領域が起動前の値へ戻ったことを確認します。

登録後の実測作業領域が予約に対応して変わらない、または状態が不明の場合は、SC-006試験としてSafe exitを続けません。登録が成功した可能性があるときはPhase 2Aの解除手順を使い、解除未確認なら停止します。

Phase 2BがPASSとなる条件は、予約中にSafe exitを実行し、終了処理内の`ABM_REMOVE`が受理され、解除検証の全項目が成功し、プロセスが終了コード0で終了し、終了後の実測作業領域が起動前と一致することです。`ABM_REMOVE`の戻り値だけではSC-006をPASSにしません。

解除失敗または解除状態未確認の場合、PoCの終了ガードが表示する「Keep windows open」に従い、両ウィンドウを開いたまま停止します。追加のRemove操作、Safe exitの再試行、ウィンドウ閉じる操作、強制終了、Explorer/Windows再起動、レジストリ変更、管理者権限による復旧はしません。人間に状態と記録を引き継いでください。ウィンドウを開いたままにすること自体は復旧保証ではありません。

## Phase 3 — 高さ変更

Phase 2AとPhase 2Bが両方PASSし、基準作業領域へ戻ったことを確認した場合だけ、別セッションで実施します。**チュートリアルステップ保持はこのPoCに存在しないため、SC-003全体をPASSにはできません。**

1. 起動前値とPoCの初期測定が一致することを確認します。
2. 90 pxで登録し、Phase 2と同様に実際の作業領域変化を確認します。
3. **Change to 34 px**を一度押し、`reservation-size`と`measurement`の34 px値、作業領域、AppBar境界を記録します。
4. **Restore 90 px**を一度押し、同じ測定値を記録します。
5. 90→34→90の各段階で要求高さと作業領域の変化が対応したかを個別に判定します。約90 pxと34 pxは実験値で、製品確定値や許容誤差ではありません。
6. **Remove and verify**で登録前の作業領域へ復帰したことを確認し、その後にSafe exitします。

途中で状態が不明、更新失敗、実測不一致となった場合は通常のサイズ変更をやめ、解除確認を優先します。解除未確認の場合はPhase 2と同じ停止規則を適用します。

## Phase 4 — 最大化ウィンドウと標準タスクバー

Phase 2A、Phase 2B、Phase 3がPASSし、各正常終了後に基準作業領域へ戻った場合のみ実施します。別の起動セッションで90 px予約を一度だけ行い、作業領域の変化を再確認してから開始します。

1. Windowsのメモ帳を通常の**最大化**表示にし、上端がAppBar領域と重なるか、Windows作業領域が予約されたままかを記録します。可能ならウィンドウ境界も読み取り方法とともに記録します。
2. Tableau Desktopでも同じ確認を行います。Tableauが利用できない場合は`MANUAL_PENDING`とし、メモ帳結果で代替しません。
3. 標準の画面下部タスクバーが表示され、通常利用できることを確認します。特殊配置・自動非表示の試験は行いません。
4. スクリーンショットによる目視結果と、作業領域の数値測定を別々に記録します。最大化ウィンドウの外観だけで作業領域変化を証明しません。
5. **Remove and verify**で作業領域を登録前の値に戻し、解除確認後にSafe exitします。

このPhaseではSC-002bのメモ帳・Tableauの確認とSC-009の標準タスクバー共存だけを扱います。全画面共有（SC-010）はこの手順に含めません。

## JSONLで確認するイベント

JSONLは`experiments/windows-appbar-core/logs/session-<timestamp>.jsonl`です。新しいsessionを識別し、必要イベントの原文を保管します。`process-exit`イベントはありません。プロセス終了はPowerShellに戻ったことと`$LASTEXITCODE`で確認します。

| Event | 確認内容 |
|---|---|
| `environment` | Electron/Node/Windows、monitorCount、DPI、両ウィンドウ生成 |
| `measurement` | `label`、monitor、workArea、taskbar、AppBar/操作者ウィンドウ境界 |
| `appbar-state` | `unregistered`、`registering`、`registered`、`updating`、`removing`、`released`、`release-unconfirmed`の遷移 |
| `registration-baseline` | `ABM_NEW`直前の作業領域と操作者ウィンドウ境界 |
| `ABM_NEW` | AppBarウィンドウHWNDの登録戻り値とcallback message |
| `reservation-size` | `ABM_QUERYPOS`、`ABM_SETPOS`、`SetWindowPos`戻り値、前後の作業領域、`workAreaChanged` |
| `ABM_REMOVE` | 解除APIの戻り値 |
| `release-verification` | API受理、作業領域復帰、AppBar非表示、操作者ウィンドウ不変の各判定 |
| `safe-shutdown-confirmed` / `safe-shutdown-blocked` | 通常終了がガードを通ったか、または解除未確認で止まったか |

イベントの欠落を成功とみなさず、API戻り値と実測値を別に記録してください。PoCのAppBar通知（`ABN_POSCHANGED`等）はログ記録のみで再配置処理を行いません。OSやタスクバーがウィンドウを移動した場合は継続せず停止してください。

## 結果記録

未実施の状態を初期値`NOT_RUN`とします。人間の実機確認待ちは`MANUAL_PENDING`、確認して失敗した場合は`FAIL`、必要証拠を伴い条件を満たした場合のみ`PASS`です。API戻り値だけで受け入れ条件をPASSにしません。

### 実施環境

| 項目 | 実測値 |
|---|---|
| 実施日時・担当 |  |
| Windows Edition/Version/Build |  |
| PowerShell / Node.js / npm |  |
| Electron / Koffi | 45.2.3 / 3.3.7（実測値も記録） |
| モニター数・対象Device・Primary |  |
| モニター境界 / 起動前WorkArea |  |
| スケーリング設定 / PoCのDPI値 |  |
| タスクバー位置・自動非表示 |  |
| PoC JSONL session file |  |
| Chromium disk-cache access denied warning | 発生有無・正確な表示・動作への実測影響（原因は未特定のまま） |

### 受け入れ結果

| Phase | 検証対象 | 関連仕様 | 結果 | 根拠・ログイベント・実測値 |
|---|---|---|---|---|
| 1 | 未登録起動、Measure、Safe exit、作業領域不変 | TS-01（起動経路のみ） | `NOT_RUN` |  |
| 2A | `ABM_NEW` / 位置設定結果と予約による作業領域変化 | SC-002a | `NOT_RUN` | API戻り値と起動前・登録後のWorkArea値を別々に記録 |
| 2A | 明示的な`ABM_REMOVE`と作業領域復帰 | Technical Spikeの解除確認（SC-006ではない） | `NOT_RUN` | `ABM_REMOVE`、release flags、登録前・解除後値 |
| 2A | 明示解除後のSafe exit・正常終了 | TS-01（PoC終了経路） | `NOT_RUN` | PowerShell終了コード、終了後WorkArea |
| 2B | Safe exit内の`ABM_REMOVE`とrelease-verification | SC-006の終了処理証拠 | `NOT_RUN` | API戻り値、全release flags、`safe-shutdown-confirmed` |
| 2B | Safe exit後のプロセス正常終了・WorkArea復帰 | SC-006の終了後証拠 | `NOT_RUN` | PowerShell `$LASTEXITCODE`、終了後のWorkArea実測 |
| 2B | SC-006総合判定（API・解除検証・exit code 0・終了後復帰） | SC-006 | `NOT_RUN` | すべての2B条件が揃った場合のみPASS |
| 3 | 90→34→90 pxのWorkArea変化部分 | SC-003（作業領域部分） | `NOT_RUN` | 各高さのAPI値・WorkArea・窓境界 |
| 3 | チュートリアルステップ保持 | SC-003 | `NOT_RUN` | PoCに機能がなく未検証。PASS不可 |
| 4 | メモ帳最大化時の非重複 | SC-002b（一部） | `NOT_RUN` | WorkArea数値と目視を分離 |
| 4 | Tableau Desktop最大化時の非重複 | SC-002b（一部） | `NOT_RUN` | WorkArea数値、目視、アプリ版 |
| 4 | 標準タスクバーとの共存 | SC-009 | `NOT_RUN` | タスクバー状態、WorkArea値 |
| 4 | 全画面オンライン共有 | SC-010 | `NOT_RUN` | この手順の対象外 |

### 操作ごとの実測記録

| Phase / 操作・状態 | API戻り値・GUI状態 | Monitor bounds | WorkArea bounds | AppBar window bounds | 判定・備考 |
|---|---|---|---|---|---|
| 起動前（PowerShell読取り） |  |  |  | N/A |  |
| Phase 1 未登録起動後 |  |  |  |  |  |
| Phase 2A 登録後 |  |  |  |  |  |
| Phase 2A 明示`ABM_REMOVE`後 |  |  |  |  |  |
| Phase 2A Safe exit後 |  |  |  | N/A |  |
| Phase 2B 登録後 |  |  |  |  |  |
| Phase 2B Safe exit中の自動解除 |  |  |  |  | JSONLの`ABM_REMOVE` / `release-verification` |
| Phase 2B プロセス終了後 | 終了コード： |  |  | N/A |  |
| Phase 2B 終了後のWorkArea再測定 |  |  |  | N/A |  |
| Phase 3 34 px変更後 |  |  |  |  |  |
| Phase 3 90 px復帰後 |  |  |  |  |  |
| Phase 4 / `ABM_REMOVE`後 |  |  |  |  |  |

## 停止・報告条件

- 起動前作業領域、ディスプレイ数、DPI、タスクバー条件を理解できない。
- 起動時にAppBarが未登録ではない、予期しない`ABM_NEW`イベントがある、または既存プロセス/予約が疑われる。
- AppBar状態が不明、サイズ変更結果とWorkArea実測が矛盾する、AppBar/操作ウィンドウが想定外に動く。
- `ABM_REMOVE`戻り値が失敗、解除フラグのいずれかがfalse、または作業領域が登録前の値へ戻らない。
- JSONLの記録が欠落・破損し、操作結果を追跡できない。未登録状態ならAppBar登録を始めずSafe exitします。登録処理を開始した、または登録済みの可能性がある場合は、他の試験を止めて**Remove and verifyだけを試み**、UI状態と読み取り専用の作業領域測定で解除を確認します。ログ欠損を解除成功の証拠にしてはいけません。

解除確認に失敗した場合、または結果が不明な場合は両ウィンドウを開いたまま、それ以上の操作を停止します。ウィンドウを強制終了せず、確認できた事実、操作、API結果、作業領域値、UI状態、ログ名、未解決事項を保存して人間に判断を求めます。未検証のOS復旧手順を実行しないでください。

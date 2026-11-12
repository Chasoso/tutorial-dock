# WP-1 — Windowsホスト資格確認レポート

**状態:** 読み取り専用のPhase 1調査結果。VM構築・設定変更・Issue登録の承認ではない。

**調査日:** 2026-11-12 (Asia/Tokyo)

**基準:** [WP-1 Tasks AVT-001–AVT-005](../../../specs/windows-appbar-autonomous-validation/tasks.md)、[Plan](../../../specs/windows-appbar-autonomous-validation/plan.md)、[Specification](../../../specs/windows-appbar-autonomous-validation/spec.md)

**既存設計:** [自律検証基盤の実現可能性調査](autonomous-validation-feasibility.md)

## 結論

このWindowsホストは、専用Windows AppBar VMを今すぐ作成する候補として**適格と確認できなかった**。Hyper-Vに関連する一部の基盤が動作している証拠はあるが、現在ユーザーにVM管理権限がなく、Hyper-V機能状態・既存VM・仮想スイッチを確認できない。さらに、約7.9GiBの総RAMに対して調査時の空きが約1.3GB、C:の空き容量が約86.6GiBであり、Windows 11ゲストの最低要件と運用・チェックポイント用の余裕を安全に確保できるとは判断できない。

したがって、**このホストでのVM準備へは進まない**。第一推奨は、少なくとも16GiB RAMと150GiB以上の空きSSD容量を持つ、専用の物理Windowsテスト端末または別の適格Hyper-Vホストを候補として再評価すること。この容量値はWindowsの公式最低要件ではなく、ホストOS、6GiB程度のゲスト割当、更新、ログ、チェックポイント余地を見込んだ運用上の提案である。既存の独立端末の有無は未確認。調達・ライセンス・管理権限の確認が必要である。

## 調査範囲と安全境界

実施したのは、非昇格PowerShellからの読み取り専用OS・ハードウェア・サービス・権限・ディスプレイ照会と、Microsoft/Intel公式資料の確認である。Hyper-V機能やWindows機能の有効化、VM操作、ネットワーク変更、ソフトウェア導入、Electron起動、AppBar API実行はしていない。アクセス拒否になった情報を管理者権限で再試行していない。

これはPhase 1の資格確認資料であり、WP-1のVM隔離・再起動後baseline・GUI・外部回収の受け入れを満たしたことを示さない。未実施段階は`NOT_RUN`、権限等により取得できなかった事実は`NOT_CONFIRMED`として残す。

## Phase 1 — 読み取り専用ホスト調査

| 項目 | 調査結果 | 判定と根拠 |
|---|---|---|
| OS表示 | `systeminfo`: Microsoft Windows 11 Pro, `10.0.26300`, build 26300。`Get-ComputerInfo`: `OsName`はWindows 11 Pro、`WindowsVersion=2009`、`WindowsEditionId=Professional`。 | Windows 11 Proの表示は複数照会で一致。 |
| OSレジストリ表示 | `CurrentVersion`レジストリ: `ProductName=Windows 10 Pro`, `EditionID=Professional`, `DisplayVersion=26H2`, `CurrentBuild=26300`, `UBR=9974`。 | 製品名表示がWindows 11と不一致。エディションIDはProfessionalだが、最終的なSKU/ライセンス状態は`NOT_CONFIRMED`。非昇格`DISM /Online /Get-CurrentEdition`は終了コード740で拒否された。管理者再試行なし。 |
| CPU | NEC `PC-VKT10CZG7`、Intel Core i5-10210Y、4 cores/8 logical processors、x64。Intel製品仕様ではVT-x、EPT、VT-d、Execute Disable Bit対応。 | CPU型番自体の能力は確認できる。実ホストのUEFI設定、DEP有効状態、Hyper-Vへの機能公開は未確認。 |
| CPU仮想化の実行状態 | `Win32_Processor`は`VirtualizationFirmwareEnabled=false`, `VMMonitorModeExtensions=false`, `SecondLevelAddressTranslationExtensions=false`。一方`systeminfo`は「ハイパーバイザーが検出され、要件を表示しない」、`HyperVisorPresent=true`、VBS稼働と報告。 | 結果が整合しないため実ホストのSLAT/VMX公開状態は`NOT_CONFIRMED`。現在ロード済みのHypervisorが要件表示を隠している可能性はあるが、このホストで新しいVMを作成できる証拠とは扱わない。 |
| RAM | 約8,104 MiB（約7.9 GiB）。`systeminfo`時点のavailable memoryは1,335MB。別のCIM測定では空き値が約1.1GB相当で、測定時点により変動。 | Windows 11 VMの公式最低RAM要件は4GB。現在の空きRAMと総容量から、追加ゲストへの安全な割当余裕はないと判断。 |
| C:ストレージ | 総容量約236.7GiB、空き約86.6GiB。 | Windows 11 VMは最低64GBの仮想ディスク容量を要し、更新・チェックポイント・証拠保存の余裕が不足。ドライブ媒体がSSDかは`NOT_CONFIRMED`。 |
| Hyper-V関連 | Hyper-V PowerShell module 2.0.0.0と`Get-VM`コマンドを検出。VMMS (`vmms`) はRunning / Automatic。 | 管理ツールとサービスの存在・稼働は、VM作成資格や機能有効化の証明ではない。 |
| Hyper-V機能状態 | `Get-WindowsOptionalFeature -Online`でHyper-V、VirtualMachinePlatform、Windows Hypervisor Platform、Sandbox等を照会したが、管理者権限が必要とのアクセス拒否。 | `NOT_CONFIRMED`。昇格再試行をしていない。 |
| VM・仮想スイッチ | 非昇格`Get-VM`および`Get-VMSwitch`はアクセス拒否。 | 既存VM数、状態、スイッチの一覧はいずれも`NOT_CONFIRMED`。これらを保護対象として人間の管理者が棚卸しする必要がある。 |
| 実行権限 | 非昇格token。`whoami /groups`ではAdministrators SIDはdeny-onlyで、Hyper-V Administrators groupは見えない。 | VM管理操作を実行できる権限は確認されず、ホスト側管理権限をCodexへ付与しない既存設計と一致。 |
| Hyper-V管理ツール | Hyper-V PowerShell module 2.0.0.0、`Get-VM`/`Get-VMSwitch` cmdlet、`vmconnect.exe`、`virtmgmt.msc`のファイル/コマンドを検出。 | ツールの存在だけを確認。VMConnect/Managerの起動や管理接続は行っていない。VM inventoryの権限拒否は別途継続。 |
| 他の仮想化製品 | 今回照会時点でVMware/VirtualBox/QEMU等に該当する稼働プロセスは検出されず。Docker serviceと`vmcompute`はStopped、Manual。 | インストール済み製品やドライバの不存在は確認していない。競合可能性は`NOT_CONFIRMED`。 |
| Hypervisor/VBS | `systeminfo`はHypervisor detected、VBS status Running。Device Guard CIMは`VirtualizationBasedSecurityStatus=2`。 | Windows hypervisorの稼働は確認。これはHyper-V VM管理権限やHyper-V role状態と同義ではない。 |
| 画面 | `Screen`: 1画面、プライマリ1920×1080、96 DPI。 | ホスト画面の現在値。ゲストの画面・Explorer・タスクバー・AppBar挙動の再現性は`NOT_RUN`。 |
| 作業領域 | 過去に読み取り測定されたホストwork areaは1920×1032。今回の照会は画面設定を変更していないが、今回のPhase 1前後で独立したwork-area baseline比較は実施していない。 | AppBar APIを実行していない。WP-1のホスト不変更受け入れ証拠としてのbaseline比較は`NOT_RUN`。 |

### 非昇格照会の主要コマンド

実行した読み取り確認は、`systeminfo.exe`、`Get-ComputerInfo`、CurrentVersionレジストリ読取、`Get-CimInstance Win32_Processor/Win32_OperatingSystem/Win32_DeviceGuard`、`Get-Service vmms/vmcompute/WSLService/com.docker.service`、Hyper-Vコマンド/moduleの存在確認、`Get-VM`、`Get-VMSwitch`、`Get-WindowsOptionalFeature -Online`、`Get-Process`、`Get-PSDrive`、ディスプレイ/DPI照会である。拒否された照会は上表の通り`NOT_CONFIRMED`とし、権限昇格や別コマンドによる回避をしていない。

## 実行環境候補の再評価

評価の中心は仮想化技術の有無ではなく、Explorer/タスクバーを持つ対話デスクトップ上でAppBar APIと作業領域を安全に試験し、別の監視主体が終了状態と証拠を回収・復元できるかである。以下は資料に基づく適合見込みと未検証事項を分けている。

| 候補 | 対話型GUI / AppBarの代表性 | 分離・監視・復元 | 現ホストに対する判断 |
|---|---|---|---|
| 専用Hyper-V Windows 11 VM | WindowsゲストのExplorerとタスクバーを持つ対話セッションを作る候補。VMConnect Enhanced SessionはRDPベースで解像度変更等が可能だが、仮想ディスプレイ/RDP上の作業領域、AppBar、スクリーンショットが物理コンソールと同等かは実機確認が必要。 | 固定VM ID、外部Supervisor、ゲストRunner/Sentinel、チェックポイントで他VMから分離しやすい。復元はVM単位に制限できる。 | アーキテクチャ上の第一候補のまま。ただし**このホストは現在不適格/未確認**。権限、既存VM、SKU、RAM、ディスクの確認と解消前に構築しない。 |
| Windows Sandbox | Pro等で利用できる使い捨てGUI環境。AppBarをsandboxデスクトップ上で呼べる可能性はあるが、Shell/APIの意味論、解像度、タスクバー、外部監視は未確認。 | 終了時に内容が破棄される。標準構成ではネットワーク・クリップボード等の統合が有効な場合があり、構成を狭める必要がある。長期baseline/checkpointやSupervisorとの状態管理には合いにくい。 | Sandbox feature stateもアクセス拒否で未確認。公式推奨RAMは8GB。本ホストは約7.9GiBの総RAM、調査時の空きは約1.3GBで、ホストの余力を残しつつSandboxへ推奨容量を割り当てられないため推奨しない。[Sandbox configuration](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file) |
| 既存の独立した物理Windows環境 | 専用GPU/モニターを持つ物理Windows対話セッションなら製品環境への代表性が最も高い可能性がある。1920×1080/96 DPI/タスクバーを物理的に固定できる。 | ホストとは物理的に分離できる。イメージ/ディスク復元、外部電源/プロセス監視、ログ搬出の方法は機器次第。 | 利用可能な別端末の存在・SKU・ライセンス・制御手段は未確認。利用可能なら有力な代替。 |
| 専用のクラウド/リモートWindows VM | Windows GUIをRDPで操作できる候補。ただしRDPセッションの仮想表示、Shell、AppBar、画面キャプチャの動作がローカル物理環境と同じとは限らない。 | VMスナップショット・外部監視候補はあるが、クラウド管理権限、コスト、ネットワーク、データ保持、ライセンスを追加で決める。具体的なサービス/リージョン/稼働時間が未選定のため価格は未算定。 | 現ホストの不足を避けられる候補だが費用・ライセンス・AppBar代表性は未確認。リモート専用デスクトップ検証としてPoCを先行し、AppBar適合は別判定にすべき。 |

公式資料は、Windows 11 Hyper-VにPro/Enterprise等の対応SKU、SLAT、VM Monitor Mode、ハードウェア仮想化、十分なメモリが必要とする。`systeminfo`が既存Hypervisorを検出した際に要件欄を表示しない動作は公式説明と整合するが、個別VMの作成可否は確認できていない。[Hyper-V host requirements](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/host-hardware-requirements)、[Install Hyper-V](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/get-started/install-hyper-v)

Windows 11のVM要件はGeneration 2、Secure Boot/TPM、最低2 vCPU、4GB RAM、64GBディスクである。Windows Sandboxは最低4GB RAM、8GB推奨、2 CPU core以上を掲げる。[Windows 11 requirements](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements)、[Windows Sandbox install requirements](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install)

## 条件付きの専用VM構成案

これは適格な別ホストが見つかった場合に人間が承認するための候補であり、現ホストへの設定指示ではない。

| 設定 | 提案 | 理由・未確定点 |
|---|---|---|
| Guest OS | Windows 11 Pro x64、Generation 2、Secure BootとvTPM有効 | Windows 11のVM要件に合う。Proを選ぶのはHyper-VゲストのGUI/Shell試験に十分なSKU候補だから。Guestライセンス/activationは別途権利確認が必要。 |
| vCPU | 2 vCPUで開始 | Windows 11 VMの公式最低値。現物理CPUが4C/8Tでも、この現ホストはVMを実行するリソース余裕がない。 |
| RAM | 6GiB固定を計画値、4GiBを最低ラインとする | Windows 11最低値は4GB。固定6GiBはElectron/GUI/計測の実験用推奨で、Hyper-V公式必須値ではない。安定性/host headroomを優先し、Dynamic Memoryは最初の再現性評価で避ける。推奨ホスト総RAMは16GiB以上。 |
| VHDX | 最大100GiBの動的拡張VHDX、baseline/checkpoint用に追加余白。空きSSD 150GiB以上を運用目標とする | Guestの公式最低ディスクは64GB。100GiBは更新・固定PoC依存・ログを考慮した計画上限、150GiBはcheckpoint増分とホスト余裕を含む運用目標であり、公式要件ではない。 |
| 保存先 | VM設定・VHDX・checkpoint・exportを、管理者が選定した専用のローカルSSDディレクトリへ分ける。固定パスとACLを記録。 | 現C:空き約86.6GiBは推奨余裕を満たさない。既存VM/ユーザーデータを上書きしない。別ディスク利用可否は未確認。 |
| VMスイッチ | 初期baseline/実験中はネットワーク未接続を基本。必要な準備時更新は別途承認された短時間・限定経路でのみ。 | Internetからの依存取得を避け、ネットワーク由来の変動/攻撃面を縮小。Supervisor通信・artifact搬出は後続WPで狭い固定経路を設計する。 |
| File/clipboard共有 | 既定は無効。ログ搬出はSupervisorが許可したrun-IDのディレクトリのみ、回収後にhash/ACL確認。クリップボード・mapped drivesは無効。 | ゲスト侵害や誤操作のホスト到達範囲を抑える。回収方式はWP-2/3でLevel 2設計承認が必要。 |
| 対話セッション | 通常権限の専用ローカルユーザーをゲスト内に作成。管理者用資格情報は別保管し、Codex/Runnerへ渡さない。 | UI操作は対話ログオンデスクトップで行う。PowerShell Direct単独はGUIセッションを作らない。 |
| 操作 | まずVMConnect Basic/Enhancedを比較。Enhanced Sessionは解像度変更が可能だがRDPベース。1920×1080、100%/96 DPI、単一仮想monitor、標準下部taskbarを毎回照合。 | VMConnect Enhanced Sessionのサイズ変更対応は確認済み資料にあるが、96 DPI固定やAppBar互換は未検証。[VMConnect local resources](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/use-local-resources-virtual-machine-connection) |
| checkpoint | セットアップ・更新後、VMを正常shutdownしたクリーンbaselineにProduction Checkpointを作成する案。各失敗runのログ/hash回収後、承認済みGUID/checkpoint IDだけを復元し、起動後baselineを再測定。 | Production CheckpointはVSS等を使い、メモリ状態を保存しない。Standard checkpointとの選択は対話セッション復元との比較が必要。VM復元はAppBar正常解除を意味しない。[Hyper-V checkpoints](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/checkpoints) |
| Supervisor | Hyper-V権限をCodexへ直接付与しない。固定VM GUIDと固定checkpointを操作する最小broker/JEA等をWP-2で別途設計・承認。 | `Hyper-V Administrators`は強いVM管理権限を持つため、Investigation Agentに直接付与しない。PowerShell DirectもHyper-V管理者とGuest資格情報を要する。[PowerShell Direct requirements](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/powershell-direct) |

### Windowsゲストライセンス

ホストの表示がProであることだけでは、Windows 11ゲストのインストール・activation・ローカル仮想化使用権を確定できない。MicrosoftのVirtual Desktop licensing資料は商用ライセンス向けで、OEMライセンスのみの場合は通常仮想化権が含まれない場合があるとしているが、これはこの端末の契約や使用条件を判定しない。NEC/OEM条件、購入証跡、Microsoft契約、ゲストで使うライセンスまたは評価用ライセンスの適用可否をライセンス管理者が確認する必要がある。[Windows 11 licensing for virtual desktops](https://www.microsoft.com/licensing/guidance/Windows-11-Licensing-for-Virtual-Desktops)

## Phase 2 — 人間の承認後に行うVM準備 (未実施)

以下は手順候補であり、今回実行していない。

1. 管理者がOS SKU/ライセンス、firmware virtualization、Hyper-V feature state、既存VM/VM switch、空き容量、Hyper-V管理ユーザーを確認する。既存VM/switch一覧と対象外IDを記録し、VM作成時に名前だけで選択しない。
2. 適格ホストと専用保存先を承認し、Guest Windowsライセンス/インストール媒体、2 vCPU、6GiB RAM、100GiB dynamic VHDX、Generation 2/Secure Boot/vTPMを明示承認する。より小さい構成に変更する場合は先に受け入れ条件を再確認する。
3. 専用VM名とGUIDを作成記録に固定。ネットワーク未接続、clipboard/mapped folders無効を基本とし、ログ搬出チャネルを別途承認する。
4. Windows 11 Proゲストをインストールし、更新・Electron/Koffi/固定PoC等の必要物を承認済み方法で準備する。通常権限の対話ユーザーと、管理者用アカウントを分離する。秘密情報をGitやmanifestへ保存しない。
5. VMConnectでログオンし、再起動後に自動または手動で同じ対話ユーザーのGUIへ到達できることを確認。まずEnhanced Sessionで1920×1080/96 DPI/単一画面/標準taskbarを試す。表示条件が維持できなければ別の表示方式を試し、条件の変更を記録する。
6. AppBarを実行せず、ホストwork area、他VMのGUID/電源状態、Guest work area/画面/DPI/taskbar/Explorer、仮想switch/統合機能設定をbaseline記録する。
7. Guestを正常shutdownし、Production Checkpointを作成。VM GUID、checkpoint ID、保存先、作成時刻、ベースイメージ/commitを記録する。
8. ログのみの無害なファイルをGuestで生成し、許可済みチャネルで外部回収・hash検証する。checkpoint復元後、同一VM GUID、Guest起動、GUI条件、work area、ファイルbaselineを確認する。復元成功とAppBar releaseを別々の状態として記録する。

VMの作成・変更・起動・checkpoint・restoreは明示承認後の作業。これらの手順をIssueへ登録したり実行したりする承認は、今回の資格確認からは含まれない。

## Phase 3 — 安全性確認 (未実施、AppBarなし)

| 確認 | 合格に必要な証拠 |
|---|---|
| ホスト隔離 | VM start/stop/restore前後のホスト1920×1080・96 DPI・work area測定値が一致。ホストでElectron/AppBar登録を実行していないことをSupervisor監査ログで示す。 |
| 他VM保護 | 開始前後の既存VM GUIDと状態一覧が一致し、対象VM以外にSupervisor操作がない。権限境界テストで未許可GUIDが拒否される。 |
| 対話GUI再現 | Guest environment recordと画面証拠にWindows SKU/build、Explorer/taskbar、monitor数、1920×1080、96 DPI、work area baseline、対話session IDがある。再起動後も同条件を再確認。 |
| Electron無害起動 | 指定されたElectron診断画面をゲスト対話セッションで起動・正常終了。AppBar API未呼出しをコード/ログで証明。プロセス終了コードとGuest Sentinelの終了記録が一致。 |
| 外部監視 | Electron停止とGuest heartbeat/VM停止を別々に識別し、期限超過でもホスト・別VMを操作しない。run lockが1件を超えない。 |
| artifact回収 | run ID・commit SHA・manifest・JSONL・画面証拠をGuest外の隔離場所へ回収し、hash/サイズを照合。clipboard/mapped driveに依存しない。 |
| restore | Artifact回収後、固定GUID/固定checkpointだけをrestoreし、VM状態・Guest baselineを確認。復元失敗/ID不一致では停止。AppBar release statusを復元から推定しない。 |

VM自体が停止/ハングした場合、ゲスト内Sentinelは外部確認を続けられないため、Host Supervisorが状態を観測する。AppBar解除が不明な場合はrelease=`UNKNOWN`のまま保持する。承認済みの対象VM以外を停止・restoreしない。復元成功は環境containmentの結果であり、AppBar正常解除の証拠ではない。

## Phase 4 — WP-1完了判定

AVT-001–AVT-005とWP-1のAcceptanceは、Phase 1だけでは完了しない。`PASS`とするには、少なくとも以下が必要。

| Task | 必要な証拠 | 現在 |
|---|---|---|
| AVT-001 host資格 | 管理者が確認したhost SKU/build/firmware/SLAT/DEP/Hyper-V feature、管理権限、既存VM/switch inventory、resource/storage headroom | **PARTIAL / NOT_CONFIRMED**。OS/CPU型番/RAM/storage等は記録、機能・VM inventory・権限は確認不全。 |
| AVT-002 guest要件・ライセンス | Guest Windows license/activation根拠、費用、VM resource approval、画面/DPI/taskbar/対話sessionの再現結果 | **NOT_RUN**。設計案のみ。 |
| AVT-003 isolation/control | VM GUIDと保存先の承認、switch/network/integration/credential/VMConnect境界、未許可対象拒否のテスト | **NOT_RUN**。実VM/brokerなし。 |
| AVT-004 baseline/recovery | Clean baseline/checkpoint ID、capture-before-restore/hash、対象VM固定、復元とpost-restore測定 | **NOT_RUN**。checkpointを作成・適用していない。 |
| AVT-005 host/other VM safety | Host work areaと他VM状態のbefore/after証拠、無害なGuest GUI起動・終了・外部回収 | **NOT_RUN**。今回VMやGUI試験なし。 |
| WP-1 Acceptance | 人間がSKU/license/privileges/resource/isolation/checkpoint/interactive GUI境界を承認し、対象VM識別、Guest display baseline、AppBar APIなしで不変更確認 | **MANUAL_PENDING**。Phase 2/3の承認・実行が未完了。 |

## GitHub Issue候補 (未登録)

| フィールド | Issue候補 |
|---|---|
| Work Package | WP-1 — 専用Windows環境の資格確認と隔離 |
| Task IDs | `AVT-001`–`AVT-005` |
| 仕様/計画/タスク | `specs/windows-appbar-autonomous-validation/spec.md` (`AV-001`, `AV-003`, `AV-004`, `AV-005`), `plan.md`, `tasks.md` |
| 今回の調査成果 | `docs/spikes/windows-appbar-core/wp1-host-qualification.md` |
| Issue候補の目的 | 資格のある専用Windows環境を選び、隔離・対話GUI・baseline/checkpoint・証拠搬出をAppBar実験前に検証する。 |
| 完了条件 | Phase 4の各AVT証拠をそろえ、未確認を残さず人間が環境構成とライセンスを承認。AppBar APIは一切実行しない。 |
| 依存 | WP-1以前の実装依存はなし。まず適格ホスト/ライセンス/権限の人間確認が必要。 |
| 承認 | 対象ホスト選択、Guest OSライセンス、VM作成/保存先/資源、Hyper-V enablement/admin permissions、switch/network/clipboard/share/credentials、checkpoint/restore、GUI操作と外部Supervisorの権限。 |
| 登録状態 | **未登録**。人間によるWork Package承認後にのみIssue化する。Issue登録は実装/VM操作の承認ではない。 |

## 次に必要な人間の判断

1. **実行環境:** 現ホストを使わず、別の専用物理Windows端末または少なくとも16GiB RAM/150GiB空きSSDを持つ別Hyper-Vホストを選ぶか。現ホスト継続を希望する場合は、RAM/storage余裕をどう確保するか。
2. **資格情報の確認:** 管理者にWindows SKU/ライセンス、Hyper-V/Sandbox機能状態、firmware virtualization、既存VM・switch一覧を読み取り確認してもらう。権限拒否された状態のままVM作成に進まない。
3. **ライセンス:** Guest Windows 11 Proの使用権・activation方法をライセンス管理者が確定する。ホストOSライセンスの流用を前提にしない。
4. **資源・隔離方針:** 2 vCPU/6GiB RAM/最大100GiB VHDX、専用保存先、network-off baseline、clipboard/mapped folders無効、VMConnect方式、ログ回収経路を承認するか変更案を選ぶ。
5. **権限と復元:** CodexにHyper-V Administrators権限を直接与えない設計を維持し、固定VM GUID/checkpoint IDだけを扱うSupervisor/brokerを別WPで設計する。VM create/start/restoreのどこまでを後続Issueに含めるか明示する。
6. **Issue登録:** 上記の選択を反映したWP-1候補を人間が承認し、登録を明示指示する。登録のみではVM作成・設定・実装を開始しない。

## 公式資料

- [System requirements for Hyper-V on Windows and Windows Server](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/host-hardware-requirements)
- [Install Hyper-V in Windows and Windows Server](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/get-started/install-hyper-v)
- [Windows 11 requirements](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-requirements)
- [Install Windows Sandbox](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-install)
- [Use local resources on Hyper-V with VMConnect](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/use-local-resources-virtual-machine-connection)
- [Using Hyper-V checkpoints](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/checkpoints)
- [Manage Windows virtual machines with PowerShell Direct](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/powershell-direct)
- [Windows 11 licensing for virtual desktops](https://www.microsoft.com/licensing/guidance/Windows-11-Licensing-for-Virtual-Desktops)
- [Intel Core i5-10210Y product specifications](https://www.intel.com/content/www/us/en/products/sku/196454/intel-core-i510210y-processor-6m-cache-up-to-4-00-ghz/specifications.html)

param(
    [Parameter(Mandatory = $true)][string]$BaselineSource,
    [Parameter(Mandatory = $true)][string]$PatchedSource,
    [Parameter(Mandatory = $true)][string]$BuildRoot
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$BaseSha = '56e3bb550c91fd7005566f19c079cb7a503223cf'
$ExpectedQuotedPatchSha256 = 'CC023C13AF13A4F836922B87DA72BB51EA7A7C752AAC861A75F7A066E0EA3141'
$ExpectedFoldedPatchSha256 = 'CE9DF718C987E314ED92ECB79033DCFAF7373F6F0765A24A72755D46F087E577'
$QuotedPatchFile = Join-Path $PSScriptRoot '..\patches\preserve-quoted-scalar-trailing-newlines.patch'
$FoldedPatchFile = Join-Path $PSScriptRoot '..\patches\preserve-folded-keep-trailing-newlines.patch'
$Harness = Join-Path $PSScriptRoot '..\harness'
$ReportRoot = Join-Path $BuildRoot 'reports'
$Checks = [ordered]@{}

function Set-Check {
    param([string]$Name, [string]$Status, [string]$Detail)
    $script:Checks[$Name] = [ordered]@{ status = $Status; detail = $Detail }
    if ($Name -match '^[ABCD]-') {
        $statusPath = Join-Path $ReportRoot "$Name.status.txt"
        "$Name=$Status`nDETAIL=$Detail" | Set-Content -LiteralPath $statusPath -Encoding utf8
    }
    Write-Host "$Name=$Status ($Detail)"
}

function Invoke-LoggedCommand {
    param([string]$Name, [string]$File, [string[]]$Arguments, [string]$LogPath)
    New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null
    "COMMAND=$File $($Arguments -join ' ')" | Set-Content -LiteralPath $LogPath -Encoding utf8
    $exitCode = 1
    try {
        & $File @Arguments *>> $LogPath
        $exitCode = $LASTEXITCODE
    } catch {
        ($_ | Out-String) | Add-Content -LiteralPath $LogPath -Encoding utf8
    }
    "EXIT_CODE=$exitCode" | Add-Content -LiteralPath $LogPath -Encoding utf8
    if ($exitCode -eq 0) {
        Set-Check $Name 'PASS' "exit code $exitCode; see $([IO.Path]::GetFileName($LogPath))"
        return $true
    }
    Set-Check $Name 'FAIL' "exit code $exitCode; see $([IO.Path]::GetFileName($LogPath))"
    return $false
}

function Get-SourceHead {
    param([string]$Path)
    $value = @(& git -C $Path rev-parse HEAD 2>&1)
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return ($value | Out-String).Trim()
}

function Test-SourceClean {
    param([string]$Path)
    $status = @(& git -C $Path status --porcelain --untracked-files=all 2>&1)
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return ($status.Count -eq 0)
}

function Test-CacheSetting {
    param([string[]]$Cache, [string]$Pattern)
    return [bool]($Cache | Where-Object { $_ -match $Pattern })
}

function Test-BuiltBinaryDependencies {
    param([string]$Variant, [string]$BuildDir)
    $logPath = Join-Path $ReportRoot "runtime-$Variant.log"
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $dumpbin = (Get-Command dumpbin.exe -ErrorAction SilentlyContinue).Source
    if (-not $dumpbin -and (Test-Path -LiteralPath $vswhere)) {
        $vsPath = @(& $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>&1)
        if ($LASTEXITCODE -eq 0 -and $vsPath.Count -gt 0) {
            $candidate = Get-ChildItem -LiteralPath (Join-Path $vsPath[0] 'VC\Tools\MSVC') -Filter dumpbin.exe -File -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -match '\\bin\\Hostx64\\x64\\dumpbin\.exe$' } |
                Sort-Object FullName -Descending | Select-Object -First 1
            if ($candidate) { $dumpbin = $candidate.FullName }
        }
    }
    if (-not $dumpbin) {
        Set-Check "RUNTIME-$Variant" 'NOT_RUN' 'could not locate x64 dumpbin.exe'
        return $false
    }

    $allPassed = $true
    foreach ($exeName in @('yaml_cpp_compatibility_tests.exe', 'yaml_cpp_resource_bounds_tests.exe')) {
        $exePath = Join-Path $BuildDir "Release\$exeName"
        "BINARY=$exePath" | Add-Content -LiteralPath $logPath -Encoding utf8
        $headers = @(& $dumpbin /headers $exePath 2>&1)
        $headersExit = $LASTEXITCODE
        $headers | Add-Content -LiteralPath $logPath -Encoding utf8
        $dependents = @(& $dumpbin /dependents $exePath 2>&1)
        $dependentsExit = $LASTEXITCODE
        $dependents | Add-Content -LiteralPath $logPath -Encoding utf8
        $isX64 = $headersExit -eq 0 -and [bool]($headers | Where-Object { $_ -match '8664 machine \(x64\)' })
        $runtimeImports = @($dependents | Where-Object {
            $_ -match '(?i)^\s*(VCRUNTIME\d*(?:_\d+)?|MSVCP\d*(?:_\d+)?|UCRTBASE|CONCRT\d*|API-MS-WIN-CRT-[^\s]+)\.DLL\s*$' -or
            $_ -match '(?i)^\s*YAML-CPP\.DLL\s*$'
        })
        if ($dependentsExit -ne 0 -or -not $isX64 -or $runtimeImports.Count -gt 0) {
            $allPassed = $false
            "DEPENDENCY_RESULT=FAIL x64=$isX64 dumpbinExit=$dependentsExit unexpectedRuntimeImports=$($runtimeImports -join ',')" |
                Add-Content -LiteralPath $logPath -Encoding utf8
        } else {
            "DEPENDENCY_RESULT=PASS x64=$isX64; no dynamic MSVC/UCRT runtime imports" |
                Add-Content -LiteralPath $logPath -Encoding utf8
        }
    }
    Set-Check "RUNTIME-$Variant" $(if ($allPassed) { 'PASS' } else { 'FAIL' }) "x64 harness binaries inspected; see $([IO.Path]::GetFileName($logPath))"
    return $allPassed
}

function Invoke-Variant {
    param([string]$Variant, [string]$Source, [bool]$IsPatched)
    $buildDir = Join-Path $BuildRoot "build-$Variant"
    $logDir = Join-Path $ReportRoot $Variant
    $compatKey = if ($Variant -eq 'baseline') { 'A-baseline-compatibility' } else { 'B-patched-compatibility' }
    $resourceKey = if ($Variant -eq 'baseline') { 'C-baseline-resource-bounds' } else { 'D-patched-resource-bounds' }
    $buildKey = "BUILD-$Variant"

    $sourceHead = Get-SourceHead $Source
    if ($sourceHead -ne $BaseSha) {
        Set-Check $buildKey 'FAIL' "source must be exactly $BaseSha; observed '$sourceHead'"
        Set-Check "RUNTIME-$Variant" 'NOT_RUN' 'source revision prerequisite failed'
        Set-Check $compatKey 'NOT_RUN' 'source revision prerequisite failed'
        Set-Check $resourceKey 'NOT_RUN' 'source revision prerequisite failed'
        return
    }
    if (-not $IsPatched) {
        $sourceClean = Test-SourceClean $Source
        if ($null -eq $sourceClean -or -not $sourceClean) {
            Set-Check $buildKey 'FAIL' 'baseline checkout is dirty or could not be inspected'
            Set-Check "RUNTIME-$Variant" 'NOT_RUN' 'baseline checkout cleanliness prerequisite failed'
            Set-Check $compatKey 'NOT_RUN' 'baseline checkout cleanliness prerequisite failed'
            Set-Check $resourceKey 'NOT_RUN' 'baseline checkout cleanliness prerequisite failed'
            return
        }
    }

    if (Test-Path -LiteralPath $buildDir) {
        Set-Check $buildKey 'FAIL' "refusing to overwrite existing build directory $buildDir"
        Set-Check "RUNTIME-$Variant" 'NOT_RUN' 'build directory pre-existed'
        Set-Check $compatKey 'NOT_RUN' 'build was not attempted'
        Set-Check $resourceKey 'NOT_RUN' 'build was not attempted'
        return
    }

    $patchOption = if ($IsPatched) { 'ON' } else { 'OFF' }
    $configureLog = Join-Path $logDir 'configure.log'
    $configureArgs = @(
        '-S', $Harness,
        '-B', $buildDir,
        '-A', 'x64',
        "-DYAML_CPP_SOURCE_DIR=$Source",
        "-DQUALIFY_PATCHED=$patchOption",
        '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded'
    )
    if (-not (Invoke-LoggedCommand -Name "$buildKey-configure" -File 'cmake' -Arguments $configureArgs -LogPath $configureLog)) {
        Set-Check $buildKey 'FAIL' 'CMake configure failed'
        Set-Check "RUNTIME-$Variant" 'NOT_RUN' 'configuration failed'
        Set-Check $compatKey 'NOT_RUN' 'build configuration failed'
        Set-Check $resourceKey 'NOT_RUN' 'build configuration failed'
        return
    }

    try {
        $cachePath = Join-Path $buildDir 'CMakeCache.txt'
        $cache = Get-Content -LiteralPath $cachePath
        $cacheChecks = @(
            (Test-CacheSetting $cache '^CMAKE_GENERATOR:INTERNAL=Visual Studio 17 2022$'),
            (Test-CacheSetting $cache '^CMAKE_GENERATOR_PLATFORM:INTERNAL=x64$'),
            (Test-CacheSetting $cache '^CMAKE_MSVC_RUNTIME_LIBRARY:STRING=MultiThreaded$'),
            (Test-CacheSetting $cache '^YAML_BUILD_SHARED_LIBS:BOOL=OFF$')
        )
    } catch {
        Set-Check $buildKey 'FAIL' "could not inspect CMake cache: $($_.Exception.Message)"
        Set-Check "RUNTIME-$Variant" 'NOT_RUN' 'CMake cache could not be verified'
        Set-Check $compatKey 'NOT_RUN' 'CMake cache could not be verified'
        Set-Check $resourceKey 'NOT_RUN' 'CMake cache could not be verified'
        return
    }
    if ($cacheChecks -contains $false) {
        Set-Check $buildKey 'FAIL' 'generator, x64, /MT, or static-link cache assertion failed'
        Set-Check "RUNTIME-$Variant" 'NOT_RUN' 'build configuration assertion failed'
        Set-Check $compatKey 'NOT_RUN' 'build configuration assertion failed'
        Set-Check $resourceKey 'NOT_RUN' 'build configuration assertion failed'
        return
    }

    $buildLog = Join-Path $logDir 'build.log'
    $buildArgs = @('--build', $buildDir, '--config', 'Release', '--parallel', '2')
    if (-not (Invoke-LoggedCommand -Name "$buildKey-compile" -File 'cmake' -Arguments $buildArgs -LogPath $buildLog)) {
        Set-Check $buildKey 'FAIL' 'compile or link failed'
        Set-Check "RUNTIME-$Variant" 'NOT_RUN' 'build did not complete'
        Set-Check $compatKey 'NOT_RUN' 'variant did not build'
        Set-Check $resourceKey 'NOT_RUN' 'variant did not build'
        return
    }
    Set-Check $buildKey 'PASS' 'MSVC x64 /MT static build succeeded'
    $null = Test-BuiltBinaryDependencies -Variant $Variant -BuildDir $buildDir

    $compatLog = Join-Path $logDir "$compatKey.log"
    $compatArgs = @('--test-dir', $buildDir, '-C', 'Release', '--output-on-failure', '--verbose', '-R', '^compatibility$')
    $null = Invoke-LoggedCommand -Name $compatKey -File 'ctest' -Arguments $compatArgs -LogPath $compatLog

    $resourceLog = Join-Path $logDir "$resourceKey.log"
    $resourceArgs = @('--test-dir', $buildDir, '-C', 'Release', '--output-on-failure', '--verbose', '-R', '^resource-bounds$')
    $null = Invoke-LoggedCommand -Name $resourceKey -File 'ctest' -Arguments $resourceArgs -LogPath $resourceLog
}

if (Test-Path -LiteralPath $BuildRoot) {
    throw "Build output already exists; refusing to overwrite: $BuildRoot"
}
New-Item -ItemType Directory -Path $ReportRoot -Force | Out-Null

Set-Check 'PATCH-integrity' 'NOT_RUN' 'validation pending'
$patchSpecs = @(
    [ordered]@{ name = 'quoted-scalar'; file = $QuotedPatchFile; expectedSha = $ExpectedQuotedPatchSha256; changedPath = 'src/scantoken.cpp'; expectedNumstat = "1`t1`tsrc/scantoken.cpp" },
    [ordered]@{ name = 'folded-keep'; file = $FoldedPatchFile; expectedSha = $ExpectedFoldedPatchSha256; changedPath = 'src/scanscalar.cpp'; expectedNumstat = "3`t1`tsrc/scanscalar.cpp" }
)
$patchHashes = [ordered]@{}
$patchValidationPassed = $true
$patchLog = Join-Path $ReportRoot 'patch-validation.log'
"BASE_SHA=$BaseSha" | Set-Content -LiteralPath $patchLog -Encoding utf8
foreach ($spec in $patchSpecs) {
    try {
        $observedSha = (Get-FileHash -LiteralPath $spec.file -Algorithm SHA256).Hash
        $patchHashes[$spec.name] = $observedSha
        "PATCH=$($spec.name) EXPECTED_SHA256=$($spec.expectedSha) OBSERVED_SHA256=$observedSha" |
            Add-Content -LiteralPath $patchLog -Encoding utf8
        if ($observedSha -ne $spec.expectedSha) { $patchValidationPassed = $false }
    } catch {
        "PATCH=$($spec.name) HASH_ERROR=$($_.Exception.Message)" | Add-Content -LiteralPath $patchLog -Encoding utf8
        $patchValidationPassed = $false
    }
}

$patchSourceHead = Get-SourceHead $PatchedSource
$patchSourceClean = Test-SourceClean $PatchedSource
if ($patchSourceHead -ne $BaseSha -or $null -eq $patchSourceClean -or -not $patchSourceClean) {
    "PATCH_SOURCE_HEAD=$patchSourceHead" | Add-Content -LiteralPath $patchLog -Encoding utf8
    "PATCH_SOURCE_CLEAN=$patchSourceClean" | Add-Content -LiteralPath $patchLog -Encoding utf8
    $patchValidationPassed = $false
}

if ($patchValidationPassed) {
    foreach ($spec in $patchSpecs) {
        $checkOutput = @(& git -C $PatchedSource apply --check $spec.file 2>&1)
        $checkExit = $LASTEXITCODE
        $checkOutput | Add-Content -LiteralPath $patchLog -Encoding utf8
        if ($checkExit -eq 0) {
            & git -C $PatchedSource apply $spec.file *>> $patchLog
            $applyExit = $LASTEXITCODE
        } else {
            $applyExit = $checkExit
        }
        if ($applyExit -ne 0) {
            "PATCH_APPLY=$($spec.name) FAIL exit=$applyExit" | Add-Content -LiteralPath $patchLog -Encoding utf8
            $patchValidationPassed = $false
            break
        }

        $changed = @(& git -C $PatchedSource diff --name-only)
        $namesExit = $LASTEXITCODE
        $numstat = @(& git -C $PatchedSource diff --numstat)
        $numstatExit = $LASTEXITCODE
        $expectedPaths = if ($spec.name -eq 'quoted-scalar') {
            @('src/scantoken.cpp')
        } else {
            @('src/scanscalar.cpp', 'src/scantoken.cpp')
        }
        $expectedStats = if ($spec.name -eq 'quoted-scalar') {
            @("1`t1`tsrc/scantoken.cpp")
        } else {
            @("3`t1`tsrc/scanscalar.cpp", "1`t1`tsrc/scantoken.cpp")
        }
        $changedSorted = @($changed | Sort-Object)
        $numstatSorted = @($numstat | Sort-Object)
        $statsSorted = @($expectedStats | Sort-Object)
        if ($namesExit -ne 0 -or $numstatExit -ne 0 -or
            (Compare-Object -ReferenceObject $expectedPaths -DifferenceObject $changedSorted) -or
            (Compare-Object -ReferenceObject $statsSorted -DifferenceObject $numstatSorted)) {
            "PATCH_APPLY=$($spec.name) FAIL changed=$($changed -join ',') numstat=$($numstat -join ';')" |
                Add-Content -LiteralPath $patchLog -Encoding utf8
            $patchValidationPassed = $false
            break
        }
        "PATCH_APPLY=$($spec.name) PASS PATH=$($spec.changedPath) NUMSTAT=$($spec.expectedNumstat)" |
            Add-Content -LiteralPath $patchLog -Encoding utf8
    }
}

if ($patchValidationPassed) {
    $quotedPatchHash = $patchHashes['quoted-scalar']
    $foldedPatchHash = $patchHashes['folded-keep']
    Set-Check 'PATCH-integrity' 'PASS' "patch order quoted-scalar then folded-keep; SHA-256s $quotedPatchHash / $foldedPatchHash; exact changed-file/numstat checks passed"
} else {
    Set-Check 'PATCH-integrity' 'FAIL' 'patch hashes, base checkout, ordered application, or exact diff verification failed; see patch-validation.log'
    Set-Check 'BUILD-patched' 'NOT_RUN' 'patch integrity failed'
    Set-Check 'RUNTIME-patched' 'NOT_RUN' 'patch integrity failed'
    Set-Check 'B-patched-compatibility' 'NOT_RUN' 'patch integrity failed'
    Set-Check 'D-patched-resource-bounds' 'NOT_RUN' 'patch integrity failed'
}

Invoke-Variant -Variant 'baseline' -Source $BaselineSource -IsPatched $false
if ($Checks['PATCH-integrity'].status -eq 'PASS') {
    Invoke-Variant -Variant 'patched' -Source $PatchedSource -IsPatched $true
} else {
    if (-not $Checks.Contains('BUILD-patched')) { Set-Check 'BUILD-patched' 'NOT_RUN' 'patch did not pass integrity checks' }
    if (-not $Checks.Contains('RUNTIME-patched')) { Set-Check 'RUNTIME-patched' 'NOT_RUN' 'patch did not pass integrity checks' }
    if (-not $Checks.Contains('B-patched-compatibility')) { Set-Check 'B-patched-compatibility' 'NOT_RUN' 'patch did not pass integrity checks' }
    if (-not $Checks.Contains('D-patched-resource-bounds')) { Set-Check 'D-patched-resource-bounds' 'NOT_RUN' 'patch did not pass integrity checks' }
}

$required = @('PATCH-integrity', 'BUILD-baseline', 'RUNTIME-baseline', 'A-baseline-compatibility', 'C-baseline-resource-bounds', 'BUILD-patched', 'RUNTIME-patched', 'B-patched-compatibility', 'D-patched-resource-bounds')
$overall = 'PASS'
foreach ($name in $required) {
    if (-not $Checks.Contains($name) -or $Checks[$name].status -ne 'PASS') {
        $overall = 'FAIL'
    }
}
$summary = [ordered]@{
    baseSha = $BaseSha
    patchOrder = @('preserve-quoted-scalar-trailing-newlines.patch', 'preserve-folded-keep-trailing-newlines.patch')
    patchSha256 = $patchHashes
    checks = $Checks
    requiredCheckNames = $required
    overall = $overall
}
$summaryPath = Join-Path $ReportRoot 'summary.json'
[IO.File]::WriteAllText($summaryPath, ($summary | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Host "QUALIFICATION_OVERALL=$overall"
if ($overall -ne 'PASS') { exit 1 }

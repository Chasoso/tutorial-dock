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
$ExpectedPatchSha256 = 'CC023C13AF13A4F836922B87DA72BB51EA7A7C752AAC861A75F7A066E0EA3141'
$PatchFile = Join-Path $PSScriptRoot '..\patches\preserve-quoted-scalar-trailing-newlines.patch'
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
        Set-Check $compatKey 'NOT_RUN' 'source revision prerequisite failed'
        Set-Check $resourceKey 'NOT_RUN' 'source revision prerequisite failed'
        return
    }
    if (-not $IsPatched) {
        $sourceClean = Test-SourceClean $Source
        if ($null -eq $sourceClean -or -not $sourceClean) {
            Set-Check $buildKey 'FAIL' 'baseline checkout is dirty or could not be inspected'
            Set-Check $compatKey 'NOT_RUN' 'baseline checkout cleanliness prerequisite failed'
            Set-Check $resourceKey 'NOT_RUN' 'baseline checkout cleanliness prerequisite failed'
            return
        }
    }

    if (Test-Path -LiteralPath $buildDir) {
        Set-Check $buildKey 'FAIL' "refusing to overwrite existing build directory $buildDir"
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
        Set-Check $compatKey 'NOT_RUN' 'CMake cache could not be verified'
        Set-Check $resourceKey 'NOT_RUN' 'CMake cache could not be verified'
        return
    }
    if ($cacheChecks -contains $false) {
        Set-Check $buildKey 'FAIL' 'generator, x64, /MT, or static-link cache assertion failed'
        Set-Check $compatKey 'NOT_RUN' 'build configuration assertion failed'
        Set-Check $resourceKey 'NOT_RUN' 'build configuration assertion failed'
        return
    }

    $buildLog = Join-Path $logDir 'build.log'
    $buildArgs = @('--build', $buildDir, '--config', 'Release', '--parallel', '2')
    if (-not (Invoke-LoggedCommand -Name "$buildKey-compile" -File 'cmake' -Arguments $buildArgs -LogPath $buildLog)) {
        Set-Check $buildKey 'FAIL' 'compile or link failed'
        Set-Check $compatKey 'NOT_RUN' 'variant did not build'
        Set-Check $resourceKey 'NOT_RUN' 'variant did not build'
        return
    }
    Set-Check $buildKey 'PASS' 'MSVC x64 /MT static build succeeded'

    $compatLog = Join-Path $logDir "$compatKey.log"
    $compatArgs = @('--test-dir', $buildDir, '-C', 'Release', '--output-on-failure', '-R', '^compatibility$')
    $null = Invoke-LoggedCommand -Name $compatKey -File 'ctest' -Arguments $compatArgs -LogPath $compatLog

    $resourceLog = Join-Path $logDir "$resourceKey.log"
    $resourceArgs = @('--test-dir', $buildDir, '-C', 'Release', '--output-on-failure', '-R', '^resource-bounds$')
    $null = Invoke-LoggedCommand -Name $resourceKey -File 'ctest' -Arguments $resourceArgs -LogPath $resourceLog
}

if (Test-Path -LiteralPath $BuildRoot) {
    throw "Build output already exists; refusing to overwrite: $BuildRoot"
}
New-Item -ItemType Directory -Path $ReportRoot -Force | Out-Null

Set-Check 'PATCH-integrity' 'NOT_RUN' 'validation pending'
$patchHash = $null
try {
    $patchHash = (Get-FileHash -LiteralPath $PatchFile -Algorithm SHA256).Hash
} catch {
    Set-Check 'PATCH-integrity' 'FAIL' "could not hash approved patch: $($_.Exception.Message)"
}
if ($null -ne $patchHash -and $patchHash -ne $ExpectedPatchSha256) {
    Set-Check 'PATCH-integrity' 'FAIL' "expected $ExpectedPatchSha256, observed $patchHash"
    Set-Check 'BUILD-patched' 'NOT_RUN' 'patch integrity failed'
    Set-Check 'B-patched-compatibility' 'NOT_RUN' 'patch integrity failed'
    Set-Check 'D-patched-resource-bounds' 'NOT_RUN' 'patch integrity failed'
} elseif ($null -ne $patchHash -and $patchHash -eq $ExpectedPatchSha256) {
    $patchLog = Join-Path $ReportRoot 'patch-validation.log'
    "PATCH_SHA256=$patchHash" | Set-Content -LiteralPath $patchLog -Encoding utf8
    $patchSourceHead = Get-SourceHead $PatchedSource
    $patchSourceClean = Test-SourceClean $PatchedSource
    if ($patchSourceHead -ne $BaseSha -or $null -eq $patchSourceClean -or -not $patchSourceClean) {
        "PATCH_SOURCE_HEAD=$patchSourceHead" | Add-Content -LiteralPath $patchLog -Encoding utf8
        "PATCH_SOURCE_CLEAN=$patchSourceClean" | Add-Content -LiteralPath $patchLog -Encoding utf8
        Set-Check 'PATCH-integrity' 'FAIL' "patch target must be a clean checkout at $BaseSha"
        Set-Check 'BUILD-patched' 'NOT_RUN' 'patch target precondition failed'
        Set-Check 'B-patched-compatibility' 'NOT_RUN' 'patch target precondition failed'
        Set-Check 'D-patched-resource-bounds' 'NOT_RUN' 'patch target precondition failed'
    } else {
    $applyExit = 1
    try {
        $checkOutput = @(& git -C $PatchedSource apply --check $PatchFile 2>&1)
        $checkExit = $LASTEXITCODE
        $checkOutput | Add-Content -LiteralPath $patchLog -Encoding utf8
        if ($checkExit -eq 0) {
            & git -C $PatchedSource apply $PatchFile *>> $patchLog
            $applyExit = $LASTEXITCODE
        } else {
            $applyExit = $checkExit
        }
    } catch {
        ($_ | Out-String) | Add-Content -LiteralPath $patchLog -Encoding utf8
    }
    if ($applyExit -eq 0) {
        $changed = @(& git -C $PatchedSource diff --name-only)
        $namesExit = $LASTEXITCODE
        $numstat = @(& git -C $PatchedSource diff --numstat)
        $numstatExit = $LASTEXITCODE
        if ($namesExit -eq 0 -and $numstatExit -eq 0 -and
            $changed.Count -eq 1 -and $changed[0] -eq 'src/scantoken.cpp' -and
            $numstat.Count -eq 1 -and $numstat[0] -match '^1\s+1\s+src/scantoken\.cpp$') {
            Set-Check 'PATCH-integrity' 'PASS' "SHA-256 $patchHash; one-line src/scantoken.cpp replacement"
        } else {
            Set-Check 'PATCH-integrity' 'FAIL' 'applied diff did not match the approved one-line patch'
        }
    } else {
        Set-Check 'PATCH-integrity' 'FAIL' "git apply check/application failed with exit $applyExit"
    }
    }
} else {
    Set-Check 'BUILD-patched' 'NOT_RUN' 'patch hash could not be established'
    Set-Check 'B-patched-compatibility' 'NOT_RUN' 'patch hash could not be established'
    Set-Check 'D-patched-resource-bounds' 'NOT_RUN' 'patch hash could not be established'
}

Invoke-Variant -Variant 'baseline' -Source $BaselineSource -IsPatched $false
if ($Checks['PATCH-integrity'].status -eq 'PASS') {
    Invoke-Variant -Variant 'patched' -Source $PatchedSource -IsPatched $true
} else {
    if (-not $Checks.Contains('BUILD-patched')) { Set-Check 'BUILD-patched' 'NOT_RUN' 'patch did not pass integrity checks' }
    if (-not $Checks.Contains('B-patched-compatibility')) { Set-Check 'B-patched-compatibility' 'NOT_RUN' 'patch did not pass integrity checks' }
    if (-not $Checks.Contains('D-patched-resource-bounds')) { Set-Check 'D-patched-resource-bounds' 'NOT_RUN' 'patch did not pass integrity checks' }
}

$required = @('A-baseline-compatibility', 'B-patched-compatibility', 'C-baseline-resource-bounds', 'D-patched-resource-bounds')
$overall = 'PASS'
foreach ($name in $required) {
    if (-not $Checks.Contains($name) -or $Checks[$name].status -ne 'PASS') {
        $overall = 'FAIL'
    }
}
$summary = [ordered]@{
    baseSha = $BaseSha
    patchSha256 = $patchHash
    checks = $Checks
    requiredCheckNames = $required
    overall = $overall
}
$summaryPath = Join-Path $ReportRoot 'summary.json'
[IO.File]::WriteAllText($summaryPath, ($summary | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Host "QUALIFICATION_OVERALL=$overall"
if ($overall -ne 'PASS') { exit 1 }

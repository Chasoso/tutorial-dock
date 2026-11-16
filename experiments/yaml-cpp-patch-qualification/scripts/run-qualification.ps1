param(
    [Parameter(Mandatory = $true)][string]$BaselineSource,
    [Parameter(Mandatory = $true)][string]$PatchedSource,
    [Parameter(Mandatory = $true)][string]$BuildRoot
)

$ErrorActionPreference = 'Stop'
$BaseSha = '56e3bb550c91fd7005566f19c079cb7a503223cf'
$ExpectedPatchSha256 = 'CC023C13AF13A4F836922B87DA72BB51EA7A7C752AAC861A75F7A066E0EA3141'
$PatchFile = Join-Path $PSScriptRoot '..\patches\preserve-quoted-scalar-trailing-newlines.patch'
$Harness = Join-Path $PSScriptRoot '..\harness'

function Invoke-Native {
    param([Parameter(Mandatory = $true)][string]$File, [Parameter(Mandatory = $true)][string[]]$Arguments)
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE`: $File $($Arguments -join ' ')"
    }
}

function Get-SourceHead {
    param([string]$Path)
    $value = & git -C $Path rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw "Could not read source revision: $Path" }
    return ($value | Out-String).Trim()
}

if ((Get-SourceHead $BaselineSource) -ne $BaseSha -or (Get-SourceHead $PatchedSource) -ne $BaseSha) {
    throw "Both yaml-cpp checkouts must be exactly $BaseSha."
}

$actualPatchHash = (Get-FileHash -LiteralPath $PatchFile -Algorithm SHA256).Hash
if ($actualPatchHash -ne $ExpectedPatchSha256) {
    throw "Patch SHA-256 mismatch: expected $ExpectedPatchSha256, got $actualPatchHash."
}

Invoke-Native -File 'git' -Arguments @('-C', $PatchedSource, 'apply', '--check', $PatchFile)
Invoke-Native -File 'git' -Arguments @('-C', $PatchedSource, 'apply', $PatchFile)
$changed = @(& git -C $PatchedSource diff --name-only)
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the applied dependency patch.' }
if ($changed.Count -ne 1 -or $changed[0] -ne 'src/scantoken.cpp') {
    throw "Patch changed unexpected files: $($changed -join ', ')"
}
$numstat = @(& git -C $PatchedSource diff --numstat)
if ($LASTEXITCODE -ne 0 -or $numstat.Count -ne 1 -or $numstat[0] -notmatch '^1\s+1\s+src/scantoken\.cpp$') {
    throw "Patch is not the expected one-line replacement: $($numstat -join '; ')"
}

if (Test-Path -LiteralPath $BuildRoot) {
    throw "Build output already exists; refusing to overwrite: $BuildRoot"
}
New-Item -ItemType Directory -Path $BuildRoot | Out-Null

function Build-And-Test {
    param([string]$Variant, [string]$Source, [bool]$IsPatched)
    $buildDir = Join-Path $BuildRoot $Variant
    $patchOption = if ($IsPatched) { 'ON' } else { 'OFF' }

    Invoke-Native -File 'cmake' -Arguments @(
        '-S', $Harness,
        '-B', $buildDir,
        '-A', 'x64',
        "-DYAML_CPP_SOURCE_DIR=$Source",
        "-DQUALIFY_PATCHED=$patchOption",
        '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded'
    )

    $cache = Get-Content -LiteralPath (Join-Path $buildDir 'CMakeCache.txt')
    if (-not ($cache -match '^CMAKE_GENERATOR:INTERNAL=Visual Studio 17 2022$')) {
        throw "$Variant build did not use the Visual Studio 2022 generator."
    }
    if (-not ($cache -match '^CMAKE_GENERATOR_PLATFORM:INTERNAL=x64$')) {
        throw "$Variant build is not configured for x64."
    }
    if (-not ($cache -match '^CMAKE_MSVC_RUNTIME_LIBRARY:STRING=MultiThreaded$')) {
        throw "$Variant build is not configured for static /MT runtime."
    }
    if (-not ($cache -match '^YAML_BUILD_SHARED_LIBS:BOOL=OFF$')) {
        throw "$Variant yaml-cpp build is not static."
    }
    Write-Host "VARIANT=$Variant"
    Write-Host 'MSVC compiler: required by CMake configuration guard; version is printed during configure.'
    Write-Host 'Windows SDK: required and printed by the CMake configuration guard.'

    Invoke-Native -File 'cmake' -Arguments @('--build', $buildDir, '--config', 'Release', '--parallel', '2')
    Invoke-Native -File 'ctest' -Arguments @('--test-dir', $buildDir, '-C', 'Release', '--output-on-failure')
}

Write-Host "YAML_CPP_BASE_SHA=$BaseSha"
Write-Host "PATCH_SHA256=$actualPatchHash"
Write-Host "PATCH_DIFF=$($numstat[0])"
Build-And-Test -Variant 'baseline' -Source $BaselineSource -IsPatched $false
Build-And-Test -Variant 'patched' -Source $PatchedSource -IsPatched $true
Write-Host 'QUALIFICATION_RESULT=PASS'

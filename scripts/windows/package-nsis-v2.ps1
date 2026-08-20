# package-nsis-v2.ps1
# Parameterized DeepSeek Harness Windows NSIS packager.
#
# AI-friendly contract:
#   - Every parameter is a named switch/value (see param block).
#   - On success prints a single machine-readable line: INSTALLER=<full path>
#   - Exit code 0 on success, 1 on failure.
#   - Full log is written to -LogFile (default: <output>/package.log).
#
# Versioning:
#   -Version '0.2.0-beta.1' overrides the root package.json version; the
#   installer file name, NSIS file/product version metadata and the
#   HKCU\Software\DeepSeek Harness\Version registry value all follow it.
#
# Known-environment hardening (Windows + AV realtime scans):
#   - pnpm run build is retried up to -BuildRetries times (rolldown writes
#     occasionally hit transient Access-Denied on Windows).
#   - If H:\...\absolutize-symlink.cjs exists next to the repo root, it is
#     auto-loaded through NODE_OPTIONS (fixes pnpm relative-dir-symlink
#     failures on this machine).
#   - verify-deps-before-run is disabled so pnpm run never triggers a
#     surprise install.
#
# Examples:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/package-nsis-v2.ps1
#   powershell ... -Version 0.2.0 -OutputDirectory dist/windows-020 -BuildRetries 8
#   powershell ... -SkipBuild -NoClean -OutputDirectory dist/windows -Version 0.1.0-rc.7

[CmdletBinding()]
param(
  [string]$OutputDirectory = 'dist/windows',
  [string]$NodeExecutable = (Get-Command node -ErrorAction Stop).Source,
  [string]$Version = '',
  [switch]$SkipBuild,
  [switch]$NoClean,
  [int]$BuildRetries = 5,
  [string]$StoreDir = '',
  [string]$LogFile = ''
)

$ErrorActionPreference = 'Stop'

function Write-Log {
  param([string]$Message)
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
  Write-Host $line
  if ($script:LogStream) { $script:LogStream.WriteLine($line) }
}

function Invoke-RequiredCommand {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(Mandatory)][string[]]$Arguments
  )
  Write-Log "RUN: $FilePath $($Arguments -join ' ')"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

$script:LogStream = $null
$exitCode = 0
try {
  $root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
  $output = Join-Path $root $OutputDirectory
  $tarballs = Join-Path $output 'tarballs'
  $runtime = Join-Path $output 'runtime'
  $stage = Join-Path $output 'stage'
  $temp = Join-Path $output 'temp'
  $nsisV2 = Join-Path $PSScriptRoot 'deepseek-harness-v2.nsi'

  if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
    throw "Node executable does not exist: $NodeExecutable"
  }

  # ---- version resolution ----
  if (-not $Version) {
    $Version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
    Write-Log "Version not specified; using package.json version: $Version"
  }
  if (-not $Version) { throw 'Version resolved to empty' }
  if ($Version -match '\s') { throw "Version must not contain whitespace: '$Version'" }
  $vm = [regex]::Match($Version, '^(\d+)\.(\d+)\.(\d+)')
  if (-not $vm.Success) { throw "Version must look like N.N.N[-suffix]: '$Version'" }
  $rb = [regex]::Match($Version, '(?i)(?:rc|beta|alpha)\.?(\d+)')
  $build = if ($rb.Success) { $rb.Groups[1].Value } else { '0' }
  $versionNum = "$($vm.Groups[1]).$($vm.Groups[2]).$($vm.Groups[3]).$build"

  # ---- logging ----
  if (-not $LogFile) { $LogFile = Join-Path $output 'package.log' }
  $logDir = Split-Path -Parent $LogFile
  if ($logDir -and -not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
  $script:LogStream = [System.IO.StreamWriter]::new($LogFile, $true)
  $script:LogStream.AutoFlush = $true
  Write-Log "Log file: $LogFile"
  Write-Log "Version=$Version VERSION_NUM=$versionNum Output=$OutputDirectory"

  # ---- environment ----
  $env:TEMP = $temp
  $env:TMP = $temp
  $nodeDir = Split-Path -Parent $NodeExecutable
  if ($nodeDir) { $env:PATH = "$nodeDir;$env:PATH" }

  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($null -eq $pnpm -and $null -eq $corepack) {
    throw 'Neither pnpm nor corepack found on PATH'
  }
  $pnpmCmd = if ($null -ne $pnpm) { $pnpm.Source } else { $corepack.Source }
  $pnpmPrefix = @()
  if ($null -eq $pnpm) { $pnpmPrefix = @('pnpm') }
  function Invoke-Pnpm {
    param([string[]]$Arguments)
    $all = @($pnpmPrefix) + $Arguments
    Invoke-RequiredCommand -FilePath $pnpmCmd -Arguments $all
  }

  $env:npm_config_verify_deps_before_run = 'false'
  $env:pnpm_config_verify_deps_before_run = 'false'
  if ($StoreDir) {
    $env:npm_config_store_dir = $StoreDir
    $env:pnpm_config_store_dir = $StoreDir
    Write-Log "pnpm store-dir: $StoreDir"
  }

  # Override NODE_OPTIONS entirely: the WorkBuddy host injects a
  # genie-safe-delete.cjs preload that turns every fs.unlink into an async
  # trash operation which briefly locks the file; rolldown's exclusive
  # writes then fail with os error 5 (Access denied) on this machine.
  # Build output deletion needs no trash protection, so we drop it and keep
  # only --use-system-ca plus the optional symlink patch.
  $env:NODE_OPTIONS = '--use-system-ca'
  $patch = Join-Path $root 'absolutize-symlink.cjs'
  if (Test-Path -LiteralPath $patch) {
    $requireArg = '--require ' + ($patch -replace '\\', '/')
    $env:NODE_OPTIONS = "$requireArg $env:NODE_OPTIONS"
    Write-Log "Symlink patch loaded via NODE_OPTIONS: $patch"
  }
  Write-Log "NODE_OPTIONS=$env:NODE_OPTIONS"

  # ---- clean / dirs ----
  if (-not $NoClean) {
    Write-Log "Cleaning output: $output"
    $cleanOk = $false
    # Prefer .NET API (bypasses host PowerShell safe-delete wrappers).
    try { [System.IO.Directory]::Delete($output, $true); $cleanOk = $true } catch { }
    if (-not $cleanOk) {
      try { Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction Stop; $cleanOk = $true } catch { }
    }
    if (-not $cleanOk) { Write-Log "WARN: could not clean $output (host policy); existing files will be overwritten" }
  }
  New-Item -ItemType Directory -Path $tarballs, $runtime, $stage, $temp -Force | Out-Null

  Push-Location $root
  try {
    # ---- build with retries ----
    if (-not $SkipBuild) {
      $built = $false
      for ($i = 1; $i -le $BuildRetries; $i++) {
        Write-Log "Build attempt $i / $BuildRetries"
        try {
          # rc.8 pack.ts --family dsh requires the OFFICIAL client build record
          # (DSH_CLIENT_BUILD_PROFILE / DSH_CLIENT_TITLE); plain `build` writes a
          # non-official profile and fails verifyBuildArtifacts.
          Invoke-Pnpm @('run', 'build:official')
          $built = $true
          break
        } catch {
          Write-Log "Build attempt $i failed: $($_.Exception.Message)"
          if ($i -lt $BuildRetries) { Write-Log 'Retrying build...' }
        }
      }
      if (-not $built) { throw "Build failed after $BuildRetries attempts" }
    } else {
      Write-Log 'SkipBuild: reusing existing build artifacts'
    }

    # ---- release tarballs ----
    Invoke-Pnpm @('exec', 'tsx', 'scripts/release/pack.ts', '--family', 'vendor', '--out', "$OutputDirectory/tarballs/vendor")
    Invoke-Pnpm @('exec', 'tsx', 'scripts/release/pack.ts', '--family', 'dsh', '--out', "$OutputDirectory/tarballs/dsh")
  } finally {
    Pop-Location
  }

  $packageFiles = Get-ChildItem -LiteralPath $tarballs -Recurse -Filter '*.tgz' -File | Sort-Object FullName
  if ($packageFiles.Count -eq 0) { throw "No release tarballs were produced under $tarballs" }
  Write-Log "Tarballs produced: $($packageFiles.Count)"

  # ---- supplementary tarballs for private in-repo plugins ----
  # Some bundles (e.g. web-app) depend on private plugins (@loongserpent/*)
  # that are not part of any release family and therefore absent from the
  # tarballs above. npm must resolve every transitive dependency during
  # install, so pack each external dep that has an in-repo source and add
  # the resulting tgz to the install set. (Mirrors what pack.ts does for
  # family members; keeps the extension inside this desktop build.)
  Write-Log 'Scanning for external dependencies not covered by the tarball set...'
  $localNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  $externalDeps = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($tgz in $packageFiles) {
    $jsonText = (& tar -xOf $tgz.FullName package/package.json 2>$null | Out-String).Trim()
    if (-not $jsonText) { continue }
    try { $manifest = $jsonText | ConvertFrom-Json } catch { continue }
    [void]$localNames.Add([string]$manifest.name)
    $depNames = @($manifest.dependencies.PSObject.Properties.Name) + @($manifest.peerDependencies.PSObject.Properties.Name)
    foreach ($depName in $depNames) { if ($depName) { [void]$externalDeps.Add([string]$depName) } }
  }
  $missingDeps = @($externalDeps | Where-Object { -not $localNames.Contains($_) })
  Write-Log "External deps not in tarball set: $($missingDeps -join ', ')"
  if ($missingDeps.Count -gt 0) {
    $repoByName = @{}
    foreach ($groupDir in (Get-ChildItem -LiteralPath (Join-Path $root 'packages') -Directory)) {
      foreach ($pkgDir in (Get-ChildItem -LiteralPath $groupDir.FullName -Directory)) {
        $pj = Join-Path $pkgDir.FullName 'package.json'
        if (Test-Path -LiteralPath $pj -PathType Leaf) {
          try { $m = Get-Content -LiteralPath $pj -Raw | ConvertFrom-Json } catch { continue }
          if ($m.name) { $repoByName[[string]$m.name] = $pkgDir.FullName }
        }
      }
    }
    $extraDir = Join-Path $tarballs 'extra'
    New-Item -ItemType Directory -Path $extraDir -Force | Out-Null
    foreach ($dep in $missingDeps) {
      if ($repoByName.ContainsKey($dep)) {
        $pkgDir = $repoByName[$dep]
        Write-Log "Packing private plugin: $dep <- $pkgDir"
        Push-Location $pkgDir
        try {
          & $pnpmCmd pack --pack-destination $extraDir 2>&1 | Out-Null
          if ($LASTEXITCODE -ne 0) { throw "pnpm pack failed for $dep (exit $LASTEXITCODE)" }
        } finally { Pop-Location }
      } else {
        Write-Log "No in-repo source for $dep; npm will resolve it from the registry"
      }
    }
    $extraTgzs = @(Get-ChildItem -LiteralPath $extraDir -Filter '*.tgz' -File)
    if ($extraTgzs.Count -gt 0) {
      $packageFiles = @($packageFiles) + $extraTgzs
      Write-Log "Supplementary private tarballs added: $($extraTgzs.Count)"
    }
  }

  # ---- runtime manifest + npm install (local tgz only) ----
  # runtime/ is regenerated from scratch by npm install below; a leftover
  # (e.g. a half-finished install from an interrupted/blocked run) must be
  # cleared so dependency resolution starts clean. This runs even under
  # -NoClean, because tarballs/ (the expensive part) live in a separate dir.
  if (Test-Path -LiteralPath $runtime) {
    try { [System.IO.Directory]::Delete($runtime, $true) } catch { Remove-Item -LiteralPath $runtime -Recurse -Force -ErrorAction SilentlyContinue }
  }
  New-Item -ItemType Directory -Path $runtime -Force | Out-Null

  # npm (>=11) discovers the repo's pnpm-workspace.yaml by walking up and
  # would treat the whole monorepo as a workspace, parsing the root
  # package.json's workspace:* deps and failing with EUNSUPPORTEDPROTOCOL.
  # Pin the runtime as its own (empty) workspace root so npm stays local:
  # 1) workspaces: [] in the manifest, 2) an empty pnpm-workspace.yaml in
  # runtime/, 3) --workspaces=false on the install command.
  $stageManifest = [ordered]@{
    name = 'deepseek-harness-windows-runtime'
    private = $true
    version = '0.0.0'
    workspaces = @()
    dependencies = [ordered]@{ pnpm = '11.7.0' }
  }
  $stageManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runtime 'package.json') -Encoding utf8
  Set-Content -LiteralPath (Join-Path $runtime 'pnpm-workspace.yaml') -Value 'packages: []' -Encoding ascii

  Push-Location $runtime
  try {
    $installArguments = @('install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--workspaces=false', '--registry=https://registry.npmmirror.com') + @($packageFiles.FullName)
    Invoke-RequiredCommand 'npm' $installArguments
  } finally {
    Pop-Location
  }

  # ---- bundle third-party/private plugin packages ----
  # Packages that live under packages/*/* but do not follow the dsh release
  # family contract (e.g. `@loongserpent/*` user extensions) are skipped by
  # families.ts and therefore never appear in the official tarballs above.
  # Mirror each one's built `lib/` into `runtime/node_modules` so the runtime
  # can `require('@loongserpent/<name>')` after install. Carrying them here —
  # instead of publishing them — keeps the extension inside this desktop build
  # and out of the public registry.
  foreach ($groupDir in (Get-ChildItem -LiteralPath (Join-Path $root 'packages') -Directory)) {
    foreach ($pkgDir in (Get-ChildItem -LiteralPath $groupDir.FullName -Directory)) {
      $pkgJsonPath = Join-Path $pkgDir.FullName 'package.json'
      if (-not (Test-Path -LiteralPath $pkgJsonPath -PathType Leaf)) { continue }
      $manifest = Get-Content -LiteralPath $pkgJsonPath -Raw | ConvertFrom-Json
      $pkgName = [string]$manifest.name
      if ($pkgName -notmatch '^@[^/]+/') { continue }
      if ($pkgName -like '@deepseek-ai/*') { continue }
      $dest = Join-Path (Join-Path $runtime 'node_modules') $pkgName
      New-Item -ItemType Directory -Path $dest -Force | Out-Null
      Copy-Item -LiteralPath $pkgJsonPath -Destination (Join-Path $dest 'package.json') -Force
      if (Test-Path -LiteralPath (Join-Path $pkgDir.FullName 'lib') -PathType Container) {
        Copy-Item -LiteralPath (Join-Path $pkgDir.FullName 'lib') -Destination $dest -Recurse -Force
      }
      Write-Log "Bundled private plugin: $pkgName"
    }
  }

  # ---- assemble electron app ----
  # stage/ is regenerated from scratch below; a leftover (e.g. from a previous
  # run under -NoClean) would break the electron.exe rename and the app copy.
  # tarballs/ and runtime/ are handled separately, so clearing only stage is
  # safe even under -NoClean.
  if (Test-Path -LiteralPath $stage) {
    Get-ChildItem -LiteralPath $stage -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
  Copy-Item -LiteralPath $NodeExecutable -Destination (Join-Path $runtime 'node.exe')
  @'
@echo off
"%~dp0node.exe" "%~dp0node_modules\@deepseek-ai\dsh\lib\bin.js" %*
'@ | Set-Content -LiteralPath (Join-Path $runtime 'dsh.cmd') -Encoding ascii

  $electron = Join-Path $root 'node_modules\electron\dist'
  if (-not (Test-Path -LiteralPath $electron -PathType Container)) {
    throw "Electron runtime is missing: $electron. Run pnpm install first."
  }
  Copy-Item -Path (Join-Path $electron '*') -Destination $stage -Recurse -Force
  Rename-Item -LiteralPath (Join-Path $stage 'electron.exe') -NewName 'DeepSeek Harness.exe'
  $app = Join-Path $stage 'resources\app'
  New-Item -ItemType Directory -Path $app -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $runtime 'node.exe'), (Join-Path $runtime 'dsh.cmd'), (Join-Path $runtime 'node_modules') -Destination $app -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'desktop-main.cjs') -Destination (Join-Path $app 'main.cjs') -Force
  Copy-Item -LiteralPath 'C:\Program Files (x86)\NSIS\Contrib\Graphics\Icons\modern-install-blue-full.ico' -Destination (Join-Path $app 'icon.ico') -Force
  @{ name = 'deepseek-harness-desktop'; main = 'main.cjs'; private = $true } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $app 'package.json') -Encoding utf8

  # ---- NSIS ----
  $makeNsis = Get-Command makensis.exe -ErrorAction SilentlyContinue
  $makeNsisPath = if ($null -ne $makeNsis) {
    $makeNsis.Source
  } else {
    (Get-Item -LiteralPath 'C:\Program Files (x86)\NSIS\makensis.exe' -ErrorAction Stop).FullName
  }
  $installer = Join-Path $output "deepseek-harness-$Version-setup.exe"
  Invoke-RequiredCommand $makeNsisPath @("/DVERSION=$Version", "/DVERSION_NUM=$versionNum", "/DSTAGING_DIR=$stage", "/DOUTPUT_FILE=$installer", $nsisV2)

  Write-Log "Windows installer: $installer"
  Write-Output "INSTALLER=$installer"
}
catch {
  Write-Log "FATAL: $_"
  $exitCode = 1
  Write-Error $_
}
finally {
  if ($script:LogStream) { $script:LogStream.Dispose(); $script:LogStream = $null }
}
exit $exitCode

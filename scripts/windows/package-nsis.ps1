[CmdletBinding()]
param(
  [string]$OutputDirectory = 'dist/windows',
  [string]$NodeExecutable = (Get-Command node -ErrorAction Stop).Source
)

$ErrorActionPreference = 'Stop'

function Invoke-RequiredCommand {
  param(
    [Parameter(Mandatory)] [string]$FilePath,
    [Parameter(Mandatory)] [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($Arguments -join ' ')"
  }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$output = Join-Path $root $OutputDirectory
$tarballs = Join-Path $output 'tarballs'
$runtime = Join-Path $output 'runtime'
$stage = Join-Path $output 'stage'
$temp = Join-Path $output 'temp'
$nsis = Join-Path $PSScriptRoot 'deepseek-harness.nsi'
$pnpm = Get-Command pnpm -ErrorAction Stop
$makeNsis = Get-Command makensis.exe -ErrorAction SilentlyContinue
$makeNsisPath = if ($null -ne $makeNsis) {
  $makeNsis.Source
} else {
  (Get-Item -LiteralPath 'C:\Program Files (x86)\NSIS\makensis.exe' -ErrorAction Stop).FullName
}

if (-not (Test-Path -LiteralPath $NodeExecutable -PathType Leaf)) {
  throw "Node executable does not exist: $NodeExecutable"
}

Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tarballs, $runtime, $stage, $temp -Force | Out-Null

$env:TEMP = $temp
$env:TMP = $temp
$env:PATH = "$(Split-Path -Parent $pnpm.Source);$env:PATH"

Push-Location $root
try {
  Invoke-RequiredCommand 'pnpm' @('run', 'build')
  Invoke-RequiredCommand 'pnpm' @('exec', 'tsx', 'scripts/release/pack.ts', '--family', 'vendor', '--out', "$OutputDirectory/tarballs/vendor")
  Invoke-RequiredCommand 'pnpm' @('exec', 'tsx', 'scripts/release/pack.ts', '--family', 'dsh', '--out', "$OutputDirectory/tarballs/dsh")
} finally {
  Pop-Location
}

$packageFiles = Get-ChildItem -LiteralPath $tarballs -Recurse -Filter '*.tgz' -File | Sort-Object FullName
if ($packageFiles.Count -eq 0) {
  throw "No release tarballs were produced under $tarballs"
}

$stageManifest = [ordered]@{
  name = 'deepseek-harness-windows-runtime'
  private = $true
  version = '0.0.0'
  dependencies = [ordered]@{
    pnpm = '11.7.0'
  }
}
$stageManifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $runtime 'package.json') -Encoding utf8

Push-Location $runtime
try {
  $installArguments = @('install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false') + @($packageFiles.FullName)
  Invoke-RequiredCommand 'npm' $installArguments
} finally {
  Pop-Location
}

# Install third-party/private plugin packages that live under packages/*/* but
# do not follow the dsh release family contract (e.g. `@loongserpent/*` user
# extensions). `npm install` above only knows about the official tarballs, so
# mirror each private package's published `lib/` into `runtime/node_modules` so
# the runtime can `require('@loongserpent/<name>')` after install. Adding these
# here is preferable to a parallel npm publish: the extension lives only in this
# desktop build and never reaches the public registry.
$privatePluginRoots = @()
foreach ($groupDir in (Get-ChildItem -LiteralPath (Join-Path $root 'packages') -Directory)) {
  foreach ($pkgDir in (Get-ChildItem -LiteralPath $groupDir.FullName -Directory)) {
    $pkgJsonPath = Join-Path $pkgDir.FullName 'package.json'
    if (-not (Test-Path -LiteralPath $pkgJsonPath -PathType Leaf)) { continue }
    $manifest = Get-Content -LiteralPath $pkgJsonPath -Raw | ConvertFrom-Json
    $pkgName = [string]$manifest.name
    if ($pkgName -notmatch '^@[^/]+/') { continue }
    if ($pkgName -like '@deepseek-ai/*') { continue }
    $privatePluginRoots += [pscustomobject]@{ Name = $pkgName; Directory = $pkgDir.FullName }
  }
}
foreach ($plugin in $privatePluginRoots) {
  $dest = Join-Path (Join-Path $runtime 'node_modules') $plugin.Name
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $plugin.Directory 'package.json') -Destination (Join-Path $dest 'package.json') -Force
  if (Test-Path -LiteralPath (Join-Path $plugin.Directory 'lib') -PathType Container) {
    Copy-Item -LiteralPath (Join-Path $plugin.Directory 'lib') -Destination $dest -Recurse -Force
  }
  Write-Output "Bundled private plugin: $($plugin.Name)"
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

$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $output "deepseek-harness-$version-setup.exe"
Invoke-RequiredCommand $makeNsisPath @("/DSTAGING_DIR=$stage", "/DOUTPUT_FILE=$installer", $nsis)

Write-Output "Windows installer: $installer"

param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$toolsDir = Join-Path $repoRoot ".tools"
$nodeVersion = "v22.22.3"
$nodeFolderName = "node-$nodeVersion-win-x64"
$nodeDir = Join-Path $toolsDir $nodeFolderName
$nodeZip = Join-Path $toolsDir "$nodeFolderName.zip"
$npmCmd = Join-Path $nodeDir "npm.cmd"

if (-not (Test-Path $npmCmd)) {
  New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null

  if (-not (Test-Path $nodeZip)) {
    $nodeZipUrl = "https://nodejs.org/dist/$nodeVersion/$nodeFolderName.zip"
    Write-Host "Downloading $nodeZipUrl"
    Invoke-WebRequest -Uri $nodeZipUrl -OutFile $nodeZip
  }

  Write-Host "Extracting $nodeZip"
  Expand-Archive -LiteralPath $nodeZip -DestinationPath $toolsDir -Force
}

$env:Path = "$nodeDir;$env:Path"
$env:npm_config_cache = Join-Path $toolsDir "npm-cache"

Write-Host "Using Node:"
& (Join-Path $nodeDir "node.exe") -v
Write-Host "Using npm:"
& $npmCmd -v

if (-not $SkipInstall) {
  & $npmCmd ci --no-audit --no-fund
}

& $npmCmd run typecheck
& $npmCmd run build

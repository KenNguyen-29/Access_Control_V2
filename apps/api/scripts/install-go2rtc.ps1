# Download the go2rtc binary into ./bin (Windows x64)
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root "bin"
$zipPath = Join-Path $env:TEMP "go2rtc_win64.zip"
$assetName = "go2rtc_win64.zip"

New-Item -ItemType Directory -Force -Path $binDir | Out-Null

Write-Host "Fetching latest go2rtc release..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/AlexxIT/go2rtc/releases/latest"
$asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1

if (-not $asset) {
  throw "Asset '$assetName' not found in latest release."
}

Write-Host "Downloading $($asset.browser_download_url) ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath

Write-Host "Extracting to $binDir ..."
Expand-Archive -Path $zipPath -DestinationPath $binDir -Force
Remove-Item $zipPath -Force

$exe = Join-Path $binDir "go2rtc.exe"
if (-not (Test-Path $exe)) {
  throw "go2rtc.exe not found after extract."
}

Write-Host "Done: $exe"
Write-Host "Restart the API - go2rtc will auto-start (GO2RTC_AUTO_START=true)."

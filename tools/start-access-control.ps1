[CmdletBinding()]
param(
  [switch]$Visible
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot
. (Join-Path $PSScriptRoot 'resolve-pnpm.ps1')

function Import-EnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) { return }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $name = $Matches[1]
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name, 'Process')) -and
          -not [string]::IsNullOrWhiteSpace($value)) {
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
      }
    }
  }
}

# Keep machine-specific credentials out of the shortcut and repository.
$localConfig = Join-Path $PSScriptRoot 'start-access-control.local.ps1'
if (Test-Path -LiteralPath $localConfig) {
  . $localConfig
}
# Honour a deployment-specific .env without committing it. Explicit process
# variables/local overrides win over the file, and defaults are applied last.
Import-EnvFile -Path (Join-Path $repoRoot '.env')

function Set-ProcessDefault {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value
  )

  $current = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ([string]::IsNullOrWhiteSpace($current)) {
    [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
  }
}

function Test-TcpPort {
  param([Parameter(Mandatory = $true)][int]$Port)

  try {
    $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop
    return $null -ne $listeners
  } catch {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $connection = $client.ConnectAsync('127.0.0.1', $Port)
      if (-not $connection.Wait(350)) {
        $client.Close()
        return $false
      }
      $connected = $client.Connected
      $client.Close()
      return $connected
    } catch {
      return $false
    }
  }
}

Set-ProcessDefault 'DATABASE_URL' 'postgresql://acv2:acv2secret@localhost:5432/access_control_v2?schema=public'
Set-ProcessDefault 'API_PORT' '8010'
Set-ProcessDefault 'API_BIND_HOST' '0.0.0.0'
Set-ProcessDefault 'CORS_ORIGIN' ''
Set-ProcessDefault 'API_PROXY_TARGET' 'http://127.0.0.1:8010'
Set-ProcessDefault 'JWT_SECRET' 'access-control-v2-local-development-secret-please-change'
Set-ProcessDefault 'GO2RTC_BASE_URL' 'http://127.0.0.1:1984'
Set-ProcessDefault 'GO2RTC_ENABLED' 'true'
Set-ProcessDefault 'GO2RTC_AUTO_START' 'true'
Set-ProcessDefault 'REDIS_ENABLED' 'false'
Set-ProcessDefault 'AKUVOX_MOCK_MODE' 'true'
Set-ProcessDefault 'DNAKE_MOCK_MODE' 'true'
Set-ProcessDefault 'DNAKE_POLL_ENABLED' 'false'

# The simulator camera points at the real RTSP source saved in the database.
# Keep mock redirection opt-in so a missing local password cannot overwrite it.
Set-ProcessDefault 'MOCK_CAMERA_ENABLED' 'false'
Set-ProcessDefault 'MOCK_CAMERA_IP' '192.168.1.4'
Set-ProcessDefault 'MOCK_CAMERA_SOURCE' 'rtsp://192.168.1.4:554/rtsp/streaming?channel=1&subtype=0'

$windowStyle = 'Minimized'
if ($Visible) {
  $windowStyle = 'Normal'
}

$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$escapedRoot = $repoRoot.Replace("'", "''")
$pnpm = Resolve-PnpmCommand -RepoRoot $repoRoot
$pnpmCommand = Get-PnpmPowerShellCommand -Pnpm $pnpm
# Corepack otherwise tries to write a packageManager field into package.json.
if ([string]::IsNullOrWhiteSpace($env:COREPACK_ENABLE_PROJECT_SPEC)) {
  $env:COREPACK_ENABLE_PROJECT_SPEC = '0'
}
Write-Output "Using pnpm via $($pnpm.Source): $($pnpm.Path)"

function Start-DevWindow {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$Command
  )

  if (Test-TcpPort -Port $Port) {
    Write-Output "$Name is already running on port $Port."
    return
  }

  $childCommand = "Set-Location -LiteralPath '$escapedRoot'; $pnpmCommand $Command"
  Start-Process `
    -FilePath $powershell `
    -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $childCommand) `
    -WorkingDirectory $repoRoot `
    -WindowStyle $windowStyle | Out-Null

  Write-Output "$Name start requested on port $Port."
}

Start-DevWindow -Name 'API' -Port 8010 -Command '--filter @acv2/api dev'
Start-DevWindow -Name 'FE' -Port 3003 -Command '--filter @acv2/web dev'
Write-Output 'Access Control startup finished. Open http://localhost:3003.'

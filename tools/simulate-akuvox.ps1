[CmdletBinding()]
param(
  [ValidateSet('setup', 'send', 'interactive', 'ui')]
  [string]$Action = 'ui',
  [string]$ApiUrl = 'http://localhost:8010/api',
  [string]$DeviceIp = '192.168.1.4',
  [string]$AkuvoxCode = 'SIM-AKUVOX-14',
  [string]$CameraCode = 'SIM-CAM-14',
  [string]$EmployeeCode = 'SIM-NV-14',
  [string]$ProjectId,
  [string]$ZoneId,
  [string]$ZoneName = 'Khu vuc gia lap - 192.168.1.4',
  [string]$Username = $(if ($env:MOCK_CAMERA_USERNAME) { $env:MOCK_CAMERA_USERNAME } else { 'admin' }),
  [string]$Password = $(if ($env:MOCK_CAMERA_PASSWORD) { $env:MOCK_CAMERA_PASSWORD } else { 'admin123' }),
  [string]$RtspUrl,
  [ValidateSet('Success', 'Denied')]
  [string]$Status = 'Success',
  [string]$EventDate,
  [string]$EventTime,
  [int]$CameraPort = 19084,
  [switch]$StartCamera,
  [switch]$SetupFirst
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot 'apps\api'
$cameraScript = Join-Path $apiRoot 'scripts\mock-akuvox-camera.mjs'
$setupScript = Join-Path $apiRoot 'scripts\setup-akuvox-simulator.ts'
$startupError = $null
. (Join-Path $PSScriptRoot 'resolve-pnpm.ps1')

function Assert-LocalIp([string]$ip) {
  if ($ip -notmatch '^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$') {
    throw "DeviceIp khong hop le: $ip"
  }
}

function Start-MockCamera {
  if ($env:MOCK_CAMERA_SOURCE -match '^rtsps?://') {
    Write-Host 'Using passthrough RTSP source from MOCK_CAMERA_SOURCE; no local generator needed.'
    return
  }
  $existing = Get-NetTCPConnection -State Listen -LocalPort $CameraPort -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Mock camera da chay o cong $CameraPort (PID $($existing[0].OwningProcess))."
    return
  }
  $stdout = Join-Path $env:TEMP 'acv2-mock-camera.out.log'
  $stderr = Join-Path $env:TEMP 'acv2-mock-camera.err.log'
  $args = @($cameraScript, '--port', $CameraPort, '--virtual-ip', $DeviceIp)
  $proc = Start-Process -FilePath 'node' -ArgumentList $args -WorkingDirectory $apiRoot `
    -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
  Start-Sleep -Milliseconds 700
  if ($proc.HasExited) {
    $detail = if (Test-Path $stderr) { Get-Content $stderr -Raw } else { 'khong co log' }
    throw "Khong khoi dong duoc mock camera: $detail"
  }
  Write-Host "Da khoi dong mock camera PID $($proc.Id), cong $CameraPort."
}

function Invoke-SimulatorSetup {
  $setupArgs = @(
    '--ip', $DeviceIp,
    '--akuvox-code', $AkuvoxCode,
    '--camera-code', $CameraCode,
    '--zone-name', $ZoneName,
    '--username', $Username,
    '--password', $Password
  )
  if ($RtspUrl) { $setupArgs += @('--rtsp-url', $RtspUrl) }
  if ($ProjectId) { $setupArgs += @('--project-id', $ProjectId) }
  if ($ZoneId) { $setupArgs += @('--zone-id', $ZoneId) }
  if ($EmployeeCode) { $setupArgs += @('--employee-code', $EmployeeCode) }

  if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = 'postgresql://acv2:acv2secret@127.0.0.1:5432/access_control_v2?schema=public'
  }
  $pnpm = Resolve-PnpmCommand -RepoRoot $repoRoot
  if ($pnpm.PrefixArguments -contains 'pnpm' -and [string]::IsNullOrWhiteSpace($env:COREPACK_ENABLE_PROJECT_SPEC)) {
    $env:COREPACK_ENABLE_PROJECT_SPEC = '0'
  }
  Push-Location $apiRoot
  $setupOutput = @()
  $exitCode = 1
  try {
    # Capture child output so Prisma/tsx stack traces never leak into the UI
    # or the shortcut console. The original text is only used to classify the
    # failure into a short operator-facing message.
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      $setupOutput = @(& $pnpm.Path @($pnpm.PrefixArguments + @('exec', 'tsx', '--tsconfig', 'tsconfig.seed.json', $setupScript) + $setupArgs) 2>&1)
      $exitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorAction
    }
  } finally {
    Pop-Location
  }
  if ($exitCode -ne 0) {
    $detail = ($setupOutput | ForEach-Object { [string]$_ }) -join "`n"
    if ($detail -match '(?i)(P1001|Can.?t reach database server|database server at|ECONNREFUSED)') {
      throw 'Khong ket noi duoc PostgreSQL. Hay bat database va thu lai.'
    }
    throw 'Khong khoi tao duoc du lieu gia lap. Hay kiem tra API va database.'
  }
  if ($Action -ne 'ui') {
    $setupOutput | ForEach-Object { Write-Output $_ }
  }
}

function Send-SimulatorEvent([string]$code, [string]$eventStatus = $Status) {
  $eventNow = Get-Date
  $payload = @{
    Type = 'Face'
    Status = $eventStatus
    UserID = $code
    Name = 'Simulator'
    Date = if ($EventDate) { $EventDate } else { $eventNow.ToString('yyyy-MM-dd') }
    Time = if ($EventTime) { $EventTime } else { $eventNow.ToString('HH:mm:ss') }
  } | ConvertTo-Json
  try {
    # Use the public door_log receiver with the simulator panel code, exactly
    # like a panel HTTP push. Mock mode keeps this endpoint local-only for tests.
    $queryCode = [Uri]::EscapeDataString($AkuvoxCode)
    $result = Invoke-RestMethod -Method Post -Uri "$ApiUrl/akuvox/door_log?deviceCode=$queryCode" `
      -ContentType 'application/json' -Body $payload -TimeoutSec 20
    $result | ConvertTo-Json -Depth 8
  } catch {
    throw "Khong gui duoc su kien toi API $ApiUrl - kiem tra API dang chay va da setup simulator: $($_.Exception.Message)"
  }
}

Assert-LocalIp $DeviceIp

if ($Action -eq 'setup') {
  Invoke-SimulatorSetup
  exit 0
}

if ($SetupFirst -or $Action -eq 'ui') {
  try {
    Invoke-SimulatorSetup
  } catch {
    if ($Action -eq 'ui') {
      $startupError = $_.Exception.Message
      Write-Warning $startupError
    } else {
      throw
    }
  }
}
if ($StartCamera -or $Action -in @('interactive', 'ui')) {
  try {
    Start-MockCamera
  } catch {
    if ($Action -eq 'ui') {
      $message = "Khong khoi dong duoc camera gia lap. Kiem tra cong $CameraPort."
      $startupError = if ($startupError) { "$startupError`r`n$message" } else { $message }
      Write-Warning $message
    } else {
      throw
    }
  }
}

function Show-SimulatorUi {
  param([string]$InitialError)

  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  [System.Windows.Forms.Application]::EnableVisualStyles()
  [System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'Access Control - Akuvox Simulator'
  $form.StartPosition = 'CenterScreen'
  $form.Size = New-Object System.Drawing.Size(520, 300)
  $form.MinimumSize = New-Object System.Drawing.Size(520, 300)
  $form.MaximizeBox = $false
  $form.ShowInTaskbar = $true
  # A UI launched from a shortcut may otherwise open behind the browser.
  $form.TopMost = $true

  $title = New-Object System.Windows.Forms.Label
  $title.Text = 'Gia lap cham cong Akuvox'
  $title.Font = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
  $title.AutoSize = $true
  $title.Location = New-Object System.Drawing.Point(24, 20)
  $form.Controls.Add($title)

  $info = New-Object System.Windows.Forms.Label
  $info.Text = "Nhan su: $EmployeeCode`r`nThiet bi: $AkuvoxCode`r`nCamera ao: $DeviceIp"
  $info.AutoSize = $true
  $info.Location = New-Object System.Drawing.Point(26, 58)
  $form.Controls.Add($info)

  $sendButton = New-Object System.Windows.Forms.Button
  $sendButton.Text = 'Gui cham cong'
  $sendButton.Size = New-Object System.Drawing.Size(200, 48)
  $sendButton.Location = New-Object System.Drawing.Point(24, 130)
  $sendButton.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
  $form.Controls.Add($sendButton)

  $denyButton = New-Object System.Windows.Forms.Button
  $denyButton.Text = 'Gui tu choi'
  $denyButton.Size = New-Object System.Drawing.Size(200, 48)
  $denyButton.Location = New-Object System.Drawing.Point(244, 130)
  $form.Controls.Add($denyButton)

  $statusLabel = New-Object System.Windows.Forms.Label
  $statusLabel.Text = 'San sang. Bam nut de gui su kien.'
  $statusLabel.AutoSize = $false
  $statusLabel.Size = New-Object System.Drawing.Size(470, 50)
  $statusLabel.Location = New-Object System.Drawing.Point(24, 200)
  $statusLabel.AutoEllipsis = $true
  $form.Controls.Add($statusLabel)

  if ($InitialError) {
    $statusLabel.Text = $InitialError
    $statusLabel.ForeColor = [System.Drawing.Color]::DarkRed
  }

  $form.Add_Shown({
    $form.Activate()
    $form.TopMost = $false
  })

  $send = {
    param([string]$eventStatus)
    try {
      $output = Send-SimulatorEvent $EmployeeCode $eventStatus
      $statusLabel.Text = "Da gui $eventStatus luc $((Get-Date).ToString('HH:mm:ss')).`r`n$output"
      $statusLabel.ForeColor = [System.Drawing.Color]::DarkGreen
    } catch {
      $statusLabel.Text = $_.Exception.Message
      $statusLabel.ForeColor = [System.Drawing.Color]::DarkRed
    }
  }
  $sendButton.Add_Click({ & $send 'Success' })
  $denyButton.Add_Click({ & $send 'Denied' })
  [void]$form.ShowDialog()
}

if ($Action -eq 'ui') {
  Show-SimulatorUi -InitialError $startupError
  exit 0
}

if ($Action -eq 'send') {
  $code = if ($EmployeeCode) { $EmployeeCode } else { Read-Host 'Ma nhan su' }
  if (-not $code) { throw 'Can EmployeeCode de gui su kien.' }
  Send-SimulatorEvent $code
  exit 0
}

Write-Host ''
Write-Host "Simulator Akuvox/camera dang chay. Moi lan nhap ma nhan su se gui mot su kien $Status."
Write-Host "Panel: $AkuvoxCode | camera IP ao: $DeviceIp | API: $ApiUrl"
Write-Host 'Nhan Enter tai prompt ma nhan su de thoat.'
while ($true) {
  $code = Read-Host 'Ma nhan su'
  if (-not $code) { break }
  try {
    Send-SimulatorEvent $code.Trim()
  } catch {
    Write-Warning $_.Exception.Message
  }
}

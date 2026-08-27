[CmdletBinding()]
param(
  [string]$ShortcutName = 'Akuvox Simulator.lnk'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop $ShortcutName
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$scriptPath = Join-Path $repoRoot 'tools\simulate-akuvox.ps1'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`" -Action ui"
$shortcut.WindowStyle = 1
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = 'Open the Access Control Akuvox attendance simulator'
$shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
$shortcut.Save()

Write-Output "Created desktop shortcut: $shortcutPath"

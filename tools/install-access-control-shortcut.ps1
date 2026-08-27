[CmdletBinding()]
param(
  [string]$ShortcutName = 'Techwave Access Control.lnk'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop $ShortcutName
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$launcher = Join-Path $repoRoot 'tools\start-access-control.ps1'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershell
$shortcut.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$launcher`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = 'Start Techwave Access Control API and web interface'
$shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
$shortcut.Save()

Write-Output "Created desktop shortcut: $shortcutPath"

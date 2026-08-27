@echo off
setlocal
cd /d "%~dp0.."
start "" powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0simulate-akuvox.ps1" -Action ui %*
exit /b 0

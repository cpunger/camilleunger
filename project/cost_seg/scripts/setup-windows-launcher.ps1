$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  Write-Host "Skipping launcher setup: Windows only."
  exit 0
}

$root = Split-Path -Parent $PSScriptRoot
$appName = "PhotoSeg"
$launcherCmdPath = Join-Path $root "$appName-Launch.cmd"
$desktopShortcut = Join-Path $env:USERPROFILE "Desktop\$appName.lnk"

$cmdContent = @"
@echo off
setlocal
cd /d "%~dp0"
start "PhotoSeg Dev Server" cmd /k "cd /d ""%~dp0"" && npm run dev:all"
timeout /t 3 /nobreak >nul
start "" "http://localhost:3000"
endlocal
"@

Set-Content -Path $launcherCmdPath -Value $cmdContent -Encoding ASCII

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($desktopShortcut)
$shortcut.TargetPath = $launcherCmdPath
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
$shortcut.Description = "Launch PhotoSeg UI"
$shortcut.Save()

Write-Host "Created launcher: $launcherCmdPath"
Write-Host "Desktop shortcut: $desktopShortcut"
Write-Host "Double-click PhotoSeg on Desktop to start the server and open the UI."

@echo off
rem ============================================================
rem  DeepSeek Harness package GUI launcher
rem  Double-click this file to open the graphical packager.
rem  It just invokes package-nsis-gui.ps1 with Bypass execution
rem  policy, so you do not need to touch .ps1 associations.
rem ============================================================
setlocal
cd /d "%~dp0..\.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-nsis-gui.ps1" %*
if errorlevel 1 (
  echo.
  echo Packager exited with an error. Review the log above.
  pause
)
endlocal

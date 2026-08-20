Unicode true
RequestExecutionLevel user
SetCompressor /SOLID zlib

!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef STAGING_DIR
  !error "STAGING_DIR must name the prepared runtime directory"
!endif

!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE must name the installer executable"
!endif

Name "DeepSeek Harness 安装程序"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\DeepSeek Harness"
InstallDirRegKey HKCU "Software\DeepSeek Harness" "InstallDir"
BrandingText "DeepSeek Harness"
Icon "${NSISDIR}\Contrib\Graphics\Icons\modern-install-blue-full.ico"
UninstallIcon "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall-blue-full.ico"

!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Header\nsis3-metro.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\nsis3-metro.bmp"
!define MUI_WELCOMEPAGE_TITLE "欢迎使用 DeepSeek Harness"
!define MUI_WELCOMEPAGE_TEXT "此安装程序将把 DeepSeek Harness 桌面应用安装到你的用户目录。安装后的程序不依赖系统 Node 或浏览器。"
!define MUI_DIRECTORYPAGE_TEXT_TOP "选择 DeepSeek Harness 的安装位置。你的 profile、会话和凭据保留在 DSH 主目录，卸载程序不会删除它们。"
!define MUI_FINISHPAGE_TITLE "DeepSeek Harness 已安装"
!define MUI_FINISHPAGE_TEXT "现在可以从开始菜单打开 DeepSeek Harness 桌面应用，或在命令提示符中使用 dsh。"
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 DeepSeek Harness"
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchWeb

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Section "DeepSeek Harness（必需）"
  SectionIn RO
  ; Close an older desktop instance before replacing its executable. The
  ; service is a child process and is terminated with the desktop tree.
  ; Then WAIT until the whole tree has fully exited: taskkill /F returns as
  ; soon as termination is issued, while the processes may still hold their
  ; files open for a moment — installing over a locked executable would pop
  ; the in-use retry dialog. taskkill exits 128 when no matching process
  ; remains, which is our "gone" signal.
  StrCpy $1 0
  ${Do}
    nsExec::ExecToStack 'taskkill.exe /IM "DeepSeek Harness.exe" /T /F'
    Pop $0
    ${If} $0 == 128
      ${Break}
    ${EndIf}
    Sleep 400
    IntOp $1 $1 + 1
  ${LoopWhile} $1 < 25
  SetOutPath "$INSTDIR"
  File /r "${STAGING_DIR}\*"
  File /oname=dsh.ico "${NSISDIR}\Contrib\Graphics\Icons\modern-install-blue-full.ico"

  WriteRegStr HKCU "Software\DeepSeek Harness" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  CreateDirectory "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness"
  CreateShortcut "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\DeepSeek Harness.lnk" "$INSTDIR\DeepSeek Harness.exe" "" "$INSTDIR\dsh.ico"
  CreateShortcut "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\DeepSeek Harness Command Prompt.lnk" "$SYSDIR\cmd.exe" '/k ""$INSTDIR\resources\app\dsh.cmd""' "$INSTDIR\dsh.ico"
  CreateShortcut "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\Uninstall DeepSeek Harness.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "桌面快捷方式" SecDesktop
  CreateShortcut "$DESKTOP\DeepSeek Harness.lnk" "$INSTDIR\DeepSeek Harness.exe" "" "$INSTDIR\dsh.ico"
SectionEnd

Function LaunchWeb
  ExecShell "open" "$INSTDIR\DeepSeek Harness.exe"
FunctionEnd

Section "Uninstall"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\DeepSeek Harness.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\DeepSeek Harness Command Prompt.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\Uninstall DeepSeek Harness.lnk"
  RMDir "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness"
  Delete "$DESKTOP\DeepSeek Harness.lnk"

  DeleteRegKey HKCU "Software\DeepSeek Harness"
  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\dsh.ico"
  RMDir /r "$INSTDIR"
SectionEnd

Unicode true
RequestExecutionLevel user
SetCompressor /SOLID zlib

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

!ifndef STAGING_DIR
  !error "STAGING_DIR must name the prepared runtime directory"
!endif

!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE must name the installer executable"
!endif

!ifndef VERSION
  !error "VERSION must be defined (e.g. 0.1.0-rc.7)"
!endif

!ifndef VERSION_NUM
  !error "VERSION_NUM must be defined as a 4-part numeric version (e.g. 0.1.0.7)"
!endif

Name "DeepSeek Harness 安装程序"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\DeepSeek Harness"
InstallDirRegKey HKCU "Software\DeepSeek Harness" "InstallDir"
BrandingText "DeepSeek Harness"
Icon "${NSISDIR}\Contrib\Graphics\Icons\modern-install-blue-full.ico"
UninstallIcon "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall-blue-full.ico"

; --- version metadata (exe properties / registry) ---
VIProductVersion "${VERSION_NUM}"
VIAddVersionKey /LANG=2052 "ProductName" "DeepSeek Harness"
VIAddVersionKey /LANG=2052 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=2052 "FileDescription" "DeepSeek Harness 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${VERSION_NUM}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "DeepSeek AI"

!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Header\nsis3-metro.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\nsis3-metro.bmp"
!define MUI_WELCOMEPAGE_TITLE "欢迎使用 DeepSeek Harness"
!define MUI_WELCOMEPAGE_TEXT "此安装程序将把 DeepSeek Harness 桌面应用（版本 ${VERSION}）安装到你的用户目录。安装后的程序不依赖系统 Node 或浏览器。"
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
; User-data removal opt-in. We do not add a dedicated `Page custom` here
; because Page custom registers the create/leave functions against the
; *install* pages too, and NSIS forbids `un.`-prefixed functions there. The
; question is asked from inside Section "Uninstall" via Call instead, so the
; dialog is only shown during uninstallation.
Var unRemoveUserDataDialog
Var unRemoveUserData
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Function un.unUserDataAsk
  !insertmacro MUI_HEADER_TEXT "卸载选项" "选择是否也删除用户数据"

  nsDialogs::Create /NOUNLOAD 1018
  Pop $unRemoveUserDataDialog
  ${If} $unRemoveUserDataDialog == error
    StrCpy $unRemoveUserData ${BST_UNCHECKED}
    Return
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "默认会保留 profile、会话和凭据，下次安装后仍可用。若要彻底卸载，请勾选下方选项。"
  Pop $0

  ${NSD_CreateLabel} 0 28u 100% 12u "数据目录: $APPDATA\DeepSeek Harness\dsh"
  Pop $0

  ${NSD_CreateCheckbox} 0 46u 100% 12u "同时删除我的用户数据"
  Pop $unRemoveUserData
  ; Default state: unchecked = preserve user data (matches prior behaviour).

  nsDialogs::Show $unRemoveUserDataDialog
  ${NSD_GetState} $unRemoveUserData $0
  StrCpy $unRemoveUserData $0
FunctionEnd

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
  WriteRegStr HKCU "Software\DeepSeek Harness" "Version" "${VERSION}"
  ; Persist the user-data root alongside the install root so the uninstaller
  ; can locate DSH_HOME without reverse-engineering `app.getName()` against
  ; an Electron variant. desktop-main.cjs derives DSH_HOME as
  ; join(app.getPath('userData'), 'dsh') where app.getPath('userData') is
  ; %APPDATA%\<app-name>; on this build `app-name` is "DeepSeek Harness"
  ; (resolved from the renamed electron.exe), which matches this path.
  WriteRegStr HKCU "Software\DeepSeek Harness" "DataDir" "$APPDATA\DeepSeek Harness"
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
  ; Pop the opt-in dialog up front so the user's choice is captured before
  ; any destructive action runs. nsDialogs runs modally here, so by the time
  ; control returns the user already picked yes/no on wiping DSH_HOME.
  Call un.unUserDataAsk

  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\DeepSeek Harness.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\DeepSeek Harness Command Prompt.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness\Uninstall DeepSeek Harness.lnk"
  RMDir "$APPDATA\Microsoft\Windows\Start Menu\Programs\DeepSeek Harness"
  Delete "$DESKTOP\DeepSeek Harness.lnk"

  ; Read the user-data root BEFORE the registry key is deleted. Fall back to
  ; the inferred default path when the key is missing (older installs).
  ReadRegStr $0 HKCU "Software\DeepSeek Harness" "DataDir"
  ${If} $0 == ""
    StrCpy $0 "$APPDATA\DeepSeek Harness"
  ${EndIf}

  Delete "$INSTDIR\Uninstall.exe"
  Delete "$INSTDIR\dsh.ico"
  RMDir /r "$INSTDIR"

  ; Conditionally wipe user data (DSH_HOME = $DataDir\dsh) only when the
  ; user opted in on the uninstall page. Leave the parent directory alone
  ; so other Electron products named "DeepSeek Harness" can coexist.
  ${If} $unRemoveUserData == ${BST_CHECKED}
    RMDir /r "$0\dsh"
  ${EndIf}

  DeleteRegKey HKCU "Software\DeepSeek Harness"
SectionEnd

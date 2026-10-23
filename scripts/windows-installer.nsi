Unicode true
SetCompressor /SOLID lzma
XPStyle on
ManifestDPIAware true

!include "MUI2.nsh"

!ifndef ROOT
  !error "ROOT não definido"
!endif
!ifndef ICON
  !error "ICON não definido"
!endif
!ifndef OUT
  !error "OUT não definido"
!endif

!define APP_NAME "Cite"
!ifndef APP_VERSION
  !define APP_VERSION "0.2.0"
!endif
!define APP_VERSION4 "${APP_VERSION}.0"
!define APP_EXE "Cite.exe"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cite"

Name "${APP_NAME}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Cite"
InstallDirRegKey HKCU "Software\Cite" "InstallDir"
RequestExecutionLevel user
BrandingText "${APP_NAME}"
Icon "${ICON}"
UninstallIcon "${ICON}"

VIProductVersion "${APP_VERSION4}"
VIAddVersionKey /LANG=1046 "ProductName" "${APP_NAME}"
VIAddVersionKey /LANG=1046 "FileDescription" "Gerenciador de referências Cite"
VIAddVersionKey /LANG=1046 "CompanyName" "Cite"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Copyright © 2026 Cite"
VIAddVersionKey /LANG=1046 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${APP_VERSION}"

!define MUI_ABORTWARNING
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao assistente de instalação do Cite"
!define MUI_WELCOMEPAGE_TEXT "Este assistente instalará o Cite no seu computador.$\r$\n$\r$\nClique em Avançar para continuar."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Executar o Cite agora"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "Cite" SecCite
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "${ROOT}/*"

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Cite"
  CreateShortcut "$SMPROGRAMS\Cite\Cite.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$DESKTOP\Cite.lnk" "$INSTDIR\${APP_EXE}"

  WriteRegStr HKCU "Software\Cite" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "Cite"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP_EXE},0"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Cite.lnk"
  Delete "$SMPROGRAMS\Cite\Cite.lnk"
  RMDir "$SMPROGRAMS\Cite"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\Cite"
SectionEnd

!macro customInstall
  FileOpen $0 "$INSTDIR\.codexstyle-installed" w
  FileWrite $0 "com.codexstyle.desktop/v1$\r$\n"
  FileClose $0
!macroend

!macro customUnInstall
  ; Preserve the opt-in during upgrades. A real uninstall removes only an
  ; entry pointing at this installation, never a second portable copy.
  ${ifNot} ${isUpdated}
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CodexStyle"
    ${if} $0 == '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    ${orIf} $0 == "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "CodexStyle"
      DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "CodexStyle"
    ${endif}
  ${endif}
  Delete "$INSTDIR\.codexstyle-installed"
!macroend

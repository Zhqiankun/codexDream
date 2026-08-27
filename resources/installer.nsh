!macro customInstall
  FileOpen $0 "$INSTDIR\.codexstyle-installed" w
  FileWrite $0 "com.codexstyle.desktop/v1$\r$\n"
  FileClose $0
!macroend

!macro customUnInstall
  Delete "$INSTDIR\.codexstyle-installed"
!macroend

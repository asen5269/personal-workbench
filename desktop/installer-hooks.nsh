!define WB_WEBVIEW_INSTALLER "${__FILEDIR__}\..\artifacts\WebView2Offline-x64.exe"

!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${If} $0 == ""
    ReadRegStr $0 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $0 == ""
    InitPluginsDir
    File "/oname=$PLUGINSDIR\WebView2Offline.exe" "${WB_WEBVIEW_INSTALLER}"
    DetailPrint "正在安装内置 Microsoft WebView2 运行时…"
    ExecWait '"$PLUGINSDIR\WebView2Offline.exe" /silent /install' $0
    ${If} $0 == 3010
      SetRebootFlag true
    ${ElseIf} $0 != 0
      MessageBox MB_ICONSTOP "WebView2 安装失败（错误 $0），应用尚未安装。"
      Abort
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "正在解压内置运行环境…"
  ExecWait '"$INSTDIR\unpack\7z.exe" x "$INSTDIR\payload.7z" -o"$INSTDIR\payload" -y -bd -bso0' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "运行环境解压失败（错误 $0），请重新安装。"
    Abort
  ${EndIf}
  Delete "$INSTDIR\payload.7z"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  RMDir /r "$INSTDIR\payload"
!macroend

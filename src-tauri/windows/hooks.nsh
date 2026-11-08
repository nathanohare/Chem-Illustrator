; Uninstalling takes the app off the "Open with" lists it joined for the person (Edit > Settings >
; File Types, written by src-tauri/src/file_types.rs) and removes its object type for Word,
; PowerPoint and Excel (src-tauri/src/ole.rs). An update (/UPDATE) keeps them.
!macro CI_FORGET_TYPE EXT
  DeleteRegValue HKCU "Software\Classes\.${EXT}\OpenWithProgids" "ChemIllustrator.${EXT}"
  DeleteRegKey HKCU "Software\Classes\ChemIllustrator.${EXT}"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\RegisteredApplications" "Chem Illustrator"
    DeleteRegKey HKCU "Software\Chemweave"
    !insertmacro CI_FORGET_TYPE "cdxml"
    !insertmacro CI_FORGET_TYPE "cdx"
    !insertmacro CI_FORGET_TYPE "mol"
    !insertmacro CI_FORGET_TYPE "sdf"
    !insertmacro CI_FORGET_TYPE "docx"
    !insertmacro CI_FORGET_TYPE "pptx"
    !insertmacro CI_FORGET_TYPE "xlsx"
    DeleteRegKey HKCU "Software\Classes\CLSID\{171931C4-E8B6-4D52-A649-5D43133B5231}"
    DeleteRegKey HKCU "Software\Classes\ChemIllustrator.Drawing"
    DeleteRegKey HKCU "Software\Classes\ChemIllustrator.Drawing.1"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend

; An update is started by the app, which then closes itself. Windows can take a moment to finish
; closing it, and the installer's own check would find it still there, fail to stop it and give
; up ("Failed to kill Chemweave", issue #213). So an update first waits (up to 15 seconds)
; for the app to be gone.
!macro NSIS_HOOK_PREINSTALL
  ${If} $UpdateMode = 1
    StrCpy $R9 0
    ci_wait_for_app:
      !if "${INSTALLMODE}" == "currentUser"
        nsis_tauri_utils::FindProcessCurrentUser "${MAINBINARYNAME}.exe"
      !else
        nsis_tauri_utils::FindProcess "${MAINBINARYNAME}.exe"
      !endif
      Pop $R8
      ${If} $R8 = 0
      ${AndIf} $R9 < 60
        Sleep 250
        IntOp $R9 $R9 + 1
        Goto ci_wait_for_app
      ${EndIf}
  ${EndIf}
!macroend

; An update asked to restart the app (/R) should open the new version when it is done. The
; installer's own restart sometimes leaves it closed, so it is started here too; if both get
; through, the second just hands over to the first (one copy of the app runs at a time).
!macro NSIS_HOOK_POSTINSTALL
  Call CiRemoveOldName
  ${If} $UpdateMode = 1
    ClearErrors
    ${GetOptions} $CMDLINE "/R" $R8
    ${IfNot} ${Errors}
      Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
    ${EndIf}
  ${EndIf}
!macroend

; The app was called Chem Illustrator before it became Chemweave. The installer keeps its folder,
; Start menu entry and Apps list entry under the app's name, so a copy installed under the old name
; would stay beside the new one. The first Chemweave install removes it, the way an update does
; (/UPDATE): settings, file types and Word objects stay (settings are kept under the app's id, which
; did not change, and Chemweave points file types and objects at itself when it starts).
!define CI_OLD_NAME "Chem Illustrator"
!define CI_OLD_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${CI_OLD_NAME}"
Function CiRemoveOldName
  ReadRegStr $R6 SHCTX "${CI_OLD_UNINSTKEY}" "InstallLocation"
  ${If} $R6 == ""
    Return
  ${EndIf}
  ; InstallLocation is written in quotes
  StrCpy $R5 $R6 1
  ${If} $R5 == '"'
    StrCpy $R6 $R6 -1 1
  ${EndIf}
  ; never remove the folder Chemweave was just installed to
  ${If} $R6 == $INSTDIR
    DeleteRegKey SHCTX "${CI_OLD_UNINSTKEY}"
    Return
  ${EndIf}
  ${If} ${FileExists} "$R6\uninstall.exe"
    ExecWait '"$R6\uninstall.exe" /S /UPDATE _?=$R6'
    Delete "$R6\uninstall.exe"
    RMDir "$R6"
  ${EndIf}
  DeleteRegKey SHCTX "${CI_OLD_UNINSTKEY}"
  ; an update leaves shortcuts in place, so the old ones are removed here
  Delete "$SMPROGRAMS\${CI_OLD_NAME}.lnk"
  Delete "$DESKTOP\${CI_OLD_NAME}.lnk"
FunctionEnd

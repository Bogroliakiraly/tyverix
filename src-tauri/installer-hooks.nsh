; NSIS installer hooks for Tyverix.
;
; Why this file exists: Tauri's generated installer does offer to remove a
; previous installation, but only as a *page the user can decline*, and it only
; ever looks for an Uninstall entry named after the current ${PRODUCTNAME}.
; That leaves two holes:
;
;   1. Clicking through the wizard without selecting "uninstall" installs the
;      new version on top of the old one, and both stay registered.
;   2. The pre-rename brand (BoostForge, identifier com.boostforge.app) is
;      registered under a different name entirely, so Tauri never sees it. It
;      survived every Tyverix release and still shows up in Apps & Features,
;      in the Start menu, and — worst of all — in the autostart list.
;
; So before a single file is copied, remove every previous installation we know
; about, silently and deterministically.
;
; User data is deliberately preserved: Tauri's uninstaller only deletes app data
; when its "delete app data" checkbox is ticked, which a silent run never does.
; Licence keys, the undo history and the cleanup schedule survive the upgrade.

; Strips the quotes NSIS writes around registry paths, in place.
!macro TYVERIX_UNQUOTE VAR
  StrCpy $R6 ${VAR} 1
  ${If} $R6 == '"'
    StrCpy ${VAR} ${VAR} "" 1   ; drop the leading quote
    StrCpy ${VAR} ${VAR} -1     ; drop the trailing quote
  ${EndIf}
!macroend

; Runs the uninstaller registered under one Uninstall key and waits for it.
;
; `_?=<dir>` is what makes ExecWait actually wait: without it NSIS copies the
; uninstaller into %TEMP%, launches that copy and returns immediately, so the
; install would race the uninstall and win.
;
; EXTRAARGS carries `/UPDATE` when we are replacing *our own* previous version.
; Tauri's uninstaller deletes the autostart registration unless it is told this
; is an update, so without it every upgrade would silently turn off "start with
; Windows" for anyone who had switched it on. The legacy brand is removed
; without it, because there we do want its autostart entry gone.
!macro TYVERIX_REMOVE_PREVIOUS HIVE KEYNAME EXTRAARGS
  ClearErrors
  ReadRegStr $R7 ${HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}" "UninstallString"
  ReadRegStr $R8 ${HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}" "InstallLocation"
  !insertmacro TYVERIX_UNQUOTE $R7
  !insertmacro TYVERIX_UNQUOTE $R8

  ${If} $R7 != ""
    ${If} ${FileExists} "$R7"
      ${If} $R8 != ""
        ExecWait '"$R7" /S ${EXTRAARGS} _?=$R8' $R9
        ; An NSIS uninstaller launched with `_?=` runs from its real location
        ; and therefore cannot delete itself, so it always leaves uninstall.exe
        ; behind. It has exited by now, so clean it up here instead.
        Delete "$R8\uninstall.exe"
        ; Non-recursive on purpose: this removes the folder only once it is
        ; genuinely empty, and never touches user data that is still in it.
        RMDir "$R8"
      ${Else}
        ExecWait '"$R7" /S ${EXTRAARGS}' $R9
      ${EndIf}
    ${Else}
      ; The uninstaller is gone (folder deleted by hand, a failed uninstall, a
      ; restored disk image). Nothing can run, but the stale entry would keep
      ; the ghost listed in Apps & Features forever — so drop it.
      DeleteRegKey ${HIVE} "Software\Microsoft\Windows\CurrentVersion\Uninstall\${KEYNAME}"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; Current brand, both hives — covers a per-user install being replaced by a
  ; per-machine one and vice versa. /UPDATE keeps the user's autostart choice.
  !insertmacro TYVERIX_REMOVE_PREVIOUS HKCU "Tyverix" "/UPDATE"
  !insertmacro TYVERIX_REMOVE_PREVIOUS HKLM "Tyverix" "/UPDATE"

  ; Legacy brand. Its uninstaller removes its own shortcuts and autostart entry;
  ; the cleanup below only matters when that uninstaller was already missing.
  !insertmacro TYVERIX_REMOVE_PREVIOUS HKCU "BoostForge" ""
  !insertmacro TYVERIX_REMOVE_PREVIOUS HKLM "BoostForge" ""
  Delete "$SMPROGRAMS\BoostForge.lnk"
  Delete "$DESKTOP\BoostForge.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "BoostForge"

  ; Uninstalling may have removed the directory we are about to install into,
  ; so re-establish it before the file copy that follows this hook.
  SetOutPath $INSTDIR
!macroend

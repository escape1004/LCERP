!macro customInstall
  ; 바탕화면 바로가기 생성 여부 확인
  ${NSD_CreateCheckbox} 120u 130u 100% 10u "바탕화면에 바로가기 만들기"
  Pop $CheckboxDesktopShortcut
  ${NSD_Check} $CheckboxDesktopShortcut ; 기본값으로 체크
  
  ; 시작 메뉴 바로가기 생성 여부 확인
  ${NSD_CreateCheckbox} 120u 145u 100% 10u "시작 메뉴에 바로가기 만들기"
  Pop $CheckboxStartMenuShortcut
  ${NSD_Check} $CheckboxStartMenuShortcut ; 기본값으로 체크
!macroend

!macro customInstallMode
  StrCpy $IsDesktopShortcutChecked 1
  StrCpy $IsStartMenuShortcutChecked 1
  
  ${If} ${SectionIsSelected} ${SecDesktopShortcut}
    ; 바탕화면 바로가기 체크박스 상태 확인
    ${NSD_GetState} $CheckboxDesktopShortcut $IsDesktopShortcutChecked
  ${EndIf}
  
  ${If} ${SectionIsSelected} ${SecStartMenuShortcut}
    ; 시작 메뉴 바로가기 체크박스 상태 확인
    ${NSD_GetState} $CheckboxStartMenuShortcut $IsStartMenuShortcutChecked
  ${EndIf}
!macroend 
!macro customInstall
  ; 재설치 시 기존 데이터 보존
  DetailPrint "기존 데이터 보존 확인 중..."
  
  ; 앱 데이터 디렉토리 확인
  ${If} ${DirExists} "$APPDATA\Local ERP"
    DetailPrint "기존 앱 데이터 발견"
    
    ; 데이터베이스 백업
    ${If} ${FileExists} "$APPDATA\Local ERP\database.db"
      DetailPrint "기존 데이터베이스 백업 중..."
      CopyFiles "$APPDATA\Local ERP\database.db" "$APPDATA\Local ERP\database.db.backup"
      ${If} ${Errors}
        DetailPrint "데이터베이스 백업 실패"
      ${Else}
        DetailPrint "데이터베이스 백업 완료"
      ${EndIf}
    ${EndIf}
    
    ; save 폴더 백업 (파일 및 썸네일)
    ${If} ${DirExists} "$APPDATA\Local ERP\save"
      DetailPrint "기존 파일 및 썸네일 백업 중..."
      CreateDirectory "$APPDATA\Local ERP\save.backup"
      CopyFiles /SILENT "$APPDATA\Local ERP\save\*" "$APPDATA\Local ERP\save.backup\"
      ${If} ${Errors}
        DetailPrint "파일 백업 실패"
      ${Else}
        DetailPrint "파일 및 썸네일 백업 완료"
      ${EndIf}
    ${EndIf}
    
    ; 설정 파일 백업
    ${If} ${FileExists} "$APPDATA\Local ERP\settings.json"
      DetailPrint "설정 파일 백업 중..."
      CopyFiles "$APPDATA\Local ERP\settings.json" "$APPDATA\Local ERP\settings.json.backup"
      ${If} ${Errors}
        DetailPrint "설정 파일 백업 실패"
      ${Else}
        DetailPrint "설정 파일 백업 완료"
      ${EndIf}
    ${EndIf}
    
    ; 로그 파일 백업
    ${If} ${FileExists} "$APPDATA\Local ERP\app.log"
      DetailPrint "로그 파일 백업 중..."
      CopyFiles "$APPDATA\Local ERP\app.log" "$APPDATA\Local ERP\app.log.backup"
      ${If} ${Errors}
        DetailPrint "로그 파일 백업 실패"
      ${Else}
        DetailPrint "로그 파일 백업 완료"
      ${EndIf}
    ${EndIf}
  ${Else}
    DetailPrint "기존 앱 데이터가 없습니다. 새로 설치됩니다."
  ${EndIf}
!macroend

!macro customUnInstall
  ; 언인스톨 시 백업된 데이터 복원 (재설치 시)
  DetailPrint "백업된 데이터 복원 확인 중..."
  
  ; 데이터베이스 복원
  ${If} ${FileExists} "$APPDATA\Local ERP\database.db.backup"
    DetailPrint "데이터베이스 복원 중..."
    CopyFiles "$APPDATA\Local ERP\database.db.backup" "$APPDATA\Local ERP\database.db"
    ${If} ${Errors}
      DetailPrint "데이터베이스 복원 실패"
    ${Else}
      Delete "$APPDATA\Local ERP\database.db.backup"
      DetailPrint "데이터베이스 복원 완료"
    ${EndIf}
  ${EndIf}
  
  ; save 폴더 복원
  ${If} ${DirExists} "$APPDATA\Local ERP\save.backup"
    DetailPrint "파일 및 썸네일 복원 중..."
    CreateDirectory "$APPDATA\Local ERP\save"
    CopyFiles /SILENT "$APPDATA\Local ERP\save.backup\*" "$APPDATA\Local ERP\save\"
    ${If} ${Errors}
      DetailPrint "파일 복원 실패"
    ${Else}
      RMDir /r "$APPDATA\Local ERP\save.backup"
      DetailPrint "파일 및 썸네일 복원 완료"
    ${EndIf}
  ${EndIf}
  
  ; 설정 파일 복원
  ${If} ${FileExists} "$APPDATA\Local ERP\settings.json.backup"
    DetailPrint "설정 파일 복원 중..."
    CopyFiles "$APPDATA\Local ERP\settings.json.backup" "$APPDATA\Local ERP\settings.json"
    ${If} ${Errors}
      DetailPrint "설정 파일 복원 실패"
    ${Else}
      Delete "$APPDATA\Local ERP\settings.json.backup"
      DetailPrint "설정 파일 복원 완료"
    ${EndIf}
  ${EndIf}
  
  ; 로그 파일 복원
  ${If} ${FileExists} "$APPDATA\Local ERP\app.log.backup"
    DetailPrint "로그 파일 복원 중..."
    CopyFiles "$APPDATA\Local ERP\app.log.backup" "$APPDATA\Local ERP\app.log"
    ${If} ${Errors}
      DetailPrint "로그 파일 복원 실패"
    ${Else}
      Delete "$APPDATA\Local ERP\app.log.backup"
      DetailPrint "로그 파일 복원 완료"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstallMode
  ; 설치 모드 설정
  SetRegView 64
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "DisplayName" "Local ERP"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "DisplayIcon" "$INSTDIR\Local ERP.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "Publisher" "Escape"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "DisplayVersion" "1.0.5"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "NoRepair" 1
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Local ERP" "URLInfoAbout" "https://github.com/escape/local-erp"
!macroend 
!macro customInstall
  ; 재설치 시 기존 데이터 보존
  DetailPrint "기존 데이터 보존 확인 중..."
  
  ; 앱 데이터 디렉토리 확인 (Local 경로)
  IfFileExists "$LOCALAPPDATA\Local ERP\*" 0 no_data
    DetailPrint "기존 앱 데이터 발견"
    
    ; 데이터베이스 백업
    IfFileExists "$LOCALAPPDATA\Local ERP\erp.db" 0 no_db_backup
      DetailPrint "기존 데이터베이스 백업 중..."
      CopyFiles "$LOCALAPPDATA\Local ERP\erp.db" "$LOCALAPPDATA\Local ERP\erp.db.backup"
      IfErrors db_backup_fail db_backup_success
      db_backup_fail:
        DetailPrint "데이터베이스 백업 실패"
        Goto db_backup_end
      db_backup_success:
        DetailPrint "데이터베이스 백업 완료"
      db_backup_end:
    no_db_backup:
    
    ; 썸네일 폴더 백업
    IfFileExists "$LOCALAPPDATA\Local ERP\thumbnails\*" 0 no_thumbnails_backup
      DetailPrint "기존 썸네일 백업 중..."
      CreateDirectory "$LOCALAPPDATA\Local ERP\thumbnails.backup"
      CopyFiles /SILENT "$LOCALAPPDATA\Local ERP\thumbnails\*" "$LOCALAPPDATA\Local ERP\thumbnails.backup\"
      IfErrors thumbnails_backup_fail thumbnails_backup_success
      thumbnails_backup_fail:
        DetailPrint "썸네일 백업 실패"
        Goto thumbnails_backup_end
      thumbnails_backup_success:
        DetailPrint "썸네일 백업 완료"
      thumbnails_backup_end:
    no_thumbnails_backup:
    
    ; 설정 파일 백업
    IfFileExists "$LOCALAPPDATA\Local ERP\settings.json" 0 no_settings_backup
      DetailPrint "설정 파일 백업 중..."
      CopyFiles "$LOCALAPPDATA\Local ERP\settings.json" "$LOCALAPPDATA\Local ERP\settings.json.backup"
      IfErrors settings_backup_fail settings_backup_success
      settings_backup_fail:
        DetailPrint "설정 파일 백업 실패"
        Goto settings_backup_end
      settings_backup_success:
        DetailPrint "설정 파일 백업 완료"
      settings_backup_end:
    no_settings_backup:
    
    ; 로그 파일 백업
    IfFileExists "$LOCALAPPDATA\Local ERP\app.log" 0 no_log_backup
      DetailPrint "로그 파일 백업 중..."
      CopyFiles "$LOCALAPPDATA\Local ERP\app.log" "$LOCALAPPDATA\Local ERP\app.log.backup"
      IfErrors log_backup_fail log_backup_success
      log_backup_fail:
        DetailPrint "로그 파일 백업 실패"
        Goto log_backup_end
      log_backup_success:
        DetailPrint "로그 파일 백업 완료"
      log_backup_end:
    no_log_backup:

    Goto end_customInstall
  no_data:
    DetailPrint "기존 앱 데이터가 없습니다. 새로 설치됩니다."
  end_customInstall:
!macroend

!macro customUnInstall
  ; 언인스톨 시에는 백업된 데이터를 삭제하지 않음 (재설치를 위해 보존)
  DetailPrint "언인스톨 중 - 백업된 데이터는 보존됩니다."
!macroend 
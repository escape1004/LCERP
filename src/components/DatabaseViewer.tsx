import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Save, Settings2, Link2, X, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from './ui/use-toast';
import { useERPStore } from '../hooks/useERPStore';
import { Input } from './ui/input';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormControl,
} from './ui/form';
import { useForm } from 'react-hook-form';
import { ThumbnailSyncCheckResult, ThumbnailSyncCleanupOptions, ThumbnailSyncCleanupResult } from '../types';

interface TableInfo {
  name: string;
}

interface Config {
  dbPath: string;
  backupDir: string;
  backupInterval: number;
}

interface FormValues {
  dbPath: string;
  backupDir: string;
  backupInterval: string;
}

export const DatabaseViewer: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<any | null>(null);
  const [dbPath, setDbPath] = useState<string>('');
  const [config, setConfig] = useState<Config | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fileSize, setFileSize] = useState<string>('');
  const [syncCheckResult, setSyncCheckResult] = useState<ThumbnailSyncCheckResult | null>(null);
  const [isCheckingSync, setIsCheckingSync] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [cleanupOptions, setCleanupOptions] = useState<ThumbnailSyncCleanupOptions>({
    removeDbOnly: true,
    addFileOnly: true,
    dryRun: false
  });
  const { toast } = useToast();
  const { selectCategory } = useERPStore();

  const form = useForm<FormValues>({
    defaultValues: {
      dbPath: '',
      backupDir: '',
      backupInterval: '60',
    }
  });

  const showSuccessToast = (message: string) => {
    toast({
      title: message,
      className: 'bg-[#2a3a2a] border border-[#40ff40] text-white',
    });
  };

  const showErrorToast = (message: string) => {
    toast({
      title: message,
      variant: 'destructive',
      className: 'bg-[#3a2a2a] border border-[#ff4040] text-white',
    });
  };

  const handleApiError = (error: unknown, fallbackMessage: string) => {
    const message = error instanceof Error ? error.message : fallbackMessage;
    showErrorToast(message);
  };

  const loadTables = async () => {
    try {
      const tables = await window.electronAPI.getTables();
      setTables(tables);
      if (tables.length > 0 && !selectedTable) {
        loadTableData(tables[0].name);
      }
    } catch (error) {
      handleApiError(error, '테이블 목록을 불러오는데 실패했습니다.');
    }
  };

  const loadTableData = async (tableName: string) => {
    try {
      const data = await window.electronAPI.getTableData(tableName);
      setTableData(data);
      setSelectedTable(tableName);
    } catch (error) {
      handleApiError(error, '테이블 데이터를 불러오는데 실패했습니다.');
    }
  };

  const handleOpenFile = async () => {
    try {
      await window.electronAPI.openDbFile();
    } catch (error) {
      handleApiError(error, 'DB 파일을 여는데 실패했습니다.');
    }
  };

  const handleBackup = async () => {
    try {
      const result = await window.electronAPI.backupDatabase();
      if (result.success) {
        showSuccessToast('데이터베이스 백업이 완료되었습니다.');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      handleApiError(error, '데이터베이스 백업에 실패했습니다.');
    }
  };

  const handleOpenBackup = async () => {
    try {
      const result = await window.electronAPI.openBackupLocation();
      if (!result.success) {
        throw new Error('백업 폴더를 열 수 없습니다.');
      }
    } catch (error) {
      handleApiError(error, '백업 폴더를 여는데 실패했습니다.');
    }
  };

  const loadConfig = async () => {
    try {
      const config = await window.electronAPI.getConfig();
      setConfig(config);
      setDbPath(config.dbPath);
      form.reset({
        dbPath: config.dbPath,
        backupDir: config.backupDir,
        backupInterval: String(Math.max(1, config.backupInterval)),
      });
      
      // 파일 용량 가져오기
      await loadFileSize(config.dbPath);
    } catch (error) {
      handleApiError(error, '설정을 불러오는데 실패했습니다.');
    }
  };

  const loadFileSize = async (filePath: string) => {
    try {
      const result = await window.electronAPI.getFileSize(filePath);
      if (result.success) {
        setFileSize(result.size);
      } else {
        setFileSize('');
      }
    } catch (error) {
      // 파일 용량 가져오기 실패는 무시
      setFileSize('');
    }
  };

  const handleSetDbPath = async () => {
    try {
      const result = await window.electronAPI.setDbPath();
      if (result.success && result.path) {
        await loadConfig();
        showSuccessToast('DB 저장 위치가 변경되었습니다.');
        await loadTables();
      }
    } catch (error) {
      handleApiError(error, 'DB 저장 위치 변경에 실패했습니다.');
    }
  };

  const handleSetBackupDir = async () => {
    try {
      const result = await window.electronAPI.setBackupDir();
      if (result.success && result.path) {
        await loadConfig();
        showSuccessToast('백업 저장 위치가 변경되었습니다.');
      }
    } catch (error) {
      handleApiError(error, '백업 저장 위치 변경에 실패했습니다.');
    }
  };

  const handleSetBackupInterval = async () => {
    try {
      const minutes = parseInt(form.getValues("backupInterval"));
      if (isNaN(minutes) || minutes < 1) {
        showErrorToast('유효한 시간 간격을 입력해주세요.');
        return;
      }

      const result = await window.electronAPI.setBackupInterval(minutes);
      if (result.success) {
        showSuccessToast('백업 주기가 변경되었습니다.');
        setIsSettingsOpen(false);
      }
    } catch (error) {
      handleApiError(error, '백업 주기 변경에 실패했습니다.');
    }
  };

  // 썸네일 동기화 점검
  const handleCheckThumbnailSync = async () => {
    try {
      setIsCheckingSync(true);
      const result = await window.electronAPI.checkThumbnailSync();
      setSyncCheckResult(result);
      showSuccessToast('썸네일 동기화 점검이 완료되었습니다.');
    } catch (error) {
      handleApiError(error, '썸네일 동기화 점검에 실패했습니다.');
    } finally {
      setIsCheckingSync(false);
    }
  };

  // 썸네일 동기화 정리
  const handleCleanupThumbnailSync = async () => {
    try {
      setIsCleaningUp(true);
      const result = await window.electronAPI.cleanupThumbnailSync(cleanupOptions);
      
      if (result.errors.length > 0) {
        showErrorToast(`${result.errors.length}개의 오류가 발생했습니다.`);
      } else {
        showSuccessToast(`정리가 완료되었습니다. (DB에서 제거: ${result.removedFromDb}, DB에 추가: ${result.addedToDb})`);
      }
      
      // 점검 결과 새로고침
      await handleCheckThumbnailSync();
    } catch (error) {
      handleApiError(error, '썸네일 동기화 정리에 실패했습니다.');
    } finally {
      setIsCleaningUp(false);
    }
  };

  useEffect(() => {
    const initializeViewer = async () => {
      try {
        await loadConfig();
        await loadTables();
      } catch (error) {
        handleApiError(error, '초기화에 실패했습니다.');
      }
    };

    initializeViewer();
    selectCategory(null);
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-discord-bg">
      {/* Header */}
      <div className="shrink-0 p-6 space-y-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-end">
            <h1 className="text-xl font-bold text-discord-text">데이터베이스</h1>
            {fileSize && (
              <span className="ml-2 text-sm text-discord-muted flex items-center">
                ({fileSize})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={handleCheckThumbnailSync}
              disabled={isCheckingSync}
              className="border-gray-600 hover:bg-discord-hover"
            >
              <RefreshCw size={16} className={`mr-2 ${isCheckingSync ? 'animate-spin' : ''}`} />
              썸네일 동기화 점검
            </Button>
            <Button 
              variant="outline" 
              onClick={handleBackup}
              className="border-gray-600 hover:bg-discord-hover"
            >
              <Save size={16} className="mr-2" />
              백업하기
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsSettingsOpen(true)}
              className="border-gray-600 hover:bg-discord-hover"
            >
              <Settings2 size={16} className="mr-2" />
              설정
            </Button>
          </div>
        </div>

        {/* 썸네일 동기화 상태 표시 */}
        {syncCheckResult && (
          <div className="bg-discord-sidebar rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-discord-text">썸네일 동기화 상태</h3>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCleanupThumbnailSync}
                  disabled={isCleaningUp}
                  className="border-gray-600 hover:bg-discord-hover text-xs"
                >
                  <AlertTriangle size={14} className="mr-1" />
                  {isCleaningUp ? '정리 중...' : '동기화 정리'}
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-discord-muted">총 레코드:</span>
                <span className="text-discord-text font-medium">{syncCheckResult.totalRecords}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-green-400" />
                <span className="text-discord-muted">정상:</span>
                <span className="text-discord-text font-medium">{syncCheckResult.bothExist}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-yellow-400" />
                <span className="text-discord-muted">DB에만:</span>
                <span className="text-discord-text font-medium">{syncCheckResult.dbOnly.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-blue-400" />
                <span className="text-discord-muted">파일에만:</span>
                <span className="text-discord-text font-medium">{syncCheckResult.fileOnly.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <X size={14} className="text-red-400" />
                <span className="text-discord-muted">둘 다 없음:</span>
                <span className="text-discord-text font-medium">{syncCheckResult.neitherExist}</span>
              </div>
            </div>

            {/* 정리 옵션 */}
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-2 text-discord-muted">
                  <input
                    type="checkbox"
                    checked={cleanupOptions.removeDbOnly}
                    onChange={(e) => setCleanupOptions(prev => ({ ...prev, removeDbOnly: e.target.checked }))}
                    className="rounded border-gray-600 bg-discord-bg"
                  />
                  DB에만 있는 썸네일 경로 제거
                </label>
                <label className="flex items-center gap-2 text-discord-muted">
                  <input
                    type="checkbox"
                    checked={cleanupOptions.addFileOnly}
                    onChange={(e) => setCleanupOptions(prev => ({ ...prev, addFileOnly: e.target.checked }))}
                    className="rounded border-gray-600 bg-discord-bg"
                  />
                  파일에만 있는 썸네일 경로 추가
                </label>
                <label className="flex items-center gap-2 text-discord-muted">
                  <input
                    type="checkbox"
                    checked={cleanupOptions.dryRun}
                    onChange={(e) => setCleanupOptions(prev => ({ ...prev, dryRun: e.target.checked }))}
                    className="rounded border-gray-600 bg-discord-bg"
                  />
                  시뮬레이션만 실행
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex items-center gap-2">
            <span>데이터베이스 위치:</span>
            <span className="text-discord-text font-medium flex items-center gap-2">
              {dbPath}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenFile}
                className="h-6 px-2 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Link2 size={14} />
              </Button>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>백업 저장 위치:</span>
            <span className="text-discord-text font-medium flex items-center gap-2">
              {config?.backupDir}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenBackup}
                className="h-6 px-2 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Link2 size={14} />
              </Button>
            </span>
          </div>
        </div>

        {/* Table List */}
        <div className="flex flex-wrap gap-2">
          {tables.map((table) => (
            <Button
              key={table.name}
              variant={selectedTable === table.name ? "secondary" : "outline"}
              onClick={() => loadTableData(table.name)}
              className={`text-sm border-gray-600 ${
                selectedTable === table.name 
                  ? "bg-discord-accent hover:bg-blue-600 text-white border-transparent" 
                  : "hover:bg-discord-hover text-discord-text"
              }`}
            >
              {table.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-hidden">
        {tableData && (
          <div className="relative w-full h-full">
            <div className="absolute inset-0 overflow-x-scroll overflow-y-auto scrollbar-thin scrollbar-thumb-[#4a4b50] hover:scrollbar-thumb-[#6a6b70] scrollbar-track-[#2b2d31]">
              <table className="min-w-[1500px] border-separate border-spacing-0">
                <thead>
                  <tr>
                    {tableData.columns.filter(f => !f.hidden).map((column) => (
                      <th 
                        key={column.name} 
                        className="bg-discord-sidebar text-xs font-medium text-discord-text p-2 text-left sticky top-0 border-b border-gray-700 first:pl-2"
                      >
                        {column.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row, i) => (
                    <tr 
                      key={`row-${i}-${JSON.stringify(row).slice(0, 50)}`}
                      className="hover:bg-discord-hover transition-colors"
                    >
                      {tableData.columns.filter(f => !f.hidden).map((column, colIndex) => (
                        <td 
                          key={`${i}-${column.name}`}
                          className={`p-2 text-xs text-discord-text border-b border-gray-700 ${
                            colIndex === 0 ? 'pl-2' : ''
                          }`}
                        >
                          {(() => {
                            const value = row[column.name];
                            if (value === null || value === undefined) {
                              return <span className="text-gray-500">-</span>;
                            }
                            if (typeof value === 'object') {
                              return <span className="text-gray-400">{JSON.stringify(value)}</span>;
                            }
                            return String(value);
                          })()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Settings Dialog */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-discord-bg rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-xl font-bold text-discord-text">
                데이터베이스 설정
              </h2>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="text-discord-muted hover:text-discord-text"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)] discord-scrollbar">
              <Form {...form}>
                <div className="space-y-6">
                  <FormField
                    control={form.control}
                    name="dbPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-discord-text font-medium">
                          DB 저장 위치
                        </FormLabel>
                        <div className="flex gap-2 mt-2">
                          <FormControl>
                            <Input
                              {...field}
                              readOnly
                              className="flex-1 bg-discord-sidebar border-gray-600 text-discord-text"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSetDbPath}
                            className="border-gray-600 hover:bg-discord-hover text-discord-text"
                          >
                            변경
                          </Button>
                        </div>
                        <FormDescription className="text-sm text-discord-muted mt-1">
                          데이터베이스 파일이 저장될 경로를 지정합니다.
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="backupDir"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-discord-text font-medium">
                          백업 저장 위치
                        </FormLabel>
                        <div className="flex gap-2 mt-2">
                          <FormControl>
                            <Input
                              {...field}
                              readOnly
                              className="flex-1 bg-discord-sidebar border-gray-600 text-discord-text"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSetBackupDir}
                            className="border-gray-600 hover:bg-discord-hover text-discord-text"
                          >
                            변경
                          </Button>
                        </div>
                        <FormDescription className="text-sm text-discord-muted mt-1">
                          데이터베이스 백업 파일이 저장될 경로를 지정합니다.
                        </FormDescription>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="backupInterval"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-discord-text font-medium">
                          백업 주기
                        </FormLabel>
                        <div className="flex gap-2 mt-2">
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              min="1"
                              placeholder="예: 60 (1시간)"
                              className="flex-1 bg-discord-sidebar border-gray-600 text-discord-text"
                            />
                          </FormControl>
                        </div>
                        <FormDescription className="text-sm text-discord-muted mt-1">
                          자동 백업이 실행될 시간 간격을 분 단위로 설정합니다.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </div>
              </Form>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsSettingsOpen(false)}
                className="text-discord-text hover:bg-discord-hover"
              >
                취소
              </Button>
              <Button
                type="button"
                onClick={handleSetBackupInterval}
                className="bg-discord-accent hover:bg-discord-accent/80 text-white"
              >
                저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 
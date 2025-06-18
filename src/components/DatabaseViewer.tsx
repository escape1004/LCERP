import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Save, Settings2, Link2, X } from 'lucide-react';
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
import { TableInfo, TableData, Config, ApiResponse } from '../types/electron';

interface FormValues {
  dbPath: string;
  backupDir: string;
  backupInterval: string;
}

export const DatabaseViewer: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [dbPath, setDbPath] = useState<string>('');
  const [config, setConfig] = useState<Config | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
      if (!result.success && result.error) {
        throw new Error(result.error);
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
    } catch (error) {
      handleApiError(error, '설정을 불러오는데 실패했습니다.');
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
          <h1 className="text-2xl font-bold">데이터베이스 뷰어</h1>
          <div className="flex items-center gap-2">
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
                        key={column} 
                        className="bg-discord-sidebar text-xs font-medium text-discord-text p-2 text-left sticky top-0 border-b border-gray-700 first:pl-2"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row, i) => (
                    <tr 
                      key={i}
                      className="hover:bg-discord-hover transition-colors"
                    >
                      {tableData.columns.filter(f => !f.hidden).map((column, colIndex) => (
                        <td 
                          key={column} 
                          className={`p-2 text-xs text-discord-text border-b border-gray-700 ${
                            colIndex === 0 ? 'pl-2' : ''
                          }`}
                        >
                          {typeof row[column] === 'object'
                            ? JSON.stringify(row[column])
                            : String(row[column])}
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
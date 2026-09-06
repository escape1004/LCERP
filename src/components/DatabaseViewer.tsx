import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Save, Settings2, Link2, X } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { useERPStore } from '../hooks/useERPStore';
import { AnimatedModal } from './ui/animated-modal';
import { Button } from './ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from './ui/form';
import { Input } from './ui/input';
import { useToast } from './ui/use-toast';

interface TableInfo {
  name: string;
}

interface TableColumn {
  name: string;
  hidden: boolean;
}

interface TableData {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
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
  const DEFAULT_COLUMN_WIDTH = 150;
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPageInputMode, setIsPageInputMode] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [dbPath, setDbPath] = useState('');
  const [config, setConfig] = useState<Config | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetInput, setResetInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [fileSize, setFileSize] = useState('');
  const { toast } = useToast();
  const { selectCategory } = useERPStore();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRequestIdRef = useRef(0);

  const form = useForm<FormValues>({
    defaultValues: {
      dbPath: '',
      backupDir: '',
      backupInterval: '60',
    },
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

  const loadTableData = async (tableName: string, page = 1, nextPageSize = pageSize) => {
    const requestId = ++tableRequestIdRef.current;
    setIsTableLoading(true);
    try {
      const data = await window.electronAPI.getTableData(tableName, {
        page,
        pageSize: nextPageSize,
      });

      if (requestId !== tableRequestIdRef.current) return;
      setTableData(data);
      setSelectedTable(tableName);
      setCurrentPage(data.page);
      setPageSize(data.pageSize);
      tableScrollRef.current?.scrollTo({ top: 0, left: 0 });
    } catch (error) {
      if (requestId !== tableRequestIdRef.current) return;
      handleApiError(error, '테이블 데이터를 불러오지 못했습니다.');
    } finally {
      if (requestId === tableRequestIdRef.current) {
        setIsTableLoading(false);
      }
    }
  };

  const handleSelectTable = (tableName: string) => {
    setCurrentPage(1);
    void loadTableData(tableName, 1, pageSize);
  };

  const handlePageChange = (page: number) => {
    if (!selectedTable || isTableLoading) return;
    const targetPage = Math.min(Math.max(1, page), totalPages);
    void loadTableData(selectedTable, targetPage, pageSize);
  };

  const handlePageInputCommit = () => {
    const page = Number.parseInt(pageInput, 10);
    if (Number.isInteger(page) && page >= 1 && page <= totalPages) {
      handlePageChange(page);
    }
    setIsPageInputMode(false);
    setPageInput('');
  };

  const handlePageNumberClick = () => {
    if (isTableLoading) return;
    setIsPageInputMode(true);
    setPageInput(String(currentPage));
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    if (!selectedTable || isTableLoading) return;
    setPageSize(nextPageSize);
    setCurrentPage(1);
    void loadTableData(selectedTable, 1, nextPageSize);
  };

  const loadTables = async () => {
    try {
      const nextTables = await window.electronAPI.getTables();
      setTables(nextTables);

      if (nextTables.length > 0 && !selectedTable) {
        await loadTableData(nextTables[0].name);
      }
    } catch (error) {
      handleApiError(error, '테이블 목록을 불러오지 못했습니다.');
    }
  };

  const loadFileSize = async (filePath: string) => {
    try {
      const result = await window.electronAPI.getFileSize(filePath);
      setFileSize(result.success ? result.size : '');
    } catch {
      setFileSize('');
    }
  };

  const loadConfig = async () => {
    try {
      const nextConfig = await window.electronAPI.getConfig();
      setConfig(nextConfig);
      setDbPath(nextConfig.dbPath);
      form.reset({
        dbPath: nextConfig.dbPath,
        backupDir: nextConfig.backupDir,
        backupInterval: String(Math.max(1, nextConfig.backupInterval)),
      });
      await loadFileSize(nextConfig.dbPath);
    } catch (error) {
      handleApiError(error, '설정을 불러오지 못했습니다.');
    }
  };

  const handleOpenFile = async () => {
    try {
      await window.electronAPI.openDbFile();
    } catch (error) {
      handleApiError(error, 'DB 파일을 열지 못했습니다.');
    }
  };

  const handleBackup = async () => {
    try {
      const result = await window.electronAPI.backupDatabase();
      if (!result.success) {
        throw new Error(result.error);
      }
      showSuccessToast('데이터베이스 백업이 완료되었습니다.');
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
      handleApiError(error, '백업 폴더를 열지 못했습니다.');
    }
  };

  const handleSetDbPath = async () => {
    try {
      const result = await window.electronAPI.setDbPath();
      if (result.success && result.path) {
        await loadConfig();
        await loadTables();
        showSuccessToast('DB 경로가 변경되었습니다.');
      }
    } catch (error) {
      handleApiError(error, 'DB 경로 변경에 실패했습니다.');
    }
  };

  const handleSetBackupDir = async () => {
    try {
      const result = await window.electronAPI.setBackupDir();
      if (result.success && result.path) {
        await loadConfig();
        showSuccessToast('백업 폴더가 변경되었습니다.');
      } else if (result.error) {
        throw new Error(result.error);
      }
    } catch (error) {
      handleApiError(error, '백업 폴더 변경에 실패했습니다.');
    }
  };

  const handleSetBackupInterval = async () => {
    try {
      const minutes = parseInt(form.getValues('backupInterval'), 10);
      if (Number.isNaN(minutes) || minutes < 1) {
        showErrorToast('유효한 백업 주기를 입력해 주세요.');
        return;
      }

      const result = await window.electronAPI.setBackupInterval(minutes);
      if (!result.success) {
        throw new Error(result.error);
      }

      await loadConfig();
      showSuccessToast('백업 주기가 변경되었습니다.');
      setIsSettingsOpen(false);
    } catch (error) {
      handleApiError(error, '백업 주기 변경에 실패했습니다.');
    }
  };

  const handleResetDatabase = async () => {
    try {
      setIsResetting(true);
      const result = await window.electronAPI.resetDatabase();
      if (!result.success) {
        throw new Error(result.error || '데이터베이스 초기화에 실패했습니다.');
      }

      showSuccessToast('데이터베이스가 초기화되었습니다.');
      setShowResetConfirm(false);
      setResetInput('');
      setSelectedTable(null);
      setTableData(null);
      await loadConfig();
      await loadTables();
    } catch (error) {
      handleApiError(error, '데이터베이스 초기화에 실패했습니다.');
    } finally {
      setIsResetting(false);
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

  useEffect(() => {
    if (!selectedTable) return;

    try {
      const savedWidths = localStorage.getItem(`databaseViewerColumnWidths_${selectedTable}`);
      setColumnWidths(savedWidths ? JSON.parse(savedWidths) : {});
    } catch {
      setColumnWidths({});
    }
  }, [selectedTable]);

  const handleResizeStart = useCallback((columnName: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setResizingColumn(columnName);
    setResizeStartX(event.clientX);
    setResizeStartWidth(columnWidths[columnName] || DEFAULT_COLUMN_WIDTH);
  }, [columnWidths]);

  const handleResizeMove = useCallback((event: MouseEvent) => {
    if (!resizingColumn) return;
    const width = Math.max(50, resizeStartWidth + event.clientX - resizeStartX);
    setColumnWidths(previous => {
      const nextWidths = { ...previous, [resizingColumn]: width };
      if (selectedTable) {
        localStorage.setItem(`databaseViewerColumnWidths_${selectedTable}`, JSON.stringify(nextWidths));
      }
      return nextWidths;
    });
  }, [resizeStartWidth, resizeStartX, resizingColumn, selectedTable]);

  const handleResizeEnd = useCallback(() => {
    setResizingColumn(null);
  }, []);

  useEffect(() => {
    if (!resizingColumn) return;

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [handleResizeEnd, handleResizeMove, resizingColumn]);

  const visibleColumns = useMemo(
    () => tableData?.columns.filter(column => !column.hidden) ?? [],
    [tableData]
  );
  const tableWidth = visibleColumns.reduce(
    (width, column) => width + (columnWidths[column.name] || DEFAULT_COLUMN_WIDTH),
    0
  );
  const totalPages = Math.max(1, Math.ceil((tableData?.total ?? 0) / pageSize));
  const firstVisibleRow = tableData && tableData.total > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const lastVisibleRow = tableData ? Math.min(currentPage * pageSize, tableData.total) : 0;

  const formatCellValue = (value: unknown) => {
    if (value === null || value === undefined) return null;
    let text: string;
    if (typeof value === 'object') {
      try {
        text = JSON.stringify(value);
      } catch {
        text = String(value);
      }
    } else {
      text = String(value);
    }
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  };

  return (
    <div className="h-full w-full flex flex-col bg-discord-bg">
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
            <span>백업 폴더:</span>
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

        <div className="flex flex-wrap gap-2">
          {tables.map((table) => (
            <Button
              key={table.name}
              variant={selectedTable === table.name ? 'secondary' : 'outline'}
              onClick={() => handleSelectTable(table.name)}
              className={`text-sm border-gray-600 ${
                selectedTable === table.name
                  ? 'bg-discord-accent hover:bg-blue-600 text-white border-transparent'
                  : 'hover:bg-discord-hover text-discord-text'
              }`}
            >
              {table.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tableData && (
          <div className="relative flex h-full w-full flex-col">
            <div
              ref={tableScrollRef}
              className="relative flex-1 min-h-0 overflow-auto scrollbar-thin scrollbar-thumb-[#4a4b50] hover:scrollbar-thumb-[#6a6b70] scrollbar-track-[#2b2d31]"
            >
              <table
                className="table-fixed border-separate border-spacing-0"
                style={{ width: `${Math.max(tableWidth, 1)}px` }}
              >
                <thead>
                  <tr>
                    {visibleColumns.map((column) => (
                      <th
                        key={column.name}
                        className="sticky top-0 z-10 bg-discord-sidebar text-xs font-medium text-discord-text p-2 text-left border-b border-gray-700 first:pl-2 relative"
                        style={{ width: `${columnWidths[column.name] || DEFAULT_COLUMN_WIDTH}px` }}
                      >
                        <div className="truncate select-none">{column.name}</div>
                        <div
                          className={`absolute right-0 top-0 h-full w-2 cursor-col-resize transition-colors ${
                            resizingColumn === column.name
                              ? 'bg-discord-accent'
                              : 'bg-transparent hover:bg-discord-accent'
                          }`}
                          onMouseDown={(event) => handleResizeStart(column.name, event)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row, rowIndex) => (
                    <tr
                      key={`${currentPage}-${rowIndex}`}
                      className="hover:bg-discord-hover transition-colors"
                    >
                      {visibleColumns.map((column, columnIndex) => (
                        <td
                          key={`${rowIndex}-${column.name}`}
                          className={`p-2 text-xs text-discord-text border-b border-gray-700 truncate whitespace-nowrap ${
                            columnIndex === 0 ? 'pl-2' : ''
                          }`}
                        >
                          {(() => {
                            const value = formatCellValue(row[column.name]);
                            if (value === null) {
                              return <span className="text-gray-500">-</span>;
                            }
                            return value;
                          })()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {isTableLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-discord-bg/60">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-600 border-t-discord-accent" />
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-gray-700 px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-discord-muted">
                  전체 {tableData.total.toLocaleString()}개 중 {firstVisibleRow.toLocaleString()}-{lastVisibleRow.toLocaleString()}개 표시
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-discord-muted">
                    페이지당
                    <select
                      value={pageSize}
                      onChange={(event) => handlePageSizeChange(Number(event.target.value))}
                      disabled={isTableLoading}
                      className="h-8 rounded border border-gray-600 bg-discord-sidebar px-2 text-sm text-discord-text outline-none focus:border-discord-accent"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                    </select>
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1 || isTableLoading}
                    className="border-gray-600 hover:bg-discord-hover"
                  >
                    이전
                  </Button>
                  {isPageInputMode ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={pageInput}
                        onChange={(event) => setPageInput(event.target.value)}
                        onBlur={handlePageInputCommit}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.currentTarget.blur();
                          } else if (event.key === 'Escape') {
                            setIsPageInputMode(false);
                            setPageInput('');
                          }
                        }}
                        aria-label="이동할 페이지"
                        autoFocus
                        className="h-8 w-20 bg-discord-sidebar px-2 text-center text-sm text-discord-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-sm text-discord-text">/ {totalPages.toLocaleString()}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePageNumberClick}
                      disabled={isTableLoading}
                      className="flex h-8 min-w-20 items-center justify-center rounded px-3 text-sm text-discord-text hover:bg-discord-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {currentPage.toLocaleString()} / {totalPages.toLocaleString()}
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages || isTableLoading}
                    className="border-gray-600 hover:bg-discord-hover"
                  >
                    다음
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatedModal isOpen={isSettingsOpen} contentClassName="bg-discord-bg rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-discord-text">데이터베이스 설정</h2>
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
                    <FormLabel className="text-discord-text font-medium">DB 파일 위치</FormLabel>
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
                      데이터베이스 파일이 저장될 경로입니다.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="backupDir"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-discord-text font-medium">백업 폴더 위치</FormLabel>
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
                      데이터베이스 백업 파일이 저장될 폴더입니다.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="backupInterval"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-discord-text font-medium">백업 주기</FormLabel>
                    <div className="flex gap-2 mt-2">
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          min="1"
                          max="10080"
                          placeholder="예: 60"
                          className="flex-1 bg-discord-sidebar border-gray-600 text-discord-text"
                        />
                      </FormControl>
                    </div>
                    <FormDescription className="text-sm text-discord-muted mt-1">
                      자동 백업 실행 간격을 분 단위로 설정합니다.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <div className="border border-red-800/60 bg-[#2a1f1f] rounded-lg p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-red-300">데이터베이스 초기화</div>
                    <div className="text-xs text-red-200/80 mt-1">
                      모든 카테고리와 레코드가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    className="bg-discord-danger hover:bg-red-900"
                    onClick={() => setShowResetConfirm(true)}
                  >
                    초기화
                  </Button>
                </div>
              </div>
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
      </AnimatedModal>

      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-discord-bg rounded-lg p-6 w-full max-w-md border border-gray-700 flex flex-col items-center">
            <div className="mb-6 text-center text-discord-text">
              <div className="text-base font-medium mb-2">
                정말로 데이터베이스를 초기화하시겠습니까?
              </div>
              <div className="text-red-400 font-semibold mb-2">
                이 작업은 되돌릴 수 없습니다.
              </div>
              <div className="text-discord-muted text-sm">
                아래에 <span className="font-semibold">데이터베이스를 초기화하겠습니다</span>를 입력해 주세요.
              </div>
            </div>

            {isResetting && (
              <div className="mb-4 p-4 bg-discord-sidebar rounded-lg border border-gray-600">
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-discord-accent" />
                  <div className="text-discord-text text-sm">데이터베이스 초기화 중...</div>
                </div>
              </div>
            )}

            <Input
              type="text"
              value={resetInput}
              onChange={(e) => setResetInput(e.target.value)}
              className="w-full mb-3 bg-discord-sidebar border-gray-600 text-discord-text"
              placeholder="데이터베이스를 초기화하겠습니다"
              disabled={isResetting}
            />
            <div className="flex w-full gap-2">
              <Button
                variant="ghost"
                className="flex-1 text-discord-text hover:bg-discord-hover"
                onClick={() => {
                  setShowResetConfirm(false);
                  setResetInput('');
                }}
                disabled={isResetting}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                className="flex-1 bg-discord-danger hover:bg-red-900 text-white disabled:bg-red-800 disabled:text-red-300 disabled:cursor-not-allowed"
                disabled={resetInput !== '데이터베이스를 초기화하겠습니다' || isResetting}
                onClick={handleResetDatabase}
              >
                {isResetting ? '초기화 중...' : '초기화'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

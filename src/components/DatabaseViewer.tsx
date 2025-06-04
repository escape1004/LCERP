import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Folder, RefreshCw } from 'lucide-react';
import { useToast } from './ui/use-toast';
import { useERPStore } from '../hooks/useERPStore';

interface TableInfo {
  name: string;
}

interface TableData {
  columns: string[];
  rows: Record<string, any>[];
}

export const DatabaseViewer: React.FC = () => {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [dbPath, setDbPath] = useState<string>('');
  const { toast } = useToast();
  const { selectCategory } = useERPStore();

  const loadTables = async () => {
    try {
      const tables = await window.electronAPI.getTables();
      setTables(tables);
      if (tables.length > 0 && !selectedTable) {
        loadTableData(tables[0].name);
      }
    } catch (error) {
      toast({
        title: '테이블 목록을 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const loadTableData = async (tableName: string) => {
    try {
      const data = await window.electronAPI.getTableData(tableName);
      setTableData(data);
      setSelectedTable(tableName);
    } catch (error) {
      toast({
        title: '테이블 데이터를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const loadDbPath = async () => {
    try {
      const path = await window.electronAPI.getDbPath();
      setDbPath(path);
    } catch (error) {
      toast({
        title: 'DB 경로를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  const handleOpenFile = async () => {
    try {
      await window.electronAPI.openDbFile();
    } catch (error) {
      toast({
        title: 'DB 파일을 여는데 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    loadTables();
    loadDbPath();
    selectCategory(null);
  }, [selectCategory]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 p-6 space-y-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold">데이터베이스 뷰어</h1>
            <Button variant="ghost" size="icon" onClick={() => loadTables()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <Button 
            variant="outline" 
            onClick={handleOpenFile} 
            className="border-gray-600 hover:bg-discord-hover"
          >
            <Folder size={16} className="mr-2" />
            DB 경로 열기
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          데이터베이스 위치: {dbPath}
        </div>

        {/* Table List - Horizontal */}
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
      <div className="flex-1 min-h-0 overflow-hidden">
        {tableData && (
          <div className="h-full overflow-auto custom-scrollbar">
            <div className="min-w-full inline-block align-middle">
              <div className="overflow-x-auto custom-scrollbar">
                <Table>
                  <TableHeader className="[&_tr]:border-b [&_tr]:border-gray-700 [&_tr]:bg-discord-sidebar">
                    <TableRow>
                      {tableData.columns.map((column) => (
                        <TableHead 
                          key={column} 
                          className="px-3 py-2 whitespace-nowrap text-sm font-semibold text-discord-text select-none"
                        >
                          {column}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableData.rows.map((row, i) => (
                      <TableRow 
                        key={i}
                        className="border-b border-gray-800 transition-colors hover:bg-discord-hover cursor-pointer"
                      >
                        {tableData.columns.map((column) => (
                          <TableCell 
                            key={column} 
                            className="px-3 py-2 whitespace-nowrap text-sm"
                          >
                            {typeof row[column] === 'object'
                              ? JSON.stringify(row[column])
                              : String(row[column])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}; 

import React, { useState, useMemo } from 'react';
import { Search, Plus, Download, Eye, Edit, Trash2, ExternalLink } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { DataRecord, FieldDefinition } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RecordModal } from './RecordModal';
import { ViewRecordModal } from './ViewRecordModal';

export const MainContent: React.FC = () => {
  const {
    categories,
    selectedCategoryId,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    getFilteredRecords,
    deleteRecord,
  } = useERPStore();

  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DataRecord | null>(null);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
  const allRecords = selectedCategoryId ? getFilteredRecords(selectedCategoryId) : [];

  // Sorting
  const sortedRecords = useMemo(() => {
    if (!sortField) return allRecords;

    return [...allRecords].sort((a, b) => {
      let aValue = a.data[sortField];
      let bValue = b.data[sortField];

      // Handle different data types
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allRecords, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRecords = sortedRecords.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (fieldId: string) => {
    if (sortField === fieldId) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldId);
      setSortDirection('asc');
    }
  };

  const handleEdit = (record: DataRecord) => {
    setEditingRecord(record);
    setIsRecordModalOpen(true);
  };

  const handleView = (record: DataRecord) => {
    setViewingRecord(record);
    setIsViewModalOpen(true);
  };

  const handleDelete = (record: DataRecord) => {
    if (window.confirm('이 항목을 삭제하시겠습니까?')) {
      deleteRecord(record.id);
    }
  };

  const exportToCSV = () => {
    if (!selectedCategory || sortedRecords.length === 0) return;

    const headers = ['ID', ...selectedCategory.fields.map(f => f.name), '생성일', '수정일'];
    const csvContent = [
      headers.join(','),
      ...sortedRecords.map(record => [
        record.id,
        ...selectedCategory.fields.map(field => {
          const value = record.data[field.id];
          if (Array.isArray(value)) {
            return `"${value.join(', ')}"`;
          }
          return `"${String(value || '')}"`;
        }),
        record.createdAt.toLocaleDateString(),
        record.updatedAt.toLocaleDateString(),
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedCategory.name}_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFieldValue = (field: FieldDefinition, value: any) => {
    if (value === null || value === undefined) return '-';

    switch (field.type) {
      case 'date':
        return value ? new Date(value).toLocaleDateString() : '-';
      case 'select':
      case 'relation':
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-1">
              {value.map((item, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-discord-accent text-white text-xs rounded-full"
                >
                  {String(item)}
                </span>
              ))}
            </div>
          );
        }
        return String(value);
      case 'longtext':
        return String(value).length > 50 ? String(value).substring(0, 50) + '...' : String(value);
      default:
        // URL detection and linking
        const urlPattern = /^https?:\/\/.+/i;
        if (typeof value === 'string' && urlPattern.test(value)) {
          return (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-discord-accent hover:underline flex items-center gap-1"
            >
              <span className="truncate">{value.length > 30 ? value.substring(0, 30) + '...' : value}</span>
              <ExternalLink size={14} />
            </a>
          );
        }
        return String(value);
    }
  };

  if (!selectedCategory) {
    return (
      <div className="flex-1 flex items-center justify-center bg-discord-bg">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-discord-text mb-4">
            카테고리를 선택하세요
          </h2>
          <p className="text-discord-muted">
            왼쪽 사이드바에서 카테고리를 선택하거나 새로 생성하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-discord-bg">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-discord-text">
            {selectedCategory.name}
          </h1>
          <div className="flex gap-3">
            <Button
              onClick={exportToCSV}
              variant="outline"
              className="border-gray-600 hover:bg-discord-hover"
              disabled={sortedRecords.length === 0}
            >
              <Download size={16} className="mr-2" />
              CSV 다운로드
            </Button>
            <Button
              onClick={() => {
                setEditingRecord(null);
                setIsRecordModalOpen(true);
              }}
              className="bg-discord-accent hover:bg-blue-600"
            >
              <Plus size={16} className="mr-2" />
              새 항목 추가
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-muted" />
          <Input
            placeholder="검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-discord-sidebar border-gray-600 text-discord-text"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-hidden">
        {sortedRecords.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-discord-text mb-2">
                {searchTerm ? '검색 결과가 없습니다' : '등록된 항목이 없습니다'}
              </h3>
              <p className="text-discord-muted mb-4">
                {searchTerm ? '다른 검색어로 시도해보세요' : '첫 번째 항목을 추가해보세요'}
              </p>
              {!searchTerm && (
                <Button
                  onClick={() => {
                    setEditingRecord(null);
                    setIsRecordModalOpen(true);
                  }}
                  className="bg-discord-accent hover:bg-blue-600"
                >
                  <Plus size={16} className="mr-2" />
                  항목 추가하기
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Table */}
            <div className="flex-1 overflow-auto discord-scrollbar">
              <table className="w-full">
                <thead className="sticky top-0 bg-discord-sidebar border-b border-gray-700">
                  <tr>
                    {selectedCategory.fields.map(field => (
                      <th
                        key={field.id}
                        className="px-4 py-3 text-left text-sm font-semibold text-discord-text cursor-pointer hover:bg-discord-hover"
                        onClick={() => handleSort(field.id)}
                      >
                        <div className="flex items-center gap-2">
                          {field.name}
                          {sortField === field.id && (
                            <span className="text-discord-accent">
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-sm font-semibold text-discord-text w-32">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((record) => (
                    <tr
                      key={record.id}
                      className="border-b border-gray-800 hover:bg-discord-hover transition-colors"
                    >
                      {selectedCategory.fields.map(field => (
                        <td key={field.id} className="px-4 py-3 text-sm text-discord-text">
                          {formatFieldValue(field, record.data[field.id])}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleView(record)}
                            className="h-8 w-8 p-0 hover:bg-discord-bg"
                          >
                            <Eye size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(record)}
                            className="h-8 w-8 p-0 hover:bg-discord-bg"
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(record)}
                            className="h-8 w-8 p-0 hover:bg-red-900 text-discord-danger"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
                <div className="text-sm text-discord-muted">
                  전체 {sortedRecords.length}개 중 {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedRecords.length)}개 표시
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="border-gray-600 hover:bg-discord-hover"
                  >
                    이전
                  </Button>
                  <span className="flex items-center px-3 text-sm text-discord-text">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="border-gray-600 hover:bg-discord-hover"
                  >
                    다음
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <RecordModal
        isOpen={isRecordModalOpen}
        onClose={() => {
          setIsRecordModalOpen(false);
          setEditingRecord(null);
        }}
        category={selectedCategory}
        record={editingRecord}
      />

      <ViewRecordModal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setViewingRecord(null);
        }}
        category={selectedCategory}
        record={viewingRecord}
      />
    </div>
  );
};

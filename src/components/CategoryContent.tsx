import React, { useState, useCallback, useEffect } from 'react';
import { Download, Edit, Eye, Filter, Plus, Search, Trash2, X } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RecordModal } from './RecordModal';
import { ViewRecordModal } from './ViewRecordModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Category, DataRecord } from '../types';
import type { ElectronAPI } from '../types/electron';
import { LinkIcon } from 'lucide-react';
import { ConfirmDialog } from './ui/confirm-dialog';
import { AlertDialog } from './ui/alert-dialog';

interface CategoryContentProps {
  categoryId: string | null;
}

export const CategoryContent: React.FC<CategoryContentProps> = ({ categoryId }) => {
  const {
    categories,
    records,
    currentPage,
    itemsPerPage,
    setCurrentPage,
    selectCategory,
  } = useERPStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DataRecord | null>(null);
  const [viewingCategory, setViewingCategory] = useState<string>('');
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [alertDialogProps, setAlertDialogProps] = useState<{
    title: string;
    message: string;
    variant: 'error' | 'warning' | 'info' | 'success';
  }>({
    title: '',
    message: '',
    variant: 'info'
  });
  const [recordToDelete, setRecordToDelete] = useState<DataRecord | null>(null);
  const [isPageInputMode, setIsPageInputMode] = useState(false);
  const [pageInputValue, setPageInputValue] = useState('');

  const isEmpty = (v: any): boolean => {
    // null, undefined 체크
    if (v === null || v === undefined) return true;
    
    // 문자열 체크
    if (typeof v === 'string') {
      return v.trim() === '';
    }
    
    // 배열 체크
    if (Array.isArray(v)) {
      return v.length === 0 || v.every(item => isEmpty(item));
    }
    
    // 객체 체크 (빈 객체도 빈 값으로 처리)
    if (typeof v === 'object') {
      return Object.keys(v).length === 0;
    }
    
    // 숫자 체크 (0은 유효한 값)
    if (typeof v === 'number') {
      return isNaN(v);
    }
    
    // boolean 체크 (false도 유효한 값)
    if (typeof v === 'boolean') {
      return false;
    }
    
    // 나머지는 빈 값이 아님
    return false;
  };

  // Reset pagination when category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryId, setCurrentPage]);

  const getRecordReferenceCount = useCallback((recordId: string, categoryId: string): number => {
    let count = 0;
    
    // 모든 카테고리를 순회
    categories.forEach(category => {
      // 현재 카테고리의 relation 타입 필드 중 targetCategoryId가 일치하는 것만 확인
      const relationFields = category.fields.filter(
        field => field.type === 'relation' && field.relationCategoryId === categoryId
      );
      
      if (relationFields.length > 0) {
        // 해당 카테고리의 모든 레코드를 확인
        const categoryRecords = records[category.id] || [];
        categoryRecords.forEach(record => {
          relationFields.forEach(field => {
            const value = record.data[field.id];
            if (field.multiple && Array.isArray(value)) {
              // 다중 선택인 경우 배열에서 recordId가 포함된 횟수를 더함
              count += value.filter(id => id === recordId).length;
            } else if (value === recordId) {
              // 단일 선택인 경우 값이 일치하면 카운트 증가
              count += 1;
            }
          });
        });
      }
    });
    
    return count;
  }, [categories, records]);

  if (!categoryId) {
    return (
      <div className="flex items-center justify-center h-full text-discord-muted">
        카테고리를 선택해주세요
      </div>
    );
  }

  const selectedCategory = categories.find(c => c.id === categoryId);
  if (!selectedCategory) {
    return (
      <div className="flex items-center justify-center h-full text-discord-muted">
        존재하지 않는 카테고리입니다
      </div>
    );
  }

  const getParentPath = (category: Category): Category[] => {
    const path: Category[] = [];
    let current = categories.find(c => c.id === category.parentId);
    while (current) {
      path.unshift(current);
      current = categories.find(c => c.id === current.parentId);
    }
    return path;
  };

  const handleCategoryClick = (id: string) => {
    selectCategory(id);
  };

  const categoryRecords = records[categoryId] || [];
  const sortedRecords = [...categoryRecords]
    .filter(record => {
      if (!searchTerm) return true;
      if (searchField === 'all') {
        return selectedCategory.fields.some(field => {
          const value = record.data[field.id];
          return String(value).toLowerCase().includes(searchTerm.toLowerCase());
        });
      } else {
        const value = record.data[searchField];
        return String(value).toLowerCase().includes(searchTerm.toLowerCase());
      }
    })
    .sort((a, b) => {
      if (!sortField) return 0;

      if (sortField === '__refCount') {
        const countA = getRecordReferenceCount(a.id, selectedCategory.id);
        const countB = getRecordReferenceCount(b.id, selectedCategory.id);
        return sortDirection === 'asc' ? countA - countB : countB - countA;
      }

      const aValue = a.data[sortField];
      const bValue = b.data[sortField];
      const field = selectedCategory.fields.find(f => f.id === sortField);
      if (!field) return 0;

      let comparison = 0;
      if (field.type === 'number') {
        comparison = Number(aValue) - Number(bValue);
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

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

  const handleView = (record: DataRecord) => {
    setViewingRecord(record);
    setViewingCategory(categoryId);
    setIsViewModalOpen(true);
  };

  const handleEdit = (record: DataRecord) => {
    setEditingRecord(record);
    setIsRecordModalOpen(true);
  };

  const handleDelete = async (record: DataRecord) => {
    setRecordToDelete(record);
    setIsConfirmDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (recordToDelete) {
      try {
        await window.electronAPI.deleteRecord(recordToDelete.id);
        const updatedRecords = records[categoryId!].filter(r => r.id !== recordToDelete.id);
        if (updatedRecords.length === 0 && currentPage > 1) {
          setCurrentPage(currentPage - 1);
        }
      } catch (error) {
        console.error('Failed to delete record:', error);
        showAlert('오류', '레코드 삭제 중 오류가 발생했습니다.', 'error');
      }
      setRecordToDelete(null);
    }
  };

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'info' | 'success' = 'info') => {
    setAlertDialogProps({ title, message, variant });
    setIsAlertDialogOpen(true);
  };

  const exportToCSV = async () => {
    const headers = selectedCategory.fields.filter(f => !f.hidden).map(f => f.name).join(',');
    const rows = sortedRecords.map(record => 
      selectedCategory.fields.filter(f => !f.hidden).map(field => {
        const value = record.data[field.id];
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value}"`;
        }
        return value;
      }).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    try {
      await window.electronAPI.openExternal(url);
    } catch (error) {
      console.error('Failed to export CSV:', error);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const formatFieldValue = (field: any, value: any): string | JSX.Element => {
    // 테스트용: 모든 값을 "-"로 출력
    console.log('원래 값:', value); // 디버깅용 로그
    return '-';
  };

  const formatRelationArray = (values: any[], field: any): string => {
    if (!field.relationCategoryId || !values.length) return '-';
    
    const relatedRecords = records[field.relationCategoryId] || [];
    const relatedCategory = categories.find(c => c.id === field.relationCategoryId);
    if (!relatedCategory || !relatedCategory.fields[0]) return '-';
    
    const displayField = relatedCategory.fields[0];
    const names = values
      .map(id => {
        const record = relatedRecords.find(r => r.id === id);
        if (!record) return null;
        const displayValue = record.data[displayField.id];
        return displayValue || null;
      })
      .filter(Boolean);
    
    return names.length > 0 ? names.join(', ') : '-';
  };

  const formatRelation = (value: any, field: any): string => {
    if (!field.relationCategoryId || !value) return '-';
    
    const relatedRecords = records[field.relationCategoryId] || [];
    const relatedCategory = categories.find(c => c.id === field.relationCategoryId);
    if (!relatedCategory || !relatedCategory.fields[0]) return '-';
    
    const record = relatedRecords.find(r => r.id === value);
    if (!record) return '-';
    
    const displayField = relatedCategory.fields[0];
    const displayValue = record.data[displayField.id];
    return displayValue || '-';
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const pageNumber = parseInt(pageInputValue);
      if (pageNumber >= 1 && pageNumber <= totalPages) {
        setCurrentPage(pageNumber);
        setIsPageInputMode(false);
        setPageInputValue('');
      }
    } else if (e.key === 'Escape') {
      setIsPageInputMode(false);
      setPageInputValue('');
    }
  };

  const handlePageInputBlur = () => {
    const pageNumber = parseInt(pageInputValue);
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
    setIsPageInputMode(false);
    setPageInputValue('');
  };

  const handlePageNumberClick = () => {
    setIsPageInputMode(true);
    setPageInputValue(currentPage.toString());
  };

  return (
    <div className="flex-1 flex flex-col bg-discord-bg">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-discord-text">
              {selectedCategory.name}
              {selectedCategory.parentId && (
                <span className="text-sm font-normal text-discord-muted ml-2">
                  (
                  {getParentPath(selectedCategory).map((cat, index, array) => (
                    <React.Fragment key={cat.id}>
                      <button
                        onClick={() => handleCategoryClick(cat.id)}
                        className="hover:text-discord-text hover:underline"
                      >
                        {cat.name}
                      </button>
                      {index < array.length - 1 && " > "}
                    </React.Fragment>
                  ))}
                  )
                </span>
              )}
            </h1>
            <p className="text-sm text-discord-muted mt-2">
              전체 {sortedRecords.length}개 항목
              {searchTerm && ` (검색 결과: ${sortedRecords.length}개)`}
            </p>
          </div>
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
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-muted" />
            <Input
              placeholder={searchField === 'all' ? '전체 검색...' : `${selectedCategory.fields.find(f => f.id === searchField)?.name || ''} 검색...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-discord-muted hover:text-discord-text"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <Select value={searchField} onValueChange={setSearchField}>
            <SelectTrigger className="w-48 bg-discord-sidebar border-gray-600 text-discord-text">
              <Filter size={16} className="mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-discord-sidebar border-gray-600">
              <SelectItem value="all">전체 필드</SelectItem>
              {selectedCategory.fields.filter(f => !f.hidden).map(field => (
                <SelectItem key={field.id} value={field.id}>
                  {field.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                    {selectedCategory.fields.filter(f => !f.hidden).map(field => (
                      <th
                        key={field.id}
                        className="px-2 py-2 text-left text-sm font-semibold text-discord-text cursor-pointer hover:bg-discord-hover"
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
                    {/* 참조되는 카테고리인 경우에만 참조 횟수 컬럼 표시 */}
                    {categories.some(cat => 
                      cat.fields.some(field => 
                        field.type === 'relation' && field.relationCategoryId === selectedCategory.id
                      )
                    ) && (
                      <th
                        className="px-2 py-2 text-left text-sm font-semibold text-discord-text cursor-pointer hover:bg-discord-hover"
                        onClick={() => handleSort('__refCount')}
                      >
                        <div className="flex items-center gap-2">
                          참조 횟수
                          {sortField === '__refCount' && (
                            <span className="text-discord-accent">
                              {sortDirection === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    )}
                    <th className="px-2 py-2 text-left text-sm font-semibold text-discord-text w-32">
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
                      {selectedCategory.fields.filter(f => !f.hidden).map(field => {
                        const value = record.data[field.id];
                        return (
                          <td key={field.id} className="px-2 py-3 text-sm text-discord-text whitespace-nowrap">
                            {formatFieldValue(field, value)}
                          </td>
                        );
                      })}
                      {/* 참조되는 카테고리인 경우에만 참조 횟수 표시 */}
                      {categories.some(cat => 
                        cat.fields.some(field => 
                          field.type === 'relation' && field.relationCategoryId === selectedCategory.id
                        )
                      ) && (
                        <td className="px-2 py-3 text-sm whitespace-nowrap">
                          {(() => {
                            const count = getRecordReferenceCount(record.id, selectedCategory.id);
                            return count === 0 ? '0' : count;
                          })()}
                        </td>
                      )}
                      <td className="px-2 py-3">
                        <div className="flex gap-1">
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
                {isPageInputMode ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={pageInputValue}
                      onChange={(e) => setPageInputValue(e.target.value)}
                      onKeyDown={handlePageInputKeyDown}
                      onBlur={handlePageInputBlur}
                      className="w-16 h-8 text-sm text-center bg-discord-sidebar border-gray-600 text-discord-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min={1}
                      max={totalPages}
                      autoFocus
                    />
                    <span className="text-sm text-discord-text">/ {Math.max(totalPages, 1)}</span>
                  </div>
                ) : (
                  <button
                    onClick={handlePageNumberClick}
                    className="flex items-center px-3 text-sm text-discord-text hover:bg-discord-hover rounded cursor-pointer"
                  >
                    {currentPage} / {Math.max(totalPages, 1)}
                  </button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="border-gray-600 hover:bg-discord-hover"
                >
                  다음
                </Button>
              </div>
            </div>
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
          setViewingCategory('');
        }}
        category={categories.find(cat => cat.id === viewingCategory) || selectedCategory}
        record={viewingRecord}
      />

      {/* 커스텀 다이얼로그들 */}
      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onClose={() => {
          setIsConfirmDialogOpen(false);
          setRecordToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="레코드 삭제"
        message="정말 삭제하시겠습니까?"
        confirmText="삭제"
        cancelText="취소"
        variant="danger"
      />

      <AlertDialog
        isOpen={isAlertDialogOpen}
        onClose={() => setIsAlertDialogOpen(false)}
        title={alertDialogProps.title}
        message={alertDialogProps.message}
        variant={alertDialogProps.variant}
      />
    </div>
  );
}; 
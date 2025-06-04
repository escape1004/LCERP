import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Plus, Download, Eye, Edit, Trash2, ExternalLink, Filter, X, ChevronRight } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { DataRecord, FieldDefinition, Category } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RecordModal } from './RecordModal';
import { ViewRecordModal } from './ViewRecordModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CategoryContent } from './CategoryContent';
import { DatabaseViewer } from './DatabaseViewer';
import { toast } from './ui/use-toast';

// Custom event type
declare global {
  interface WindowEventMap {
    'erp:categoryChange': CustomEvent<{ categoryId: string }>;
  }
}

// Breadcrumb component
const CategoryBreadcrumb = React.memo(({ 
  category, 
  categories,
  onCategoryClick 
}: { 
  category: Category; 
  categories: Category[];
  onCategoryClick: (categoryId: string) => void;
}) => {
  const getCategoryPath = useCallback((currentCategory: Category): Category[] => {
    const path: Category[] = [currentCategory];
    let parent = currentCategory.parentId ? categories.find(c => c.id === currentCategory.parentId) : null;
    
    while (parent) {
      path.unshift(parent);
      parent = parent.parentId ? categories.find(c => c.id === parent.parentId) : null;
    }
    
    return path;
  }, [categories]);

  const categoryPath = useMemo(() => getCategoryPath(category), [category, getCategoryPath]);

  return (
    <div className="flex items-center gap-1 text-sm text-discord-muted">
      {categoryPath.map((cat, index) => (
        <React.Fragment key={cat.id}>
          {index > 0 && <ChevronRight size={14} className="text-discord-muted" />}
          <button
            onClick={() => onCategoryClick(cat.id)}
            className={`hover:text-discord-text ${
              index === categoryPath.length - 1 
                ? 'text-discord-text' 
                : 'hover:underline'
            }`}
          >
            {cat.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
});

CategoryBreadcrumb.displayName = 'CategoryBreadcrumb';

export const MainContent: React.FC = () => {
  const {
    categories,
    selectedCategoryId,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    deleteRecord,
    getCategoryRecords,
    loadRecords,
    selectCategory,
    showDbViewer,
  } = useERPStore();

  const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
  const currentRecords = selectedCategoryId ? getCategoryRecords(selectedCategoryId) : [];
  
  // Reset search field to 'all' when category changes
  useEffect(() => {
    setSearchField('all');
  }, [selectedCategoryId]);

  // Load current category records
  useEffect(() => {
    const loadRecords = async () => {
      if (selectedCategoryId) {
        try {
          const records = await window.electronAPI.getRecords(selectedCategoryId);
          setCurrentRecords(records);
        } catch (error) {
          toast({
            title: '레코드를 불러오는데 실패했습니다.',
            variant: 'destructive',
          });
        }
      }
    };

    loadRecords();
  }, [selectedCategoryId, toast]);

  // Load related records when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      const category = categories.find(cat => cat.id === selectedCategoryId);
      if (category) {
        const relationFields = category.fields.filter(field => field.type === 'relation');
        const loadedCategories = new Set();
        relationFields.forEach(field => {
          if (field.relationCategoryId && !loadedCategories.has(field.relationCategoryId)) {
            loadedCategories.add(field.relationCategoryId);
            loadRecords(field.relationCategoryId);
          }
        });
      }
    }
  }, [selectedCategoryId, categories, loadRecords]);

  React.useEffect(() => {
    if (selectedCategoryId) {
      const categoryRecords = getCategoryRecords(selectedCategoryId);
    }
  }, [currentRecords, selectedCategoryId, getCategoryRecords]);

  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DataRecord | null>(null);
  const [viewingCategory, setViewingCategory] = useState<string>('');
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchField, setSearchField] = useState<string>('all');

  // Custom filtered records based on field-specific search
  const customFilteredRecords = useMemo(() => {
    if (!selectedCategoryId) return [];
    
    if (!searchTerm) return currentRecords;
    
    return currentRecords.filter((record) => {
      if (searchField === 'all') {
        return Object.values(record.data).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        );
      } else {
        const fieldValue = record.data[searchField];
        return String(fieldValue || '').toLowerCase().includes(searchTerm.toLowerCase());
      }
    });
  }, [selectedCategoryId, searchTerm, searchField, currentRecords]);

  // Sorting
  const sortedRecords = useMemo(() => {
    if (!sortField) return customFilteredRecords;

    return [...customFilteredRecords].sort((a, b) => {
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
  }, [customFilteredRecords, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRecords = sortedRecords.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (fieldId: string) => {
    if (sortField === fieldId) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        // Reset sorting on third click
        setSortField('');
        setSortDirection('asc');
      }
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
    setViewingCategory(selectedCategoryId || '');
    setIsViewModalOpen(true);
  };

  const handleViewRelatedRecord = (recordId: string, categoryId: string) => {
    const relatedRecords = getCategoryRecords(categoryId);
    const relatedRecord = relatedRecords.find(r => r.id === recordId);
    if (relatedRecord) {
      setViewingRecord(relatedRecord);
      setViewingCategory(categoryId);
      setIsViewModalOpen(true);
    }
  };

  const handleDelete = (record: DataRecord) => {
    if (window.confirm('이 항목을 삭제하시겠습니까?')) {
      deleteRecord(record.id);
    }
  };

  const exportToCSV = () => {
    if (!selectedCategory || sortedRecords.length === 0) return;

    const headers = ['ID', ...selectedCategory.fields.map(f => f.name), '생성일', '수정일'];
    
    // Add BOM for Korean encoding
    const BOM = '\uFEFF';
    
    const csvContent = BOM + [
      headers.join(','),
      ...sortedRecords.map(record => [
        record.id,
        ...selectedCategory.fields.map(field => {
          const value = record.data[field.id];
          
          // Handle different field types
          if (field.type === 'relation') {
            if (Array.isArray(value)) {
              const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
              if (!relatedCategory) return `"${value.join(', ')}"`;
              
              const relatedRecords = getCategoryRecords(field.relationCategoryId!);
              const displayField = relatedCategory.fields[0];
              
              const displayValues = value.map(recordId => {
                const relatedRecord = relatedRecords.find(r => r.id === recordId);
                return relatedRecord ? 
                  String(relatedRecord.data[displayField?.id] || recordId) : 
                  recordId;
              });
              
              return `"${displayValues.join(', ')}"`;
            } else if (value) {
              const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
              if (!relatedCategory) return `"${value}"`;
              
              const relatedRecords = getCategoryRecords(field.relationCategoryId!);
              const displayField = relatedCategory.fields[0];
              const relatedRecord = relatedRecords.find(r => r.id === value);
              
              return `"${relatedRecord ? 
                String(relatedRecord.data[displayField?.id] || value) : 
                value}"`;
            }
            return '""';
          }
          
          // Handle arrays (e.g., select multiple)
          if (Array.isArray(value)) {
            return `"${value.join(', ')}"`;
          }
          
          // Handle dates
          if (field.type === 'date' && value) {
            const date = new Date(value);
            return `"${date.toLocaleDateString()} ${date.toLocaleTimeString()}"`;
          }
          
          // Handle other types
          if (value === null || value === undefined) {
            return '""';
          }
          
          // Escape quotes and format other values
          const stringValue = String(value).replace(/"/g, '""');
          return `"${stringValue}"`;
        }),
        new Date(record.createdAt).toLocaleString(),
        new Date(record.updatedAt).toLocaleString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedCategory.name}_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUrlClick = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Attempting to open URL:', url);
    try {
      const result = await window.electronAPI.openExternal(url);
      if (!result.success) {
        console.error('Failed to open URL:', result.error);
        // TODO: Add toast notification here
      }
    } catch (error) {
      console.error('Error opening URL:', error);
      // TODO: Add toast notification here
    }
  };

  const renderUrl = (url: string, maxLength: number) => (
    <button
      type="button"
      onClick={(e) => handleUrlClick(e, url)}
      className="text-discord-accent hover:underline flex items-center gap-1 text-left w-full"
    >
      <span className="truncate">
        {url.length > maxLength ? url.substring(0, maxLength) + '...' : url}
      </span>
      <ExternalLink size={14} className="flex-shrink-0" />
    </button>
  );

  const formatFieldValue = (field: FieldDefinition, value: any) => {
    if (value === null || value === undefined) return '-';

    const urlPattern = /^https?:\/\/.+/i;

    switch (field.type) {
      case 'date':
        return value ? new Date(value).toLocaleDateString() : '-';
      case 'select':
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
      case 'relation':
        if (!field.relationCategoryId) return '-';
        
        const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
        if (!relatedCategory) return '-';
        
        const relatedRecords = getCategoryRecords(field.relationCategoryId);
        const displayField = relatedCategory.fields[0];
        
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-1">
              {value.map((recordId, index) => {
                const relatedRecord = relatedRecords.find(r => r.id === recordId);
                if (!relatedRecord) return null;
                
                const displayValue = relatedRecord.data[displayField?.id] || '(제목 없음)';
                return (
                  <span
                    key={index}
                    className="px-2 py-1 bg-green-600 text-white text-xs rounded-full cursor-pointer hover:bg-green-700"
                    onClick={() => handleViewRelatedRecord(recordId, field.relationCategoryId!)}
                  >
                    {displayValue}
                  </span>
                );
              })}
            </div>
          );
        } else {
          const relatedRecord = relatedRecords.find(r => r.id === value);
          if (!relatedRecord) return '-';
          
          const displayValue = relatedRecord.data[displayField?.id] || '(제목 없음)';
          return (
            <span
              className="text-green-400 cursor-pointer hover:text-green-300 hover:underline"
              onClick={() => handleViewRelatedRecord(value, field.relationCategoryId!)}
            >
              {displayValue}
            </span>
          );
        }
      case 'longtext':
        const text = String(value);
        if (urlPattern.test(text)) {
          return renderUrl(text, 50);
        }
        return text.length > 50 ? text.substring(0, 50) + '...' : text;
      default:
        if (typeof value === 'string' && urlPattern.test(value)) {
          return renderUrl(value, 30);
        }
        return String(value);
    }
  };

  const handleCategoryClick = useCallback((categoryId: string) => {
    selectCategory(categoryId);
  }, [selectCategory]);

  // Get parent categories path
  const getParentPath = useCallback((category: Category): Category[] => {
    const path: Category[] = [];
    let parent = category.parentId ? categories.find(c => c.id === category.parentId) : null;
    
    while (parent) {
      path.unshift(parent);
      parent = parent.parentId ? categories.find(c => c.id === parent.parentId) : null;
    }
    
    return path;
  }, [categories]);

  if (!selectedCategory && !showDbViewer) {
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
    <div className="flex-1 h-full flex flex-col bg-discord-bg">
      {showDbViewer ? (
        <div className="flex-1 flex flex-col min-h-0">
          <DatabaseViewer />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <div className="shrink-0 p-6 border-b border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-discord-text">
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
                  className="pl-10 bg-discord-sidebar border-gray-600 text-discord-text"
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
                  {selectedCategory.fields.map(field => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {sortedRecords.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
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
              <>
                {/* Table Container */}
                <div className="flex-1 min-h-0 p-6 pb-0 overflow-auto discord-scrollbar">
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

                {/* Pagination - Fixed to bottom */}
                <div className="shrink-0 px-6 py-4 border-t border-gray-700">
                  <div className="flex items-center justify-between">
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
                        {currentPage} / {Math.max(totalPages, 1)}
                      </span>
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
              </>
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
        </div>
      )}
    </div>
  );
};

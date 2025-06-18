import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Plus, Download, Eye, Edit, Trash2, ExternalLink, Filter, X, ChevronRight, LinkIcon } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

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

// 썸네일 렌더링 유틸
const ThumbnailCell: React.FC<{ filePath: string | undefined }> = ({ filePath }) => {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let ignore = false;
    if (filePath) {
      window.electronAPI.getThumbnailDataUrl(filePath).then(res => {
        if (!ignore) setDataUrl(res.success ? res.dataUrl || null : null);
      });
    } else {
      setDataUrl(null);
    }
    return () => { ignore = true; };
  }, [filePath]);
  return dataUrl ? (
    <img src={dataUrl} alt="썸네일" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8 }} />
  ) : (
    <div style={{ width: 96, height: 96, background: '#222', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 36 }}>
      <span>🖼️</span>
    </div>
  );
};

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

  // categories, selectedCategory, currentRecords에 기본값 보장
  const categoriesSafe = categories || [];
  const selectedCategorySafe = categoriesSafe.find(cat => cat.id === selectedCategoryId) || null;
  const currentRecordsSafe = selectedCategoryId ? getCategoryRecords(selectedCategoryId) || [] : [];

  const getRecordReferenceCount = useCallback((recordId: string, categoryId: string): number => {
    let count = 0;
    
    // 모든 카테고리를 순회
    categoriesSafe.forEach(category => {
      // 현재 카테고리의 relation 타입 필드 중 targetCategoryId가 일치하는 것만 확인
      const relationFields = category.fields.filter(
        field => field.type === 'relation' && field.relationCategoryId === categoryId
      );
      
      if (relationFields.length > 0) {
        // 해당 카테고리의 모든 레코드를 확인
        const records = getCategoryRecords(category.id);
        records.forEach(record => {
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
  }, [categoriesSafe, getCategoryRecords]);
  
  // Reset search field to 'all' when category changes
  useEffect(() => {
    setSearchField('all');
    setCurrentPage(1); // Reset pagination when category changes
  }, [selectedCategoryId, setCurrentPage]);

  // Load related records when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      const category = categoriesSafe.find(cat => cat.id === selectedCategoryId);
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
  }, [selectedCategoryId, categoriesSafe, loadRecords]);

  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DataRecord | null>(null);
  const [viewingCategory, setViewingCategory] = useState<string>('');
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchField, setSearchField] = useState<string>('all');
  const [expandedTags, setExpandedTags] = useState<{[key: string]: boolean}>({});

  // Custom filtered records based on field-specific search
  const customFilteredRecords = useMemo(() => {
    if (!selectedCategoryId) return [];
    
    if (!searchTerm) return currentRecordsSafe;
    
    return currentRecordsSafe.filter((record) => {
      if (searchField === 'all') {
        return Object.values(record.data).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        );
      } else {
        const fieldValue = record.data[searchField];
        return String(fieldValue || '').toLowerCase().includes(searchTerm.toLowerCase());
      }
    });
  }, [selectedCategoryId, searchTerm, searchField, currentRecordsSafe]);

  // Sorting
  const sortedRecords = useMemo(() => {
    if (!sortField) return customFilteredRecords;

    return [...customFilteredRecords].sort((a, b) => {
      if (sortField === '__refCount') {
        const countA = getRecordReferenceCount(a.id, selectedCategorySafe?.id || '');
        const countB = getRecordReferenceCount(b.id, selectedCategorySafe?.id || '');
        return sortDirection === 'asc' ? countA - countB : countB - countA;
      }

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
  }, [customFilteredRecords, sortField, sortDirection, selectedCategorySafe?.id, getRecordReferenceCount]);

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
    setViewingCategory(selectedCategorySafe?.id || '');
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
    if (!selectedCategorySafe || sortedRecords.length === 0) return;

    const headers = ['ID', ...selectedCategorySafe.fields.filter(f => !f.hidden).map(f => f.name), '생성일', '수정일'];
    
    // Add BOM for Korean encoding
    const BOM = '\uFEFF';
    
    const csvContent = BOM + [
      headers.join(','),
      ...sortedRecords.map(record => [
        record.id,
        ...selectedCategorySafe.fields.filter(f => !f.hidden).map(field => {
          const value = record.data[field.id];
          
          // Handle different field types
          if (field.type === 'relation') {
            if (Array.isArray(value)) {
              const relatedCategory = categoriesSafe.find(cat => cat.id === field.relationCategoryId);
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
              const relatedCategory = categoriesSafe.find(cat => cat.id === field.relationCategoryId);
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
    link.setAttribute('download', `${selectedCategorySafe.name}_${timestamp}.csv`);
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

  const formatFieldValue = (field: FieldDefinition, value: any, recordId: string) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      return '-';
    }

    switch (field.type) {
      case 'date':
        return new Date(value).toLocaleDateString();
      
      case 'select':
        if (Array.isArray(value)) {
          const isExpanded = expandedTags[`${recordId}-${field.id}`];
          const displayTags = isExpanded ? value : value.slice(0, 3);
          const remainingCount = value.length - 3;

          return (
            <div className="flex flex-wrap gap-1">
              {displayTags.map((item) => (
                <span
                  key={item}
                  className="px-2 py-1 text-xs rounded bg-green-600/20 text-green-500"
                >
                  {String(item)}
                </span>
              ))}
              {!isExpanded && remainingCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedTags(prev => ({
                      ...prev,
                      [`${recordId}-${field.id}`]: true
                    }));
                  }}
                  className="px-2 py-1 text-xs rounded bg-discord-blurple text-white hover:bg-discord-blurple/80"
                >
                  +{remainingCount}개 더보기
                </button>
              )}
              {isExpanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedTags(prev => ({
                      ...prev,
                      [`${recordId}-${field.id}`]: false
                    }));
                  }}
                  className="px-2 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600"
                >
                  접기
                </button>
              )}
            </div>
          );
        }
        return String(value);
      
      case 'relation':
        if (!field.relationCategoryId) return String(value);
        
        const relatedCategory = categoriesSafe.find(cat => cat.id === field.relationCategoryId);
        if (!relatedCategory) return String(value);
        
        const relatedRecords = getCategoryRecords(field.relationCategoryId);
        const displayField = relatedCategory.fields[0];
        
        if (field.multiple && Array.isArray(value)) {
          const isExpanded = expandedTags[`${recordId}-${field.id}`];
          const displayTags = isExpanded ? value : value.slice(0, 3);
          const remainingCount = value.length - 3;

          return (
            <div className="flex flex-wrap gap-1">
              {displayTags.map((relatedId) => {
                const relatedRecord = relatedRecords.find(r => r.id === relatedId);
                if (!relatedRecord) return null;
                return (
                  <span
                    key={relatedId}
                    className="px-2 py-1 text-xs rounded bg-green-600/20 text-green-500 cursor-pointer hover:bg-green-600/30"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingRecord(relatedRecord);
                      setViewingCategory(field.relationCategoryId!);
                      setIsViewModalOpen(true);
                    }}
                  >
                    {String(relatedRecord.data[displayField?.id] || relatedRecord.id)}
                  </span>
                );
              })}
              {!isExpanded && remainingCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedTags(prev => ({
                      ...prev,
                      [`${recordId}-${field.id}`]: true
                    }));
                  }}
                  className="px-2 py-1 text-xs rounded bg-discord-blurple text-white hover:bg-discord-blurple/80"
                >
                  +{remainingCount}개 더보기
                </button>
              )}
              {isExpanded && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedTags(prev => ({
                      ...prev,
                      [`${recordId}-${field.id}`]: false
                    }));
                  }}
                  className="px-2 py-1 text-xs rounded bg-gray-500 text-white hover:bg-gray-600"
                >
                  접기
                </button>
              )}
            </div>
          );
        } else {
          // 단일 선택 필드는 일반 텍스트로 표시
          const relatedRecord = relatedRecords.find(r => r.id === value);
          if (!relatedRecord) return String(value);
          
          return (
            <span
              className="text-green-500 cursor-pointer hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setViewingRecord(relatedRecord);
                setViewingCategory(field.relationCategoryId!);
                setIsViewModalOpen(true);
              }}
            >
              {String(relatedRecord.data[displayField?.id] || relatedRecord.id)}
            </span>
          );
        }
      
      default:
        return String(value || '-');
    }
  };

  const handleCategoryClick = useCallback((categoryId: string) => {
    selectCategory(categoryId);
  }, [selectCategory]);

  // Get parent categories path
  const getParentPath = useCallback((category: Category): Category[] => {
    const path: Category[] = [];
    let parent = category.parentId ? categoriesSafe.find(c => c.id === category.parentId) : null;
    
    while (parent) {
      path.unshift(parent);
      parent = parent.parentId ? categoriesSafe.find(c => c.id === parent.parentId) : null;
    }
    
    return path;
  }, [categoriesSafe]);

  // 렌더링 시 카테고리 없을 때 안내 메시지
  if (!categoriesSafe || categoriesSafe.length === 0) {
    return <div className="flex items-center justify-center h-full text-discord-muted">카테고리가 없습니다. 새로 추가해보세요.</div>;
  }

  // 파일 필드 존재 여부
  const fileField = selectedCategorySafe?.fields.find(f => f.type === 'file');

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
                  {selectedCategorySafe?.name}
                  {selectedCategorySafe?.parentId && (
                    <span className="text-sm font-normal text-discord-muted ml-2">
                      (
                      {getParentPath(selectedCategorySafe).map((cat, index, array) => (
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
                  placeholder={searchField === 'all' ? '전체 검색...' : `${selectedCategorySafe?.fields.find(f => f.id === searchField)?.name || ''} 검색...`}
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
                  {selectedCategorySafe?.fields.filter(f => !f.hidden).map(field => (
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
                        {fileField && <th className="px-2 py-2 text-left text-sm font-semibold text-discord-text w-[104px]">썸네일</th>}
                        {selectedCategorySafe?.fields.filter(f => !f.hidden).map(field => (
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
                        {categoriesSafe.some(cat => 
                          cat.fields.some(field => 
                            field.type === 'relation' && field.relationCategoryId === selectedCategorySafe.id
                          )
                        ) && (
                          <th
                            className="px-2 py-2 text-center text-sm font-semibold text-discord-text cursor-pointer hover:bg-discord-hover w-16 whitespace-nowrap"
                            onClick={() => handleSort('__refCount')}
                          >
                            <div className="flex items-center gap-2 justify-center">
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
                          {fileField && (
                            <td className="px-2 py-3 text-sm text-discord-text w-[104px]">
                              <ThumbnailCell filePath={record.data[fileField.id]} />
                            </td>
                          )}
                          {selectedCategorySafe?.fields.filter(f => !f.hidden).map(field => (
                            <td key={field.id} className="px-2 py-3 text-sm text-discord-text">
                              {formatFieldValue(field, record.data[field.id], record.id)}
                            </td>
                          ))}
                          {categoriesSafe.some(cat => 
                            cat.fields.some(field => 
                              field.type === 'relation' && field.relationCategoryId === selectedCategorySafe.id
                            )
                          ) && (
                            <td className="px-2 py-3 text-sm text-center w-16 whitespace-nowrap">
                              {(() => {
                                const count = getRecordReferenceCount(record.id, selectedCategorySafe.id);
                                return count > 0 ? count : '-';
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
            category={selectedCategorySafe}
            record={editingRecord}
          />

          <ViewRecordModal
            isOpen={isViewModalOpen}
            onClose={() => {
              setIsViewModalOpen(false);
              setViewingRecord(null);
              setViewingCategory('');
            }}
            category={categoriesSafe.find(cat => cat.id === viewingCategory) || selectedCategorySafe}
            record={viewingRecord}
          />
        </div>
      )}
    </div>
  );
};

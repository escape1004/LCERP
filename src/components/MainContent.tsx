import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Download, Eye, Edit, Trash2, ExternalLink, Filter, X, ChevronRight, LinkIcon, Upload, FileText, ChevronDown, ChevronUp, ArrowUpWideNarrow, ArrowDownWideNarrow, ArrowUp01, ArrowDown01, SortAsc, SortDesc, Check, RefreshCw, HelpCircle } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { DataRecord, FieldDefinition, Category } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RecordModal } from './RecordModal';
import { ViewRecordModal } from './ViewRecordModal';
import { ViewerModal } from './ViewerModal';
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
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ConfirmDialog } from './ui/confirm-dialog';
import { AlertDialog } from './ui/alert-dialog';
import { CategoryModal } from './CategoryModal';
import { format } from "date-fns";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { BulkAddModal } from './BulkAddModal';
import { resolveFilePath } from '../lib/pathResolver';

// 해시태그 파싱 유틸리티 함수
const parseHashtags = (text: string): { hashtags: string[]; plainText: string } => {
  const hashtagRegex = /#(\S+)/g;
  const hashtags: string[] = [];
  let match;
  
  // 해시태그 추출
  while ((match = hashtagRegex.exec(text)) !== null) {
    hashtags.push(match[1]);
  }
  
  // 해시태그를 제거한 일반 텍스트
  const plainText = text.replace(hashtagRegex, '').trim();
  
  return { hashtags, plainText };
};

// 해시태그를 태그로 변환하는 함수
const renderTextWithHashtags = (text: string) => {
  const hashtagRegex = /#(\S+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = hashtagRegex.exec(text)) !== null) {
    // 해시태그 이전 텍스트
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    // 해시태그를 태그로 변환
    parts.push(
      <span
        key={match.index}
        className="inline-block px-2 py-0.5 text-xs rounded bg-gray-600/20 text-gray-400 mr-1"
      >
        #{match[1]}
      </span>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // 마지막 해시태그 이후 텍스트
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts;
};

// URL 렌더링 함수
const renderUrl = (url: string) => (
  <div className="flex items-center gap-2">
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-discord-accent px-1 py-0.5 rounded transition-colors truncate flex-1 cursor-pointer"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(url);
                toast({ 
                  title: '복사 완료', 
                  description: 'URL이 클립보드에 복사되었습니다.' 
                });
              } catch (error) {
                toast({ 
                  title: '복사 실패', 
                  description: '클립보드 복사에 실패했습니다.', 
                  variant: 'destructive' 
                });
              }
            }}
          >
            {url}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
            {`${url} (클릭하여 복사)`}
          </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                const result = await window.electronAPI.openExternal(url);
                if (!result.success) {
                  console.error('Failed to open URL:', result.error);
                  toast({ 
                    title: '링크 열기 실패', 
                    description: '외부 브라우저에서 링크를 열 수 없습니다.', 
                    variant: 'destructive' 
                  });
                }
              } catch (error) {
                console.error('Error opening URL:', error);
                toast({ 
                  title: '링크 열기 실패', 
                  description: '외부 브라우저에서 링크를 열 수 없습니다.', 
                  variant: 'destructive' 
                });
              }
            }}
            className="text-discord-accent hover:text-blue-400 flex-shrink-0"
          >
            <ExternalLink size={16} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
          외부 브라우저에서 열기
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
);

// 필드 값 포맷팅 함수
const formatFieldValue = (field: FieldDefinition, value: any, categories: Category[], getCategoryRecords: (categoryId: string) => DataRecord[], onViewRelatedRecord?: (record: DataRecord, category: Category) => void) => {
  const urlPattern = /^https?:\/\/.+/;
  
  // 빈 값 처리 - 레코드 리스트 테이블과 동일하게
  if (value === null || value === undefined || value === '' || value === '-') {
    return <span className="text-gray-500">-</span>;
  }

  // 배열이지만 비어있는 경우
  if (Array.isArray(value) && value.length === 0) {
    return <span className="text-gray-500">-</span>;
  }
  
  switch (field.type) {
    case 'text':
    case 'longtext':
      if (typeof value === 'string' && urlPattern.test(value)) {
        return renderUrl(value);
      }
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span 
                className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors truncate block" 
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(String(value));
                    toast({ 
                      title: '복사 완료', 
                      description: '값이 클립보드에 복사되었습니다.' 
                    });
                  } catch (error) {
                    toast({ 
                      title: '복사 실패', 
                      description: '클립보드 복사에 실패했습니다.', 
                      variant: 'destructive' 
                    });
                  }
                }}
              >
                {typeof value === 'string' ? renderTextWithHashtags(value) : String(value)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
              복사하기
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    
    case 'number':
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span 
                className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors truncate block" 
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(String(value));
                    toast({ 
                      title: '복사 완료', 
                      description: '숫자가 클립보드에 복사되었습니다.' 
                    });
                  } catch (error) {
                    toast({ 
                      title: '복사 실패', 
                      description: '클립보드 복사에 실패했습니다.', 
                      variant: 'destructive' 
                    });
                  }
                }}
              >
                {String(value)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
              복사하기
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    
    case 'checkbox':
      return value ? <Check className="w-5 h-5 text-discord-accent" /> : <X className="w-5 h-5 text-discord-danger" />;
    
    case 'relation':
      if (!field.relationCategoryId) return String(value);
      const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
      if (!relatedCategory) return String(value);
      const relatedRecords = getCategoryRecords(field.relationCategoryId);
      const displayField = field.displayFieldId
        ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
        : relatedCategory.fields[0];

      if (Array.isArray(value)) {
        // 다중 선택 관계형 필드 - 더보기 기능 추가
        const MultiSelectRelationField: React.FC = () => {
          const [isExpanded, setIsExpanded] = React.useState(false);
          const maxVisible = 3;
          const hasMore = value.length > maxVisible;
          const visibleItems = isExpanded ? value : value.slice(0, maxVisible);
          return (
            <div className="flex flex-wrap gap-1">
              {visibleItems.map((relatedId) => {
                const relatedRecord = relatedRecords.find(r => r.id === relatedId);
                if (!relatedRecord) return null;
                return (
                  <TooltipProvider key={relatedId}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="px-2 py-1 text-xs rounded bg-green-600/20 text-green-500 cursor-pointer hover:bg-green-600/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onViewRelatedRecord) {
                              onViewRelatedRecord(relatedRecord, relatedCategory);
                            }
                          }}
                        >
                          {displayField ? relatedRecord.data[displayField.id] : relatedRecord.id}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                        상세 보기
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
              {hasMore && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsExpanded(!isExpanded);
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-600/20 text-gray-400 hover:bg-gray-600/30 cursor-pointer"
                      >
                        {isExpanded ? "접기" : `+${value.length - maxVisible}개 더보기`}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                      더보기
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          );
        };
        return <MultiSelectRelationField />;
      } else {
        const relatedRecord = relatedRecords.find(r => r.id === value);
        return relatedRecord 
          ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="text-green-500 hover:underline cursor-pointer truncate block"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onViewRelatedRecord) {
                        onViewRelatedRecord(relatedRecord, relatedCategory);
                      }
                    }}
                  >
                    {displayField ? relatedRecord.data[displayField.id] : relatedRecord.id}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                  상세 보기
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
          : <span className="truncate block">{String(value)}</span>;
      }
    
    default:
      if (typeof value === 'string' && urlPattern.test(value)) {
        return renderUrl(value);
      }
      
      // 배열 값 처리 (다중 선택 필드들)
      if (Array.isArray(value)) {
        const MultiSelectField: React.FC = () => {
          const [isExpanded, setIsExpanded] = React.useState(false);
          const maxVisible = 3;
          const hasMore = value.length > maxVisible;
          
          const visibleItems = isExpanded ? value : value.slice(0, maxVisible);
          
          return (
            <div className="flex flex-wrap gap-1">
              {visibleItems.map((item, index) => (
                <TooltipProvider key={index}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="px-2 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await navigator.clipboard.writeText(String(item));
                            toast({ 
                              title: '복사 완료', 
                              description: '값이 클립보드에 복사되었습니다.' 
                            });
                          } catch (error) {
                            toast({ 
                              title: '복사 실패', 
                              description: '클립보드 복사에 실패했습니다.', 
                              variant: 'destructive' 
                            });
                          }
                        }}
                      >
                        {String(item)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                      복사하기
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
              {hasMore && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsExpanded(!isExpanded);
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-600/20 text-gray-400 hover:bg-gray-600/30 cursor-pointer"
                      >
                        {isExpanded ? "접기" : `+${value.length - maxVisible}개 더보기`}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                      더보기
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          );
        };
        
        return <MultiSelectField />;
      }
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span 
                className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors truncate block" 
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await navigator.clipboard.writeText(String(value));
                    toast({ 
                      title: '복사 완료', 
                      description: '값이 클립보드에 복사되었습니다.' 
                    });
                  } catch (error) {
                    toast({ 
                      title: '복사 실패', 
                      description: '클립보드 복사에 실패했습니다.', 
                      variant: 'destructive' 
                    });
                  }
                }}
              >
                {typeof value === 'string' ? renderTextWithHashtags(value) : String(value)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
              복사하기
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
  }
};

// 전역 이벤트 타입 정의
declare global {
  interface WindowEventMap {
    'erp:categoryChange': CustomEvent<{ categoryId: string }>;
    'thumbnail:regenerated': CustomEvent<{ filePath: string }>;
  }
}

// 썸네일 렌더링 유틸
const ThumbnailCell: React.FC<{ 
  filePath: string | undefined;
  record: DataRecord | undefined;
  onThumbnailClick: (filePath: string) => void;
}> = ({ filePath, record, onThumbnailClick }) => {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [fileExists, setFileExists] = React.useState<boolean | null>(null);
  
  React.useEffect(() => {
    let ignore = false;
    if (filePath && record) {
      window.electronAPI.getThumbnailDataUrlHybrid(record, filePath).then(res => {
        if (!ignore) setDataUrl(res);
      });
    } else {
      setDataUrl(null);
    }
    return () => { ignore = true; };
  }, [filePath, record]);

  React.useEffect(() => {
    let ignore = false;
    if (filePath) {
      window.electronAPI.checkFileExists(filePath).then(exists => {
        if (!ignore) setFileExists(exists);
      });
    } else {
      setFileExists(null);
    }
    return () => { ignore = true; };
  }, [filePath]);

  // 썸네일 삭제 이벤트 감지하여 캐시 초기화
  React.useEffect(() => {
    const handleThumbnailRegenerated = (event: CustomEvent<{ filePath: string }>) => {
      if (filePath && event.detail.filePath === filePath) {
        // 해당 파일의 썸네일이 변경되었으므로 캐시 초기화
        setDataUrl(null);
        // 새로운 썸네일 데이터 다시 로드
        if (record) {
          window.electronAPI.getThumbnailDataUrlHybrid(record, filePath).then(res => {
            setDataUrl(res);
          });
        }
      }
    };

    window.addEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
    return () => {
      window.removeEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
    };
  }, [filePath, record]);

  // 파일 확장자 추출
  const getFileExtension = (path: string) => {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    return ext;
  };

  // 썸네일이 해시 기반인지 여부
  const isHashBased = record && !record.thumbnailPath;
  const missingFile = !!filePath && fileExists === false;
  const canOpen = !!filePath && fileExists !== false;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative w-24 h-24">
            {dataUrl ? (
              <>
                <img 
                  src={dataUrl} 
                  alt="썸네일" 
                  className={`w-24 h-24 object-contain rounded border border-gray-700 cursor-pointer hover:opacity-80 ${missingFile ? 'opacity-40' : ''}`}
                  onClick={() => filePath && canOpen && onThumbnailClick(filePath)}
                />
                {isHashBased && (
                  <div className="absolute top-1 left-1 z-10">
                    <RefreshCw size={16} className="text-[#5865F2] drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]" />
                  </div>
                )}
                {missingFile && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <HelpCircle size={20} className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
                  </div>
                )}
              </>
            ) : filePath ? (
              // 파일은 있지만 썸네일이 없는 경우
              <div 
                className={`w-24 h-24 bg-gray-800 flex items-center justify-center text-gray-500 border border-gray-700 rounded cursor-pointer hover:bg-gray-700 transition-colors ${missingFile ? 'opacity-40' : ''}`}
                onClick={() => canOpen && onThumbnailClick(filePath)}
              >
                <span className="text-2xl">{missingFile ? '?' : '🖼️'}</span>
              </div>
            ) : (
              // 파일이 없는 경우
              <div className="w-24 h-24 bg-gray-900 flex items-center justify-center text-gray-600 border border-gray-800 rounded">
                <span className="text-2xl">-</span>
              </div>
            )}
            {/* 파일 확장자 표시 */}
            {filePath && (
              <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded">
                {getFileExtension(filePath)}
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
          {filePath ? (missingFile ? '원본 파일이 존재하지 않습니다' : dataUrl ? '썸네일 클릭 시 뷰어 모달 열기' : '클릭 시 뷰어 모달 열기 (썸네일 없음)') : '첨부파일이 없습니다'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const MainContent: React.FC = () => {
  const {
    categories,
    selectedCategoryId,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    deleteRecord,
    getCategoryRecords,
    loadRecords,
    selectCategory,
    showDbViewer,
  } = useERPStore();

  const {
    showLoading,
    hideLoading,
    setLoading: setGlobalLoading,
  } = useLoadingStore();

  // 검색어를 로컬 상태로 관리
  const [searchTerm, setSearchTerm] = useState('');

  // 컬럼 너비 관리 (카테고리별로 저장)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);

  // categories, selectedCategory, currentRecords에 기본값 보장
  const categoriesSafe = categories || [];
  const selectedCategorySafe = categoriesSafe.find(cat => cat.id === selectedCategoryId) || null;
  const currentRecordsSafe = selectedCategoryId ? getCategoryRecords(selectedCategoryId) || [] : [];

  const getRecordReferenceCount = useCallback((recordId: string, categoryId: string): number => {
    let count = 0;
    const currentCategory = categoriesSafe.find(cat => cat.id === categoryId);
    if (!currentCategory || !currentCategory.parentId) return 0;

    const parentCategory = categoriesSafe.find(cat => cat.id === currentCategory.parentId);
    if (!parentCategory) return 0;

    const relationFields = parentCategory.fields.filter(
      field => field.type === 'relation' && field.relationCategoryId === categoryId
    );

    if (relationFields.length > 0) {
      const records = getCategoryRecords(parentCategory.id);
      records.forEach(record => {
        relationFields.forEach(field => {
          const value = record.data[field.id];
          if (field.multiple && Array.isArray(value)) {
            count += value.filter(id => id === recordId).length;
          } else if (value === recordId) {
            count += 1;
          }
        });
      });
    }

    return count;
  }, [categoriesSafe, getCategoryRecords]);
  
  // 카테고리별 컬럼 너비 불러오기
  useEffect(() => {
    if (selectedCategoryId) {
      const savedWidths = localStorage.getItem(`columnWidths_${selectedCategoryId}`);
      if (savedWidths) {
        try {
          const widths = JSON.parse(savedWidths);
          setColumnWidths(widths);
        } catch (e) {
          console.error('컬럼 너비 불러오기 실패:', e);
        }
      } else {
        setColumnWidths({});
      }
    }
  }, [selectedCategoryId]);

  // 컬럼 너비 변경 시 저장
  useEffect(() => {
    if (selectedCategoryId && Object.keys(columnWidths).length > 0) {
      localStorage.setItem(`columnWidths_${selectedCategoryId}`, JSON.stringify(columnWidths));
    }
  }, [columnWidths, selectedCategoryId]);

  // Reset search field to 'all' when category changes
  useEffect(() => {
    setSearchField('all');
    setSearchTerm(''); // Reset search term when category changes
    setCurrentPage(1); // Reset pagination when category changes
    setSortField(''); // Reset sort field when category changes
    setSortDirection('asc'); // Reset sort direction when category changes
    setFileTypeFilter('all'); // Reset file type filter when category changes
    scrollTableToTop(); // Reset scroll position when category changes
  }, [selectedCategoryId, setCurrentPage]);

  // Reset pagination to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, setCurrentPage]);

  // Load related records when category changes
  useEffect(() => {
    if (selectedCategoryId) {
      const category = categoriesSafe.find(cat => cat.id === selectedCategoryId);
      if (category) {
        const relationFields = category.fields.filter(field => field.type === 'relation');
        const loadedCategories = new Set();
        const categoriesToLoad: string[] = [];
        
        // 이미 로드되지 않은 관계형 카테고리만 찾기
        relationFields.forEach(field => {
          if (field.relationCategoryId && !loadedCategories.has(field.relationCategoryId)) {
            // 이미 메모리에 로드된 카테고리인지 확인
            const existingRecords = getCategoryRecords(field.relationCategoryId);
            if (!existingRecords || existingRecords.length === 0) {
              categoriesToLoad.push(field.relationCategoryId);
            }
            loadedCategories.add(field.relationCategoryId);
          }
        });
        
        // 로드할 카테고리가 있으면 백그라운드에서 로드 (로딩 표시 없이)
        if (categoriesToLoad.length > 0) {
          const loadPromises = categoriesToLoad.map(categoryId => loadRecords(categoryId));
          Promise.all(loadPromises).catch((error) => {
            console.error('카테고리 로드 중 오류:', error);
          });
        }
      }
    }
  }, [selectedCategoryId, categoriesSafe, loadRecords, getCategoryRecords]);

  useEffect(() => {
    // 첫 카테고리 자동 선택 로직 제거 (대시보드가 기본 화면)
    // 카테고리를 수동으로 선택할 때만 로드
  }, []);

  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchField, setSearchField] = useState<string>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all'); // 'all', 'image', 'video', 'archive'

  // 컬럼 리사이즈 핸들러
  const handleResizeStart = useCallback((columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(columnId);
    setResizeStartX(e.clientX);
    const currentWidth = columnWidths[columnId] || getDefaultColumnWidth(columnId);
    setResizeStartWidth(currentWidth);
  }, [columnWidths]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const diff = e.clientX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + diff); // 최소 너비 50px
    setColumnWidths(prev => ({
      ...prev,
      [isResizing]: newWidth
    }));
  }, [isResizing, resizeStartX, resizeStartWidth]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(null);
  }, []);

  useEffect(() => {
    if (isResizing) {
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
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  // 기본 컬럼 너비 반환
  const getDefaultColumnWidth = useCallback((columnId: string): number => {
    if (columnId === '__thumbnail') return 112;
    if (columnId === '__refCount') return 96;
    return 150; // 기본 필드 너비
  }, []);

  // 컬럼 너비 가져오기
  const getColumnWidth = useCallback((columnId: string): number => {
    return columnWidths[columnId] || getDefaultColumnWidth(columnId);
  }, [columnWidths, getDefaultColumnWidth]);

  // 파일 필드 존재 여부
  const fileField = selectedCategorySafe?.fields.find(f => f.type === 'file');

  // 파일 확장자로 타입 확인 함수
  const getFileTypeFromPath = (filePath: string): 'image' | 'video' | 'archive' | 'other' => {
    if (!filePath || typeof filePath !== 'string') return 'other';
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) return 'image';
    if (['.mp4', '.avi', '.mkv', '.mov'].includes(ext)) return 'video';
    if (['.zip', '.7z'].includes(ext)) return 'archive';
    return 'other';
  };

  // Custom filtered records based on field-specific search and file type filter
  const customFilteredRecords = useMemo(() => {
    if (!selectedCategoryId) return [];
    
    // 먼저 파일 타입 필터 적용
    let filteredByFileType = currentRecordsSafe;
    if (fileField && fileTypeFilter !== 'all') {
      filteredByFileType = currentRecordsSafe.filter((record) => {
        const filePath = resolveFilePath(record.data[fileField.id], fileField);
        if (!filePath || filePath === '' || filePath === '-') return false;
        const fileType = getFileTypeFromPath(filePath);
        return fileType === fileTypeFilter;
      });
    }
    
    // 검색어가 없으면 파일 타입 필터만 적용한 결과 반환
    if (!searchTerm) return filteredByFileType;

    return filteredByFileType.filter((record) => {
      if (searchField === 'all') {
        const visibleFields = selectedCategorySafe?.fields.filter(f => !f.hidden) || [];
        return visibleFields.some((field) => {
          const value = record.data[field.id];

          // 관계형 필드 처리
          if (field.type === 'relation' && field.relationCategoryId) {
            const relatedCategory = categoriesSafe.find(cat => cat.id === field.relationCategoryId);
            if (!relatedCategory) return false;
            const relatedRecords = getCategoryRecords(field.relationCategoryId);
            const displayField = field.displayFieldId
              ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
              : relatedCategory.fields[0];

            if (field.multiple && Array.isArray(value)) {
              return value.some((relatedId) => {
                const relatedRecord = relatedRecords.find(r => r.id === relatedId);
                if (!relatedRecord) return false;
                const displayValue = relatedRecord.data[displayField?.id];
                return String(displayValue || '').toLowerCase().includes(searchTerm.toLowerCase());
              });
            } else {
              const relatedRecord = relatedRecords.find(r => r.id === value);
              if (!relatedRecord) return false;
              const displayValue = relatedRecord.data[displayField?.id];
              return String(displayValue || '').toLowerCase().includes(searchTerm.toLowerCase());
            }
          }

          // 일반 필드
          return String(value || '').toLowerCase().includes(searchTerm.toLowerCase());
        });
      } else {
        // 특정 필드만 검색
        const field = selectedCategorySafe?.fields.find(f => f.id === searchField);
        if (!field) return false;
        const value = record.data[field.id];

        if (field.type === 'relation' && field.relationCategoryId) {
          const relatedCategory = categoriesSafe.find(cat => cat.id === field.relationCategoryId);
          if (!relatedCategory) return false;
          const relatedRecords = getCategoryRecords(field.relationCategoryId);
          const displayField = field.displayFieldId
            ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
            : relatedCategory.fields[0];

          if (field.multiple && Array.isArray(value)) {
            return value.some((relatedId) => {
              const relatedRecord = relatedRecords.find(r => r.id === relatedId);
              if (!relatedRecord) return false;
              const displayValue = relatedRecord.data[displayField?.id];
              return String(displayValue || '').toLowerCase().includes(searchTerm.toLowerCase());
            });
          } else {
            const relatedRecord = relatedRecords.find(r => r.id === value);
            if (!relatedRecord) return false;
            const displayValue = relatedRecord.data[displayField?.id];
            return String(displayValue || '').toLowerCase().includes(searchTerm.toLowerCase());
          }
        }

        // 일반 필드
        return String(value || '').toLowerCase().includes(searchTerm.toLowerCase());
      }
    });
  }, [selectedCategoryId, searchTerm, searchField, fileTypeFilter, currentRecordsSafe, selectedCategorySafe, categoriesSafe, getCategoryRecords, fileField]);

  // Sorting
  const sortedRecords = useMemo(() => {
    if (!sortField) return customFilteredRecords;

    return [...customFilteredRecords].sort((a, b) => {
      if (sortField === '__refCount') {
        const countA = getRecordReferenceCount(a.id, selectedCategorySafe?.id || '');
        const countB = getRecordReferenceCount(b.id, selectedCategorySafe?.id || '');
        return sortDirection === 'asc' ? countA - countB : countB - countA;
      }

      if (sortField === '__thumbnail') {
        // 썸네일 유무에 따른 정렬
        if (!fileField) return 0; // 파일 필드가 없으면 정렬하지 않음
        
        const getFileValue = (record: DataRecord): string | null => {
          const value = resolveFilePath(record.data[fileField.id], fileField);
          if (!value || value === '' || value === '-') return null;
          return String(value);
        };
        
        const fileValueA = getFileValue(a);
        const fileValueB = getFileValue(b);
        
        const hasThumbnailA = fileValueA !== null;
        const hasThumbnailB = fileValueB !== null;
        
        // 둘 다 썸네일이 있거나 둘 다 없는 경우
        if (hasThumbnailA === hasThumbnailB) {
          return 0;
        }
        
        // 썸네일 유무에 따라 정렬
        if (hasThumbnailA && !hasThumbnailB) {
          return sortDirection === 'asc' ? -1 : 1; // 오름차순: 썸네일 있는 것 먼저, 내림차순: 썸네일 없는 것 먼저
        }
        if (!hasThumbnailA && hasThumbnailB) {
          return sortDirection === 'asc' ? 1 : -1; // 오름차순: 썸네일 없는 것 나중, 내림차순: 썸네일 없는 것 먼저
        }
        
        return 0;
      }

      let aValue = a.data[sortField];
      let bValue = b.data[sortField];

      // 관계형 필드인 경우 실제 데이터 값으로 정렬
      const sortFieldDef = selectedCategorySafe?.fields.find(f => f.id === sortField);
      if (sortFieldDef?.type === 'relation') {
        const relatedCategory = categoriesSafe.find(cat => cat.id === sortFieldDef.relationCategoryId);
        if (relatedCategory) {
          const relatedRecords = getCategoryRecords(sortFieldDef.relationCategoryId!);
          const displayField = sortFieldDef.displayFieldId
            ? relatedCategory.fields.find(f => f.id === sortFieldDef.displayFieldId)
            : relatedCategory.fields[0];
          
          if (sortFieldDef.multiple && Array.isArray(aValue) && Array.isArray(bValue)) {
            // 다중 선택 관계형 필드 정렬
            const aDisplayValues = aValue
              .map((id: string) => {
                const rec = relatedRecords.find(r => r.id === id);
                return rec ? String(rec.data[displayField?.id] || '') : '';
              })
              .filter(Boolean)
              .sort();
            const bDisplayValues = bValue
              .map((id: string) => {
                const rec = relatedRecords.find(r => r.id === id);
                return rec ? String(rec.data[displayField?.id] || '') : '';
              })
              .filter(Boolean)
              .sort();
            
            aValue = aDisplayValues.join(',');
            bValue = bDisplayValues.join(',');
          } else if (sortFieldDef.multiple) {
            // 다중 선택 필드이지만 배열이 아닌 경우 (잘못된 데이터)
            aValue = '';
            bValue = '';
          } else {
            // 단일 선택 관계형 필드 정렬
            const aRelatedRecord = relatedRecords.find(r => r.id === aValue);
            const bRelatedRecord = relatedRecords.find(r => r.id === bValue);
            
            aValue = aRelatedRecord ? String(aRelatedRecord.data[displayField?.id] || '') : '';
            bValue = bRelatedRecord ? String(bRelatedRecord.data[displayField?.id] || '') : '';
          }
        }
      }

      // 빈 값 처리 (모든 필드 타입에 적용)
      const isEmptyValue = (val: any): boolean => {
        if (val === null || val === undefined) return true;
        if (typeof val === 'string' && val.trim() === '') return true;
        if (Array.isArray(val) && val.length === 0) return true;
        if (typeof val === 'object' && Object.keys(val).length === 0) return true;
        return false;
      };

      const aIsEmpty = isEmptyValue(aValue);
      const bIsEmpty = isEmptyValue(bValue);

      // 둘 다 빈 값인 경우
      if (aIsEmpty && bIsEmpty) return 0;
      // a만 빈 값인 경우
      if (aIsEmpty) return sortDirection === 'asc' ? 1 : -1;
      // b만 빈 값인 경우
      if (bIsEmpty) return sortDirection === 'asc' ? -1 : 1;

      // Handle different data types
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [customFilteredRecords, sortField, sortDirection, selectedCategorySafe?.id, getRecordReferenceCount, fileField]);

  // Pagination
  const totalPages = Math.ceil(sortedRecords.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedRecords = sortedRecords.slice(startIndex, startIndex + itemsPerPage);

  // 테이블 컨테이너 ref 선언
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollTableToTop = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  };

  // 썸네일 생성/삭제 시 레코드 리스트 강제 리로드
  useEffect(() => {
    const handler = () => {
      if (selectedCategoryId) {
        showLoading('썸네일 업데이트 중...', 15000, true); // 15초 타임아웃, 취소 버튼 표시
        loadRecords(selectedCategoryId).finally(() => {
          hideLoading();
        });
      }
    };
    window.addEventListener('thumbnail:regenerated', handler);
    return () => window.removeEventListener('thumbnail:regenerated', handler);
  }, [selectedCategoryId, loadRecords, showLoading, hideLoading]);

  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DataRecord | null>(null);
  const [viewingRecord, setViewingRecord] = useState<DataRecord | null>(null);
  const [viewingCategory, setViewingCategory] = useState<string>('');
  const [expandedTags, setExpandedTags] = useState<{[key: string]: boolean}>({});
  const [csvDropdownOpen, setCsvDropdownOpen] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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

  // 뷰어 모달 상태
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerFilePath, setViewerFilePath] = useState<string>('');
  const [viewerFileType, setViewerFileType] = useState<'image' | 'video' | 'archive' | null>(null);
  const [viewerCategoryId, setViewerCategoryId] = useState<string>('');
  const [viewerRecordId, setViewerRecordId] = useState<string>('');
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);

  // Ctrl+좌우 방향키 페이지 이동 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 모달이 열려있으면 단축키 비활성화
      if (isRecordModalOpen || isViewModalOpen || viewerModalOpen || isConfirmDialogOpen || isAlertDialogOpen) {
        return;
      }

      if (e.key === 'F5' && selectedCategoryId) {
        e.preventDefault();
        showLoading('데이터 새로고침 중...', 30000, true); // 30초 타임아웃, 취소 버튼 표시
        loadRecords(selectedCategoryId).finally(() => {
          hideLoading();
          toast({
            title: "새로고침 완료",
            description: "레코드 목록이 새로고침되었습니다.",
          });
        });
      } else if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        if (selectedCategoryId) {
          setEditingRecord(null);
          setIsRecordModalOpen(true);
        }
      } else if (e.ctrlKey && e.key === 'ArrowRight') {
        if (currentPage < totalPages) {
          setCurrentPage(currentPage + 1);
          scrollTableToTop();
        }
      } else if (e.ctrlKey && e.key === 'ArrowLeft') {
        if (currentPage > 1) {
          setCurrentPage(currentPage - 1);
          scrollTableToTop();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedCategoryId, loadRecords, currentPage, totalPages, showLoading, hideLoading, isRecordModalOpen, isViewModalOpen, viewerModalOpen, isConfirmDialogOpen, isAlertDialogOpen]);

  // Ctrl+마우스 휠 페이지 이동 핸들러
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // 모달이 열려있으면 단축키 비활성화
      if (isRecordModalOpen || isViewModalOpen || viewerModalOpen || isConfirmDialogOpen || isAlertDialogOpen) {
        return;
      }

      if (e.ctrlKey && selectedCategoryId) {
        e.preventDefault();
        if (e.deltaY > 0) {
          // 아래로 스크롤 (다음 페이지)
          if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
            scrollTableToTop();
          }
        } else if (e.deltaY < 0) {
          // 위로 스크롤 (이전 페이지)
          if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
            scrollTableToTop();
          }
        }
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      document.removeEventListener('wheel', handleWheel);
    };
  }, [selectedCategoryId, currentPage, totalPages, isRecordModalOpen, isViewModalOpen, viewerModalOpen, isConfirmDialogOpen, isAlertDialogOpen]);

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

  const handleViewRelatedRecord = (record: DataRecord, category: Category) => {
    setViewingRecord(record);
    setViewingCategory(category.id);
    setIsViewModalOpen(true);
  };

  const handleDelete = (record: DataRecord) => {
    setRecordToDelete(record);
    setIsConfirmDialogOpen(true);
  };

  const confirmDelete = () => {
    if (recordToDelete) {
      deleteRecord(recordToDelete.id);
      setRecordToDelete(null);
    }
  };

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'info' | 'success' = 'info') => {
    setAlertDialogProps({ title, message, variant });
    setIsAlertDialogOpen(true);
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const pageNumber = parseInt(pageInputValue);
      if (pageNumber >= 1 && pageNumber <= totalPages) {
        setCurrentPage(pageNumber);
        setIsPageInputMode(false);
        setPageInputValue('');
        scrollTableToTop();
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
      scrollTableToTop();
    }
    setIsPageInputMode(false);
    setPageInputValue('');
  };

  const handlePageNumberClick = () => {
    setIsPageInputMode(true);
    setPageInputValue(currentPage.toString());
  };

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
                  <h1 className="text-xl font-bold text-discord-text">
                  {selectedCategorySafe?.name || '카테고리를 선택해주세요'}
                  </h1>
              </div>
              <div className="flex gap-3">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
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
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsBulkAddModalOpen(true);
                      }}
                    >
                      항목 다중 추가
                    </ContextMenuItem>
                    <ContextMenuItem disabled>
                      CSV 내보내기 (개발중)
                    </ContextMenuItem>
                    <ContextMenuItem disabled>
                      Excel 내보내기 (개발중)
                    </ContextMenuItem>
                    <ContextMenuItem disabled>
                      CSV 가져오기 (개발중)
                    </ContextMenuItem>
                    <ContextMenuItem disabled>
                      Excel 가져오기 (개발중)
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </div>

            {/* Search */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-muted" />
                <Input
                  ref={searchInputRef}
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
                  {selectedCategorySafe?.fields.filter(f => !f.hidden && f.type !== 'checkbox').map(field => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* 파일 확장자 필터 - 파일 필드가 있는 경우에만 표시 */}
              {fileField && (
                <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                  <SelectTrigger className="w-40 bg-discord-sidebar border-gray-600 text-discord-text">
                    <FileText size={16} className="mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-discord-sidebar border-gray-600">
                    <SelectItem value="all">전체 파일</SelectItem>
                    <SelectItem value="image">이미지</SelectItem>
                    <SelectItem value="video">동영상</SelectItem>
                    <SelectItem value="archive">압축파일</SelectItem>
                  </SelectContent>
                </Select>
              )}
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
              <div className="flex-1 flex flex-col min-h-0">
                {/* Table Container */}
                <div ref={tableContainerRef} className="flex-1 min-h-0 overflow-auto discord-scrollbar">
                  <table ref={tableRef} className="w-full table-fixed">
                    <thead className="sticky top-0 z-10 bg-discord-sidebar border-b border-gray-700">
                      <tr>
                        {fileField && (
                          <th 
                            className="px-2 py-2 text-left text-xs font-semibold text-discord-text cursor-pointer hover:bg-discord-hover relative"
                            style={{ width: `${getColumnWidth('__thumbnail')}px` }}
                            onClick={() => handleSort('__thumbnail')}
                          >
                            <div className="flex items-center gap-1 select-none">
                              썸네일
                              {sortField === '__thumbnail' && (
                                sortDirection === 'asc' ? (
                                  <SortAsc size={16} className="text-white" />
                                ) : (
                                  <SortDesc size={16} className="text-white" />
                                )
                              )}
                            </div>
                            <div
                              className={`absolute top-0 right-0 w-2 h-full cursor-col-resize transition-colors ${
                                isResizing === '__thumbnail' 
                                  ? 'bg-discord-accent' 
                                  : 'bg-transparent hover:bg-discord-accent'
                              }`}
                              style={{ marginRight: '-4px' }}
                              onMouseDown={(e) => handleResizeStart('__thumbnail', e)}
                            />
                          </th>
                        )}
                        {selectedCategorySafe?.fields.filter(f => !f.hidden).map(field => (
                          <th
                            key={field.id}
                            className={
                              field.type === 'checkbox'
                                ? 'px-2 py-2 text-xs font-semibold text-discord-text cursor-pointer hover:bg-discord-hover text-left truncate relative'
                                : 'px-2 py-2 text-left text-xs font-semibold text-discord-text cursor-pointer hover:bg-discord-hover relative'
                            }
                            style={{ width: `${getColumnWidth(field.id)}px` }}
                            onClick={() => handleSort(field.id)}
                          >
                            <div className="flex items-center gap-1 select-none">
                              {field.name}
                              {sortField === field.id && (
                                sortDirection === 'asc' ? (
                                  <SortAsc size={16} className="text-white" />
                                ) : (
                                  <SortDesc size={16} className="text-white" />
                                )
                              )}
                            </div>
                            <div
                              className={`absolute top-0 right-0 w-2 h-full cursor-col-resize transition-colors ${
                                isResizing === field.id 
                                  ? 'bg-discord-accent' 
                                  : 'bg-transparent hover:bg-discord-accent'
                              }`}
                              style={{ marginRight: '-4px' }}
                              onMouseDown={(e) => handleResizeStart(field.id, e)}
                            />
                          </th>
                        ))}
                        {/* 참조되는 카테고리인 경우에만 참조 횟수 컬럼 표시 */}
                        {selectedCategorySafe && categoriesSafe.some(cat => 
                          cat.fields.some(field => 
                            field.type === 'relation' && field.relationCategoryId === selectedCategorySafe.id
                          )
                        ) && (
                          <th 
                            className="px-2 py-2 text-left text-xs font-semibold text-discord-text cursor-pointer hover:bg-discord-hover relative"
                            style={{ width: `${getColumnWidth('__refCount')}px` }}
                            onClick={() => handleSort('__refCount')}
                          >
                            <div className="flex items-center gap-1 select-none">
                              참조 횟수
                              {sortField === '__refCount' && (
                                sortDirection === 'asc' ? (
                                  <SortAsc size={16} className="text-white" />
                                ) : (
                                  <SortDesc size={16} className="text-white" />
                                )
                              )}
                            </div>
                            <div
                              className={`absolute top-0 right-0 w-2 h-full cursor-col-resize transition-colors ${
                                isResizing === '__refCount' 
                                  ? 'bg-discord-accent' 
                                  : 'bg-transparent hover:bg-discord-accent'
                              }`}
                              style={{ marginRight: '-4px' }}
                              onMouseDown={(e) => handleResizeStart('__refCount', e)}
                            />
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRecords.map((record) => (
                        <ContextMenu key={record.id}>
                          <ContextMenuTrigger asChild>
                            <tr className="hover:bg-discord-hover group cursor-default">
                              {fileField && (
                                <td className="px-2 py-3 text-xs text-discord-text overflow-hidden relative" style={{ width: `${getColumnWidth('__thumbnail')}px` }}>
                                  <ThumbnailCell
                                    filePath={resolveFilePath(record.data[fileField.id], fileField) || undefined}
                                    record={record}
                                    onThumbnailClick={async (filePath) => {
                                      const fileType = await window.electronAPI.getFileType(filePath);
                                      if (fileType === 'image' || fileType === 'video') {
                                        setViewerFilePath(filePath);
                                        setViewerFileType(fileType);
                                        setViewerCategoryId(selectedCategorySafe?.id || '');
                                        setViewerRecordId(record.id);
                                        setViewerModalOpen(true);
                                      } else if (fileType === 'archive') {
                                        // 압축파일인 경우 읽을 수 있는 파일이 있는지 확인
                                        try {
                                          const files = await window.electronAPI.getArchiveFiles(filePath);
                                          const supportedFiles = files.filter(file => 
                                            !file.isDirectory && /\.(jpg|jpeg|png|gif|webp|mp4|avi|mkv|mov|wmv|flv|webm|txt)$/i.test(file.name)
                                          );
                                          
                                          if (supportedFiles.length === 0) {
                                            toast({ 
                                              title: '읽을 수 있는 파일이 없습니다', 
                                              description: '압축파일 내에 이미지, 동영상, 텍스트 파일이 없습니다.', 
                                              variant: 'destructive' 
                                            });
                                            return;
                                          }
                                          
                                          setViewerFilePath(filePath);
                                          setViewerFileType(fileType);
                                          setViewerCategoryId(selectedCategorySafe?.id || '');
                                          setViewerRecordId(record.id);
                                          setViewerModalOpen(true);
                                        } catch (error) {
                                          toast({ 
                                            title: '압축파일 열기 실패', 
                                            description: '압축파일을 읽을 수 없습니다.', 
                                            variant: 'destructive' 
                                          });
                                        }
                                      }
                                    }}
                                  />
                                </td>
                              )}
                              {selectedCategorySafe?.fields.filter(f => !f.hidden).map(field => (
                                <td key={field.id} className={`${
                                  field.type === 'checkbox'
                                    ? 'px-2 py-3 text-xs text-discord-text text-left overflow-hidden'
                                    : 'px-2 py-3 text-xs text-discord-text overflow-hidden'
                                }`} style={{ width: `${getColumnWidth(field.id)}px` }}>
                                  {formatFieldValue(field, record.data[field.id], categoriesSafe, getCategoryRecords, handleViewRelatedRecord)}
                                </td>
                              ))}
                              {/* 참조되는 카테고리인 경우에만 참조 횟수 표시 */}
                              {selectedCategorySafe && categoriesSafe.some(cat => 
                                cat.fields.some(field => 
                                  field.type === 'relation' && field.relationCategoryId === selectedCategorySafe.id
                                )
                              ) && (
                                <td className="px-2 py-3 text-xs text-discord-text text-left overflow-hidden" style={{ width: `${getColumnWidth('__refCount')}px` }}>
                                  {getRecordReferenceCount(record.id, selectedCategorySafe.id)}
                                </td>
                              )}
                            </tr>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleView(record);
                              }}
                            >
                              상세
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(record);
                              }}
                            >
                              수정
                            </ContextMenuItem>
                            <ContextMenuItem
                              className="text-discord-danger focus:text-discord-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(record);
                              }}
                            >
                              삭제
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="shrink-0 px-6 py-4 border-t border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-discord-muted">
                      전체 {sortedRecords.length}개 중 {startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedRecords.length)}개 표시
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCurrentPage(currentPage - 1);
                          scrollTableToTop();
                        }}
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
                        onClick={() => {
                          setCurrentPage(currentPage + 1);
                          scrollTableToTop();
                        }}
                        disabled={currentPage >= totalPages}
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
            onViewRecord={handleViewRelatedRecord}
          />

          <ViewerModal
            isOpen={viewerModalOpen}
            onClose={() => {
              setViewerModalOpen(false);
              setViewerFilePath('');
              setViewerFileType(null);
              setViewerCategoryId('');
              setViewerRecordId('');
            }}
            filePath={viewerFilePath}
            fileType={viewerFileType}
            categoryId={viewerCategoryId}
            recordId={viewerRecordId}
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
            message="이 항목을 삭제하시겠습니까?"
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

          <BulkAddModal
            isOpen={isBulkAddModalOpen}
            onClose={() => setIsBulkAddModalOpen(false)}
            category={selectedCategorySafe}
          />
        </div>
      )}
    </div>
  );
};

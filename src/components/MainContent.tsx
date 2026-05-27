import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Download, Eye, Edit, Trash2, ExternalLink, Filter, X, ChevronRight, LinkIcon, Upload, FileText, ChevronDown, ChevronUp, ArrowUpWideNarrow, ArrowDownWideNarrow, ArrowUp01, ArrowDown01, SortAsc, SortDesc, Check, RefreshCw, HelpCircle, ChevronsUpDown, LayoutGrid, TableProperties } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { DataRecord, FieldDefinition, Category } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { RecordModal } from './RecordModal';
import { ViewRecordModal } from './ViewRecordModal';
import { ViewerModal } from './ViewerModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { CategoryContent } from './CategoryContent';
import { DatabaseViewer } from './DatabaseViewer';
import { toast } from './ui/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
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
import { formatFieldDisplayValue } from '../lib/fieldFormat';
import { getRelationDisplayLabel } from '../utils/relationDisplay';
import { DatePicker } from './ui/date-picker';
import { cn } from '../lib/utils';

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

const getPercentageMeta = (field: FieldDefinition, value: any) => {
  const currentValue = value && typeof value === 'object' ? value.value : value;
  const maxValue = value && typeof value === 'object' ? value.max : 0;
  const numericValue = Number(currentValue || 0);
  const numericMax = Number(maxValue || 0);
  const safeMax = Number.isFinite(numericMax) ? Math.max(0, numericMax) : 0;
  const safeValue = Number.isFinite(numericValue) ? Math.min(Math.max(0, numericValue), safeMax) : 0;
  const percentValue = safeMax > 0 ? Math.round((safeValue / safeMax) * 100) : 0;

  return {
    value: safeValue,
    max: safeMax,
    percent: percentValue
  };
};

const parseNonNegativeNumberInput = (value: string): number => {
  if (value === '') return 0;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
};

const getFieldOptions = (field: FieldDefinition): string[] => {
  const legacyField = field as FieldDefinition & { options?: string[] };
  return legacyField.options ?? field.selectOptions ?? [];
};

const isFieldMultiple = (field: FieldDefinition): boolean => {
  const legacyField = field as FieldDefinition & { multiple?: boolean };
  return Boolean(legacyField.multiple ?? field.multiSelect);
};

const getPercentageTextClassName = (percent: number) => (
  percent >= 100 ? 'text-discord-accent font-semibold' : 'text-discord-text font-semibold'
);

const TOOLTIP_CONTENT_CLASSNAME = "relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words";

const copyOnCtrlClick = async (
  e: React.MouseEvent,
  text: string,
  successDescription: string,
  onSelectRow?: () => void
) => {
  onSelectRow?.();
  e.stopPropagation();

  if (!e.ctrlKey) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    toast({
      title: '복사 완료',
      description: successDescription,
    });
  } catch (error) {
    toast({
      title: '복사 실패',
      description: '클립보드 복사에 실패했습니다.',
      variant: 'destructive',
    });
  }
};

// URL 렌더링 함수
const renderUrl = (url: string, onSelectRow?: () => void, displayText?: string) => (
  <div className="flex items-center gap-2">
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="text-discord-accent px-1 py-0.5 rounded transition-colors truncate flex-1 cursor-pointer"
            onClick={async (e) => {
              onSelectRow?.();
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(url);
                toast({
                  title: '복사 완료',
                  description: 'URL이 클립보드에 복사되었습니다.',
                });
              } catch (error) {
                toast({
                  title: '복사 실패',
                  description: '클립보드 복사에 실패했습니다.',
                  variant: 'destructive',
                });
              }
            }}
          >
            {displayText || url}
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
const formatFieldValue = (field: FieldDefinition, value: any, categories: Category[], getCategoryRecords: (categoryId: string) => DataRecord[], onViewRelatedRecord?: (record: DataRecord, category: Category) => void, onSelectRow?: () => void) => {
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
    case 'longtext': {
      const formattedValue = formatFieldDisplayValue(field, value);
      if (urlPattern.test(formattedValue)) {
        return renderUrl(formattedValue, onSelectRow);
      }
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span 
                className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors truncate block" 
                onClick={async (e) => {
                  await copyOnCtrlClick(e, formattedValue, '값이 클립보드에 복사되었습니다.', onSelectRow);
                }}
              >
                {typeof formattedValue === 'string' ? renderTextWithHashtags(formattedValue) : String(formattedValue)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
              Ctrl+클릭하여 복사
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    case 'number':
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span 
                className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors truncate block" 
                onClick={async (e) => {
                  await copyOnCtrlClick(e, String(value), '숫자가 클립보드에 복사되었습니다.', onSelectRow);
                }}
              >
                {String(value)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
              Ctrl+클릭하여 복사
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

    case 'percentage': {
      const percentage = getPercentageMeta(field, value);
      return (
        <span className="text-discord-text px-1 py-0.5 rounded truncate block">
          {percentage.value} / {percentage.max}{' '}
          <span className={getPercentageTextClassName(percentage.percent)}>
            ({percentage.percent}%)
          </span>
        </span>
      );
    }
    
    case 'checkbox':
      return value ? <Check className="w-5 h-5 text-discord-accent" /> : <X className="w-5 h-5 text-discord-danger" />;
    
    case 'relation':
      if (!field.relationCategoryId) return String(value);
      const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
      if (!relatedCategory) return String(value);
      const relatedRecords = getCategoryRecords(field.relationCategoryId);
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
                          {getRelationDisplayLabel(relatedRecord, field, categories, getCategoryRecords)}
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
                    {getRelationDisplayLabel(relatedRecord, field, categories, getCategoryRecords)}
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
        return renderUrl(value, onSelectRow);
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
                          onSelectRow?.();
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
                  await copyOnCtrlClick(e, String(value), '값이 클립보드에 복사되었습니다.', onSelectRow);
                }}
              >
                {typeof value === 'string' ? renderTextWithHashtags(value) : String(value)}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
              Ctrl+클릭하여 복사
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
    'config:updated': CustomEvent<{
      listThumbnailFit?: 'cover' | 'contain';
      thumbnailPreviewScale?: number;
    }>;
  }
}

// 썸네일 렌더링 유틸
const ThumbnailCell: React.FC<{ 
  filePath: string | undefined;
  record: DataRecord | undefined;
  onThumbnailClick: (filePath: string) => void;
  thumbnailFit: 'cover' | 'contain';
  thumbnailOnly?: boolean;
  sizeClassName?: string;
  sizeStyle?: React.CSSProperties;
  onPreviewChange?: (preview: {
    dataUrl: string | null;
    filePath: string;
    missingFile: boolean;
    thumbnailFit: 'cover' | 'contain';
  } | null) => void;
}> = ({ filePath, record, onThumbnailClick, thumbnailFit, thumbnailOnly = false, sizeClassName = 'w-24 h-24', sizeStyle, onPreviewChange }) => {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [fileExists, setFileExists] = React.useState<boolean | null>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const hasRetriedAfterErrorRef = React.useRef(false);
  const reloadThumbnail = React.useCallback(() => {
    if (!filePath || !record) {
      setDataUrl(null);
      return;
    }

    window.electronAPI.getThumbnailDataUrlHybrid(record, filePath).then((res) => {
      setDataUrl(res);
    });
  }, [filePath, record]);
  
  React.useEffect(() => {
    let ignore = false;
    if (filePath && record) {
      hasRetriedAfterErrorRef.current = false;
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
    if (thumbnailOnly) {
      setFileExists(true);
      return () => { ignore = true; };
    }
    if (filePath) {
      window.electronAPI.checkFileExists(filePath).then(exists => {
        if (!ignore) setFileExists(exists);
      });
    } else {
      setFileExists(null);
    }
    return () => { ignore = true; };
  }, [filePath, thumbnailOnly]);

  const handleThumbnailImageError = React.useCallback(() => {
    if (!filePath || !record || hasRetriedAfterErrorRef.current) {
      setDataUrl(null);
      return;
    }

    hasRetriedAfterErrorRef.current = true;
    setDataUrl(null);

    window.electronAPI.regenerateThumbnail(filePath, {
      recordId: record.id,
      categoryId: record.categoryId,
    })
      .catch(() => null)
      .finally(() => {
        reloadThumbnail();
      });
  }, [filePath, record, reloadThumbnail]);

  // 썸네일 삭제 이벤트 감지하여 캐시 초기화
  React.useEffect(() => {
    const handleThumbnailRegenerated = (event: CustomEvent<{ filePath: string }>) => {
      if (filePath && event.detail.filePath === filePath) {
        // 해당 파일의 썸네일이 변경되었으므로 캐시 초기화
        setDataUrl(null);
        // 새로운 썸네일 데이터 다시 로드
        reloadThumbnail();
      }
    };

    window.addEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
    return () => {
      window.removeEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
    };
  }, [filePath, record, reloadThumbnail]);

  // 파일 확장자 추출
  const getFileExtension = (path: string) => {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    return ext;
  };

  // 썸네일이 해시 기반인지 여부
  const isHashBased = record && !record.thumbnailPath;
  const missingFile = !thumbnailOnly && !!filePath && fileExists === false;
  const canOpen = !!filePath && fileExists !== false && !thumbnailOnly;

  React.useEffect(() => {
    if (!onPreviewChange) return;
    if (!isHovered || !filePath) {
      onPreviewChange(null);
      return;
    }

    onPreviewChange({
      dataUrl,
      filePath,
      missingFile,
      thumbnailFit
    });
  }, [onPreviewChange, isHovered, filePath, dataUrl, missingFile, thumbnailFit]);

  const thumbnailBody = (
    <div
      className={cn("relative", sizeClassName)}
      style={sizeStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {dataUrl ? (
        <>
          <img 
            src={dataUrl} 
            alt="썸네일" 
            className={`${sizeClassName} ${thumbnailFit === 'contain' ? 'object-contain bg-black' : 'object-cover'} rounded border border-gray-700 ${canOpen ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
            style={sizeStyle}
            onClick={() => filePath && canOpen && onThumbnailClick(filePath)}
            onError={handleThumbnailImageError}
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
        <div 
          className={`${sizeClassName} bg-gray-800 flex items-center justify-center text-gray-500 border border-gray-700 rounded transition-colors ${canOpen ? 'cursor-pointer hover:bg-gray-700' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
          style={sizeStyle}
          onClick={() => canOpen && onThumbnailClick(filePath)}
        >
          <span className="text-2xl">{missingFile ? '?' : '🖼️'}</span>
        </div>
      ) : (
        <div className={`${sizeClassName} bg-gray-900 flex items-center justify-center text-gray-600 border border-gray-800 rounded`} style={sizeStyle}>
          <span className="text-2xl">-</span>
        </div>
      )}
      {filePath && !thumbnailOnly && (
        <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded">
          {getFileExtension(filePath)}
        </div>
      )}
    </div>
  );

  if (thumbnailOnly) {
    return thumbnailBody;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {thumbnailBody}
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
    invalidateCache,
    selectCategory,
    showDbViewer,
    pendingRecordFocus,
    clearPendingRecordFocus,
  } = useERPStore();

  const {
    showLoading,
    hideLoading,
    setLoading: setGlobalLoading,
  } = useLoadingStore();

  // 검색어를 로컬 상태로 관리
  const [searchTerm, setSearchTerm] = useState('');
  const [multiSearchTerms, setMultiSearchTerms] = useState<string[]>([]);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchField, setSearchField] = useState<string>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<string>('all'); // 'all', 'image', 'video', 'archive'
  const [multiSelectSearchOpen, setMultiSelectSearchOpen] = useState(false);
  const [recordListView, setRecordListView] = useState<'table' | 'gallery'>('table');

  // 컬럼 너비 관리 (카테고리별로 저장)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const tableRef = useRef<HTMLTableElement>(null);
  const [inlinePercentageOverrides, setInlinePercentageOverrides] = useState<Record<string, { value: number; max: number }>>({});
  const inlinePercentageRequestRef = useRef<Record<string, number>>({});

  // categories, selectedCategory, currentRecords에 기본값 보장
  const categoriesSafe = categories || [];
  const selectedCategorySafe = categoriesSafe.find(cat => cat.id === selectedCategoryId) || null;
  const currentRecordsSafe = selectedCategoryId ? getCategoryRecords(selectedCategoryId) || [] : [];
  const getInlinePercentageKey = useCallback((recordId: string, fieldId: string) => `${recordId}:${fieldId}`, []);

  useEffect(() => {
    if (selectedCategoryId && categoriesSafe.length > 0 && !selectedCategorySafe) {
      selectCategory(null);
    }
  }, [selectedCategoryId, selectedCategorySafe, selectCategory, categoriesSafe.length]);

  const getRecordFieldValue = useCallback((record: DataRecord, fieldId: string) => {
    const overrideKey = getInlinePercentageKey(record.id, fieldId);
    if (Object.prototype.hasOwnProperty.call(inlinePercentageOverrides, overrideKey)) {
      return inlinePercentageOverrides[overrideKey];
    }
    return record.data[fieldId];
  }, [getInlinePercentageKey, inlinePercentageOverrides]);

  const updateInlinePercentageValue = useCallback(async (
    record: DataRecord,
    field: FieldDefinition,
    nextRawValue: string
  ) => {
    const overrideKey = getInlinePercentageKey(record.id, field.id);
    const currentValue = getRecordFieldValue(record, field.id);
    const normalizedCurrent = currentValue && typeof currentValue === 'object'
      ? currentValue
      : { value: 0, max: 0 };
    const maxValue = Math.max(0, Number(normalizedCurrent.max || 0));
    const nextValue = {
      ...normalizedCurrent,
      value: Math.min(parseNonNegativeNumberInput(nextRawValue), maxValue),
      max: maxValue
    };

    setInlinePercentageOverrides((prev) => ({
      ...prev,
      [overrideKey]: nextValue
    }));

    const requestId = (inlinePercentageRequestRef.current[overrideKey] || 0) + 1;
    inlinePercentageRequestRef.current[overrideKey] = requestId;

    try {
      await window.electronAPI.updateRecord(record.id, {
        ...record.data,
        [field.id]: nextValue
      });
      if (inlinePercentageRequestRef.current[overrideKey] === requestId) {
        record.data[field.id] = nextValue;
      }
    } catch (error) {
      if (inlinePercentageRequestRef.current[overrideKey] === requestId) {
        const fallback = getPercentageMeta(field, record.data[field.id]);
        setInlinePercentageOverrides((prev) => ({
          ...prev,
          [overrideKey]: { value: fallback.value, max: fallback.max }
        }));
        toast({
          title: '저장 실패',
          description: `${field.name} 값을 저장하지 못했습니다.`,
          variant: 'destructive'
        });
      }
    }
  }, [getInlinePercentageKey, getRecordFieldValue]);

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
    setMultiSearchTerms([]);
    setCurrentPage(1); // Reset pagination when category changes
    setSortField(''); // Reset sort field when category changes
    setSortDirection('asc'); // Reset sort direction when category changes
    setFileTypeFilter('all'); // Reset file type filter when category changes
    setInlinePercentageOverrides({});
    scrollTableToTop(); // Reset scroll position when category changes
  }, [selectedCategoryId, setCurrentPage]);

  useEffect(() => {
    setMultiSelectSearchOpen(false);
  }, [selectedCategoryId, searchField]);

  // Reset pagination to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, multiSearchTerms, searchField, fileTypeFilter, setCurrentPage]);

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

  const visibleFields = useMemo(
    () => selectedCategorySafe?.fields.filter((field) => !field.hidden) ?? [],
    [selectedCategorySafe]
  );
  const selectedCategoryFieldMap = useMemo(
    () => new Map((selectedCategorySafe?.fields ?? []).map((field) => [field.id, field])),
    [selectedCategorySafe]
  );
  const selectedSearchField = useMemo(
    () => selectedCategoryFieldMap.get(searchField) ?? null,
    [selectedCategoryFieldMap, searchField]
  );
  const effectiveSearchField = (selectedSearchField || searchField === 'all') ? searchField : 'all';
  const isMultiValueSearchField = Boolean(
    selectedSearchField
    && (selectedSearchField.type === 'select' || selectedSearchField.type === 'relation')
    && isFieldMultiple(selectedSearchField)
  );
  const relationSearchOptions = useMemo(() => {
    if (!selectedSearchField || selectedSearchField.type !== 'relation' || !selectedSearchField.relationCategoryId) {
      return [];
    }

    const relatedCategory = categoriesSafe.find((cat) => cat.id === selectedSearchField.relationCategoryId);
    if (!relatedCategory) {
      return [];
    }

    const relatedRecords = getCategoryRecords(selectedSearchField.relationCategoryId);
    const displayField = selectedSearchField.displayFieldId
      ? relatedCategory.fields.find((field) => field.id === selectedSearchField.displayFieldId)
      : relatedCategory.fields[0];

    return Array.from(
      new Set(
        relatedRecords
          .map((record) => String(record.data[displayField?.id] || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [selectedSearchField, categoriesSafe, getCategoryRecords]);
  const normalizedMultiSearchTerms = useMemo(
    () => multiSearchTerms.map((term) => term.trim().toLowerCase()).filter(Boolean),
    [multiSearchTerms]
  );
  const hasActiveSearch = isMultiValueSearchField
    ? multiSearchTerms.length > 0
    : searchTerm.trim().length > 0;
  const multiSearchLabel = multiSearchTerms.length === 0
    ? ''
    : multiSearchTerms.join(', ');
  const toggleMultiSearchTerm = useCallback((term: string) => {
    setMultiSearchTerms((prev) => (
      prev.includes(term)
        ? prev.filter((item) => item !== term)
        : [...prev, term]
    ));
  }, []);

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
  const supportsGalleryView = Boolean(fileField);
  const showGalleryView = supportsGalleryView && recordListView === 'gallery';
  const galleryTitleField = useMemo(
    () => visibleFields.find((field) => field.type !== 'file') ?? null,
    [visibleFields]
  );
  const galleryDetailFields = useMemo(
    () => visibleFields.filter((field) => field.type !== 'file' && field.id !== galleryTitleField?.id).slice(0, 4),
    [visibleFields, galleryTitleField]
  );
  const hasIncomingReferences = useMemo(
    () => Boolean(
      selectedCategorySafe && categoriesSafe.some((cat) =>
        cat.fields.some((field) => field.type === 'relation' && field.relationCategoryId === selectedCategorySafe.id)
      )
    ),
    [categoriesSafe, selectedCategorySafe]
  );

  useEffect(() => {
    if (!fileField) {
      setRecordListView('table');
    }
  }, [fileField]);

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) return;

    const savedView = localStorage.getItem(`recordListView_${selectedCategoryId}`);
    if (savedView === 'gallery' || savedView === 'table') {
      setRecordListView(savedView);
      return;
    }

    setRecordListView('table');
  }, [selectedCategoryId, supportsGalleryView]);

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) return;
    localStorage.setItem(`recordListView_${selectedCategoryId}`, recordListView);
  }, [selectedCategoryId, supportsGalleryView, recordListView]);

  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const matchesSearchValue = useCallback((field: FieldDefinition, value: any) => {
    if (!normalizedSearchTerm && normalizedMultiSearchTerms.length === 0) return true;

    if (field.type === 'number') {
      const numericSearch = Number(searchTerm);
      return Number.isFinite(numericSearch) && Number(value) === numericSearch;
    }

    if (field.type === 'date') {
      return String(value || '').trim() === searchTerm.trim();
    }

    if (field.type === 'select') {
      if (isFieldMultiple(field) && Array.isArray(value)) {
        if (
          effectiveSearchField === field.id
          && isMultiValueSearchField
          && normalizedMultiSearchTerms.length > 0
        ) {
          return value.some((item) => normalizedMultiSearchTerms.includes(String(item || '').toLowerCase()));
        }
        return value.some((item) => String(item || '').toLowerCase() === normalizedSearchTerm);
      }
      return String(value || '').toLowerCase() === normalizedSearchTerm;
    }

    if (field.type === 'checkbox') {
      if (searchTerm !== 'true' && searchTerm !== 'false') return false;
      return Boolean(value) === (searchTerm === 'true');
    }

    if (field.type === 'percentage') {
      const percentage = getPercentageMeta(field, value);
      const numericSearch = Number(searchTerm);

      if (Number.isFinite(numericSearch)) {
        return percentage.value === numericSearch
          || percentage.max === numericSearch
          || percentage.percent === numericSearch;
      }

      return `${percentage.value} ${percentage.max} ${percentage.percent}`
        .toLowerCase()
        .includes(normalizedSearchTerm);
    }

    return String(value || '').toLowerCase().includes(normalizedSearchTerm);
  }, [normalizedSearchTerm, normalizedMultiSearchTerms, searchTerm, effectiveSearchField, isMultiValueSearchField]);

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
    if (!hasActiveSearch) return filteredByFileType;

    return filteredByFileType.filter((record) => {
      if (effectiveSearchField === 'all') {
        return visibleFields.some((field) => {
          const value = getRecordFieldValue(record, field.id);

          // 관계형 필드 처리
          if (field.type === 'relation' && field.relationCategoryId) {
            const relatedCategory = categoriesSafe.find(cat => cat.id === field.relationCategoryId);
            if (!relatedCategory) return false;
            const relatedRecords = getCategoryRecords(field.relationCategoryId);
            const displayField = field.displayFieldId
              ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
              : relatedCategory.fields[0];

            if (isFieldMultiple(field) && Array.isArray(value)) {
              return value.some((relatedId) => {
                const relatedRecord = relatedRecords.find(r => r.id === relatedId);
                if (!relatedRecord) return false;
                const displayValue = relatedRecord.data[displayField?.id];
                return String(displayValue || '').toLowerCase().includes(normalizedSearchTerm);
              });
            } else {
              const relatedRecord = relatedRecords.find(r => r.id === value);
              if (!relatedRecord) return false;
              const displayValue = relatedRecord.data[displayField?.id];
              return String(displayValue || '').toLowerCase().includes(normalizedSearchTerm);
            }
          }

          return matchesSearchValue(field, value);
        });
      } else {
        // 특정 필드만 검색
        const field = selectedCategoryFieldMap.get(effectiveSearchField);
        if (!field) return false;
        const value = getRecordFieldValue(record, field.id);

        if (field.type === 'relation' && field.relationCategoryId) {
          const relatedCategory = categoriesSafe.find(cat => cat.id === field.relationCategoryId);
          if (!relatedCategory) return false;
          const relatedRecords = getCategoryRecords(field.relationCategoryId);
          const displayField = field.displayFieldId
            ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
            : relatedCategory.fields[0];

          if (isFieldMultiple(field) && Array.isArray(value)) {
            return value.some((relatedId) => {
              const relatedRecord = relatedRecords.find(r => r.id === relatedId);
              if (!relatedRecord) return false;
              const displayValue = relatedRecord.data[displayField?.id];
              if (
                effectiveSearchField === field.id
                && isMultiValueSearchField
                && normalizedMultiSearchTerms.length > 0
              ) {
                return normalizedMultiSearchTerms.includes(String(displayValue || '').toLowerCase());
              }
              return String(displayValue || '').toLowerCase().includes(normalizedSearchTerm);
            });
          } else {
            const relatedRecord = relatedRecords.find(r => r.id === value);
            if (!relatedRecord) return false;
            const displayValue = relatedRecord.data[displayField?.id];
            return String(displayValue || '').toLowerCase().includes(normalizedSearchTerm);
          }
        }

        return matchesSearchValue(field, value);
      }
    });
  }, [selectedCategoryId, searchTerm, effectiveSearchField, fileTypeFilter, currentRecordsSafe, categoriesSafe, getCategoryRecords, fileField, getRecordFieldValue, matchesSearchValue, normalizedSearchTerm, hasActiveSearch, isMultiValueSearchField, normalizedMultiSearchTerms, visibleFields, selectedCategoryFieldMap]);

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

      let aValue = getRecordFieldValue(a, sortField);
      let bValue = getRecordFieldValue(b, sortField);

      // 관계형 필드인 경우 실제 데이터 값으로 정렬
      const sortFieldDef = selectedCategoryFieldMap.get(sortField);
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

      if (sortFieldDef?.type === 'number') {
        aValue = Number(aValue);
        bValue = Number(bValue);
      }

      if (sortFieldDef?.type === 'percentage') {
        aValue = getPercentageMeta(sortFieldDef, aValue).percent;
        bValue = getPercentageMeta(sortFieldDef, bValue).percent;
      }

      // Handle different data types
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [customFilteredRecords, sortField, sortDirection, selectedCategorySafe?.id, getRecordReferenceCount, fileField, getRecordFieldValue, categoriesSafe, getCategoryRecords, selectedCategoryFieldMap]);

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

  useEffect(() => {
    if (!pendingRecordFocus) return;
    if (pendingRecordFocus.categoryId !== selectedCategoryId) return;

    setSearchField('all');
    setSearchTerm('');
    setFileTypeFilter('all');

    const targetIndex = sortedRecords.findIndex((record) => record.id === pendingRecordFocus.recordId);
    if (targetIndex < 0) return;

    const targetPage = Math.floor(targetIndex / itemsPerPage) + 1;
    if (currentPage !== targetPage) {
      setCurrentPage(targetPage);
      return;
    }

    setSelectedRecordId(pendingRecordFocus.recordId);
    clearPendingRecordFocus();

    requestAnimationFrame(() => {
      const targetRow = tableContainerRef.current?.querySelector<HTMLElement>(
        `[data-record-id="${pendingRecordFocus.recordId}"]`
      );
      targetRow?.scrollIntoView({ block: 'center' });
    });
  }, [
    pendingRecordFocus,
    selectedCategoryId,
    sortedRecords,
    itemsPerPage,
    currentPage,
    setCurrentPage,
    clearPendingRecordFocus,
  ]);

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
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<{
    dataUrl: string | null;
    filePath: string;
    missingFile: boolean;
    thumbnailFit: 'cover' | 'contain';
  } | null>(null);
  const [thumbnailPreviewScale, setThumbnailPreviewScale] = useState(100);
  const [galleryZoom, setGalleryZoom] = useState(100);
  const [galleryZoomFeedbackVisible, setGalleryZoomFeedbackVisible] = useState(false);
  const galleryZoomFeedbackTimeoutRef = useRef<number | null>(null);

  // 뷰어 모달 상태
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerFilePath, setViewerFilePath] = useState<string>('');
  const [viewerFileType, setViewerFileType] = useState<'image' | 'video' | 'archive' | null>(null);
  const [viewerCategoryId, setViewerCategoryId] = useState<string>('');
  const [viewerRecordId, setViewerRecordId] = useState<string>('');
  const [isBulkAddModalOpen, setIsBulkAddModalOpen] = useState(false);
  const [listThumbnailFit, setListThumbnailFit] = useState<'cover' | 'contain'>('cover');

  useEffect(() => {
    let cancelled = false;

    window.electronAPI.getConfig().then((config) => {
      if (!cancelled) {
        setListThumbnailFit(config?.listThumbnailFit === 'contain' ? 'contain' : 'cover');
        setThumbnailPreviewScale(Math.min(200, Math.max(75, Number(config?.thumbnailPreviewScale ?? 100))));
      }
    }).catch(() => {
      if (!cancelled) {
        setListThumbnailFit('cover');
        setThumbnailPreviewScale(100);
      }
    });

    const handleConfigUpdated = (event: CustomEvent<{
      listThumbnailFit?: 'cover' | 'contain';
      thumbnailPreviewScale?: number;
    }>) => {
      if (event.detail.listThumbnailFit) {
        setListThumbnailFit(event.detail.listThumbnailFit);
      }
      if (event.detail.thumbnailPreviewScale) {
        setThumbnailPreviewScale(Math.min(200, Math.max(75, Number(event.detail.thumbnailPreviewScale))));
      }
    };

    window.addEventListener('config:updated', handleConfigUpdated as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('config:updated', handleConfigUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) return;

    const nextKey = `galleryZoomV2_${selectedCategoryId}`;
    const savedZoomV2 = Number(localStorage.getItem(nextKey));
    if (Number.isFinite(savedZoomV2) && savedZoomV2 >= 50 && savedZoomV2 <= 200) {
      setGalleryZoom(savedZoomV2);
      return;
    }

    const legacyZoom = Number(localStorage.getItem(`galleryZoom_${selectedCategoryId}`));
    if (Number.isFinite(legacyZoom) && legacyZoom >= 70 && legacyZoom <= 160) {
      setGalleryZoom(Math.min(200, Math.max(50, legacyZoom - 10)));
      return;
    }

    setGalleryZoom(100);
  }, [selectedCategoryId, supportsGalleryView]);

  useEffect(() => {
    if (!selectedCategoryId || !supportsGalleryView) return;
    localStorage.setItem(`galleryZoomV2_${selectedCategoryId}`, String(galleryZoom));
  }, [selectedCategoryId, supportsGalleryView, galleryZoom]);

  useEffect(() => {
    if (!showGalleryView) {
      setThumbnailPreview(null);
    }
  }, [showGalleryView]);

  const previewWidth = Math.round(320 * (thumbnailPreviewScale / 100));
  const previewHeight = Math.round(220 * (thumbnailPreviewScale / 100));
  const effectiveGalleryZoom = galleryZoom + 10;
  const galleryCardMinWidth = Math.round(220 * (effectiveGalleryZoom / 100));
  const galleryThumbnailHeight = Math.round(224 * (effectiveGalleryZoom / 100));
  const showGalleryZoomFeedback = useCallback(() => {
    setGalleryZoomFeedbackVisible(true);
    if (galleryZoomFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(galleryZoomFeedbackTimeoutRef.current);
    }
    galleryZoomFeedbackTimeoutRef.current = window.setTimeout(() => {
      setGalleryZoomFeedbackVisible(false);
      galleryZoomFeedbackTimeoutRef.current = null;
    }, 900);
  }, []);

  const handleGalleryWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || !showGalleryView) return;

    event.preventDefault();
    setGalleryZoom((prev) => {
      const next = Math.min(200, Math.max(50, prev + (event.deltaY < 0 ? 10 : -10)));
      return next;
    });
    showGalleryZoomFeedback();
  }, [showGalleryView, showGalleryZoomFeedback]);

  // Ctrl+좌우 방향키 페이지 이동 핸들러
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditableTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

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
      } else if (e.key === 'F2' && selectedCategoryId && selectedRecordId) {
        e.preventDefault();
        const selectedRecord = paginatedRecords.find(record => record.id === selectedRecordId)
          || sortedRecords.find(record => record.id === selectedRecordId);
        if (selectedRecord) {
          handleEdit(selectedRecord);
        }
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (paginatedRecords.length === 0) {
          return;
        }

        e.preventDefault();
        const currentIndex = paginatedRecords.findIndex(record => record.id === selectedRecordId);

        if (e.key === 'ArrowUp') {
          const nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
          setSelectedRecordId(paginatedRecords[nextIndex].id);
        } else {
          const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, paginatedRecords.length - 1);
          setSelectedRecordId(paginatedRecords[nextIndex].id);
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
  }, [selectedCategoryId, selectedRecordId, paginatedRecords, sortedRecords, loadRecords, currentPage, totalPages, showLoading, hideLoading, isRecordModalOpen, isViewModalOpen, viewerModalOpen, isConfirmDialogOpen, isAlertDialogOpen]);

  useEffect(() => {
    if (!selectedRecordId) return;
    const exists = sortedRecords.some(record => record.id === selectedRecordId);
    if (!exists) {
      setSelectedRecordId(null);
    }
  }, [selectedRecordId, sortedRecords]);

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

  const handleContextMenuDelete = async (event: Event | React.SyntheticEvent, record: DataRecord) => {
    event.stopPropagation();
    setSelectedRecordId(record.id);

    if ('shiftKey' in event && event.shiftKey) {
      await deleteRecord(record.id);
      return;
    }

    handleDelete(record);
  };

  const getGalleryFieldText = useCallback((record: DataRecord, field: FieldDefinition): string => {
    const value = getRecordFieldValue(record, field.id);

    if (value === null || value === undefined || value === '' || value === '-') {
      return '-';
    }

    if (Array.isArray(value) && value.length === 0) {
      return '-';
    }

    if (field.type === 'text' || field.type === 'longtext') {
      return String(formatFieldDisplayValue(field, value));
    }

    if (field.type === 'percentage') {
      const percentage = getPercentageMeta(field, value);
      return `${percentage.value} / ${percentage.max} (${percentage.percent}%)`;
    }

    if (field.type === 'checkbox') {
      return Boolean(value) ? '체크됨' : '체크 안 됨';
    }

    if (field.type === 'relation' && field.relationCategoryId) {
      const relatedCategory = categoriesSafe.find((category) => category.id === field.relationCategoryId);
      if (!relatedCategory) {
        return String(value);
      }

      const relatedRecords = getCategoryRecords(field.relationCategoryId);
      const displayField = field.displayFieldId
        ? relatedCategory.fields.find((relatedField) => relatedField.id === field.displayFieldId)
        : relatedCategory.fields[0];

      if (Array.isArray(value)) {
        const labels = value
          .map((relatedId) => {
            const relatedRecord = relatedRecords.find((item) => item.id === relatedId);
            return relatedRecord ? String(relatedRecord.data[displayField?.id] || relatedId) : String(relatedId);
          })
          .filter(Boolean);

        return labels.length > 0 ? labels.join(', ') : '-';
      }

      const relatedRecord = relatedRecords.find((item) => item.id === value);
      return relatedRecord ? String(relatedRecord.data[displayField?.id] || value) : String(value);
    }

    if (field.type === 'select' && Array.isArray(value)) {
      return value.map((item) => String(item)).join(', ');
    }

    return String(value);
  }, [categoriesSafe, getCategoryRecords, getRecordFieldValue]);

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

  const handleExportRecords = async (format: 'csv' | 'xlsx') => {
    if (!selectedCategorySafe) {
      showAlert('내보내기 실패', '먼저 카테고리를 선택해주세요.', 'warning');
      return;
    }

    try {
      const result = await window.electronAPI.exportCategoryRecords(selectedCategorySafe.id, format);

      if (!result.success) {
        if (!result.canceled) {
          showAlert('내보내기 실패', result.error || '파일 내보내기 중 오류가 발생했습니다.', 'error');
        }
        return;
      }

      const formatLabel = result.path?.toLowerCase().endsWith('.zip')
        ? 'CSV ZIP'
        : (format === 'xlsx' ? 'Excel' : 'CSV');
      showAlert(
        '내보내기 완료',
        `${selectedCategorySafe.name} 카테고리의 ${result.recordCount ?? 0}개 레코드를 ${formatLabel} 파일로 저장했습니다.`,
        'success'
      );
    } catch (error) {
      console.error(`Failed to export ${format}:`, error);
      showAlert('내보내기 실패', '파일 내보내기 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleImportRecords = async (format: 'csv' | 'xlsx') => {
    if (!selectedCategorySafe) {
      showAlert('가져오기 실패', '먼저 카테고리를 선택해주세요.', 'warning');
      return;
    }

    try {
      const result = await window.electronAPI.importCategoryRecords(selectedCategorySafe.id, format);

      if (!result.success) {
        if (!result.canceled) {
          showAlert('가져오기 실패', result.error || '파일 가져오기 중 오류가 발생했습니다.', 'error');
        }
        return;
      }

      invalidateCache(selectedCategorySafe.id);
      await loadRecords(selectedCategorySafe.id);

      const details = [
        `저장됨: ${result.importedCount ?? 0}건`,
        `중복으로 건너뜀: ${result.duplicateCount ?? 0}건`,
        `빈 행/해석 불가 행 건너뜀: ${result.skippedCount ?? 0}건`,
      ];

      if (result.unresolvedRelationCount) {
        details.push(`관계형 자동 연결 실패: ${result.unresolvedRelationCount}건`);
      }

      if (result.duplicateFields && result.duplicateFields.length > 0) {
        details.push(`중복 검사 필드: ${result.duplicateFields.join(', ')}`);
      }

      showAlert(
        '가져오기 완료',
        details.join('\n'),
        (result.duplicateCount || result.skippedCount || result.unresolvedRelationCount) ? 'warning' : 'success'
      );
    } catch (error) {
      console.error(`Failed to import ${format}:`, error);
      showAlert('가져오기 실패', '파일 가져오기 중 오류가 발생했습니다.', 'error');
    }
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

  if (!showDbViewer && selectedCategoryId && !selectedCategorySafe) {
    return (
      <div className="flex-1 h-full flex flex-col bg-discord-bg">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-discord-muted">카테고리 로딩 중...</div>
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
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleExportRecords('csv');
                      }}
                    >
                      CSV 내보내기
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleExportRecords('xlsx');
                      }}
                    >
                      Excel 내보내기
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleImportRecords('csv');
                      }}
                    >
                      CSV 가져오기
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleImportRecords('xlsx');
                      }}
                    >
                      Excel 가져오기
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </div>

            {/* Search */}
            <div className="flex gap-3">
              <div className="flex flex-1 gap-2">
                <div className="relative flex-1">
                  {(effectiveSearchField === 'all' || !selectedSearchField || ['text', 'longtext', 'file'].includes(selectedSearchField.type)) && (
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-discord-muted pointer-events-none" />
                  )}
                  {effectiveSearchField === 'all' || !selectedSearchField ? (
                    <Input
                      ref={searchInputRef}
                      placeholder="전체 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500"
                    />
                  ) : selectedSearchField.type === 'date' ? (
                    <DatePicker
                      value={searchTerm}
                      onChange={setSearchTerm}
                      placeholder={`${selectedSearchField.name} 날짜 선택...`}
                      className="bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500"
                    />
                  ) : selectedSearchField.type === 'select' && isFieldMultiple(selectedSearchField) ? (
                    <Popover open={multiSelectSearchOpen} onOpenChange={setMultiSelectSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={multiSelectSearchOpen}
                          className={cn(
                            "w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text hover:bg-discord-hover hover:text-discord-text",
                            multiSearchTerms.length === 0 && "text-discord-muted"
                          )}
                        >
                          <span className="truncate">
                            {multiSearchLabel || `${selectedSearchField.name} 선택...`}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                        <Command className="bg-discord-sidebar border-none">
                          <CommandInput
                            placeholder={`${selectedSearchField.name} 검색...`}
                            className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                          />
                          <CommandList className="max-h-[200px] overflow-y-auto">
                            <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">
                              항목을 찾을 수 없습니다.
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setMultiSearchTerms([]);
                                }}
                                className="text-discord-text hover:bg-discord-hover"
                              >
                                <Check className={cn("mr-2 h-4 w-4", multiSearchTerms.length === 0 ? "opacity-100" : "opacity-0")} />
                                선택 해제
                              </CommandItem>
                              {getFieldOptions(selectedSearchField).map((option) => (
                                <CommandItem
                                  key={option}
                                  value={option}
                                  onSelect={() => {
                                    toggleMultiSearchTerm(option);
                                  }}
                                  className="text-discord-text hover:bg-discord-hover"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      multiSearchTerms.includes(option) ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {option}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : selectedSearchField.type === 'relation' && isFieldMultiple(selectedSearchField) ? (
                    <Popover open={multiSelectSearchOpen} onOpenChange={setMultiSelectSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={multiSelectSearchOpen}
                          className={cn(
                            "w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text hover:bg-discord-hover hover:text-discord-text",
                            multiSearchTerms.length === 0 && "text-discord-muted"
                          )}
                        >
                          <span className="truncate">
                            {multiSearchLabel || `${selectedSearchField.name} 선택...`}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                        <Command className="bg-discord-sidebar border-none">
                          <CommandInput
                            placeholder={`${selectedSearchField.name} 검색...`}
                            className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                          />
                          <CommandList className="max-h-[200px] overflow-y-auto">
                            <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">
                              항목을 찾을 수 없습니다.
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setMultiSearchTerms([]);
                                }}
                                className="text-discord-text hover:bg-discord-hover"
                              >
                                <Check className={cn("mr-2 h-4 w-4", multiSearchTerms.length === 0 ? "opacity-100" : "opacity-0")} />
                                선택 해제
                              </CommandItem>
                              {relationSearchOptions.map((option) => (
                                <CommandItem
                                  key={option}
                                  value={option}
                                  onSelect={() => {
                                    toggleMultiSearchTerm(option);
                                  }}
                                  className="text-discord-text hover:bg-discord-hover"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      multiSearchTerms.includes(option) ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {option}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : selectedSearchField.type === 'relation' ? (
                    <Popover open={multiSelectSearchOpen} onOpenChange={setMultiSelectSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={multiSelectSearchOpen}
                          className={cn(
                            "w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text hover:bg-discord-hover hover:text-discord-text",
                            !searchTerm && "text-discord-muted"
                          )}
                        >
                          <span className="truncate">
                            {searchTerm || `${selectedSearchField.name} 선택...`}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                        <Command className="bg-discord-sidebar border-none">
                          <CommandInput
                            placeholder={`${selectedSearchField.name} 검색...`}
                            className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                          />
                          <CommandList className="max-h-[200px] overflow-y-auto">
                            <CommandEmpty className="py-2 pl-3 text-sm text-discord-muted">
                              항목을 찾을 수 없습니다.
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value=""
                                onSelect={() => {
                                  setSearchTerm('');
                                  setMultiSelectSearchOpen(false);
                                }}
                                className="text-discord-text hover:bg-discord-hover"
                              >
                                <Check className={cn("mr-2 h-4 w-4", !searchTerm ? "opacity-100" : "opacity-0")} />
                                선택 해제
                              </CommandItem>
                              {relationSearchOptions.map((option) => (
                                <CommandItem
                                  key={option}
                                  value={option}
                                  onSelect={() => {
                                    setSearchTerm(option);
                                    setMultiSelectSearchOpen(false);
                                  }}
                                  className="text-discord-text hover:bg-discord-hover"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      searchTerm === option ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {option}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : selectedSearchField.type === 'select' ? (
                    <Select value={searchTerm} onValueChange={setSearchTerm}>
                      <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
                        <SelectValue placeholder={`${selectedSearchField.name} 선택...`} />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-sidebar border-gray-600">
                        {getFieldOptions(selectedSearchField).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : selectedSearchField.type === 'checkbox' ? (
                    <Select value={searchTerm} onValueChange={setSearchTerm}>
                      <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
                        <SelectValue placeholder={`${selectedSearchField.name} 상태 선택...`} />
                      </SelectTrigger>
                      <SelectContent className="bg-discord-sidebar border-gray-600">
                        <SelectItem value="true">체크됨</SelectItem>
                        <SelectItem value="false">체크 안 됨</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      ref={searchInputRef}
                      type={selectedSearchField.type === 'number' || selectedSearchField.type === 'percentage' ? 'number' : 'text'}
                      placeholder={`${selectedSearchField.name} 검색...`}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`${selectedSearchField.type === 'number' || selectedSearchField.type === 'percentage' ? 'pr-4' : 'pl-10'} bg-discord-sidebar border-gray-600 text-discord-text placeholder:text-gray-500`}
                    />
                  )}
                </div>
                {(isMultiValueSearchField ? multiSearchTerms.length > 0 : Boolean(searchTerm)) && (
                  <button
                    onClick={() => {
                      if (isMultiValueSearchField) {
                        setMultiSearchTerms([]);
                      } else {
                        setSearchTerm('');
                      }
                    }}
                    className="shrink-0 px-3 rounded-md border border-gray-600 bg-discord-sidebar text-discord-muted hover:bg-discord-hover hover:text-discord-text transition-colors"
                    aria-label="검색어 지우기"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <Select
                value={effectiveSearchField}
                onValueChange={(value) => {
                  setSearchField(value);
                  setSearchTerm('');
                  setMultiSearchTerms([]);
                  setMultiSelectSearchOpen(false);
                }}
              >
                <SelectTrigger className="w-48 bg-discord-sidebar border-gray-600 text-discord-text">
                  <Filter size={16} className="mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-gray-600">
                  <SelectItem value="all">전체 필드</SelectItem>
                  {visibleFields.map(field => (
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
              {supportsGalleryView && (
                <TooltipProvider>
                  <div className="flex h-10 items-center border border-gray-600 bg-discord-sidebar shadow-sm">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setRecordListView('table')}
                          aria-label="테이블 뷰"
                          className={cn(
                            "flex h-full w-10 items-center justify-center border-r border-gray-600 transition-colors",
                            recordListView === 'table'
                              ? "bg-discord-accent text-white"
                              : "text-discord-muted hover:bg-discord-hover hover:text-discord-text"
                          )}
                        >
                          <TableProperties size={16} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center" className={TOOLTIP_CONTENT_CLASSNAME}>테이블 뷰</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setRecordListView('gallery')}
                          aria-label="갤러리 뷰"
                          className={cn(
                            "flex h-full w-10 items-center justify-center transition-colors",
                            recordListView === 'gallery'
                              ? "bg-discord-accent text-white"
                              : "text-discord-muted hover:bg-discord-hover hover:text-discord-text"
                          )}
                        >
                          <LayoutGrid size={16} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center" className={TOOLTIP_CONTENT_CLASSNAME}>갤러리 뷰</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col min-h-0">
            {sortedRecords.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-discord-text mb-2">
                    {hasActiveSearch ? '검색 결과가 없습니다' : '등록된 항목이 없습니다'}
                  </h3>
                  <p className="text-discord-muted mb-4">
                    {hasActiveSearch ? '다른 검색어로 시도해보세요' : '첫 번째 항목을 추가해보세요'}
                  </p>
                  {!hasActiveSearch && (
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
                {showGalleryView ? (
                  <div
                    ref={tableContainerRef}
                    className="relative flex-1 min-h-0 overflow-auto discord-scrollbar px-6 py-6"
                    onWheel={handleGalleryWheel}
                  >
                    {galleryZoomFeedbackVisible && (
                      <div className="pointer-events-none absolute bottom-6 right-6 z-20">
                        <div className="rounded-md border border-gray-600 bg-discord-sidebar/95 px-3 py-1.5 text-xs font-medium text-discord-text shadow-lg backdrop-blur-sm">
                          갤러리 크기 {galleryZoom}%
                        </div>
                      </div>
                    )}
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${galleryCardMinWidth}px, 1fr))` }}
                    >
                      {paginatedRecords.map((record) => {
                        const title = galleryTitleField ? getGalleryFieldText(record, galleryTitleField) : record.id;
                        return (
                          <ContextMenu key={record.id}>
                            <ContextMenuTrigger asChild>
                              <article
                                data-record-id={record.id}
                                className={cn(
                                  "group overflow-hidden rounded-xl border bg-discord-sidebar/70 shadow-sm transition-colors",
                                  selectedRecordId === record.id
                                    ? "border-discord-accent bg-discord-hover"
                                    : "border-gray-700 hover:border-gray-500 hover:bg-discord-hover"
                                )}
                                onClick={() => setSelectedRecordId(record.id)}
                                onDoubleClick={() => {
                                  setSelectedRecordId(record.id);
                                  handleView(record);
                                }}
                              >
                                <div className="border-b border-gray-800 bg-black/20 p-3">
                                  <ThumbnailCell
                                    filePath={resolveFilePath(record.data[fileField?.id || ''], fileField) || undefined}
                                    record={record}
                                    thumbnailFit={listThumbnailFit}
                                    thumbnailOnly={fileField?.thumbnailOnly}
                                    sizeClassName="w-full"
                                    sizeStyle={{ height: `${galleryThumbnailHeight}px` }}
                                    onPreviewChange={undefined}
                                    onThumbnailClick={(filePath) => {
                                      setViewerFilePath(filePath);
                                      setViewerFileType(null);
                                      setViewerCategoryId(selectedCategorySafe?.id || '');
                                      setViewerRecordId(record.id);
                                      setViewerModalOpen(true);
                                    }}
                                  />
                                </div>
                                <div className="space-y-3 p-4">
                                  <div>
                                    <h3 className="truncate text-sm font-semibold text-discord-text">
                                      {title}
                                    </h3>
                                  </div>
                                  <div className="space-y-2">
                                    {galleryDetailFields.map((field) => (
                                      <div key={field.id} className="flex items-start justify-between gap-3 text-xs">
                                        <span className="shrink-0 text-discord-muted">{field.name}</span>
                                        <span className="line-clamp-2 text-right text-discord-text">
                                          {getGalleryFieldText(record, field)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </article>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecordId(record.id);
                                  handleView(record);
                                }}
                              >
                                상세
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecordId(record.id);
                                  handleEdit(record);
                                }}
                              >
                                수정
                              </ContextMenuItem>
                              <ContextMenuItem
                                className="text-discord-danger focus:text-discord-danger"
                                onClick={async (e) => {
                                  await handleContextMenuDelete(e, record);
                                }}
                              >
                                삭제
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                    </div>
                  </div>
                ) : (
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
                                style={{ right: '0px' }}
                                onMouseDown={(e) => handleResizeStart('__thumbnail', e)}
                              />
                            </th>
                          )}
                          {visibleFields.map(field => (
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
                                style={{ right: '0px' }}
                                onMouseDown={(e) => handleResizeStart(field.id, e)}
                              />
                            </th>
                          ))}
                          {hasIncomingReferences && (
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
                                style={{ right: '0px' }}
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
                              <tr
                                data-record-id={record.id}
                                className={`${selectedRecordId === record.id ? 'bg-discord-hover' : 'hover:bg-discord-hover'} group cursor-default`}
                                onClick={() => setSelectedRecordId(record.id)}
                                onDoubleClick={() => {
                                  setSelectedRecordId(record.id);
                                  handleView(record);
                                }}
                              >
                                {fileField && (
                                  <td className="px-2 py-3 text-xs text-discord-text overflow-hidden relative" style={{ width: `${getColumnWidth('__thumbnail')}px` }}>
                                    <ThumbnailCell
                                      filePath={resolveFilePath(record.data[fileField.id], fileField) || undefined}
                                      record={record}
                                      thumbnailFit={listThumbnailFit}
                                      thumbnailOnly={fileField.thumbnailOnly}
                                      onPreviewChange={setThumbnailPreview}
                                      onThumbnailClick={(filePath) => {
                                        setViewerFilePath(filePath);
                                        setViewerFileType(null);
                                        setViewerCategoryId(selectedCategorySafe?.id || '');
                                        setViewerRecordId(record.id);
                                        setViewerModalOpen(true);
                                      }}
                                    />
                                  </td>
                                )}
                                {visibleFields.map(field => (
                                  <td key={field.id} className={`${
                                    field.type === 'checkbox'
                                      ? 'px-2 py-3 text-xs text-discord-text text-left overflow-hidden'
                                      : field.type === 'percentage'
                                        ? 'px-2 py-2 text-xs text-discord-text'
                                      : 'px-2 py-3 text-xs text-discord-text overflow-hidden'
                                  }`} style={{ width: `${getColumnWidth(field.id)}px` }}>
                                    {field.type === 'file' && field.thumbnailOnly
                                      ? ''
                                      : field.type === 'percentage'
                                        ? (() => {
                                            const currentValue = getRecordFieldValue(record, field.id);
                                            const percentage = getPercentageMeta(field, currentValue);
                                            const rawValue = currentValue && typeof currentValue === 'object' ? percentage.value : 0;
                                            const rawMax = currentValue && typeof currentValue === 'object' ? percentage.max : 0;
                                            return (
                                              <div className="flex items-center gap-2">
                                                <Input
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  value={rawValue}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedRecordId(record.id);
                                                  }}
                                                  onFocus={() => setSelectedRecordId(record.id)}
                                                  onChange={(e) => {
                                                    void updateInlinePercentageValue(record, field, e.target.value);
                                                  }}
                                                  className="h-8 min-w-0 bg-discord-sidebar border-gray-600 text-discord-text"
                                                />
                                                <span className="text-discord-muted">/</span>
                                                <Input
                                                  type="number"
                                                  min={0}
                                                  step="0.01"
                                                  value={rawMax}
                                                  readOnly
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedRecordId(record.id);
                                                  }}
                                                  onFocus={() => setSelectedRecordId(record.id)}
                                                  className="h-8 min-w-0 bg-discord-sidebar/70 border-gray-600 text-discord-muted cursor-default"
                                                />
                                                <span className={`min-w-[42px] text-right ${getPercentageTextClassName(percentage.percent)}`}>
                                                  {percentage.percent}%
                                                </span>
                                              </div>
                                            );
                                          })()
                                        : formatFieldValue(field, getRecordFieldValue(record, field.id), categoriesSafe, getCategoryRecords, handleViewRelatedRecord, () => setSelectedRecordId(record.id))}
                                  </td>
                                ))}
                                {hasIncomingReferences && selectedCategorySafe && (
                                  <td className="px-2 py-3 text-xs text-discord-text text-left overflow-hidden" style={{ width: `${getColumnWidth('__refCount')}px` }}>
                                    {getRecordReferenceCount(record.id, selectedCategorySafe.id)}
                                  </td>
                                )}
                              </tr>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                className="hidden"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecordId(record.id);
                                  handleView(record);
                                }}
                              >
                                상세
                              </ContextMenuItem>
                              <ContextMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecordId(record.id);
                                  handleEdit(record);
                                }}
                              >
                                수정
                              </ContextMenuItem>
                              <ContextMenuItem
                                className="text-discord-danger focus:text-discord-danger"
                                onClick={async (e) => {
                                  await handleContextMenuDelete(e, record);
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
                )}

                {thumbnailPreview && (
                  <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
                    <div
                      className="rounded-xl border border-[#3b3f46] bg-[#111214]/95 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm overflow-hidden"
                      style={{ width: `${previewWidth}px` }}
                    >
                      <div className="flex items-center justify-between border-b border-[#2b2d31] bg-[#1e1f22]/95 px-4 py-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#b5bac1]">
                          썸네일 미리보기
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(88,101,242,0.22),_transparent_58%),linear-gradient(180deg,_#232428_0%,_#15171a_100%)] p-4"
                        style={{ height: `${previewHeight}px` }}
                      >
                        {thumbnailPreview.dataUrl ? (
                          <img
                            src={thumbnailPreview.dataUrl}
                            alt="썸네일 미리보기"
                            className={`h-full w-full rounded-lg border border-[#2b2d31] shadow-[0_12px_24px_rgba(0,0,0,0.35)] ${
                              thumbnailPreview.thumbnailFit === 'contain' ? 'object-contain bg-black' : 'object-cover'
                            }`}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-[#3b3f46] bg-[#18191c] text-center">
                            <div>
                              <div className="text-4xl leading-none">
                                {thumbnailPreview.missingFile ? '?' : '🖼️'}
                              </div>
                              <p className="mt-3 text-sm text-[#dcddde]">
                                {thumbnailPreview.missingFile ? '원본 파일을 찾을 수 없습니다' : '썸네일을 불러오는 중입니다'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

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
          {selectedCategorySafe && (
            <RecordModal
              isOpen={isRecordModalOpen}
              onClose={() => {
                setIsRecordModalOpen(false);
                setEditingRecord(null);
              }}
              category={selectedCategorySafe}
              record={editingRecord}
            />
          )}

          {(categoriesSafe.find(cat => cat.id === viewingCategory) || selectedCategorySafe) && (
            <ViewRecordModal
              isOpen={isViewModalOpen}
              onClose={() => {
                setIsViewModalOpen(false);
                window.setTimeout(() => {
                  setViewingRecord(null);
                  setViewingCategory('');
                }, 200);
              }}
              category={categoriesSafe.find(cat => cat.id === viewingCategory) || selectedCategorySafe}
              record={viewingRecord}
              onViewRecord={handleViewRelatedRecord}
            />
          )}

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

          {selectedCategorySafe && (
            <BulkAddModal
              isOpen={isBulkAddModalOpen}
              onClose={() => setIsBulkAddModalOpen(false)}
              category={selectedCategorySafe}
            />
          )}
        </div>
      )}
    </div>
  );
};

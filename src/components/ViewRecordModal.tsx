import React, { useCallback, useEffect, useState } from 'react';
import { X, ExternalLink, ChevronRight, Check, HelpCircle, Upload } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { Category, DataRecord, FieldDefinition } from '../types';
import { Button } from './ui/button';
import { toast } from './ui/use-toast';
import { ViewerModal } from './ViewerModal';
import { TimeInput } from './TimeInput';
import { format } from "date-fns";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/tooltip";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./ui/context-menu";
import { resolveFilePath } from '../lib/pathResolver';
import { AnimatedModal } from './ui/animated-modal';
import { formatFieldDisplayValue } from '../lib/fieldFormat';

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

const copyOnCtrlClick = async (
  e: React.MouseEvent,
  text: string,
  successDescription: string
) => {
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

// 전역 이벤트 타입 정의
declare global {
  interface WindowEventMap {
    'thumbnail:regenerated': CustomEvent<{ filePath: string }>;
  }
}

interface ViewRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category;
  record: DataRecord | null;
  onViewRecord?: (record: DataRecord, category: Category) => void;
}

const SUPPORTED_THUMBNAIL_EXTS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.avi', '.mkv', '.mov',
  '.zip', '.7z'
];

export const ViewRecordModal: React.FC<ViewRecordModalProps> = ({
  isOpen,
  onClose,
  category,
  record,
  onViewRecord,
}) => {
  if (!record || !category) return null;

  const { categories, getCategoryRecords, selectCategory, loadRecords } = useERPStore();
  const { showLoading, hideLoading, setLoading: setGlobalLoading } = useLoadingStore();

  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerFilePath, setViewerFilePath] = useState<string>('');
  const [viewerFileType, setViewerFileType] = useState<'image' | 'video' | 'archive' | null>(null);
  const [hh, setHh] = React.useState(0);
  const [mm, setMm] = React.useState(0);
  const [ss, setSs] = React.useState(1); // 기본 1초
  const totalSec = hh * 3600 + mm * 60 + ss;
  const [duration, setDuration] = React.useState<number | null>(null); // 동영상 전체 길이(초)
  const [lastValidDuration, setLastValidDuration] = React.useState<number | null>(null);
  const [regenLoading, setRegenLoading] = React.useState(false);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Get parent categories path
  const getParentPath = useCallback((currentCategory: Category): Category[] => {
    const path: Category[] = [];
    let parent = currentCategory.parentId ? categories.find(c => c.id === currentCategory.parentId) : null;
    
    while (parent) {
      path.unshift(parent);
      parent = parent.parentId ? categories.find(c => c.id === parent.parentId) : null;
    }
    
    return path;
  }, [categories]);

  const handleCategoryClick = useCallback((categoryId: string) => {
    selectCategory(categoryId);
    onClose();
  }, [selectCategory, onClose]);

  // Footer 관련 변수들
  const fileField = category.fields.find(f => f.type === 'file');
  const filePath = resolveFilePath(fileField ? record?.data[fileField.id] : null, fileField);
  const isThumbnailOnlyFile = !!fileField?.thumbnailOnly;

  React.useEffect(() => {
    if (!isOpen || !record || !fileField || !filePath) return;
    const isVideoFile = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(filePath);
    if (!isVideoFile) return;
    const ts = record.data?.__thumbnailTimestamp;
    if (!Number.isFinite(Number(ts))) return;
    const total = Math.max(0, Number(ts));
    const newHh = Math.floor(total / 3600);
    const newMm = Math.floor((total % 3600) / 60);
    const newSs = Math.floor(total % 60);
    setHh(newHh);
    setMm(newMm);
    setSs(newSs);
  }, [isOpen, record, fileField, filePath]);

  useEffect(() => {
    let ignore = false;
    if (isThumbnailOnlyFile) {
      setFileExists(true);
      return () => { ignore = true; };
    }
    if (isOpen && filePath) {
      window.electronAPI.checkFileExists(filePath).then(exists => {
        if (!ignore) {
          setFileExists(exists);
          if (!exists) {
            toast({ title: '원본 파일이 존재하지 않습니다.', variant: 'destructive' });
            // 파일이 존재하지 않으면 해당 레코드의 북마크 삭제
            if (record && category) {
              (async () => {
                try {
                  if ((window.electronAPI as any).removeAllBookmarks) {
                    const result = await (window.electronAPI as any).removeAllBookmarks(category.id, record.id);
                    if (result && result.success) {
                    } else if (result && result.error) {
                      console.error('북마크 삭제 실패:', result.error);
                }
                  }
                } catch (error) {
                  console.error('북마크 삭제 중 오류:', error);
                  // 북마크 삭제 실패는 사용자에게 알리지 않음 (파일이 없어서 발생하는 정상적인 상황)
                }
              })();
            }
          }
        }
      });
    } else {
      setFileExists(null);
    }
    return () => { ignore = true; };
  }, [isOpen, filePath, record, category, isThumbnailOnlyFile]);

  const canOpenFile = !!filePath && filePath !== '' && filePath !== '-' && fileExists !== false && !isThumbnailOnlyFile;

  const handleThumbnailClick = (filePath: string) => {
    // 즉시 모달 열기 (파일 타입 확인은 모달 내에서 처리)
    setViewerFilePath(filePath);
    setViewerFileType(null); // null로 설정하여 모달 내에서 타입 확인
    setViewerModalOpen(true);
  };

  const handleViewerClose = () => {
    setViewerModalOpen(false);
    setViewerFilePath('');
    setViewerFileType(null);
  };

  // 참조 횟수 계산 함수
  const getRecordReferenceCount = useCallback((recordId: string, categoryId: string): number => {
    let count = 0;
    const currentCategory = categories.find(cat => cat.id === categoryId);
    if (!currentCategory || !currentCategory.parentId) return 0;

    const parentCategory = categories.find(cat => cat.id === currentCategory.parentId);
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
  }, [categories, getCategoryRecords]);

  const handleUrlClick = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
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

  const renderUrl = (url: string, displayText?: string) => (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left truncate"
              onClick={async (e) => {
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
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
            클릭하여 복사
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => handleUrlClick(e, url)}
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

  const formatFieldValue = (field: FieldDefinition, value: any, onViewRecord?: (record: DataRecord, category: Category) => void) => {
    // 파일 필드 특별 처리
    if (field.type === 'file') {
      const resolvedPath = resolveFilePath(value, field);
      if (!resolvedPath) return '-';
      
      const ext = resolvedPath ? resolvedPath.slice(resolvedPath.lastIndexOf('.')).toLowerCase() : '';
      const [thumbnailDataUrl, setThumbnailDataUrl] = React.useState<string | null>(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState<string | null>(null);
      const [resolvedExists, setResolvedExists] = React.useState<boolean | null>(null);

      React.useEffect(() => {
        let ignore = false;
        if (SUPPORTED_THUMBNAIL_EXTS.includes(ext) && resolvedPath) {
          setLoading(true);
          if (!record) {
            setLoading(false);
            setThumbnailDataUrl(null);
            setError(null);
            return () => { ignore = true; };
          }
          window.electronAPI.getThumbnailDataUrlHybrid(record, resolvedPath)
            .then(res => {
              if (!ignore) {
                if (res) {
                  setThumbnailDataUrl(res);
                  setError(null);
                } else {
                  setThumbnailDataUrl(null);
                  setError(null);
                }
                setLoading(false);
              }
            })
            .catch(e => {
              if (!ignore) {
                setThumbnailDataUrl(null);
                setError(String(e));
                setLoading(false);
              }
            });
        } else {
          setThumbnailDataUrl(null);
          setError(null);
        }
        return () => { ignore = true; };
      }, [resolvedPath, record, ext]);

      React.useEffect(() => {
        let ignore = false;
        if (field.thumbnailOnly) {
          setResolvedExists(true);
          return () => { ignore = true; };
        }
        if (resolvedPath) {
          window.electronAPI.checkFileExists(resolvedPath).then(exists => {
            if (!ignore) setResolvedExists(exists);
          });
        } else {
          setResolvedExists(null);
        }
        return () => { ignore = true; };
      }, [resolvedPath, field.thumbnailOnly]);

      // 썸네일 재생성 이벤트 처리
      React.useEffect(() => {
        const handleThumbnailRegenerated = (event: CustomEvent<{ filePath: string }>) => {
          if (event.detail.filePath === resolvedPath) {
            // 해당 파일의 썸네일이 재생성되었으므로 다시 로드
            setLoading(true);
            if (!record) {
              setLoading(false);
              setThumbnailDataUrl(null);
              setError(null);
              return;
            }
            window.electronAPI.getThumbnailDataUrlHybrid(record, resolvedPath)
              .then(res => {
                if (res) {
                  setThumbnailDataUrl(res);
                  setError(null);
                } else {
                  setThumbnailDataUrl(null);
                  setError(null);
                }
                setLoading(false);
              })
              .catch(e => {
                setThumbnailDataUrl(null);
                setError(String(e));
                setLoading(false);
              });
          }
        };

        window.addEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
        return () => {
          window.removeEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
        };
      }, [resolvedPath, record]);

      const missingFile = !field.thumbnailOnly && resolvedExists === false;
      const canOpen = resolvedExists !== false && !field.thumbnailOnly;

      if (SUPPORTED_THUMBNAIL_EXTS.includes(ext)) {
        return (
          <div className="flex flex-col items-start gap-2">
            {loading ? (
              <div className="w-[96px] h-[96px] bg-gray-800 flex items-center justify-center text-xs text-gray-400">로딩중...</div>
            ) : thumbnailDataUrl ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <img
                        src={thumbnailDataUrl}
                        alt="썸네일"
                        className={`w-[96px] h-[96px] object-contain bg-black rounded border border-gray-700 ${canOpen ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
                        onClick={() => canOpen && handleThumbnailClick(resolvedPath)}
                      />
                      {missingFile && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <HelpCircle size={16} className="text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                    {resolvedPath ? (missingFile ? '원본 파일이 존재하지 않습니다' : thumbnailDataUrl ? '썸네일 클릭 시 뷰어 모달 열기' : '클릭 시 뷰어 모달 열기 (썸네일 없음)') : '첨부파일이 없습니다'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : resolvedPath ? (
              // 파일은 있지만 썸네일이 없는 경우
              <div 
                className={`w-[96px] h-[96px] bg-gray-900 flex items-center justify-center text-xs text-gray-500 border border-gray-700 rounded transition-colors ${canOpen ? 'cursor-pointer hover:bg-gray-800' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
                onClick={() => canOpen && handleThumbnailClick(resolvedPath)}
              >
                {missingFile ? '파일 없음' : '썸네일 없음'}
              </div>
            ) : (
              // 파일이 없는 경우
              <div className="w-[96px] h-[96px] bg-gray-950 flex items-center justify-center text-xs text-gray-600 border border-gray-800 rounded">
                파일 없음
              </div>
            )}
            {!field.thumbnailOnly && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(resolvedPath);
                          toast({ title: '경로가 복사되었습니다.' });
                        } catch (e) {
                          toast({ title: '복사 실패', description: String(e), variant: 'destructive' });
                        }
                      }}
                    >
                      {resolvedPath}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                    복사하기
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      }
      if (field.thumbnailOnly) return '-';
      // 미지원 확장자: 기존 경로 복사 버튼만
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(resolvedPath);
                    toast({ title: '경로가 복사되었습니다.' });
                  } catch (e) {
                    toast({ title: '복사 실패', description: String(e), variant: 'destructive' });
                  }
                }}
              >
                {resolvedPath}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
              복사하기
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    // 빈 값 처리 - 레코드 리스트 테이블과 동일하게
    if (value === null || value === undefined || value === '' || value === '-') {
      return <span className="text-gray-500">-</span>;
    }

    // 배열이지만 비어있는 경우
    if (Array.isArray(value) && value.length === 0) {
      return <span className="text-gray-500">-</span>;
    }

    const urlPattern = /^https?:\/\/.+/i;

    switch (field.type) {
      case 'number':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span 
                  className="text-discord-text px-1 py-0.5 rounded transition-colors" 
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
      
      case 'text': {
        const strValue = formatFieldDisplayValue(field, value);
        const { hashtags, plainText } = parseHashtags(strValue);
        
        // URL 자동 감지 및 렌더링
        if (urlPattern.test(strValue)) {
          return renderUrl(strValue);
        }
        
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="whitespace-pre-wrap text-discord-text break-words overflow-wrap-anywhere px-1 py-0.5 rounded transition-colors inline-block" 
                  onClick={async (e) => {
                    await copyOnCtrlClick(e, strValue, '텍스트가 클립보드에 복사되었습니다.');
                  }}
                >
                  {renderTextWithHashtags(strValue)}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                Ctrl+클릭하여 복사
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      
      case 'longtext': {
        const strValue = String(value);
        const { hashtags, plainText } = parseHashtags(strValue);
        
        // URL 자동 감지 및 렌더링
        if (urlPattern.test(strValue)) {
          return renderUrl(strValue);
        }
        
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="whitespace-pre-wrap text-discord-text break-words overflow-wrap-anywhere px-3 py-2 rounded transition-colors border border-gray-600 max-h-[240px] overflow-y-auto block w-full" 
                  onClick={async (e) => {
                    await copyOnCtrlClick(e, strValue, '긴 텍스트가 클립보드에 복사되었습니다.');
                  }}
                >
                  {renderTextWithHashtags(strValue)}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                Ctrl+클릭하여 복사
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      
      case 'date': {
        const dateValue = typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
          ? format(new Date(value), "yyyy-MM")
          : format(new Date(value), "yyyy-MM-dd");
        
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span 
                  className="text-discord-text px-1 py-0.5 rounded transition-colors" 
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await navigator.clipboard.writeText(dateValue);
                      toast({ 
                        title: '복사 완료', 
                        description: '날짜가 클립보드에 복사되었습니다.' 
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
                  {dateValue}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                복사하기
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      
      case 'checkbox':
        return value ? <Check className="w-5 h-5 text-discord-accent" /> : <X className="w-5 h-5 text-discord-danger" />;
      
      case 'select':
        if (Array.isArray(value)) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-wrap gap-1">
                    {value.map((item) => (
                      <span
                        key={item}
                        className="px-2 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors"
                        style={{ cursor: 'pointer' }}
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
                    ))}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                  복사하기
                </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span 
                  className="text-discord-text px-1 py-0.5 rounded transition-colors" 
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await navigator.clipboard.writeText(String(value));
                      toast({ 
                        title: '복사 완료', 
                        description: '선택된 값이 클립보드에 복사되었습니다.' 
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
      
      case 'relation':
        if (!field.relationCategoryId) return String(value);
        
        const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
        if (!relatedCategory) return String(value);
        
        const relatedRecords = getCategoryRecords(field.relationCategoryId);
        const displayField = field.displayFieldId
          ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
          : relatedCategory.fields[0];
        
        if (Array.isArray(value)) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-wrap gap-1">
                    {value.map((relatedId) => {
                      const relatedRecord = relatedRecords.find(r => r.id === relatedId);
                      if (!relatedRecord) return null;
                      return (
                        <span
                          key={relatedId}
                          className="px-2 py-1 text-xs rounded bg-green-600/20 text-green-500 cursor-pointer hover:bg-green-600/30"
                          onClick={() => {
                            onClose();
                            setTimeout(() => {
                              if (onViewRecord) {
                                onViewRecord(relatedRecord, relatedCategory);
                              }
                            }, 200);
                          }}
                        >
                          {String(relatedRecord.data[displayField?.id] || relatedRecord.id)}
                        </span>
                      );
                    })}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                  복사하기
                </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
        } else {
          const relatedRecord = relatedRecords.find(r => r.id === value);
          return relatedRecord 
            ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="text-green-500 cursor-pointer hover:underline"
                      onClick={() => {
                        onClose();
                        setTimeout(() => {
                          if (onViewRecord) {
                            onViewRecord(relatedRecord, relatedCategory);
                          }
                        }, 200);
                      }}
                    >
                      {String(relatedRecord.data[displayField?.id] || relatedRecord.id)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                    상세 보기
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
            : String(value);
        }
      
      default:
        if (typeof value === 'string' && urlPattern.test(value)) {
          return renderUrl(value);
        }
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span 
                  className="text-discord-text px-1 py-0.5 rounded transition-colors" 
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
                  {String(value)}
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

  // 썸네일 전용 컴포넌트(상단에만 렌더)
  const TopThumbnail: React.FC<{ filePath: string; canOpenFile: boolean; categoryId?: string }> = ({ filePath, canOpenFile, categoryId }) => {
    const [dataUrl, setDataUrl] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [regenLoading, setRegenLoading] = React.useState(false);
    const [hasEmbeddedCover, setHasEmbeddedCover] = React.useState(false);
    const ext = filePath ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : '';
    const isVideo = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(ext);
    const loadRecords = useERPStore(state => state.loadRecords);
    const { showLoading: showGlobalLoading, hideLoading: hideGlobalLoading, setLoading: setGlobalLoading } = useLoadingStore();
    const missingFile = fileExists === false;

    // duration: record에서 우선 사용, 없으면 lazy fetch
    React.useEffect(() => {
      let ignore = false;
      if (isVideo && filePath) {
        if (record && typeof (record as any).duration === 'number' && (record as any).duration > 0) {
          setDuration((record as any).duration);
          setLastValidDuration((record as any).duration);
        } else {
          window.electronAPI.getVideoDuration(filePath).then(sec => {
            if (!ignore && sec && sec > 0) {
              setDuration(sec);
              setLastValidDuration(sec);
              // lazy update: DB에 duration 저장 요청
              window.electronAPI.updateRecord(record.id, { ...record.data, duration: sec });
            }
          });
        }
      } else {
        setDuration(null);
      }
      return () => { ignore = true; };
    }, [isVideo, filePath, record]);

    React.useEffect(() => {
      let ignore = false;
      if (isVideo && filePath) {
        window.electronAPI.getVideoCodecInfo(filePath)
          .then((info) => {
            if (!ignore) {
              setHasEmbeddedCover(info?.hasEmbeddedCover === true);
            }
          })
          .catch(() => {
            if (!ignore) {
              setHasEmbeddedCover(false);
            }
          });
      } else {
        setHasEmbeddedCover(false);
      }
/*        const codecInfo = await window.electronAPI.getVideoCodecInfo(filePath);
        const hasCoverAfterRemoval = codecInfo?.hasEmbeddedCover === true;
        setHasEmbeddedCover(hasCoverAfterRemoval);
        if (hasCoverAfterRemoval) {
          toast({
            title: '而ㅼ뒪? ?몃꽕???쒓굅 ?ㅽ뙣',
            description: '而ㅼ뒪? ?몃꽕?쇱씠 ?븘吏??섏씠??硫붾젰?곸뿉 ?꾨땲?뚯뒿?덈떎.',
            variant: 'destructive',
          });
          return;
        }
*/

      return () => { ignore = true; };
    }, [isVideo, filePath]);

    const reloadThumbnail = React.useCallback(() => {
      setLoading(true);
      if (!record) {
        setLoading(false);
        setDataUrl(null);
        setError(null);
        return Promise.resolve(null);
      }
      return window.electronAPI.getThumbnailDataUrlHybrid(record, filePath)
        .then(res => {
          if (res) {
            setDataUrl(res);
            setError(null);
          } else {
            setDataUrl(null);
            setError(null);
          }
          setLoading(false);
          return res;
        })
        .catch(e => {
          setDataUrl(null);
          setError(String(e));
          setLoading(false);
          throw e;
        });
    }, [filePath]);

    const handleRemoveCustomThumbnail = React.useCallback(async () => {
      if (!filePath) return;

      try {
        setRegenLoading(true);
        setGlobalLoading(true, '커스텀 썸네일 제거 중...');
        showGlobalLoading('커스텀 썸네일 제거 중...', 30000, true);

        const removed = await window.electronAPI.removeCustomThumbnail(filePath);
        if (!removed) {
          toast({
            title: '커스텀 썸네일 제거 실패',
            description: '커스텀 썸네일이 없거나 제거할 수 없습니다.',
            variant: 'destructive',
          });
          return;
        }

        const codecInfo = await window.electronAPI.getVideoCodecInfo(filePath);
        const hasCoverAfterRemoval = codecInfo?.hasEmbeddedCover === true;
        setHasEmbeddedCover(hasCoverAfterRemoval);
        if (hasCoverAfterRemoval) {
          toast({
            title: '커스텀 썸네일 제거 실패',
            description: '커스텀 썸네일이 아직 남아 있습니다.',
            variant: 'destructive',
          });
          return;
        }
        window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath } }));
        await reloadThumbnail();
        if (categoryId) {
          await loadRecords(categoryId);
        }
        toast({ title: '커스텀 썸네일을 제거했습니다.' });
      } catch (e) {
        toast({
          title: '커스텀 썸네일 제거 실패',
          description: String(e),
          variant: 'destructive',
        });
      } finally {
        setRegenLoading(false);
        hideGlobalLoading();
      }
    }, [filePath, categoryId, loadRecords, reloadThumbnail, hideGlobalLoading, setGlobalLoading, showGlobalLoading]);

    React.useEffect(() => {
      if (SUPPORTED_THUMBNAIL_EXTS.includes(ext) && filePath) {
        reloadThumbnail();
      } else {
        setDataUrl(null);
        setError(null);
      }
    }, [filePath, reloadThumbnail]);

    // 썸네일 재생성 이벤트 처리
    React.useEffect(() => {
      const handleThumbnailRegenerated = (event: CustomEvent<{ filePath: string }>) => {
        if (event.detail.filePath === filePath) {
          // 해당 파일의 썸네일이 재생성되었으므로 다시 로드
          reloadThumbnail();
        }
      };

      window.addEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
      return () => {
        window.removeEventListener('thumbnail:regenerated', handleThumbnailRegenerated as EventListener);
      };
    }, [filePath, reloadThumbnail]);

    // 시/분/초 입력값 보정 (duration 초과 시 자동 보정)
    React.useEffect(() => {
      if (!isVideo || duration == null) return;
      const totalSec = hh * 3600 + mm * 60 + ss;
      if (totalSec > duration) {
        // duration 내 최대값으로 보정
        let d = duration;
        const newHh = Math.floor(d / 3600);
        d = d % 3600;
        const newMm = Math.floor(d / 60);
        const newSs = d % 60;
        setHh(newHh);
        setMm(newMm);
        setSs(newSs);
      }
    }, [hh, mm, ss, duration, isVideo]);

    // duration이 0이거나 null이면 시간 입력 UI를 렌더하지 않음
    const effectiveDuration = lastValidDuration;

    if (!SUPPORTED_THUMBNAIL_EXTS.includes(ext)) return null;

    const thumbnailBody = loading ? (
      <div className="w-[320px] h-[320px] bg-gray-800 flex items-center justify-center text-lg text-gray-400 rounded-xl border border-gray-700">로딩중...</div>
    ) : dataUrl ? (
      <div className="relative">
        <img
          src={dataUrl}
          alt="썸네일"
          className={`w-[320px] h-[320px] object-contain bg-black rounded-xl border border-gray-700 transition ${canOpenFile ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
          onClick={() => canOpenFile && handleThumbnailClick(filePath)}
        />
        {missingFile && (
          <div className="absolute inset-0 flex items-center justify-center">
            <HelpCircle size={32} className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
          </div>
        )}
        {/* 파일 확장자명 표시 */}
        {filePath && !isThumbnailOnlyFile && (
          <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-sm px-2 py-1 rounded">
            {ext}
          </div>
        )}
      </div>
    ) : filePath ? (
      <div 
        className={`w-[320px] h-[320px] bg-gray-900 flex items-center justify-center text-lg text-gray-500 border border-gray-700 rounded-xl transition-colors ${canOpenFile ? 'cursor-pointer hover:bg-gray-800' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
        onClick={() => canOpenFile && handleThumbnailClick(filePath)}
      >
        {missingFile ? '파일 없음' : '썸네일 없음'}
      </div>
    ) : (
      <div className="w-[320px] h-[320px] bg-gray-950 flex items-center justify-center text-lg text-gray-600 border border-gray-800 rounded-xl">
        파일 없음
      </div>
    );

    return (
      <div className="flex flex-col items-center">
        {isThumbnailOnlyFile ? (
          thumbnailBody
        ) : dataUrl ? (
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
        ) : filePath ? (
          // 파일은 있지만 썸네일이 없는 경우
          <div 
            className={`w-[320px] h-[320px] bg-gray-900 flex items-center justify-center text-lg text-gray-500 border border-gray-700 rounded-xl transition-colors ${canOpenFile ? 'cursor-pointer hover:bg-gray-800' : 'cursor-default'} ${missingFile ? 'opacity-40' : ''}`}
            onClick={() => canOpenFile && handleThumbnailClick(filePath)}
          >
            {missingFile ? '파일 없음' : '썸네일 없음'}
          </div>
        ) : (
          // 파일이 없는 경우
          <div className="w-[320px] h-[320px] bg-gray-950 flex items-center justify-center text-lg text-gray-600 border border-gray-800 rounded-xl">
            파일 없음
          </div>
        )}
        {/* 시간 입력/슬라이더 부분만 분기 */}
        {isVideo && fileExists === true && !isThumbnailOnlyFile && (
          <div className="flex items-center justify-center mt-2">
            {(!effectiveDuration || effectiveDuration === 0) ? (
              <div className="text-xs text-gray-500">동영상 길이 불러오는 중...</div>
            ) : (
              <TimeInput
                hh={hh}
                mm={mm}
                ss={ss}
                maxDuration={effectiveDuration}
                onChange={(newHh, newMm, newSs) => {
                  setHh(newHh);
                  setMm(newMm);
                  setSs(newSs);
                }}
                onRegenerate={async (newHh, newMm, newSs) => {
                  setRegenLoading(true);
                  // 즉시 로딩 표시 (500ms 지연 없이)
                  setGlobalLoading(true, '썸네일 재생성 중...');
                  showLoading('썸네일 재생성 중...', 60000, true); // 60초 타임아웃, 취소 버튼 표시
                  try {
                    const totalSeconds = newHh * 3600 + newMm * 60 + newSs;
                    const res = await window.electronAPI.generateThumbnailWithTime(filePath, totalSeconds);
                    if (res) {
                      toast({ title: `썸네일이 ${newHh.toString().padStart(2, '0')}:${newMm.toString().padStart(2, '0')}:${newSs.toString().padStart(2, '0')} 지점에서 재생성되었습니다.` });
                      await window.electronAPI.updateRecord(record.id, { ...record.data, __thumbnailTimestamp: totalSeconds });
                      window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath } }));
                      await reloadThumbnail();
                      if (categoryId) {
                        await loadRecords(categoryId);
                      }
                    } else {
                      toast({ title: '썸네일 재생성 실패', description: '', variant: 'destructive' });
                    }
                  } catch (e) {
                    console.error('썸네일 재생성 오류:', e);
                    toast({ title: '썸네일 재생성 실패', description: String(e), variant: 'destructive' });
                  } finally {
                    setRegenLoading(false);
                    hideLoading();
                  }
                }}
                disabled={regenLoading || hasEmbeddedCover}
                loading={regenLoading}
                regenerateTooltip={hasEmbeddedCover ? '커스텀 썸네일이 있어서 재생성이 불가능합니다.' : undefined}
                rightAddon={(
                  <ContextMenu>
                    <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const result = await window.electronAPI.openImageFileDialog();
                              if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                                return;
                              }
                              const imagePath = result.filePaths[0];

                              setRegenLoading(true);
                              setGlobalLoading(true, '커스텀 썸네일 적용 중...');
                              showGlobalLoading('커스텀 썸네일 적용 중...', 30000, true);

                              const res = await window.electronAPI.setCustomThumbnail(filePath, imagePath);
                              if (res) {
                                setHasEmbeddedCover(true);
                                toast({ title: '커스텀 썸네일이 적용되었습니다.' });
                                window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath } }));
                                await reloadThumbnail();
                                if (categoryId) {
                                  await loadRecords(categoryId);
                                }
                              } else {
                                toast({
                                  title: '커스텀 썸네일 적용 실패',
                                  description: '이미지를 썸네일로 변환하지 못했습니다.',
                                  variant: 'destructive',
                                });
                              }
                            } catch (e) {
                              toast({
                                title: '커스텀 썸네일 적용 실패',
                                description: String(e),
                                variant: 'destructive',
                              });
                            } finally {
                              setRegenLoading(false);
                              hideGlobalLoading();
                            }
                          }}
                          disabled={regenLoading}
                          className="p-1.5 rounded border border-gray-600 text-discord-muted hover:bg-discord-hover hover:text-discord-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Upload size={12} />
                        </button>
                        </ContextMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                        이미지 파일을 선택해 썸네일로 등록
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                    <ContextMenuContent>
                      <ContextMenuItem
                        disabled={!hasEmbeddedCover || regenLoading}
                        onClick={handleRemoveCustomThumbnail}
                      >
                        커스텀 썸네일 제거
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )}
              />
            )}
          </div>
        )}
        
        {/* 이미지/압축파일용 썸네일 재생성 / 커스텀 업로드 버튼 영역 */}
        {!isVideo && fileExists === true && !isThumbnailOnlyFile && (
          <div className="flex items-center gap-2 mt-2">
            {/* 이미지/압축파일 자동 재생성 버튼 */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={async () => {
                      setRegenLoading(true);
                      // 즉시 로딩 표시 (500ms 지연 없이)
                      setGlobalLoading(true, '썸네일 재생성 중...');
                      showGlobalLoading('썸네일 재생성 중...', 30000, true); // 30초 타임아웃, 취소 버튼 표시
                      try {
                        const res = await window.electronAPI.regenerateThumbnail(filePath);
                        if (res) {
                          toast({ title: '썸네일이 재생성되었습니다.' });
                          window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath } }));
                          await reloadThumbnail();
                          if (categoryId) {
                            await loadRecords(categoryId);
                          }
                        } else {
                          toast({ title: '썸네일 재생성 실패', description: '', variant: 'destructive' });
                        }
                      } catch (e) {
                        toast({ title: '썸네일 재생성 실패', description: String(e), variant: 'destructive' });
                      } finally {
                        setRegenLoading(false);
                        hideGlobalLoading();
                      }
                    }}
                    disabled={regenLoading}
                    className="px-3 py-1 text-xs text-discord-muted bg-transparent hover:bg-discord-hover border border-gray-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {regenLoading ? '재생성 중...' : '썸네일 재생성'}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                  썸네일 재생성
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* 직접 업로드 버튼 (동영상/이미지/압축 공통) */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const result = await window.electronAPI.openImageFileDialog();
                        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                          return;
                        }
                        const imagePath = result.filePaths[0];

                        setRegenLoading(true);
                        setGlobalLoading(true, '커스텀 썸네일 적용 중...');
                        showGlobalLoading('커스텀 썸네일 적용 중...', 30000, true);

                        const res = await window.electronAPI.setCustomThumbnail(filePath, imagePath);
                        if (res) {
                          toast({ title: '커스텀 썸네일이 적용되었습니다.' });
                          window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath } }));
                          await reloadThumbnail();
                          if (categoryId) {
                            await loadRecords(categoryId);
                          }
                        } else {
                          toast({
                            title: '커스텀 썸네일 적용 실패',
                            description: '이미지를 썸네일로 변환하지 못했습니다.',
                            variant: 'destructive',
                          });
                        }
                      } catch (e) {
                        toast({
                          title: '커스텀 썸네일 적용 실패',
                          description: String(e),
                          variant: 'destructive',
                        });
                      } finally {
                        setRegenLoading(false);
                        hideGlobalLoading();
                      }
                    }}
                    disabled={regenLoading}
                    className="p-1.5 rounded border border-gray-600 text-discord-muted hover:bg-discord-hover hover:text-discord-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload size={12} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                  이미지 파일을 선택해 썸네일로 등록
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatedModal isOpen={isOpen} contentClassName="bg-discord-bg rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-end">
            <h2 className="text-xl font-bold text-discord-text">항목 상세 정보</h2>
            <span className="ml-2 text-sm text-discord-muted flex items-center">
              (
              {(() => {
                const parentPath = getParentPath(category);
                return (
                  <>
                    {parentPath.map((cat, idx) => (
                      <React.Fragment key={cat.id}>
                        <button
                          onClick={() => handleCategoryClick(cat.id)}
                          className="hover:text-discord-text hover:underline"
                        >
                          {cat.name}
                        </button>
                        <ChevronRight size={14} className="mx-1 text-discord-muted" />
                      </React.Fragment>
                    ))}
                    <span className="text-discord-muted font-semibold">{category.name}</span>
                  </>
                );
              })()}
              )
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        {/* 썸네일 최상단 렌더 */}
        {fileField && filePath && (
          <div className="flex flex-col items-center py-6 border-b border-gray-700 bg-discord-sidebar">
            <TopThumbnail filePath={filePath} canOpenFile={canOpenFile} categoryId={category.id} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 p-6 overflow-y-auto max-h-[calc(90vh-160px)] discord-scrollbar">
          <div className="space-y-6">
            {category.fields
              .filter(field => !(field.type === 'file' && field.thumbnailOnly))
              .sort((a, b) => a.order - b.order)
              .map(field => (
                <div key={field.id} className="border-b border-gray-800 pb-4 last:border-b-0">
                  <h3 className="text-sm font-semibold text-discord-muted uppercase tracking-wide mb-2">
                    {field.name}
                  </h3>
                  <div className="text-discord-text text-sm">
                    {/* 파일 필드는 상세 정보에서 썸네일 대신 경로 복사 버튼만 */}
                    {field.type === 'file' && !field.thumbnailOnly && record?.data[field.id] ? (
                      (() => {
                        const displayPath = resolveFilePath(record.data[field.id], field);
                        if (!displayPath) return '-';
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(displayPath);
                                      toast({ title: '경로가 복사되었습니다.' });
                                    } catch (e) {
                                      toast({ title: '복사 실패', description: String(e), variant: 'destructive' });
                                    }
                                  }}
                                >
                                  {displayPath}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                                복사하기
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()
                    ) : (
                      formatFieldValue(field, record.data[field.id], onViewRecord)
                    )}
                  </div>
                </div>
              ))}
            
            {/* 참조 횟수 - 해당 카테고리가 다른 카테고리에서 참조될 때만 표시 */}
            {categories.some(cat => 
              cat.fields.some(field => 
                field.type === 'relation' && field.relationCategoryId === category.id
              )
            ) && (
              <div className="border-b border-gray-800 pb-4">
                <h3 className="text-sm font-semibold text-discord-muted uppercase tracking-wide mb-2">
                  참조 횟수
                </h3>
                <div className="text-discord-text text-sm">
                  {getRecordReferenceCount(record.id, category.id)}
                </div>
              </div>
            )}
            
            {/* Metadata */}
            <div className="pt-4 border-t border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-discord-muted">생성일:</span>
                  <div className="text-discord-text">
                    {format(new Date(record.createdAt), "yyyy-MM-dd HH:mm:ss")}
                  </div>
                </div>
                <div>
                  <span className="text-discord-muted">수정일:</span>
                  <div className="text-discord-text">
                    {format(new Date(record.updatedAt), "yyyy-MM-dd HH:mm:ss")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end p-6 border-t border-gray-700">
          {canOpenFile && (
            <>
              <Button
                variant="outline"
                className="mr-2 hover:bg-discord-hover cursor-pointer"
                onClick={async () => {
                  try {
                    await window.electronAPI.openFile(filePath);
                  } catch (e) {
                    // TODO: 에러 안내
                  }
                }}
                disabled={!canOpenFile}
              >
                원본 파일 열기
              </Button>
            </>
          )}
          <Button onClick={onClose} className="bg-discord-accent hover:bg-blue-600">
            닫기
          </Button>
        </div>
      {viewerModalOpen && (
        <ViewerModal
          isOpen={viewerModalOpen}
          onClose={handleViewerClose}
          filePath={viewerFilePath}
          fileType={viewerFileType}
          categoryId={category.id}
          recordId={record.id}
        />
      )}
    </AnimatedModal>
  );
};

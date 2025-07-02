import React, { useCallback, useEffect, useState } from 'react';
import { X, ExternalLink, ChevronRight, Check } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Category, DataRecord, FieldDefinition } from '../types';
import { Button } from './ui/button';
import { toast } from './ui/use-toast';
import { ViewerModal } from './ViewerModal';
import { TimeInput } from './TimeInput';
import { format } from "date-fns";

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
  if (!isOpen || !record || !category) return null;

  const { categories, getCategoryRecords, selectCategory, loadRecords } = useERPStore();

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
  const filePath = fileField ? record?.data[fileField.id] : null;

  useEffect(() => {
    let ignore = false;
    if (isOpen && filePath) {
      window.electronAPI.checkFileExists(filePath).then(exists => {
        if (!ignore) {
          setFileExists(exists);
          if (!exists) {
            toast({ title: '원본 파일이 존재하지 않습니다.', variant: 'destructive' });
            // 파일이 존재하지 않으면 썸네일도 삭제
            window.electronAPI.deleteThumbnail(filePath).then(deleted => {
              if (deleted) {
                console.log('썸네일이 삭제되었습니다:', filePath);
                // 전역 이벤트 발생 - 레코드 리스트의 썸네일도 업데이트
                window.dispatchEvent(new CustomEvent('thumbnail:regenerated', {
                  detail: { filePath }
                }));
              }
            }).catch(error => {
              console.error('썸네일 삭제 실패:', error);
            });
          }
        }
      });
    } else {
      setFileExists(null);
    }
    return () => { ignore = true; };
  }, [isOpen, filePath]);

  const canOpenFile = !!filePath && filePath !== '' && filePath !== '-' && fileExists !== false;

  const handleThumbnailClick = async (filePath: string) => {
    const fileType = await window.electronAPI.getFileType(filePath);
    if (fileType === 'image' || fileType === 'video' || fileType === 'archive') {
      setViewerFilePath(filePath);
      setViewerFileType(fileType);
      setViewerModalOpen(true);
    } else {
      // 지원되지 않는 파일 타입은 기존 방식으로 처리
      window.electronAPI.openFile(filePath);
    }
  };

  const handleViewerClose = () => {
    setViewerModalOpen(false);
    setViewerFilePath('');
    setViewerFileType(null);
  };

  const handleUrlClick = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
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

  const renderUrl = (url: string) => (
    <button
      type="button"
      onClick={(e) => handleUrlClick(e, url)}
      className="text-discord-accent hover:underline flex items-center gap-2 break-all"
    >
      {url}
      <ExternalLink size={16} className="flex-shrink-0" />
    </button>
  );

  const formatFieldValue = (field: FieldDefinition, value: any) => {
    // 파일 필드 특별 처리
    if (field.type === 'file') {
      if (!value || value === '' || value === '-') return '-';
      
      const ext = value ? value.slice(value.lastIndexOf('.')).toLowerCase() : '';
      const [thumbnailDataUrl, setThumbnailDataUrl] = React.useState<string | null>(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState<string | null>(null);

      React.useEffect(() => {
        let ignore = false;
        if (SUPPORTED_THUMBNAIL_EXTS.includes(ext) && value) {
          setLoading(true);
          window.electronAPI.getThumbnailDataUrl(value)
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
      }, [value]);

      // 썸네일 재생성 이벤트 처리
      React.useEffect(() => {
        const handleThumbnailRegenerated = (event: CustomEvent<{ filePath: string }>) => {
          if (event.detail.filePath === value) {
            // 해당 파일의 썸네일이 재생성되었으므로 다시 로드
            setLoading(true);
            window.electronAPI.getThumbnailDataUrl(value)
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
      }, [value]);

      if (SUPPORTED_THUMBNAIL_EXTS.includes(ext)) {
        console.log('썸네일 dataUrl:', thumbnailDataUrl, '에러:', error);
        return (
          <div className="flex flex-col items-start gap-2">
            {loading ? (
              <div className="w-[96px] h-[96px] bg-gray-800 flex items-center justify-center text-xs text-gray-400">로딩중...</div>
            ) : thumbnailDataUrl ? (
              <div className="relative">
                <img
                  src={thumbnailDataUrl}
                  alt="썸네일"
                  className="w-[96px] h-[96px] object-contain rounded border border-gray-700 cursor-pointer hover:opacity-80"
                  onClick={() => handleThumbnailClick(value)}
                  title="썸네일 클릭 시 뷰어 모달 열기"
                />
                {/* 파일 확장자 표시 */}
                <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded">
                  {ext}
                </div>
              </div>
            ) : (
              <div className="w-[96px] h-[96px] bg-gray-900 flex items-center justify-center text-xs text-gray-500 border border-gray-700 rounded">썸네일 없음</div>
            )}
            <button
              type="button"
              className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(value);
                  toast({ title: '경로가 복사되었습니다.' });
                } catch (e) {
                  toast({ title: '복사 실패', description: String(e), variant: 'destructive' });
                }
              }}
              title="경로 복사"
            >
              {value}
            </button>
          </div>
        );
      }
      // 미지원 확장자: 기존 경로 복사 버튼만
      return (
        <button
          type="button"
          className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              toast({ title: '경로가 복사되었습니다.' });
            } catch (e) {
              toast({ title: '복사 실패', description: String(e), variant: 'destructive' });
            }
          }}
          title="경로 복사"
        >
          {value}
        </button>
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
          <span 
            className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors" 
            title={`${String(value)} (클릭하여 복사)`}
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
        );
      
      case 'text':
      case 'longtext': {
        const strValue = String(value);
        const { hashtags, plainText } = parseHashtags(strValue);
        
        // URL 자동 감지 및 렌더링
        if (urlPattern.test(strValue)) {
          return renderUrl(strValue);
        }
        
        return (
          <div 
            className="whitespace-pre-wrap text-discord-text break-words overflow-wrap-anywhere hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors" 
            title={`${strValue} (클릭하여 복사)`}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await navigator.clipboard.writeText(strValue);
                toast({ 
                  title: '복사 완료', 
                  description: '텍스트가 클립보드에 복사되었습니다.' 
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
            {renderTextWithHashtags(strValue)}
          </div>
        );
      }
      
      case 'date': {
        const dateValue = typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
          ? format(new Date(value), "yyyy-MM")
          : format(new Date(value), "yyyy-MM-dd");
        
        return (
          <span 
            className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors" 
            title={`${dateValue} (클릭하여 복사)`}
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
        );
      }
      
      case 'checkbox':
        return value ? <Check className="w-5 h-5 text-discord-accent" /> : <X className="w-5 h-5 text-discord-danger" />;
      
      case 'select':
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-1">
              {value.map((item) => (
                <span
                  key={item}
                  className="px-2 py-1 text-xs rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 transition-colors"
                  title={`${String(item)} (클릭하여 복사)`}
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
          );
        }
        return (
          <span 
            className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors" 
            title={`${String(value)} (클릭하여 복사)`}
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
                    title="상세 보기"
                  >
                    {String(relatedRecord.data[displayField?.id] || relatedRecord.id)}
                  </span>
                );
              })}
            </div>
          );
        } else {
          const relatedRecord = relatedRecords.find(r => r.id === value);
          return relatedRecord 
            ? (
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
                title="상세 보기"
              >
                {String(relatedRecord.data[displayField?.id] || relatedRecord.id)}
              </span>
            )
            : String(value);
        }
      
      default:
        if (typeof value === 'string' && urlPattern.test(value)) {
          return renderUrl(value);
        }
        return (
          <span 
            className="text-discord-text hover:bg-discord-hover/50 px-1 py-0.5 rounded transition-colors" 
            title={`${String(value)} (클릭하여 복사)`}
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
        );
    }
  };

  // 썸네일 전용 컴포넌트(상단에만 렌더)
  const TopThumbnail: React.FC<{ filePath: string; canOpenFile: boolean; categoryId?: string }> = ({ filePath, canOpenFile, categoryId }) => {
    const [dataUrl, setDataUrl] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [regenLoading, setRegenLoading] = React.useState(false);
    const ext = filePath ? filePath.slice(filePath.lastIndexOf('.')).toLowerCase() : '';
    const isVideo = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(ext);
    const loadRecords = useERPStore(state => state.loadRecords);

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

    const reloadThumbnail = React.useCallback(() => {
      setLoading(true);
      window.electronAPI.getThumbnailDataUrl(filePath)
        .then(res => {
          if (res) {
            setDataUrl(res);
            setError(null);
          } else {
            setDataUrl(null);
            setError(null);
          }
          setLoading(false);
        })
        .catch(e => {
          setDataUrl(null);
          setError(String(e));
          setLoading(false);
        });
    }, [filePath]);

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

    return (
      <div className="flex flex-col items-center">
        {loading ? (
          <div className="w-[320px] h-[320px] bg-gray-800 flex items-center justify-center text-lg text-gray-400 rounded-xl border border-gray-700">로딩중...</div>
        ) : dataUrl ? (
          <div className="relative">
            <img
              src={dataUrl}
              alt="썸네일"
              className="w-[320px] h-[320px] object-contain rounded-xl border border-gray-700 cursor-pointer hover:opacity-80 transition"
              onClick={() => canOpenFile && handleThumbnailClick(filePath)}
              title="썸네일 클릭 시 뷰어 모달 열기"
              style={{ maxWidth: 480, maxHeight: 480 }}
            />
            {/* 파일 확장자 표시 */}
            <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-sm px-2 py-1 rounded">
              {ext}
            </div>
          </div>
        ) : (
          <div className="w-[320px] h-[320px] bg-gray-900 flex items-center justify-center text-lg text-gray-500 border border-gray-700 rounded-xl">썸네일 없음</div>
        )}
        {/* 시간 입력/슬라이더 부분만 분기 */}
        {isVideo && fileExists === true && (
          <div className="flex items-center gap-2 mt-2">
            {(!effectiveDuration || effectiveDuration === 0)
              ? <div className="text-xs text-gray-500">동영상 길이 불러오는 중...</div>
              : <TimeInput
                  hh={hh}
                  mm={mm}
                  ss={ss}
                  maxDuration={effectiveDuration}
                  onChange={(newHh, newMm, newSs) => {
                    setHh(newHh);
                    setMm(newMm);
                    setSs(newSs);
                  }}
                  onRegenerate={async () => {
                    setRegenLoading(true);
                    try {
                      const res = await window.electronAPI.generateThumbnailWithTime(filePath, hh * 3600 + mm * 60 + ss);
                      if (res) {
                        toast({ title: `썸네일이 ${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')} 지점에서 재생성되었습니다.` });
                        reloadThumbnail();
                        window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath } }));
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
                    }
                  }}
                  disabled={regenLoading}
                  loading={regenLoading}
                />}
          </div>
        )}
        
        {/* 이미지/압축파일용 썸네일 재생성 버튼 */}
        {!isVideo && fileExists === true && (
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={async () => {
                setRegenLoading(true);
                try {
                  const res = await window.electronAPI.regenerateThumbnail(filePath);
                  if (res) {
                    toast({ title: '썸네일이 재생성되었습니다.' });
                    reloadThumbnail();
                    window.dispatchEvent(new CustomEvent('thumbnail:regenerated', { detail: { filePath } }));
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
                }
              }}
              disabled={regenLoading}
              className="px-3 py-1 text-xs text-discord-muted bg-transparent hover:bg-discord-hover border border-gray-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {regenLoading ? '재생성 중...' : '썸네일 재생성'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
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
              .sort((a, b) => a.order - b.order)
              .map(field => (
                <div key={field.id} className="border-b border-gray-800 pb-4 last:border-b-0">
                  <h3 className="text-sm font-semibold text-discord-muted uppercase tracking-wide mb-2">
                    {field.name}
                  </h3>
                  <div className="text-discord-text text-sm">
                    {/* 파일 필드는 상세 정보에서 썸네일 대신 경로 복사 버튼만 */}
                    {field.type === 'file' && record?.data[field.id] ? (
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-discord-sidebar text-discord-text border border-gray-600 hover:bg-discord-hover cursor-pointer text-xs select-all text-left"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(record.data[field.id]);
                            toast({ title: '경로가 복사되었습니다.' });
                          } catch (e) {
                            toast({ title: '복사 실패', description: String(e), variant: 'destructive' });
                          }
                        }}
                        title="경로 복사"
                      >
                        {record.data[field.id]}
                      </button>
                    ) : (
                      formatFieldValue(field, record.data[field.id])
                    )}
                  </div>
                </div>
              ))}
            
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
      </div>
      {viewerModalOpen && (
        <ViewerModal
          isOpen={viewerModalOpen}
          onClose={handleViewerClose}
          filePath={viewerFilePath}
          fileType={viewerFileType}
        />
      )}
    </div>
  );
};

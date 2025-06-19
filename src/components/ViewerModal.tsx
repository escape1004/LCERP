import React, { useEffect, useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download, FileImage, FileVideo, Archive, FileText, Play, Pause, Volume2, VolumeX, RotateCcw, Maximize, Minimize } from 'lucide-react';
import AdmZip from 'adm-zip';

interface ViewerModalProps {
  isOpen: boolean;
  filePath: string;
  fileType: 'image' | 'video' | 'archive' | null;
  onClose: () => void;
}

interface ArchiveFile {
  name: string;
  size: number;
  isDirectory: boolean;
  data?: Buffer;
}

export const ViewerModal: React.FC<ViewerModalProps> = ({ isOpen, filePath, fileType, onClose }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [archiveFiles, setArchiveFiles] = useState<ArchiveFile[]>([]);
  const [currentArchiveIndex, setCurrentArchiveIndex] = useState<number>(0);
  const [currentArchiveDataUrl, setCurrentArchiveDataUrl] = useState<string | null>(null);
  const [currentArchiveText, setCurrentArchiveText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // 비디오 관련 상태
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    const savedVolume = localStorage.getItem('videoVolume');
    return savedVolume ? parseFloat(savedVolume) : 1;
  });
  const [isMuted, setIsMuted] = useState(() => {
    const savedMuted = localStorage.getItem('videoMuted');
    return savedMuted ? JSON.parse(savedMuted) : false;
  });
  const [isLooping, setIsLooping] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!isOpen || !filePath || !fileType) {
      setDataUrl(null);
      setArchiveFiles([]);
      setCurrentArchiveIndex(0);
      setCurrentArchiveDataUrl(null);
      setCurrentArchiveText(null);
      setIsPlaying(false);
      return;
    }

    if (fileType === 'image' || fileType === 'video') {
      setLoading(true);
      window.electronAPI.getFileDataUrl(filePath).then((url) => {
        setDataUrl(url);
        setLoading(false);
      });
    } else if (fileType === 'archive') {
      loadArchiveFiles();
    } else {
      setDataUrl(null);
    }
  }, [isOpen, filePath, fileType]);

  useEffect(() => {
    if (fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      loadCurrentArchiveFile();
    }
  }, [currentArchiveIndex, archiveFiles, fileType]);

  // 볼륨 설정 저장
  useEffect(() => {
    localStorage.setItem('videoVolume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('videoMuted', JSON.stringify(isMuted));
  }, [isMuted]);

  // 비디오 이벤트 핸들러
  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  const handleLoopToggle = () => {
    setIsLooping(!isLooping);
    if (videoRef.current) {
      videoRef.current.loop = !isLooping;
    }
  };

  const handleFullscreenToggle = () => {
    if (videoRef.current) {
      if (!isFullscreen) {
        videoRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  };

  const handleVideoClick = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  // 전체화면 상태 감지
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const loadArchiveFiles = async () => {
    try {
      setLoading(true);
      const files = await window.electronAPI.getArchiveFiles(filePath);
      const supportedFiles = files.filter(file => 
        !file.isDirectory && /\.(jpg|jpeg|png|gif|webp|txt)$/i.test(file.name)
      ).sort((a, b) => a.name.localeCompare(b.name));
      
      setArchiveFiles(supportedFiles);
      setCurrentArchiveIndex(0);
    } catch (error) {
      console.error('압축 파일 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentArchiveFile = async () => {
    if (currentArchiveIndex >= 0 && currentArchiveIndex < archiveFiles.length) {
      try {
        const currentFile = archiveFiles[currentArchiveIndex];
        const fileExt = currentFile.name.toLowerCase().split('.').pop();
        
        if (fileExt === 'txt') {
          // 텍스트 파일인 경우
          const text = await window.electronAPI.getArchiveFileText(filePath, currentFile.name);
          setCurrentArchiveText(text);
          setCurrentArchiveDataUrl(null);
        } else {
          // 이미지 파일인 경우
          const dataUrl = await window.electronAPI.getArchiveFileDataUrl(filePath, currentFile.name);
          setCurrentArchiveDataUrl(dataUrl);
          setCurrentArchiveText(null);
        }
      } catch (error) {
        console.error('압축 파일 로드 실패:', error);
        setCurrentArchiveDataUrl(null);
        setCurrentArchiveText(null);
      }
    }
  };

  const handlePrevious = () => {
    if (currentArchiveIndex > 0) {
      setCurrentArchiveIndex(currentArchiveIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentArchiveIndex < archiveFiles.length - 1) {
      setCurrentArchiveIndex(currentArchiveIndex + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (fileType === 'archive') {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    }
  };

  if (!isOpen || !filePath || !fileType) return null;

  const currentFile = archiveFiles[currentArchiveIndex];
  const fileName = filePath.split(/[\\/]/).pop() || '';
  const currentFileExt = currentFile?.name.toLowerCase().split('.').pop();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="relative bg-discord-bg rounded-lg shadow-2xl w-[95vw] h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            {fileType === 'image' && <FileImage size={20} className="text-blue-400" />}
            {fileType === 'video' && <FileVideo size={20} className="text-green-400" />}
            {fileType === 'archive' && <Archive size={20} className="text-orange-400" />}
            <span className="text-discord-text font-medium truncate max-w-md">{fileName}</span>
            {fileType === 'archive' && (
              <span className="text-discord-muted text-sm">
                ({currentArchiveIndex + 1} / {archiveFiles.length})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-discord-accent"></div>
            </div>
          ) : (
            <>
              {/* Image Viewer */}
              {fileType === 'image' && dataUrl && (
                <img
                  src={dataUrl}
                  alt="이미지 뷰어"
                  className="max-w-full max-h-full object-contain rounded shadow-lg"
                  draggable={false}
                />
              )}

              {/* Video Player */}
              {fileType === 'video' && dataUrl && (
                <div 
                  className="relative w-full h-full flex items-center justify-center"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setShowControls(false)}
                >
                  <video
                    ref={videoRef}
                    src={dataUrl}
                    className="max-w-full max-h-[80vh] h-full object-contain bg-black"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        videoRef.current.volume = isMuted ? 0 : volume;
                        videoRef.current.muted = isMuted;
                        videoRef.current.loop = isLooping;
                      }
                    }}
                    onClick={handleVideoClick}
                    autoPlay
                  />
                  
                  {/* 커스텀 컨트롤 */}
                  <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="flex items-center gap-4">
                      {/* 재생/정지 버튼 */}
                      <button
                        onClick={handlePlayPause}
                        className="text-white hover:text-gray-300 transition-colors"
                        title={isPlaying ? '일시정지' : '재생'}
                      >
                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                      </button>
                      
                      {/* 볼륨 컨트롤 */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleMuteToggle}
                          className="text-white hover:text-gray-300 transition-colors"
                          title={isMuted ? '음소거 해제' : '음소거'}
                        >
                          {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </button>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                          className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                        />
                      </div>
                      
                      {/* 반복 버튼 */}
                      <button
                        onClick={handleLoopToggle}
                        className={`transition-colors ${isLooping ? 'text-blue-400' : 'text-white hover:text-gray-300'}`}
                        title={isLooping ? '반복 해제' : '반복 재생'}
                      >
                        <RotateCcw size={20} />
                      </button>
                      
                      {/* 전체화면 버튼 */}
                      <button
                        onClick={handleFullscreenToggle}
                        className="text-white hover:text-gray-300 transition-colors ml-auto"
                        title={isFullscreen ? '전체화면 해제' : '전체화면'}
                      >
                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Archive Viewer */}
              {fileType === 'archive' && (
                <div className="w-full h-full flex flex-row">
                  {/* 사이드 파일 리스트 */}
                  <div className="h-full w-48 bg-discord-sidebar border-r border-gray-700 overflow-y-auto flex-shrink-0">
                    <ul className="py-2">
                      {archiveFiles.map((file, idx) => {
                        const fileExt = file.name.toLowerCase().split('.').pop();
                        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
                        const isText = fileExt === 'txt';
                        
                        return (
                          <li
                            key={file.name}
                            className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-discord-hover rounded ${idx === currentArchiveIndex ? 'bg-discord-hover font-bold text-discord-accent' : ''}`}
                            onClick={() => setCurrentArchiveIndex(idx)}
                          >
                            {isImage && <FileImage size={14} className="text-blue-400 flex-shrink-0" />}
                            {isText && <FileText size={14} className="text-green-400 flex-shrink-0" />}
                            <span className="truncate flex-1">{file.name}</span>
                            {idx === currentArchiveIndex && <ChevronRight size={16} />}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  {/* 파일 내용 영역 */}
                  <div className="flex-1 flex flex-col h-full">
                    <div className="flex-1 flex items-center justify-center relative overflow-auto">
                      {currentFileExt === 'txt' ? (
                        // 텍스트 파일 표시
                        <div className="w-full h-full bg-discord-bg text-discord-text p-4 overflow-auto">
                          {currentArchiveText ? (
                            <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                              {currentArchiveText}
                            </pre>
                          ) : (
                            <div className="text-discord-muted">텍스트를 로드할 수 없습니다.</div>
                          )}
                        </div>
                      ) : (
                        // 이미지 파일 표시
                        currentArchiveDataUrl ? (
                          <img
                            src={currentArchiveDataUrl}
                            alt={currentFile?.name || '압축 파일 이미지'}
                            className="max-w-full max-h-full object-contain rounded shadow-lg block mx-auto"
                            style={{ maxHeight: '80vh', maxWidth: '100%' }}
                            draggable={false}
                          />
                        ) : (
                          <div className="text-discord-muted">이미지를 로드할 수 없습니다.</div>
                        )
                      )}
                    </div>
                    {/* Navigation Controls */}
                    <div className="flex-shrink-0 flex items-center justify-center gap-4 p-4">
                      <button
                        onClick={handlePrevious}
                        disabled={currentArchiveIndex <= 0}
                        className="p-2 rounded bg-discord-sidebar text-discord-text hover:bg-discord-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="이전 파일 (←)"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <div className="text-discord-text text-sm min-w-[200px] text-center">
                        {currentFile?.name}
                      </div>
                      <button
                        onClick={handleNext}
                        disabled={currentArchiveIndex >= archiveFiles.length - 1}
                        className="p-2 rounded bg-discord-sidebar text-discord-text hover:bg-discord-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="다음 파일 (→)"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}; 
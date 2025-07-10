import React, { useEffect, useState, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download, FileImage, FileVideo, Archive, FileText, Play, Pause, Volume2, VolumeX, RotateCcw, Maximize, Minimize, Bookmark, Clock } from 'lucide-react';
import AdmZip from 'adm-zip';

interface ViewerModalProps {
  isOpen: boolean;
  filePath: string;
  fileType: 'image' | 'video' | 'archive' | null;
  categoryId?: string;
  recordId?: string;
  onClose: () => void;
}

interface ArchiveFile {
  name: string;
  size: number;
  isDirectory: boolean;
  data?: Buffer;
}

export const ViewerModal: React.FC<ViewerModalProps> = ({ isOpen, filePath, fileType, categoryId = '', recordId = '', onClose }) => {
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
    return savedVolume ? parseFloat(savedVolume) : 0.5;
  });
  const [isMuted, setIsMuted] = useState(() => {
    const savedMuted = localStorage.getItem('videoMuted');
    return savedMuted ? JSON.parse(savedMuted) : false;
  });
  const [isLooping, setIsLooping] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  
  // 재생바 관련 상태 추가
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // 동영상 에러 상태 추가
  const [videoError, setVideoError] = useState<string | null>(null);
  // 동영상 코덱 정보 상태 추가
  const [codecInfo, setCodecInfo] = useState<any>(null);

  // 배속 관련 상태 추가
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    const savedSpeed = localStorage.getItem('videoPlaybackSpeed');
    return savedSpeed ? parseFloat(savedSpeed) : 1.0;
  });
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // 일반 이미지 상태 및 핸들러
  const [imgScale, setImgScale] = useState(1);
  const [imgOffset, setImgOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // 압축 이미지 상태 및 핸들러
  const [archiveImgScale, setArchiveImgScale] = useState(1);
  const [archiveImgOffset, setArchiveImgOffset] = useState({ x: 0, y: 0 });
  const [archiveIsPanning, setArchiveIsPanning] = useState(false);
  const archivePanStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const archiveImgRef = useRef<HTMLImageElement>(null);

  // 압축 동영상 상태 및 핸들러
  const [archiveVideoScale, setArchiveVideoScale] = useState(1);
  const [archiveVideoOffset, setArchiveVideoOffset] = useState({ x: 0, y: 0 });
  const [archiveVideoIsPanning, setArchiveVideoIsPanning] = useState(false);
  const archiveVideoPanStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const archiveVideoRef = useRef<HTMLVideoElement>(null);

  // 이미지 컨테이너 ref
  const imgContainerRef = useRef<HTMLDivElement>(null);

  // 상태 추가 (useState)
  const [imgRotation, setImgRotation] = useState(0); // 이미지 회전 각도
  const [videoRotation, setVideoRotation] = useState(0); // 동영상 회전 각도
  const [archiveImgRotation, setArchiveImgRotation] = useState(0); // 압축 이미지 회전 각도
  
  // 볼륨 오버레이 상태 추가
  const [showVolumeOverlay, setShowVolumeOverlay] = useState(false);
  const volumeOverlayTimeoutRef = useRef<NodeJS.Timeout>();

  // 1. 북마크 상태 및 불러오기
  const [bookmarks, setBookmarks] = useState<{ time: number; createdAt: string }[]>([]);

  // 파일 없음 상태 추가
  const [fileNotFound, setFileNotFound] = useState(false);

  // 파일이 없을 때 북마크 자동 삭제
  useEffect(() => {
    if (fileNotFound && fileType === 'video' && categoryId && recordId) {
      // 파일이 없으면 해당 레코드의 모든 북마크 삭제
      (async () => {
        try {
          if ((window.electronAPI as any).removeAllBookmarks) {
            const res = await (window.electronAPI as any).removeAllBookmarks(categoryId, recordId);
            if (res && res.success) {
              console.log('파일 없음으로 인한 북마크 자동 삭제 완료');
            } else if (res && res.error) {
              console.error('북마크 자동 삭제 실패:', res.error);
            }
          }
        } catch (error) {
          console.error('북마크 삭제 중 오류:', error);
        }
      })();
    }
  }, [fileNotFound, fileType, categoryId, recordId]);

  useEffect(() => {
    if (fileType === 'video' && isOpen && filePath && categoryId && recordId) {
      window.electronAPI.getBookmarks(categoryId, recordId).then(res => {
        if (res.success) setBookmarks(res.bookmarks);
        else setBookmarks([]);
      });
    } else {
      setBookmarks([]);
    }
  }, [fileType, isOpen, filePath, categoryId, recordId]);

  useEffect(() => {
    if (!isOpen || !filePath || !fileType) {
      setDataUrl(null);
      setArchiveFiles([]);
      setCurrentArchiveIndex(0);
      setCurrentArchiveDataUrl(null);
      setCurrentArchiveText(null);
      setIsPlaying(false);
      setVideoError(null);
      setFileNotFound(false);
      return;
    }

    if (fileType === 'image' || fileType === 'video') {
      setLoading(true);
      setFileNotFound(false);
      window.electronAPI.getFileDataUrl(filePath).then((url) => {
        if (url === null || url === 'error') {
          setFileNotFound(true);
          setDataUrl(null);
        } else if (fileType === 'video' && url === 'stream') {
          // 스트리밍 서버 URL로 연결
          // filePath에 한글/공백 등 특수문자 있을 수 있으므로 encodeURIComponent 적용
          const port = (window as any).videoServerPort || 17345;
          const streamUrl = `http://localhost:${port}/video?path=${encodeURIComponent(filePath)}`;
          setDataUrl(streamUrl);
        } else {
          setDataUrl(url);
        }
        setLoading(false);
      }).catch((error) => {
        console.error('파일 로드 실패:', error);
        setFileNotFound(true);
        setDataUrl(null);
        setLoading(false);
      });
    } else if (fileType === 'archive') {
      setLoading(true);
      setFileNotFound(false);
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

  // 배속 설정 저장
  useEffect(() => {
    localStorage.setItem('videoPlaybackSpeed', playbackSpeed.toString());
  }, [playbackSpeed]);

  // 동영상 볼륨 설정
  useEffect(() => {
    if (videoRef.current && fileType === 'video') {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
    }
    if (archiveVideoRef.current && fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        archiveVideoRef.current.volume = isMuted ? 0 : volume;
        archiveVideoRef.current.muted = isMuted;
      }
    }
  }, [volume, isMuted, fileType, archiveFiles, currentArchiveIndex]);

  // 동영상 배속 설정
  useEffect(() => {
    if (videoRef.current && fileType === 'video') {
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (archiveVideoRef.current && fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        archiveVideoRef.current.playbackRate = playbackSpeed;
      }
    }
  }, [playbackSpeed, fileType, archiveFiles, currentArchiveIndex]);

  // 배속 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (showSpeedMenu && !target.closest('[data-speed-menu]')) {
        setShowSpeedMenu(false);
      }
    };

    if (showSpeedMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSpeedMenu]);

  // 동영상 플레이어 포커스 설정
  useEffect(() => {
    if (fileType === 'video' && isOpen) {
      const videoContainer = document.querySelector('[data-video-container]') as HTMLElement;
      if (videoContainer) {
        videoContainer.focus();
      }
    }
  }, [fileType, isOpen]);

  // 비디오 이벤트 핸들러
  const handlePlayPause = () => {
    if (videoRef.current && fileType === 'video') {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
    if (archiveVideoRef.current && fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        if (isPlaying) {
          archiveVideoRef.current.pause();
        } else {
          archiveVideoRef.current.play();
        }
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
    
    // 볼륨 오버레이 표시
    setShowVolumeOverlay(true);
    if (volumeOverlayTimeoutRef.current) {
      clearTimeout(volumeOverlayTimeoutRef.current);
    }
    volumeOverlayTimeoutRef.current = setTimeout(() => {
      setShowVolumeOverlay(false);
    }, 1500);
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  const handleLoopToggle = () => {
    setIsLooping(!isLooping);
    if (videoRef.current && fileType === 'video') {
      videoRef.current.loop = !isLooping;
    }
    if (archiveVideoRef.current && fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        archiveVideoRef.current.loop = !isLooping;
      }
    }
  };

  const handleFullscreenToggle = () => {
    if (videoRef.current && fileType === 'video') {
      if (!isFullscreen) {
        videoRef.current.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
    if (archiveVideoRef.current && fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        if (!isFullscreen) {
          archiveVideoRef.current.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      }
    }
  };

  const handleVideoClick = () => {
    // 재생/정지 토글
    handlePlayPause();
    
    // 컨트롤 표시
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

  // 재생바 관련 핸들러 추가
  const handleTimeUpdate = () => {
    if (videoRef.current && fileType === 'video') {
      setCurrentTime(videoRef.current.currentTime);
    }
    if (archiveVideoRef.current && fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        setCurrentTime(archiveVideoRef.current.currentTime);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.muted = isMuted;
      videoRef.current.loop = isLooping;
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (archiveVideoRef.current && fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        setDuration(archiveVideoRef.current.duration);
        archiveVideoRef.current.volume = isMuted ? 0 : volume;
        archiveVideoRef.current.muted = isMuted;
        archiveVideoRef.current.loop = isLooping;
        archiveVideoRef.current.playbackRate = playbackSpeed;
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current && fileType === 'video') {
      videoRef.current.currentTime = newTime;
    }
    if (archiveVideoRef.current && fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        archiveVideoRef.current.currentTime = newTime;
      }
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
      setFileNotFound(false);
      const files = await window.electronAPI.getArchiveFiles(filePath);
      const supportedFiles = files.filter(file => 
        !file.isDirectory && /\.(jpg|jpeg|png|gif|webp|mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(file.name)
      ).sort((a, b) => a.name.localeCompare(b.name));
      
      setArchiveFiles(supportedFiles);
      setCurrentArchiveIndex(0);
    } catch (error) {
      console.error('압축 파일 로드 실패:', error);
      setFileNotFound(true);
      setArchiveFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentArchiveFile = async () => {
    if (currentArchiveIndex >= 0 && currentArchiveIndex < archiveFiles.length) {
      setCurrentArchiveDataUrl(null);
      setCurrentArchiveText(null);
      try {
        const currentFile = archiveFiles[currentArchiveIndex];
        const fileExt = currentFile.name.toLowerCase().split('.').pop();
        
        if (fileExt === 'txt') {
          // 텍스트 파일인 경우
          const text = await window.electronAPI.getArchiveFileText(filePath, currentFile.name);
          setCurrentArchiveText(text);
          setCurrentArchiveDataUrl(null);
        } else if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'].includes(fileExt || '')) {
          // 동영상 파일인 경우 - 스트리밍 방식 확인
          const streamInfo = await window.electronAPI.getArchiveFileStreamInfo(filePath, currentFile.name);
          
          if (streamInfo === 'stream') {
            // 스트리밍 방식 사용
            const port = (window as any).videoServerPort || 17345;
            const streamUrl = `http://localhost:${port}/archive-video?archive=${encodeURIComponent(filePath)}&file=${encodeURIComponent(currentFile.name)}`;
            setCurrentArchiveDataUrl(streamUrl);
            setCurrentArchiveText(null);
          } else {
            // 일반 방식 사용
            const dataUrl = await window.electronAPI.getArchiveFileDataUrl(filePath, currentFile.name);
            setCurrentArchiveDataUrl(dataUrl);
            setCurrentArchiveText(null);
          }
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
      setCurrentArchiveDataUrl(null);
      setCurrentArchiveText(null);
      setCurrentArchiveIndex(currentArchiveIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentArchiveIndex < archiveFiles.length - 1) {
      setCurrentArchiveDataUrl(null);
      setCurrentArchiveText(null);
      setCurrentArchiveIndex(currentArchiveIndex + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    
    // 동영상 플레이어 키보드 단축키
    if (fileType === 'video') {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (videoRef.current) {
            const newTime = Math.max(0, videoRef.current.currentTime - 5);
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (videoRef.current) {
            const newTime = Math.min(duration, videoRef.current.currentTime + 5);
            videoRef.current.currentTime = newTime;
            setCurrentTime(newTime);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          const newVolumeUp = Math.min(1, volume + 0.05);
          handleVolumeChange(newVolumeUp);
          break;
        case 'ArrowDown':
          e.preventDefault();
          const newVolumeDown = Math.max(0, volume - 0.05);
          handleVolumeChange(newVolumeDown);
          break;
        case '>':
        case '.':
          e.preventDefault();
          const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
          const currentIndex = speeds.indexOf(playbackSpeed);
          const nextIndex = currentIndex < speeds.length - 1 ? currentIndex + 1 : 0;
          handleSpeedChange(speeds[nextIndex]);
          break;
        case '<':
        case ',':
          e.preventDefault();
          const speeds2 = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
          const currentIndex2 = speeds2.indexOf(playbackSpeed);
          const prevIndex = currentIndex2 > 0 ? currentIndex2 - 1 : speeds2.length - 1;
          handleSpeedChange(speeds2[prevIndex]);
          break;
      }
    }
    
    // 압축파일 내 동영상 키보드 단축키
    if (fileType === 'archive' && archiveFiles.length > 0 && currentArchiveIndex >= 0) {
      const currentFile = archiveFiles[currentArchiveIndex];
      if (currentFile && /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile.name)) {
        switch (e.key) {
          case ' ':
            e.preventDefault();
            handlePlayPause();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            if (archiveVideoRef.current) {
              const newTime = Math.max(0, archiveVideoRef.current.currentTime - 5);
              archiveVideoRef.current.currentTime = newTime;
              setCurrentTime(newTime);
            }
            break;
          case 'ArrowRight':
            e.preventDefault();
            if (archiveVideoRef.current) {
              const newTime = Math.min(duration, archiveVideoRef.current.currentTime + 5);
              archiveVideoRef.current.currentTime = newTime;
              setCurrentTime(newTime);
            }
            break;
          case 'ArrowUp':
            e.preventDefault();
            const newVolumeUp = Math.min(1, volume + 0.05);
            handleVolumeChange(newVolumeUp);
            break;
          case 'ArrowDown':
            e.preventDefault();
            const newVolumeDown = Math.max(0, volume - 0.05);
            handleVolumeChange(newVolumeDown);
            break;
          case '>':
          case '.':
            e.preventDefault();
            const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
            const currentIndex = speeds.indexOf(playbackSpeed);
            const nextIndex = currentIndex < speeds.length - 1 ? currentIndex + 1 : 0;
            handleSpeedChange(speeds[nextIndex]);
            break;
          case '<':
          case ',':
            e.preventDefault();
            const speeds2 = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
            const currentIndex2 = speeds2.indexOf(playbackSpeed);
            const prevIndex = currentIndex2 > 0 ? currentIndex2 - 1 : speeds2.length - 1;
            handleSpeedChange(speeds2[prevIndex]);
            break;
        }
      } else {
        // 압축파일 내 이미지/텍스트 파일 네비게이션
        if (e.key === 'ArrowLeft') {
          handlePrevious();
        } else if (e.key === 'ArrowRight') {
          handleNext();
        }
      }
    }
  };

  // 파일이 바뀌면 확대/위치/회전 초기화 (압축/일반 모두)
  useEffect(() => {
    setImgScale(1);
    setImgOffset({ x: 0, y: 0 });
    setImgRotation(0);
    setVideoRotation(0);
    setArchiveImgRotation(0);
    setArchiveImgScale(1);
    setArchiveImgOffset({ x: 0, y: 0 });
    setArchiveVideoScale(1);
    setArchiveVideoOffset({ x: 0, y: 0 });
  }, [filePath, fileType, currentArchiveIndex]);

  // 일반 이미지 휠 확대/축소
  useEffect(() => {
    if (fileType !== 'image' || !dataUrl) return;
    const img = imgRef.current;
    const container = imgContainerRef.current;
    if (!img || !container) return;
    
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      setImgScale(prevScale => {
        let nextScale = prevScale - e.deltaY * 0.001;
        nextScale = Math.max(1, Math.min(5, nextScale));
        return nextScale;
      });
      setImgOffset(prevOffset => {
        const newScale = imgScale - e.deltaY * 0.001;
        const nextScale = Math.max(1, Math.min(5, newScale));
        let nextOffset = prevOffset;
        if (nextScale === 1) nextOffset = { x: 0, y: 0 };
        else nextOffset = clampImgOffset(nextOffset, nextScale);
        return nextOffset;
      });
    };
    
    img.addEventListener('wheel', wheelHandler, { passive: false });
    container.addEventListener('wheel', wheelHandler, { passive: false });
    
    return () => {
      img.removeEventListener('wheel', wheelHandler);
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [fileType, dataUrl]);

  // 압축 이미지 휠 확대/축소
  useEffect(() => {
    if (fileType !== 'archive') return;
    const img = archiveImgRef.current;
    const container = imgContainerRef.current;
    if (!img || !container) return;
    
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      setArchiveImgScale(prevScale => {
        let nextScale = prevScale - e.deltaY * 0.001;
        nextScale = Math.max(1, Math.min(5, nextScale));
        return nextScale;
      });
      setArchiveImgOffset(prevOffset => {
        const newScale = archiveImgScale - e.deltaY * 0.001;
        const nextScale = Math.max(1, Math.min(5, newScale));
        let nextOffset = prevOffset;
        if (nextScale === 1) nextOffset = { x: 0, y: 0 };
        else nextOffset = clampImgOffset(nextOffset, nextScale);
        return nextOffset;
      });
    };
    
    img.addEventListener('wheel', wheelHandler, { passive: false });
    container.addEventListener('wheel', wheelHandler, { passive: false });
    
    return () => {
      img.removeEventListener('wheel', wheelHandler);
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [fileType]);

  // 압축 동영상 휠 확대/축소
  useEffect(() => {
    if (fileType !== 'archive') return;
    const video = archiveVideoRef.current;
    const container = imgContainerRef.current;
    if (!video || !container) return;
    
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      setArchiveVideoScale(prevScale => {
        let nextScale = prevScale - e.deltaY * 0.001;
        nextScale = Math.max(1, Math.min(5, nextScale));
        return nextScale;
      });
      setArchiveVideoOffset(prevOffset => {
        const newScale = archiveVideoScale - e.deltaY * 0.001;
        const nextScale = Math.max(1, Math.min(5, newScale));
        let nextOffset = prevOffset;
        if (nextScale === 1) nextOffset = { x: 0, y: 0 };
        else nextOffset = clampImgOffset(nextOffset, nextScale);
        return nextOffset;
      });
    };
    
    video.addEventListener('wheel', wheelHandler, { passive: false });
    container.addEventListener('wheel', wheelHandler, { passive: false });
    
    return () => {
      video.removeEventListener('wheel', wheelHandler);
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [fileType]);

  // 일반 이미지 드래그 패닝
  const handleImgMouseDown = (e: React.MouseEvent) => {
    if (imgScale === 1) return;
    setIsPanning(true);
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: imgOffset.x,
      offsetY: imgOffset.y,
    };
  };
  const handleImgMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !panStart.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    const next = {
      x: panStart.current.offsetX + dx,
      y: panStart.current.offsetY + dy,
    };
    setImgOffset(clampImgOffset(next, imgScale));
  };
  const handleImgMouseUp = () => {
    setIsPanning(false);
  };

  // 압축 이미지 드래그 패닝
  const handleArchiveImgMouseDown = (e: React.MouseEvent) => {
    if (archiveImgScale === 1) return;
    setArchiveIsPanning(true);
    archivePanStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: archiveImgOffset.x,
      offsetY: archiveImgOffset.y,
    };
  };
  const handleArchiveImgMouseMove = (e: React.MouseEvent) => {
    if (!archiveIsPanning || !archivePanStart.current) return;
    const dx = e.clientX - archivePanStart.current.x;
    const dy = e.clientY - archivePanStart.current.y;
    const next = {
      x: archivePanStart.current.offsetX + dx,
      y: archivePanStart.current.offsetY + dy,
    };
    setArchiveImgOffset(clampImgOffset(next, archiveImgScale));
  };
  const handleArchiveImgMouseUp = () => {
    setArchiveIsPanning(false);
  };

  // 압축 동영상 드래그 패닝
  const handleArchiveVideoMouseDown = (e: React.MouseEvent) => {
    if (archiveVideoScale === 1) return;
    setArchiveVideoIsPanning(true);
    archiveVideoPanStart.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: archiveVideoOffset.x,
      offsetY: archiveVideoOffset.y,
    };
  };
  const handleArchiveVideoMouseMove = (e: React.MouseEvent) => {
    if (!archiveVideoIsPanning || !archiveVideoPanStart.current) return;
    const dx = e.clientX - archiveVideoPanStart.current.x;
    const dy = e.clientY - archiveVideoPanStart.current.y;
    const next = {
      x: archiveVideoPanStart.current.offsetX + dx,
      y: archiveVideoPanStart.current.offsetY + dy,
    };
    setArchiveVideoOffset(clampImgOffset(next, archiveVideoScale));
  };
  const handleArchiveVideoMouseUp = () => {
    setArchiveVideoIsPanning(false);
  };

  // 패닝 한계 계산 함수
  function clampImgOffset(offset: { x: number; y: number }, scale: number): { x: number; y: number } {
    if (!imgContainerRef.current) return offset;
    const container = imgContainerRef.current;
    const rect = container.getBoundingClientRect();
    // 이미지 실제 크기 (컨테이너 기준)
    const imgW = rect.width * scale;
    const imgH = rect.height * scale;
    const maxX = Math.max(0, (imgW - rect.width) / 2);
    const maxY = Math.max(0, (imgH - rect.height) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  }

  // 모달이 열릴 때 포커스 설정
  useEffect(() => {
    if (isOpen) {
      const modalContainer = document.querySelector('[data-modal-container]') as HTMLElement;
      if (modalContainer) {
        modalContainer.focus();
      }
    }
  }, [isOpen]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (volumeOverlayTimeoutRef.current) {
        clearTimeout(volumeOverlayTimeoutRef.current);
      }
    };
  }, []);

  // 볼륨 슬라이더 wheel 이벤트 등록
  useEffect(() => {
    const volumeSliders = document.querySelectorAll('#volume-slider');
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newVolume = Math.max(0, Math.min(1, (isMuted ? 0 : volume) + delta));
      handleVolumeChange(newVolume);
    };

    volumeSliders.forEach(slider => {
      slider.addEventListener('wheel', handleWheel, { passive: false });
    });

    return () => {
      volumeSliders.forEach(slider => {
        slider.removeEventListener('wheel', handleWheel);
      });
    };
  }, [volume, isMuted, handleVolumeChange]);

  // 2. 북마크 추가/삭제 함수 (일반 동영상에서만 작동)
  const handleAddBookmark = () => {
    if (fileType !== 'video') return; // 일반 동영상에서만 북마크 추가 가능
    window.electronAPI.addBookmark(categoryId, recordId, currentTime).then(res => {
      if (res.success) {
        setBookmarks(prev => [...prev, res.bookmark].sort((a, b) => a.time - b.time));
      } else {
        // 에러 처리
        console.error('북마크 추가 실패:', res.error);
      }
    });
  };
  const handleRemoveBookmark = (time: number) => {
    if (fileType !== 'video') return; // 일반 동영상에서만 북마크 삭제 가능
    window.electronAPI.removeBookmark(categoryId, recordId, time).then(res => {
      if (res.success) {
        setBookmarks(prev => prev.filter(b => Math.abs(b.time - time) >= 1));
      } else {
        // 에러 처리
        console.error('북마크 삭제 실패:', res.error);
      }
    });
  };

  // 현재 시간에 북마크가 있는지 확인하는 함수
  const hasBookmarkAtCurrentTime = () => {
    return bookmarks.some(bm => Math.abs(bm.time - currentTime) < 1);
  };

  // 배속 변경 함수
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    setShowSpeedMenu(false);
  };

  // 배속 메뉴 토글 함수
  const handleSpeedMenuToggle = () => {
    setShowSpeedMenu(!showSpeedMenu);
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
      data-modal-container
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

        {/* Content (Body) */}
        <div className="flex-1 min-h-0 flex items-center justify-center relative" style={{ overflow: 'hidden' }}>
          {/* 회전 버튼: 바디 영역 우측 상단에 fixed 배치 */}
          {((fileType === 'image') || (fileType === 'video') || (fileType === 'archive' && (currentFileExt !== 'txt'))) && (
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              <button
                onClick={() => {
                  if (fileType === 'image') setImgRotation((r) => (r - 90) % 360);
                  else if (fileType === 'video') setVideoRotation((r) => (r - 90) % 360);
                  else if (fileType === 'archive' && (currentFileExt !== 'txt')) setArchiveImgRotation((r) => (r - 90) % 360);
                }}
                className="p-2 rounded bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
                title="왼쪽으로 90도 회전"
              >
                <RotateCcw size={20} />
              </button>
              <button
                onClick={() => {
                  if (fileType === 'image') setImgRotation((r) => (r + 90) % 360);
                  else if (fileType === 'video') setVideoRotation((r) => (r + 90) % 360);
                  else if (fileType === 'archive' && (currentFileExt !== 'txt')) setArchiveImgRotation((r) => (r + 90) % 360);
                }}
                className="p-2 rounded bg-black/70 text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
                title="오른쪽으로 90도 회전"
              >
                <RotateCcw size={20} style={{ transform: 'scaleX(-1)' }} />
              </button>
            </div>
          )}
          
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-discord-accent"></div>
            </div>
          ) : fileNotFound ? (
            <div className="flex flex-col items-center justify-center text-center p-8">
              <div className="text-6xl mb-4">📁</div>
              <div className="text-2xl font-bold text-discord-text mb-2">원본 파일을 찾을 수 없습니다</div>
              <div className="text-discord-muted mb-4 max-w-md">
                파일이 삭제되었거나 이동되었을 수 있습니다.<br />
                파일 경로: <span className="font-mono text-sm bg-discord-sidebar px-2 py-1 rounded">{filePath}</span>
              </div>
              <div className="text-sm text-discord-muted">
                이 파일과 관련된 북마크는 자동으로 삭제됩니다.
              </div>
            </div>
          ) : (
            <>
              {/* Image Viewer */}
              {fileType === 'image' && dataUrl && (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <div
                    ref={imgContainerRef}
                    className="flex-1 w-full h-full flex items-center justify-center"
                    style={{ 
                      maxHeight: '80vh', 
                      maxWidth: '100%',
                      overflow: imgScale > 1 ? 'hidden' : 'visible'
                    }}
                  >
                    <img
                      src={dataUrl}
                      alt="이미지 뷰어"
                      className="max-w-full max-h-full object-contain rounded shadow-lg select-none"
                      style={{
                        maxWidth: imgRotation % 180 !== 0 ? '80vh' : '100%',
                        maxHeight: imgRotation % 180 !== 0 ? '95vw' : '80vh',
                        transform: `scale(${imgScale}) translate(${imgOffset.x / imgScale}px, ${imgOffset.y / imgScale}px) rotate(${imgRotation}deg)`,
                        cursor: imgScale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                        transition: isPanning ? 'none' : 'transform 0.2s',
                      }}
                      draggable={false}
                      ref={imgRef}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleImgMouseDown(e);
                      }}
                      onMouseMove={(e) => {
                        e.stopPropagation();
                        handleImgMouseMove(e);
                      }}
                      onMouseUp={(e) => {
                        e.stopPropagation();
                        handleImgMouseUp();
                      }}
                      onMouseLeave={(e) => {
                        e.stopPropagation();
                        handleImgMouseUp();
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Video Player */}
              {fileType === 'video' && dataUrl && (
                <div 
                  className="relative w-full h-full flex flex-col items-center justify-center"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setShowControls(false)}
                  onKeyDown={handleKeyDown}
                  tabIndex={0}
                  data-video-container
                >
                  <div className="flex-1 w-full h-full flex items-center justify-center">
                    <div style={{ 
                      transform: `rotate(${videoRotation}deg)`,
                      transition: 'transform 0.2s'
                    }}>
                      {videoError ? (
                        <div className="flex flex-col items-center justify-center bg-black text-white p-8 rounded-lg">
                          <div className="text-2xl mb-4">⚠️</div>
                          <div className="text-lg font-semibold mb-2">{videoError}</div>
                          <div className="text-sm text-gray-300 text-center">
                            지원되지 않는 코덱이거나<br />
                            파일이 손상되었을 수 있습니다.
                          </div>
                          {codecInfo && (
                            <div className="mt-4 text-xs bg-gray-800 rounded p-2 text-left">
                              <div className="mb-1 font-bold text-blue-300">코덱 정보</div>
                              {codecInfo.error && <div className="text-red-400">{codecInfo.error}</div>}
                              {codecInfo.video && (
                                <div>Video: {codecInfo.video.codec} {codecInfo.video.profile ? `(${codecInfo.video.profile})` : ''} {codecInfo.video.pix_fmt ? `[${codecInfo.video.pix_fmt}]` : ''}</div>
                              )}
                              {codecInfo.audio && (
                                <div>Audio: {codecInfo.audio.codec} {codecInfo.audio.sample_rate ? `@${codecInfo.audio.sample_rate}Hz` : ''} {codecInfo.audio.channels ? `채널:${codecInfo.audio.channels}` : ''}</div>
                              )}
                              {!codecInfo.video && !codecInfo.audio && !codecInfo.error && <div>코덱 정보를 찾을 수 없습니다.</div>}
                            </div>
                          )}
                          <button
                            onClick={() => {
                              setVideoError(null);
                              setCodecInfo(null);
                              if (videoRef.current) {
                                videoRef.current.load();
                              }
                            }}
                            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                          >
                            다시 시도
                          </button>
                        </div>
                      ) : (
                        <video
                          ref={videoRef}
                          src={dataUrl}
                          autoPlay
                          className="max-w-full max-h-[80vh] h-full object-contain bg-black"
                          style={{
                            maxWidth: videoRotation % 180 !== 0 ? '80vh' : '100%',
                            maxHeight: videoRotation % 180 !== 0 ? '95vw' : '80vh',
                          }}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onLoadedMetadata={handleLoadedMetadata}
                          onTimeUpdate={handleTimeUpdate}
                          onClick={handleVideoClick}
                          onError={(e) => {
                            console.error('동영상 재생 에러:', e);
                            console.error('동영상 소스:', dataUrl?.substring(0, 100) + '...');
                            console.error('파일 경로:', filePath);
                            // 에러 정보를 더 자세히 로깅
                            const video = e.target as HTMLVideoElement;
                            if (video.error) {
                              console.error('비디오 에러 코드:', video.error.code);
                              console.error('비디오 에러 메시지:', video.error.message);
                            }
                            setVideoError('동영상을 재생할 수 없습니다.');
                            setCodecInfo(null);
                            if (filePath) {
                              window.electronAPI.getVideoCodecInfo(filePath).then(setCodecInfo);
                            }
                          }}
                          onLoadStart={() => {
                            // 동영상 로딩 시작
                          }}
                          onCanPlay={() => {
                            setVideoError(null);
                          }}
                        />
                      )}
                    </div>
                  </div>
                  
                  {/* 볼륨 오버레이 */}
                  {showVolumeOverlay && (
                    <div className="absolute top-4 left-4 transition-opacity duration-300">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-discord-accent rounded-full">
                          {isMuted || volume === 0 ? (
                            <VolumeX size={16} className="text-white" />
                          ) : volume < 0.5 ? (
                            <Volume2 size={16} className="text-white" />
                          ) : (
                            <Volume2 size={16} className="text-white" />
                          )}
                        </div>
                        <div className="text-center">
                          <div className="text-xl font-bold text-white">
                            {Math.round((isMuted ? 0 : volume) * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 커스텀 컨트롤 */}
                  <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                    {/* 재생바 */}
                    <div className="mb-4">
                      <div style={{ position: 'relative', width: '100%' }}>
                        <input
                          type="range"
                          min={0}
                          max={duration}
                          step={0.01}
                          value={currentTime}
                          onChange={handleSeek}
                          className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                          id="seekbar"
                        />
                        {/* 북마크 마커 (일반 동영상에서만 표시) */}
                        {fileType === 'video' && bookmarks.map(bm => (
                          <div
                            key={bm.time}
                            style={{
                              position: 'absolute',
                              left: `${(bm.time / duration) * 100}%`,
                              top: 0,
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              transform: 'translate(-50%, -50%)',
                              cursor: 'pointer',
                              zIndex: 10,
                              transition: 'all 0.2s ease-in-out',
                            }}
                            className="bg-red-500/60 shadow-md shadow-red-500/30 border border-white/10 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/60"
                            onClick={() => {
                              if (videoRef.current && fileType === 'video') {
                                videoRef.current.currentTime = bm.time;
                                setCurrentTime(bm.time);
                              }
                            }}
                            onContextMenu={e => {
                              e.preventDefault();
                              handleRemoveBookmark(bm.time);
                            }}
                            title={`북마크: ${formatTime(bm.time)} (클릭: 이동, 우클릭: 삭제)`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-white text-xs mt-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>
                    {/* 컨트롤바: 좌우 분리 */}
                    <div className="flex items-center justify-between w-full">
                      {/* 왼쪽 그룹 */}
                      <div className="flex items-center gap-5">
                        {/* 재생/정지 버튼 */}
                        <button onClick={handlePlayPause} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors" title={isPlaying ? '일시정지' : '재생'}>
                          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </button>
                        {/* 볼륨 컨트롤 */}
                        <div className="flex items-center gap-2">
                          <button onClick={handleMuteToggle} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors" title={isMuted ? '음소거 해제' : '음소거'}>
                            {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                          </button>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={isMuted ? 0 : volume}
                            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                            className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                            id="volume-slider"
                          />
                        </div>
                        {/* 북마크 버튼 (일반 동영상만) */}
                        {fileType === 'video' && (
                          <button
                            onClick={() => {
                              if (hasBookmarkAtCurrentTime()) {
                                const bookmarkToRemove = bookmarks.find(bm => Math.abs(bm.time - currentTime) < 1);
                                if (bookmarkToRemove) {
                                  handleRemoveBookmark(bookmarkToRemove.time);
                                }
                              } else {
                                handleAddBookmark();
                              }
                            }}
                            className={`w-8 h-8 flex items-center justify-center transition-colors ${
                              hasBookmarkAtCurrentTime() 
                                ? 'text-blue-400' 
                                : 'text-white hover:text-gray-300'
                            }`}
                            title={
                              hasBookmarkAtCurrentTime() 
                                ? '북마크 삭제' 
                                : '현재 위치 북마크'
                            }
                          >
                            <Bookmark size={20} />
                          </button>
                        )}
                      </div>
                      {/* 오른쪽 그룹 */}
                      <div className="flex items-center gap-5">
                        {/* 루프 버튼 */}
                        <button onClick={handleLoopToggle} className={`w-8 h-8 flex items-center justify-center transition-colors ${isLooping ? 'text-blue-400' : 'text-white hover:text-gray-300'}`} title={isLooping ? '반복 해제' : '반복 재생'}>
                          <RotateCcw size={20} />
                        </button>
                        {/* 배속 버튼 */}
                        <div className="relative">
                          <button
                            onClick={handleSpeedMenuToggle}
                            className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors"
                            title={`재생 속도: ${playbackSpeed}x (>, < 키로 변경)`}
                            data-speed-menu
                          >
                            <Clock size={20} />
                          </button>
                          {showSpeedMenu && (
                            <div className="absolute bottom-full left-0 mb-2 bg-discord-sidebar border border-gray-700 rounded-lg shadow-lg z-50 min-w-[120px]" data-speed-menu>
                              <div className="p-2 text-xs text-discord-muted border-b border-gray-700">
                                재생 속도
                              </div>
                              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                                <button
                                  key={speed}
                                  onClick={() => handleSpeedChange(speed)}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-discord-hover transition-colors ${
                                    playbackSpeed === speed ? 'text-discord-accent bg-discord-hover' : 'text-discord-text'
                                  }`}
                                >
                                  {speed}x
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* 전체화면 버튼 */}
                        <button onClick={handleFullscreenToggle} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors ml-auto" title={isFullscreen ? '전체화면 해제' : '전체화면'}>
                          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                        </button>
                      </div>
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
                        const isVideo = /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(file.name);
                        const isText = fileExt === 'txt';
                        
                        return (
                          <li
                            key={file.name}
                            className={`flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-discord-hover rounded ${idx === currentArchiveIndex ? 'bg-discord-hover font-bold text-discord-accent' : ''}`}
                            onClick={() => {
                              if (idx !== currentArchiveIndex) {
                                setCurrentArchiveDataUrl(null);
                                setCurrentArchiveText(null);
                                setCurrentArchiveIndex(idx);
                              }
                            }}
                          >
                            {isImage && <FileImage size={14} className="text-blue-400 flex-shrink-0" />}
                            {isVideo && <FileVideo size={14} className="text-green-400 flex-shrink-0" />}
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
                    <div 
                      className="flex-1 flex items-center justify-center relative"
                      style={{ 
                        overflow: currentFileExt !== 'txt' && archiveImgScale > 1 ? 'hidden' : 'auto'
                      }}
                    >
                      {/* 좌/우 투명 클릭 영역 */}
                      {currentFileExt !== 'txt' && !/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile?.name || '') && archiveImgScale === 1 && archiveVideoScale === 1 && (
                        <>
                          <div
                            className="absolute top-0 left-0 h-full w-1/2 z-10 cursor-pointer"
                            style={{ background: 'transparent', pointerEvents: 'auto' }}
                            onClick={handlePrevious}
                          />
                          <div
                            className="absolute top-0 right-0 h-full w-1/2 z-10 cursor-pointer"
                            style={{ background: 'transparent', pointerEvents: 'auto' }}
                            onClick={handleNext}
                          />
                        </>
                      )}
                      {currentFileExt !== 'txt' && !/\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile?.name || '') && (archiveImgScale > 1 || archiveVideoScale > 1) && (
                        <>
                          <div
                            className="absolute top-0 left-0 h-full w-1/2 z-10"
                            style={{ background: 'transparent', pointerEvents: 'none' }}
                          />
                          <div
                            className="absolute top-0 right-0 h-full w-1/2 z-10"
                            style={{ background: 'transparent', pointerEvents: 'none' }}
                          />
                        </>
                      )}
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
                      ) : /\.(mp4|avi|mkv|mov|wmv|flv|webm)$/i.test(currentFile?.name || '') ? (
                        // 동영상 파일 표시
                        currentArchiveDataUrl ? (
                          <div 
                            className="relative w-full h-full flex items-center justify-center"
                            onMouseMove={handleMouseMove}
                            onMouseLeave={() => setShowControls(false)}
                            onKeyDown={handleKeyDown}
                            tabIndex={0}
                            data-video-container
                          >
                            <div style={{ 
                              transform: `scale(${archiveVideoScale}) translate(${archiveVideoOffset.x / archiveVideoScale}px, ${archiveVideoOffset.y / archiveVideoScale}px) rotate(${archiveImgRotation}deg)`,
                              transition: archiveVideoIsPanning ? 'none' : 'transform 0.2s',
                            }}>
                              {videoError ? (
                                <div className="flex flex-col items-center justify-center bg-black text-white p-8 rounded-lg">
                                  <div className="text-2xl mb-4">⚠️</div>
                                  <div className="text-lg font-semibold mb-2">{videoError}</div>
                                  <div className="text-sm text-gray-300 text-center">
                                    지원되지 않는 코덱이거나<br />
                                    파일이 손상되었을 수 있습니다.
                                  </div>
                                  {codecInfo && (
                                    <div className="mt-4 text-xs bg-gray-800 rounded p-2 text-left">
                                      <div className="mb-1 font-bold text-blue-300">코덱 정보</div>
                                      {codecInfo.error && <div className="text-red-400">{codecInfo.error}</div>}
                                      {codecInfo.video && (
                                        <div>Video: {codecInfo.video.codec} {codecInfo.video.profile ? `(${codecInfo.video.profile})` : ''} {codecInfo.video.pix_fmt ? `[${codecInfo.video.pix_fmt}]` : ''}</div>
                                      )}
                                      {codecInfo.audio && (
                                        <div>Audio: {codecInfo.audio.codec} {codecInfo.audio.sample_rate ? `@${codecInfo.audio.sample_rate}Hz` : ''} {codecInfo.audio.channels ? `채널:${codecInfo.audio.channels}` : ''}</div>
                                      )}
                                      {!codecInfo.video && !codecInfo.audio && !codecInfo.error && <div>코덱 정보를 찾을 수 없습니다.</div>}
                                    </div>
                                  )}
                                  <button
                                    onClick={() => {
                                      setVideoError(null);
                                      setCodecInfo(null);
                                      if (archiveVideoRef.current) {
                                        archiveVideoRef.current.load();
                                      }
                                    }}
                                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                                  >
                                    다시 시도
                                  </button>
                                </div>
                              ) : (
                                <video
                                  src={currentArchiveDataUrl}
                                  className="max-w-full max-h-[80vh] object-contain bg-black rounded shadow-lg"
                                  style={{
                                    maxWidth: archiveImgRotation % 180 !== 0 ? '80vh' : '100%',
                                    maxHeight: archiveImgRotation % 180 !== 0 ? '95vw' : '80vh',
                                    cursor: archiveVideoScale > 1 ? (archiveVideoIsPanning ? 'grabbing' : 'grab') : 'default',
                                  }}
                                  controls={false}
                                  autoPlay
                                  ref={archiveVideoRef}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    handleArchiveVideoMouseDown(e);
                                  }}
                                  onMouseMove={(e) => {
                                    e.stopPropagation();
                                    handleArchiveVideoMouseMove(e);
                                  }}
                                  onMouseUp={(e) => {
                                    e.stopPropagation();
                                    handleArchiveVideoMouseUp();
                                  }}
                                  onMouseLeave={(e) => {
                                    e.stopPropagation();
                                    handleArchiveVideoMouseUp();
                                  }}
                                  onPlay={() => setIsPlaying(true)}
                                  onPause={() => setIsPlaying(false)}
                                  onLoadedMetadata={handleLoadedMetadata}
                                  onTimeUpdate={handleTimeUpdate}
                                  onClick={handleVideoClick}
                                  onError={(e) => {
                                    console.error('동영상 재생 에러:', e);
                                    console.error('동영상 소스:', currentArchiveDataUrl?.substring(0, 100) + '...');
                                    console.error('파일 경로:', filePath);
                                    console.error('압축 파일 내 파일명:', currentFile?.name);
                                    // 에러 정보를 더 자세히 로깅
                                    const video = e.target as HTMLVideoElement;
                                    if (video.error) {
                                      console.error('비디오 에러 코드:', video.error.code);
                                      console.error('비디오 에러 메시지:', video.error.message);
                                    }
                                    setVideoError('동영상을 재생할 수 없습니다.');
                                    setCodecInfo(null);
                                    if (filePath) {
                                      window.electronAPI.getVideoCodecInfo(filePath).then(setCodecInfo);
                                    }
                                  }}
                                  onLoadStart={() => {
                                    // 동영상 로딩 시작
                                  }}
                                  onCanPlay={() => {
                                    setVideoError(null);
                                  }}
                                />
                              )}
                            </div>
                            
                            {/* 볼륨 오버레이 */}
                            {showVolumeOverlay && (
                              <div className="absolute top-4 left-4 transition-opacity duration-300">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center justify-center w-8 h-8 bg-discord-accent rounded-full">
                                    {isMuted || volume === 0 ? (
                                      <VolumeX size={16} className="text-white" />
                                    ) : volume < 0.5 ? (
                                      <Volume2 size={16} className="text-white" />
                                    ) : (
                                      <Volume2 size={16} className="text-white" />
                                    )}
                                  </div>
                                  <div className="text-center">
                                    <div className="text-xl font-bold text-white">
                                      {Math.round((isMuted ? 0 : volume) * 100)}%
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* 커스텀 컨트롤 */}
                            <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                              {/* 재생바 */}
                              <div className="mb-4">
                                <div style={{ position: 'relative', width: '100%' }}>
                                  <input
                                    type="range"
                                    min={0}
                                    max={duration}
                                    step={0.01}
                                    value={currentTime}
                                    onChange={handleSeek}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                                    id="seekbar"
                                  />
                                  {/* 북마크 마커 (일반 동영상에서만 표시) */}
                                  {fileType === 'video' && bookmarks.map(bm => (
                                    <div
                                      key={bm.time}
                                      style={{
                                        position: 'absolute',
                                        left: `${(bm.time / duration) * 100}%`,
                                        top: 0,
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        cursor: 'pointer',
                                        zIndex: 10,
                                        transition: 'all 0.2s ease-in-out',
                                      }}
                                      className="bg-red-500/60 shadow-md shadow-red-500/30 border border-white/10 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/60"
                                      onClick={() => {
                                        if (videoRef.current && fileType === 'video') {
                                          videoRef.current.currentTime = bm.time;
                                          setCurrentTime(bm.time);
                                        }
                                      }}
                                      onContextMenu={e => {
                                        e.preventDefault();
                                        handleRemoveBookmark(bm.time);
                                      }}
                                      title={`북마크: ${formatTime(bm.time)} (클릭: 이동, 우클릭: 삭제)`}
                                    />
                                  ))}
                                </div>
                                <div className="flex justify-between text-white text-xs mt-1">
                                  <span>{formatTime(currentTime)}</span>
                                  <span>{formatTime(duration)}</span>
                                </div>
                              </div>
                              {/* 컨트롤바: 좌우 분리 */}
                              <div className="flex items-center justify-between w-full">
                                {/* 왼쪽 그룹 */}
                                <div className="flex items-center gap-5">
                                  {/* 재생/정지 버튼 */}
                                  <button onClick={handlePlayPause} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors" title={isPlaying ? '일시정지' : '재생'}>
                                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                                  </button>
                                  {/* 볼륨 컨트롤 */}
                                  <div className="flex items-center gap-2">
                                    <button onClick={handleMuteToggle} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors" title={isMuted ? '음소거 해제' : '음소거'}>
                                      {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                    </button>
                                    <input
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.01"
                                      value={isMuted ? 0 : volume}
                                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                      className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                                      id="volume-slider"
                                    />
                                  </div>
                                  {/* 북마크 버튼 (일반 동영상만) */}
                                  {fileType === 'video' && (
                                    <button
                                      onClick={() => {
                                        if (hasBookmarkAtCurrentTime()) {
                                          const bookmarkToRemove = bookmarks.find(bm => Math.abs(bm.time - currentTime) < 1);
                                          if (bookmarkToRemove) {
                                            handleRemoveBookmark(bookmarkToRemove.time);
                                          }
                                        } else {
                                          handleAddBookmark();
                                        }
                                      }}
                                      className={`w-8 h-8 flex items-center justify-center transition-colors ${
                                        hasBookmarkAtCurrentTime() 
                                          ? 'text-blue-400' 
                                          : 'text-white hover:text-gray-300'
                                      }`}
                                      title={
                                        hasBookmarkAtCurrentTime() 
                                          ? '북마크 삭제' 
                                          : '현재 위치 북마크'
                                      }
                                    >
                                      <Bookmark size={20} />
                                    </button>
                                  )}
                                </div>
                                {/* 오른쪽 그룹 */}
                                <div className="flex items-center gap-5">
                                  {/* 루프 버튼 */}
                                  <button onClick={handleLoopToggle} className={`w-8 h-8 flex items-center justify-center transition-colors ${isLooping ? 'text-blue-400' : 'text-white hover:text-gray-300'}`} title={isLooping ? '반복 해제' : '반복 재생'}>
                                    <RotateCcw size={20} />
                                  </button>
                                  {/* 배속 버튼 */}
                                  <div className="relative">
                                    <button
                                      onClick={handleSpeedMenuToggle}
                                      className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors"
                                      title={`재생 속도: ${playbackSpeed}x (>, < 키로 변경)`}
                                      data-speed-menu
                                    >
                                      <Clock size={20} />
                                    </button>
                                    {showSpeedMenu && (
                                      <div className="absolute bottom-full left-0 mb-2 bg-discord-sidebar border border-gray-700 rounded-lg shadow-lg z-50 min-w-[120px]" data-speed-menu>
                                        <div className="p-2 text-xs text-discord-muted border-b border-gray-700">
                                          재생 속도
                                        </div>
                                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                                          <button
                                            key={speed}
                                            onClick={() => handleSpeedChange(speed)}
                                            className={`w-full text-left px-3 py-2 text-sm hover:bg-discord-hover transition-colors ${
                                              playbackSpeed === speed ? 'text-discord-accent bg-discord-hover' : 'text-discord-text'
                                            }`}
                                          >
                                            {speed}x
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {/* 전체화면 버튼 */}
                                  <button onClick={handleFullscreenToggle} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors ml-auto" title={isFullscreen ? '전체화면 해제' : '전체화면'}>
                                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-discord-muted">동영상을 로드할 수 없습니다.</div>
                        )
                      ) : (
                        // 이미지 파일 표시
                        currentArchiveDataUrl ? (
                          <div className="flex flex-col items-center w-full">
                            <img
                              src={currentArchiveDataUrl}
                              alt={currentFile?.name || '압축 파일 이미지'}
                              className="max-w-full max-h-full object-contain rounded shadow-lg block mx-auto select-none"
                              style={{
                                maxWidth: archiveImgRotation % 180 !== 0 ? '80vh' : '100%',
                                maxHeight: archiveImgRotation % 180 !== 0 ? '95vw' : '80vh',
                                transform: `scale(${archiveImgScale}) translate(${archiveImgOffset.x / archiveImgScale}px, ${archiveImgOffset.y / archiveImgScale}px) rotate(${archiveImgRotation}deg)`,
                                cursor: archiveImgScale > 1 ? (archiveIsPanning ? 'grabbing' : 'grab') : 'default',
                                transition: archiveIsPanning ? 'none' : 'transform 0.2s',
                              }}
                              draggable={false}
                              ref={archiveImgRef}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                handleArchiveImgMouseDown(e);
                              }}
                              onMouseMove={(e) => {
                                e.stopPropagation();
                                handleArchiveImgMouseMove(e);
                              }}
                              onMouseUp={(e) => {
                                e.stopPropagation();
                                handleArchiveImgMouseUp();
                              }}
                              onMouseLeave={(e) => {
                                e.stopPropagation();
                                handleArchiveImgMouseUp();
                              }}
                            />
                          </div>
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
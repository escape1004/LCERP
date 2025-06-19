import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ViewerModalProps {
  isOpen: boolean;
  filePath: string;
  fileType: 'image' | 'video' | 'archive' | null;
  onClose: () => void;
}

export const ViewerModal: React.FC<ViewerModalProps> = ({ isOpen, filePath, fileType, onClose }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !filePath || !fileType) {
      setDataUrl(null);
      return;
    }
    if (fileType === 'image' || fileType === 'video') {
      window.electronAPI.getFileDataUrl(filePath).then(setDataUrl);
    } else {
      setDataUrl(null);
    }
  }, [isOpen, filePath, fileType]);

  if (!isOpen || !filePath || !fileType) return null;

  // Electron 환경에서 filePath가 로컬 경로라면 file:// prefix 필요 + 인코딩
  const getSrc = (path: string) => {
    if (!path) return '';
    let normalized = path;
    // Windows 경로 처리
    if (/^[a-zA-Z]:[\\/]/.test(path)) {
      normalized = 'file:///' + path.replace(/\\/g, '/');
    } else if (!path.startsWith('file://')) {
      normalized = 'file://' + path;
    }
    // 한글/공백/특수문자 인코딩 (file:///C:/.../파일명.jpg)
    const parts = normalized.split('/');
    const encoded = parts.map((part, i) => (i > 2 ? encodeURIComponent(part) : part)).join('/');
    console.log('Viewer src:', encoded);
    return encoded;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="relative bg-discord-bg rounded-lg shadow-lg max-w-[90vw] max-h-[90vh] w-full h-full flex flex-col items-center justify-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-discord-muted hover:text-white z-10"
        >
          <X size={32} />
        </button>
        <div className="w-full h-full flex items-center justify-center">
          {fileType === 'image' && dataUrl && (
            <img
              src={dataUrl}
              alt="미리보기"
              className="max-w-[80vw] max-h-[80vh] object-contain rounded shadow-lg"
              draggable={false}
            />
          )}
          {fileType === 'video' && dataUrl && (
            <video
              src={dataUrl}
              controls
              className="max-w-[80vw] max-h-[80vh] rounded shadow-lg bg-black"
              autoPlay
            />
          )}
          {fileType === 'archive' && <div>압축파일(만화) 뷰어 준비중</div>}
        </div>
      </div>
    </div>
  );
}; 
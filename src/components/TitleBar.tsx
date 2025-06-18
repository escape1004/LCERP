import { useState, useEffect } from 'react';
import type { ElectronAPI } from '../types';

interface CSSPropertiesWithWebkit extends React.CSSProperties {
  WebkitAppRegion?: 'drag' | 'no-drag';
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const electronAPI = window.electronAPI as ElectronAPI;

  useEffect(() => {
    // 창 상태 변경 감지 (임시로 비활성화)
    // if (window.electronAPI && typeof window.electronAPI.on === 'function') {
    //   window.electronAPI.on('window-state-change', (state: { maximized: boolean }) => {
    //     setIsMaximized(state.maximized);
    //   });
    // }
  }, []);

  // 창 제어 함수들 (복구)
  const handleMinimize = () => {
    if (electronAPI && typeof electronAPI.send === 'function') {
      electronAPI.send('window-control', 'minimize');
    }
  };

  const handleMaximize = () => {
    if (electronAPI && typeof electronAPI.send === 'function') {
      electronAPI.send('window-control', isMaximized ? 'restore' : 'maximize');
    }
  };

  const handleClose = () => {
    if (electronAPI && typeof electronAPI.send === 'function') {
      electronAPI.send('window-control', 'close');
    }
  };

  return (
    <div 
      className="h-8 flex items-center justify-between bg-[#2B2D31] text-[#949BA4]"
      style={{ WebkitAppRegion: 'drag' } as CSSPropertiesWithWebkit}
    >
      {/* 앱 아이콘 & 타이틀 */}
      <div className="flex items-center px-3 space-x-2">
        <img 
          src="/icon.png" 
          alt="App Icon" 
          className="w-4 h-4" 
        />
        <span className="text-sm font-medium">Local ERP</span>
      </div>

      {/* 창 제어 버튼 */}
      <div 
        className="flex h-full"
        style={{ WebkitAppRegion: 'no-drag' } as CSSPropertiesWithWebkit}
      >
        <button
          onClick={handleMinimize}
          className="w-12 h-full hover:bg-[#404249] hover:text-white transition-colors flex items-center justify-center"
          aria-label="최소화"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M14 8v1H3V8h11z" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-full hover:bg-[#404249] hover:text-white transition-colors flex items-center justify-center"
          aria-label={isMaximized ? "창 크기 복원" : "최대화"}
        >
          {isMaximized ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3 3v10h10V3H3zm9 9H4V4h8v8z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3 3h10v10H3V3z" />
            </svg>
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-full hover:bg-[#DA373C] hover:text-white transition-colors flex items-center justify-center"
          aria-label="닫기"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
          </svg>
        </button>
      </div>
    </div>
  );
} 
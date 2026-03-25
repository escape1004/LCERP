import React, { useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import { TitleBar } from './components/TitleBar';
import { LoadingOverlay } from './components/ui/loading-overlay';
import { AppSettingsModal } from './components/AppSettingsModal';
import { Input } from './components/ui/input';
import { Button } from './components/ui/button';

const queryClient = new QueryClient();

// HashRouter 내부에서 뒤로가기 방지 처리
const RouterContent = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // 현재 경로를 히스토리에 여러 번 push하여 뒤로가기 방지
    const currentPath = window.location.hash || '#/dashboard';
    
    // 히스토리 스택에 현재 상태를 여러 번 추가하여 뒤로가기 방지
    window.history.pushState({ preventBack: true }, '', currentPath);
    window.history.pushState({ preventBack: true }, '', currentPath);
    
    // popstate 이벤트로 브라우저 뒤로가기 방지
    const handlePopState = (e: PopStateEvent) => {
      // 뒤로가기 방지하고 현재 경로 유지
      const savedPath = window.location.hash || '#/dashboard';
      window.history.pushState({ preventBack: true }, '', savedPath);
      window.history.pushState({ preventBack: true }, '', savedPath);
      navigate(savedPath.replace('#', ''));
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/category" element={<Index />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => {
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [isCheckingPassword, setIsCheckingPassword] = useState(true);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // 전역 마우스 4번 버튼(뒤로가기) 기본 동작 방지
  useEffect(() => {
    const handleAuxClick = (e: MouseEvent) => {
      // 마우스 4번 버튼(뒤로가기) = button 3
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      // 마우스 4번 버튼(뒤로가기) = button 3
      if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    // 캡처 단계에서 이벤트 처리 (다른 리스너보다 먼저)
    document.addEventListener('auxclick', handleAuxClick, true);
    document.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      document.removeEventListener('auxclick', handleAuxClick, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    window.electronAPI.getConfig().then((config) => {
      if (cancelled) return;
      setRequiresPassword(Boolean(config?.hasAppPassword));
      setIsCheckingPassword(false);
    }).catch(() => {
      if (cancelled) return;
      setRequiresPassword(false);
      setIsCheckingPassword(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnlock = async () => {
    const result = await window.electronAPI.verifyAppPassword(passwordInput);
    if (result.success) {
      setRequiresPassword(false);
      setPasswordInput('');
      setPasswordError('');
      return;
    }
    setPasswordError('비밀번호가 올바르지 않습니다.');
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="h-screen w-screen flex flex-col bg-discord-bg font-noto">
          <TitleBar onOpenSettings={() => !requiresPassword && setIsAppSettingsOpen(true)} />
          <div className="flex-1 min-h-0">
            {isCheckingPassword ? null : requiresPassword ? (
              <div className="h-full flex items-center justify-center bg-discord-bg p-6">
                <div className="w-full max-w-md rounded-xl border border-gray-700 bg-discord-sidebar p-6">
                  <h2 className="text-xl font-semibold text-white">비밀번호 입력</h2>
                  <p className="mt-2 text-sm text-discord-muted">
                    프로그램에 접근하려면 비밀번호를 입력해야 합니다.
                  </p>
                  <div className="mt-5 space-y-3">
                    <Input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        setPasswordError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          void handleUnlock();
                        }
                      }}
                      className="bg-discord-bg border-gray-600 text-discord-text"
                      placeholder="비밀번호"
                      autoFocus
                    />
                    {passwordError && (
                      <p className="text-sm text-red-400">{passwordError}</p>
                    )}
                    <Button
                      onClick={() => void handleUnlock()}
                      className="w-full bg-discord-accent hover:bg-blue-600 text-white"
                      disabled={!passwordInput.trim()}
                    >
                      잠금 해제
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <HashRouter>
                  <RouterContent />
                </HashRouter>
                <Toaster />
                <Sonner />
              </>
            )}
          </div>
          <AppSettingsModal open={isAppSettingsOpen} onOpenChange={setIsAppSettingsOpen} />
          <LoadingOverlay />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

import React, { useEffect } from 'react';
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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="h-screen w-screen flex flex-col bg-discord-bg font-noto">
          <TitleBar />
          <div className="flex-1 min-h-0">
            <HashRouter>
              <RouterContent />
            </HashRouter>
            <Toaster />
            <Sonner />
          </div>
          <LoadingOverlay />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

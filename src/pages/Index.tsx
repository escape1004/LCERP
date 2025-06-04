import React, { useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { MainContent } from '../components/MainContent';
import { useERPStore } from '../hooks/useERPStore';

const Index = () => {
  const { loadCategories } = useERPStore();

  useEffect(() => {
    // 컴포넌트 마운트 시 카테고리 로드
    loadCategories();
  }, [loadCategories]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <MainContent />
    </div>
  );
};

export default Index;

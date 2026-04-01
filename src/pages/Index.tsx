import React, { useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { MainContent } from '../components/MainContent';
import { useERPStore } from '../hooks/useERPStore';

const Index = () => {
  const { loadCategories, currentProfile } = useERPStore();

  useEffect(() => {
    // 컴포넌트 마운트 시 카테고리 로드
    void loadCategories();
  }, [loadCategories, currentProfile?.id]);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <MainContent />
    </div>
  );
};

export default Index;

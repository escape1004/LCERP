import React, { useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { MainContent } from '../components/MainContent';
import { useERPStore } from '../hooks/useERPStore';

const Index = () => {
  const { loadCategories } = useERPStore();

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  return (
    <div className="h-screen w-full flex bg-discord-bg font-noto">
      <Sidebar />
      <MainContent />
    </div>
  );
};

export default Index;

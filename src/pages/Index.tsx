import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { MainContent } from '../components/MainContent';
import { useERPStore } from '../hooks/useERPStore';

const Index = () => {
  const navigate = useNavigate();
  const {
    categories,
    loadCategories,
    currentProfile,
    selectedCategoryId,
    selectCategory,
    showDbViewer,
  } = useERPStore();

  useEffect(() => {
    // 컴포넌트 마운트 시 카테고리 로드
    void loadCategories();
  }, [loadCategories, currentProfile?.id]);

  useEffect(() => {
    if (showDbViewer) return;

    if (!selectedCategoryId) {
      navigate('/dashboard', { replace: true });
      return;
    }

    if (categories.length > 0 && !categories.some(category => category.id === selectedCategoryId)) {
      selectCategory(null);
      navigate('/dashboard', { replace: true });
    }
  }, [categories, navigate, selectedCategoryId, selectCategory, showDbViewer]);

  if (!showDbViewer && !selectedCategoryId) {
    return <Navigate to="/dashboard" replace />;
  }

  if (
    !showDbViewer
    && selectedCategoryId
    && categories.length > 0
    && !categories.some(category => category.id === selectedCategoryId)
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar />
      <MainContent />
    </div>
  );
};

export default Index;

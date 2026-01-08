import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Settings, Menu, ChevronLeft, Database, LayoutDashboard } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useERPStore } from '../hooks/useERPStore';
import { useLoadingStore } from '../hooks/useLoadingStore';
import { Category } from '../types';
import { Button } from './ui/button';
import { CategoryModal } from './CategoryModal';
import { motion, AnimatePresence } from 'framer-motion';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    categories, 
    selectedCategoryId, 
    selectCategory, 
    reorderCategories,
    setShowDbViewer,
    getCategoryRecords,
    loadRecords,
    showDbViewer
  } = useERPStore();
  
  const { showLoading, hideLoading, setLoading: setGlobalLoading } = useLoadingStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const rootCategories = categories.filter(cat => !cat.parentId).sort((a, b) => a.order - b.order);
  
  const getSubCategories = (parentId: string) => 
    categories.filter(cat => cat.parentId === parentId).sort((a, b) => a.order - b.order);

  // Check if category should be expanded (selected or has selected subcategory)
  const shouldShowSubCategories = (categoryId: string) => {
    if (selectedCategoryId === categoryId) return true;
    const subCategories = getSubCategories(categoryId);
    return subCategories.some(sub => sub.id === selectedCategoryId);
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.droppableId !== 'root-categories' || destination.droppableId !== 'root-categories') return;

    const siblings = categories.filter(cat => !cat.parentId).sort((a, b) => a.order - b.order);
    const [reorderedItem] = siblings.splice(source.index, 1);
    siblings.splice(destination.index, 0, reorderedItem);

    const reorderedCategories = categories.map(cat => {
      if (!cat.parentId) {
        const newIndex = siblings.findIndex(sibling => sibling.id === cat.id);
        return { ...cat, order: newIndex };
      }
      return cat;
    });

    reorderCategories(reorderedCategories);
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setIsModalOpen(true);
  };

  const renderCategory = (category: Category, level = 0) => {
    const subCategories = getSubCategories(category.id);
    const isSelected = selectedCategoryId === category.id;
    const showSubCategories = shouldShowSubCategories(category.id);

    return (
      <div key={category.id}>
        <div
          className={`flex items-center py-2 px-3 mb-1 rounded cursor-pointer transition-colors group ${
            isSelected 
              ? 'bg-discord-accent text-white' 
              : 'hover:bg-discord-hover text-discord-text'
          }`}
          style={{ paddingLeft: `${12 + level * 12}px` }}
          onMouseEnter={() => setHoveredCategory(category.id)}
          onMouseLeave={() => setHoveredCategory(null)}
          onClick={async () => {
            navigate('/category');
            // 이미 로드된 카테고리인지 확인
            const existingRecords = getCategoryRecords(category.id);
            const needsLoading = !existingRecords || existingRecords.length === 0;
            
            if (needsLoading) {
              // 즉시 로딩 표시 (500ms 지연 없이)
              setGlobalLoading(true, '카테고리 로딩 중...');
              showLoading('카테고리 로딩 중...', 15000, true);
            }
            
            selectCategory(category.id);
            setShowDbViewer(false);
            
            // 로드되지 않은 경우 selectCategory가 완료될 때까지 대기 후 로딩 화면 닫기
            if (needsLoading) {
              // selectCategory는 내부에서 레코드를 로드하므로, 짧은 지연 후 로딩 화면 닫기
              // 또는 loadRecords를 호출하여 확실히 로드 완료 확인
              try {
                await loadRecords(category.id);
              } catch (error) {
                console.error('카테고리 로드 오류:', error);
              } finally {
                hideLoading();
              }
            }
          }}
        >
          {level > 0 && (
            <span className="mr-2 text-gray-400">└</span>
          )}
          
          <span className="flex-1 text-sm font-medium truncate">
            {category.name}
          </span>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditCategory(category);
            }}
            className={`ml-2 p-1 rounded transition-opacity hover:bg-discord-bg ${
              hoveredCategory === category.id || isSelected ? 'opacity-70 hover:opacity-100' : 'opacity-0'
            }`}
          >
            <Settings size={14} />
          </button>
        </div>
        
        <AnimatePresence>
          {showSubCategories && subCategories.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {subCategories.map(subCategory => renderCategory(subCategory, level + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderDraggableCategory = (category: Category, level = 0) => {
    const subCategories = getSubCategories(category.id);
    const isSelected = selectedCategoryId === category.id;
    const showSubCategories = shouldShowSubCategories(category.id);

    return (
      <div key={category.id}>
        <div
          className={`flex items-center py-2 px-3 mb-1 rounded cursor-pointer transition-colors group ${
            isSelected 
              ? 'bg-discord-accent text-white' 
              : 'hover:bg-discord-hover text-discord-text'
          }`}
          style={{ paddingLeft: `${12 + level * 12}px` }}
          onMouseEnter={() => setHoveredCategory(category.id)}
          onMouseLeave={() => setHoveredCategory(null)}
          onClick={async () => {
            navigate('/category');
            // 이미 로드된 카테고리인지 확인
            const existingRecords = getCategoryRecords(category.id);
            const needsLoading = !existingRecords || existingRecords.length === 0;
            
            if (needsLoading) {
              // 즉시 로딩 표시 (500ms 지연 없이)
              setGlobalLoading(true, '카테고리 로딩 중...');
              showLoading('카테고리 로딩 중...', 15000, true);
            }
            
            selectCategory(category.id);
            setShowDbViewer(false);
            
            // 로드되지 않은 경우 selectCategory가 완료될 때까지 대기 후 로딩 화면 닫기
            if (needsLoading) {
              // selectCategory는 내부에서 레코드를 로드하므로, 짧은 지연 후 로딩 화면 닫기
              // 또는 loadRecords를 호출하여 확실히 로드 완료 확인
              try {
                await loadRecords(category.id);
              } catch (error) {
                console.error('카테고리 로드 오류:', error);
              } finally {
                hideLoading();
              }
            }
          }}
        >
          {level > 0 && (
            <span className="mr-2 text-gray-400">└</span>
          )}
          
          <span className="flex-1 text-sm font-medium truncate">
            {category.name}
          </span>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleEditCategory(category);
            }}
            className={`ml-2 p-1 rounded transition-opacity hover:bg-discord-bg ${
              hoveredCategory === category.id || isSelected ? 'opacity-70 hover:opacity-100' : 'opacity-0'
            }`}
          >
            <Settings size={14} />
          </button>
        </div>
        
        <AnimatePresence>
          {showSubCategories && subCategories.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              {subCategories.map(subCategory => renderCategory(subCategory, level + 1))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div className="w-12 h-full flex flex-col bg-discord-sidebar">
        <div className="shrink-0 flex items-center justify-center h-16 border-b border-gray-800">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCollapsed(false)}
            className="h-8 w-8 p-0 hover:bg-discord-hover"
          >
            <Menu size={16} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-64 h-full flex flex-col bg-discord-sidebar">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-gray-800 flex items-center justify-between">
        <h1 className="text-lg font-bold text-discord-text">Local ERP</h1>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsCollapsed(true)}
          className="h-8 w-8 p-0 hover:bg-discord-hover"
        >
          <ChevronLeft size={16} />
        </Button>
      </div>

      {/* Dashboard Menu */}
      <div className="shrink-0 p-3 border-b border-gray-800">
        <button
          onClick={() => {
            navigate('/dashboard');
            setShowDbViewer(false);
            selectCategory(null);
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded transition-colors ${
            (location.pathname === '/dashboard' || location.hash === '#/dashboard' || (location.pathname === '/' && location.hash === '')) && !showDbViewer
              ? 'bg-discord-accent text-white'
              : 'hover:bg-discord-hover text-discord-text'
          }`}
        >
          <LayoutDashboard size={18} />
          <span className="text-sm font-medium">대시보드</span>
        </button>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto discord-scrollbar">
        <div className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-discord-muted uppercase tracking-wide">
              카테고리
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingCategory(null);
                setIsModalOpen(true);
              }}
              className="h-6 w-6 p-0 hover:bg-discord-hover"
            >
              <Plus size={14} />
            </Button>
          </div>

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="root-categories">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {rootCategories.map((category, index) => (
                    <Draggable
                      key={category.id}
                      draggableId={category.id}
                      index={index}
                    >
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                        >
                          {renderDraggableCategory(category)}
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      </div>

      {/* DB 뷰어 버튼 */}
      <div className="p-3 border-gray-800">
        <Button
          variant="ghost"
          className="w-full justify-start text-discord-muted hover:text-discord-text"
          onClick={() => {
            selectCategory(null);
            setShowDbViewer(true);
          }}
        >
          <Database className="mr-2 h-4 w-4" />
          데이터베이스 보기
        </Button>
      </div>

      {/* Category Modal */}
      <CategoryModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCategory(null);
        }}
        category={editingCategory}
      />
    </div>
  );
};

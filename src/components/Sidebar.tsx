
import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, Settings, Menu, X } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Category } from '../types';
import { Button } from './ui/button';
import { CategoryModal } from './CategoryModal';

export const Sidebar: React.FC = () => {
  const { 
    categories, 
    selectedCategoryId, 
    selectCategory, 
    reorderCategories 
  } = useERPStore();
  
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

    const items = Array.from(categories);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const reorderedCategories = items.map((item, index) => ({
      ...item,
      order: index,
    }));

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
          style={{ paddingLeft: `${12 + level * 20}px` }}
          onMouseEnter={() => setHoveredCategory(category.id)}
          onMouseLeave={() => setHoveredCategory(null)}
          onClick={() => selectCategory(category.id)}
        >
          {level > 0 && (
            <span className="mr-2 text-discord-muted">└</span>
          )}
          
          <span className="flex-1 text-sm font-medium truncate">
            {category.name}
          </span>
          
          {(hoveredCategory === category.id || isSelected) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleEditCategory(category);
              }}
              className="ml-2 p-1 opacity-70 hover:opacity-100 hover:bg-discord-bg rounded transition-opacity"
            >
              <Settings size={14} />
            </button>
          )}
        </div>
        
        {showSubCategories && subCategories.length > 0 && (
          <div>
            {subCategories.map(subCategory => renderCategory(subCategory, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div className="w-12 bg-discord-sidebar h-screen flex flex-col border-r border-gray-800">
        <div className="flex items-center justify-center h-16 border-b border-gray-800">
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
    <div className="w-64 bg-discord-sidebar h-screen flex flex-col border-r border-gray-800">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <h1 className="text-lg font-bold text-discord-text">ERP 시스템</h1>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsCollapsed(true)}
          className="h-8 w-8 p-0 hover:bg-discord-hover"
        >
          <X size={16} />
        </Button>
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
            <Droppable droppableId="categories">
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
                          {renderCategory(category)}
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

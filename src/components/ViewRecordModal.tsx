import React, { useCallback } from 'react';
import { X, ExternalLink, ChevronRight } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Category, DataRecord, FieldDefinition } from '../types';
import { Button } from './ui/button';

interface ViewRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category;
  record: DataRecord | null;
}

export const ViewRecordModal: React.FC<ViewRecordModalProps> = ({
  isOpen,
  onClose,
  category,
  record,
}) => {
  const { categories, getCategoryRecords, selectCategory } = useERPStore();

  // Get parent categories path
  const getParentPath = useCallback((currentCategory: Category): Category[] => {
    const path: Category[] = [];
    let parent = currentCategory.parentId ? categories.find(c => c.id === currentCategory.parentId) : null;
    
    while (parent) {
      path.unshift(parent);
      parent = parent.parentId ? categories.find(c => c.id === parent.parentId) : null;
    }
    
    return path;
  }, [categories]);

  const handleCategoryClick = useCallback((categoryId: string) => {
    selectCategory(categoryId);
    onClose();
  }, [selectCategory, onClose]);

  if (!isOpen || !record) return null;

  const handleUrlClick = async (e: React.MouseEvent, url: string) => {
    e.preventDefault();
    console.log('Attempting to open URL:', url);
    try {
      const result = await window.electronAPI.openExternal(url);
      if (!result.success) {
        console.error('Failed to open URL:', result.error);
        // TODO: Add toast notification here
      }
    } catch (error) {
      console.error('Error opening URL:', error);
      // TODO: Add toast notification here
    }
  };

  const renderUrl = (url: string) => (
    <button
      type="button"
      onClick={(e) => handleUrlClick(e, url)}
      className="text-discord-accent hover:underline flex items-center gap-2 break-all"
    >
      {url}
      <ExternalLink size={16} className="flex-shrink-0" />
    </button>
  );

  const formatFieldValue = (field: FieldDefinition, value: any) => {
    if (value === null || value === undefined || value === '') return '-';

    const urlPattern = /^https?:\/\/.+/i;

    switch (field.type) {
      case 'date':
        return new Date(value).toLocaleDateString();
      
      case 'select':
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-2">
              {value.map((item, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-discord-accent text-white text-sm rounded-full"
                >
                  {String(item)}
                </span>
              ))}
            </div>
          );
        }
        return String(value);
      
      case 'relation':
        if (!field.relationCategoryId) return String(value);
        
        const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
        if (!relatedCategory) return String(value);
        
        const relatedRecords = getCategoryRecords(field.relationCategoryId);
        const displayField = relatedCategory.fields[0];
        
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-2">
              {value.map((relatedId, index) => {
                const relatedRecord = relatedRecords.find(r => r.id === relatedId);
                if (!relatedRecord) return null;
                
                return (
                  <span
                    key={index}
                    className="px-3 py-1 bg-discord-success text-white text-sm rounded-full"
                  >
                    {String(relatedRecord.data[displayField?.id] || relatedRecord.id)}
                  </span>
                );
              })}
            </div>
          );
        } else {
          const relatedRecord = relatedRecords.find(r => r.id === value);
          return relatedRecord 
            ? String(relatedRecord.data[displayField?.id] || relatedRecord.id)
            : String(value);
        }
      
      default:
        if (typeof value === 'string' && urlPattern.test(value)) {
          return renderUrl(value);
        }
        return String(value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-discord-text">
              항목 상세 정보
            </h2>
            <div className="text-sm text-discord-muted mt-1 flex items-center gap-1">
              {category.parentId ? (
                <>
                  {getParentPath(category).map((cat, index) => (
                    <React.Fragment key={cat.id}>
                      <button
                        onClick={() => handleCategoryClick(cat.id)}
                        className="hover:text-discord-text hover:underline"
                      >
                        {cat.name}
                      </button>
                      <ChevronRight size={14} className="text-discord-muted mx-0.5" />
                    </React.Fragment>
                  ))}
                  <span className="text-discord-text">{category.name}</span>
                </>
              ) : (
                <span className="text-discord-text">{category.name}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 p-6 overflow-y-auto max-h-[calc(90vh-160px)] discord-scrollbar">
          <div className="space-y-6">
            {category.fields
              .sort((a, b) => a.order - b.order)
              .map(field => (
                <div key={field.id} className="border-b border-gray-800 pb-4 last:border-b-0">
                  <h3 className="text-sm font-semibold text-discord-muted uppercase tracking-wide mb-2">
                    {field.name}
                  </h3>
                  <div className="text-discord-text">
                    {formatFieldValue(field, record.data[field.id])}
                  </div>
                </div>
              ))}
            
            {/* Metadata */}
            <div className="pt-4 border-t border-gray-700">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-discord-muted">생성일:</span>
                  <div className="text-discord-text">
                    {new Date(record.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-discord-muted">수정일:</span>
                  <div className="text-discord-text">
                    {new Date(record.updatedAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end p-6 border-t border-gray-700">
          <Button onClick={onClose} className="bg-discord-accent hover:bg-blue-600">
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
};

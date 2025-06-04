
import React from 'react';
import { X, ExternalLink } from 'lucide-react';
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
  const { categories, getCategoryRecords } = useERPStore();

  if (!isOpen || !record) return null;

  const formatFieldValue = (field: FieldDefinition, value: any) => {
    if (value === null || value === undefined || value === '') return '-';

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
        // URL detection and linking
        const urlPattern = /^https?:\/\/.+/i;
        if (typeof value === 'string' && urlPattern.test(value)) {
          return (
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-discord-accent hover:underline flex items-center gap-2 break-all"
            >
              {value}
              <ExternalLink size={16} className="flex-shrink-0" />
            </a>
          );
        }
        return String(value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-discord-text">
              항목 상세 정보
            </h2>
            <p className="text-discord-muted text-sm mt-1">
              {category.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)] discord-scrollbar">
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
                    {record.createdAt.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="text-discord-muted">수정일:</span>
                  <div className="text-discord-text">
                    {record.updatedAt.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t border-gray-700">
          <Button onClick={onClose} className="bg-discord-accent hover:bg-blue-600">
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
};

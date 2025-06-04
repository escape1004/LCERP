
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Category, FieldDefinition } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category | null;
}

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  const { categories, addCategory, updateCategory, deleteCategory } = useERPStore();
  
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [selectOptions, setSelectOptions] = useState<Record<string, string>>({});

  useEffect(() => {
    if (category) {
      setName(category.name);
      setParentId(category.parentId || '');
      setFields([...category.fields].sort((a, b) => a.order - b.order));
      
      // Initialize select options
      const options: Record<string, string> = {};
      category.fields.forEach(field => {
        if (field.type === 'select' && field.selectOptions) {
          options[field.id] = field.selectOptions.join('\n');
        }
      });
      setSelectOptions(options);
    } else {
      setName('');
      setParentId('');
      setFields([]);
      setSelectOptions({});
    }
  }, [category, isOpen]);

  const generateFieldId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

  const addField = () => {
    const newField: FieldDefinition = {
      id: generateFieldId(),
      name: '새 필드',
      type: 'text',
      required: false,
      order: fields.length,
    };
    setFields([...fields, newField]);
  };

  const updateField = (id: string, updates: Partial<FieldDefinition>) => {
    setFields(fields.map(field => 
      field.id === id ? { ...field, ...updates } : field
    ));
  };

  const deleteField = (id: string) => {
    setFields(fields.filter(field => field.id !== id));
    const newSelectOptions = { ...selectOptions };
    delete newSelectOptions[id];
    setSelectOptions(newSelectOptions);
  };

  const handleFieldDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(fields);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const reorderedFields = items.map((item, index) => ({
      ...item,
      order: index,
    }));

    setFields(reorderedFields);
  };

  const handleSave = () => {
    if (!name.trim()) return;

    // Process select options
    const processedFields = fields.map(field => {
      if (field.type === 'select') {
        const options = selectOptions[field.id];
        return {
          ...field,
          selectOptions: options ? options.split('\n').filter(opt => opt.trim()) : [],
        };
      }
      return field;
    });

    const categoryData = {
      name: name.trim(),
      parentId: parentId === 'none' ? undefined : parentId || undefined,
      fields: processedFields,
      order: category?.order ?? categories.length,
    };

    if (category) {
      updateCategory(category.id, categoryData);
    } else {
      addCategory(categoryData);
    }

    onClose();
  };

  const handleDelete = () => {
    if (category && window.confirm('이 카테고리를 삭제하시겠습니까? 모든 데이터가 삭제됩니다.')) {
      deleteCategory(category.id);
      onClose();
    }
  };

  const availableParentCategories = categories.filter(cat => 
    !cat.parentId && (!category || cat.id !== category.id)
  );

  const availableRelationCategories = categories.filter(cat => 
    !category || cat.id !== category.id
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-discord-text">
            {category ? '카테고리 수정' : '새 카테고리'}
          </h2>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] discord-scrollbar">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="text-discord-text">카테고리 이름</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-discord-sidebar border-gray-600 text-discord-text"
                  placeholder="카테고리 이름을 입력하세요"
                />
              </div>
              <div>
                <Label htmlFor="parent" className="text-discord-text">상위 카테고리</Label>
                <Select value={parentId || 'none'} onValueChange={(value) => setParentId(value === 'none' ? '' : value)}>
                  <SelectTrigger className="bg-discord-sidebar border-gray-600 text-discord-text">
                    <SelectValue placeholder="상위 카테고리 선택 (선택사항)" />
                  </SelectTrigger>
                  <SelectContent className="bg-discord-sidebar border-gray-600">
                    <SelectItem value="none">없음</SelectItem>
                    {availableParentCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fields */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label className="text-discord-text text-lg">필드 설정</Label>
                <Button onClick={addField} size="sm" className="bg-discord-accent hover:bg-blue-600">
                  <Plus size={16} className="mr-2" />
                  필드 추가
                </Button>
              </div>

              <DragDropContext onDragEnd={handleFieldDragEnd}>
                <Droppable droppableId="fields">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                      {fields.map((field, index) => (
                        <Draggable key={field.id} draggableId={field.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className="bg-discord-sidebar rounded-lg p-4 border border-gray-700"
                            >
                              <div className="flex items-start gap-4">
                                <div {...provided.dragHandleProps} className="mt-6">
                                  <GripVertical size={16} className="text-discord-muted" />
                                </div>
                                
                                <div className="flex-1 grid grid-cols-3 gap-4">
                                  <div>
                                    <Label className="text-discord-text">필드명</Label>
                                    <Input
                                      value={field.name}
                                      onChange={(e) => updateField(field.id, { name: e.target.value })}
                                      className="bg-discord-bg border-gray-600 text-discord-text"
                                    />
                                  </div>
                                  
                                  <div>
                                    <Label className="text-discord-text">타입</Label>
                                    <Select
                                      value={field.type}
                                      onValueChange={(value: any) => updateField(field.id, { type: value })}
                                    >
                                      <SelectTrigger className="bg-discord-bg border-gray-600 text-discord-text">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent className="bg-discord-sidebar border-gray-600">
                                        <SelectItem value="text">텍스트</SelectItem>
                                        <SelectItem value="number">숫자</SelectItem>
                                        <SelectItem value="date">날짜</SelectItem>
                                        <SelectItem value="longtext">긴 텍스트</SelectItem>
                                        <SelectItem value="select">셀렉트</SelectItem>
                                        <SelectItem value="relation">관계형</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  
                                  <div className="flex items-center space-x-4 pt-6">
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`required-${field.id}`}
                                        checked={field.required}
                                        onCheckedChange={(checked) => 
                                          updateField(field.id, { required: !!checked })
                                        }
                                      />
                                      <Label 
                                        htmlFor={`required-${field.id}`} 
                                        className="text-discord-text text-sm"
                                      >
                                        필수
                                      </Label>
                                    </div>
                                    
                                    {(field.type === 'select' || field.type === 'relation') && (
                                      <div className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`multi-${field.id}`}
                                          checked={field.multiSelect}
                                          onCheckedChange={(checked) => 
                                            updateField(field.id, { multiSelect: !!checked })
                                          }
                                        />
                                        <Label 
                                          htmlFor={`multi-${field.id}`} 
                                          className="text-discord-text text-sm"
                                        >
                                          다중선택
                                        </Label>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteField(field.id)}
                                  className="text-discord-danger hover:bg-red-900"
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </div>
                              
                              {/* Field-specific options */}
                              {field.type === 'select' && (
                                <div className="mt-4">
                                  <Label className="text-discord-text">선택 옵션 (한 줄에 하나씩)</Label>
                                  <Textarea
                                    value={selectOptions[field.id] || ''}
                                    onChange={(e) => setSelectOptions({
                                      ...selectOptions,
                                      [field.id]: e.target.value
                                    })}
                                    className="bg-discord-bg border-gray-600 text-discord-text"
                                    placeholder="옵션1&#10;옵션2&#10;옵션3"
                                    rows={3}
                                  />
                                </div>
                              )}
                              
                              {field.type === 'relation' && (
                                <div className="mt-4">
                                  <Label className="text-discord-text">참조 카테고리</Label>
                                  <Select
                                    value={field.relationCategoryId || 'none'}
                                    onValueChange={(value) => 
                                      updateField(field.id, { relationCategoryId: value === 'none' ? undefined : value })
                                    }
                                  >
                                    <SelectTrigger className="bg-discord-bg border-gray-600 text-discord-text">
                                      <SelectValue placeholder="참조할 카테고리 선택" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-discord-sidebar border-gray-600">
                                      <SelectItem value="none">선택 안함</SelectItem>
                                      {availableRelationCategories.map(cat => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                          {cat.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-700">
          <div>
            {category && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="bg-discord-danger hover:bg-red-600"
              >
                카테고리 삭제
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button 
              onClick={handleSave}
              className="bg-discord-accent hover:bg-blue-600"
              disabled={!name.trim()}
            >
              {category ? '수정' : '생성'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

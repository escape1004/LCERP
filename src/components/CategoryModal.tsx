
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useERPStore } from '../hooks/useERPStore';
import { Category, FieldDefinition } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category | null;
}

const fieldTypes = [
  { id: 'text', name: '텍스트' },
  { id: 'number', name: '숫자' },
  { id: 'date', name: '날짜' },
  { id: 'longtext', name: '긴 텍스트' },
  { id: 'select', name: '선택' },
  { id: 'relation', name: '관계형' },
];

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  const { categories, addCategory, updateCategory, deleteCategory } = useERPStore();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [fields, setFields] = useState<FieldDefinition[]>([]);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setParentId(category.parentId || '');
      setFields([...category.fields]);
    } else {
      setName('');
      setParentId('');
      setFields([]);
    }
  }, [category, isOpen]);

  const availableParentCategories = categories.filter(cat => 
    cat.id !== category?.id && !cat.parentId
  );

  const availableRelationCategories = categories.filter(cat => 
    cat.id !== category?.id
  );

  const generateFieldId = () => Math.random().toString(36).substring(2) + Date.now().toString(36);

  const addField = () => {
    const newField: FieldDefinition = {
      id: generateFieldId(),
      name: '',
      type: 'text',
      required: false,
      order: fields.length,
    };
    setFields([...fields, newField]);
  };

  const updateField = (fieldId: string, updates: Partial<FieldDefinition>) => {
    setFields(fields.map(field =>
      field.id === fieldId ? { ...field, ...updates } : field
    ));
  };

  const removeField = (fieldId: string) => {
    setFields(fields.filter(field => field.id !== fieldId));
  };

  const handleDragEnd = (result: any) => {
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

  const handleSubmit = () => {
    if (!name.trim()) return;

    const processedFields = fields.map((field, index) => ({
      ...field,
      order: index,
    }));

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
    if (category && window.confirm('이 카테고리를 삭제하시겠습니까?')) {
      deleteCategory(category.id);
      onClose();
    }
  };

  const addSelectOption = (fieldId: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (field) {
      const options = field.selectOptions || [];
      updateField(fieldId, {
        selectOptions: [...options, '']
      });
    }
  };

  const updateSelectOption = (fieldId: string, optionIndex: number, value: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (field && field.selectOptions) {
      const newOptions = [...field.selectOptions];
      newOptions[optionIndex] = value;
      updateField(fieldId, { selectOptions: newOptions });
    }
  };

  const removeSelectOption = (fieldId: string, optionIndex: number) => {
    const field = fields.find(f => f.id === fieldId);
    if (field && field.selectOptions) {
      const newOptions = field.selectOptions.filter((_, index) => index !== optionIndex);
      updateField(fieldId, { selectOptions: newOptions });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-discord-text">
            {category ? '카테고리 수정' : '새 카테고리 생성'}
          </h2>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)] discord-scrollbar">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="text-discord-text">카테고리명 *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-discord-sidebar border-gray-600 text-discord-text"
                  placeholder="카테고리명을 입력하세요"
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-discord-text">필드 설정</h3>
                <Button
                  onClick={addField}
                  size="sm"
                  className="bg-discord-accent hover:bg-blue-600"
                >
                  <Plus size={16} className="mr-2" />
                  필드 추가
                </Button>
              </div>

              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="fields">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                      {fields.map((field, index) => (
                        <Draggable key={field.id} draggableId={field.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className="p-4 bg-discord-sidebar rounded-lg border border-gray-700"
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  {...provided.dragHandleProps}
                                  className="mt-2 text-discord-muted cursor-move"
                                >
                                  <GripVertical size={16} />
                                </div>
                                
                                <div className="flex-1 space-y-3">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-discord-text text-sm">필드명</Label>
                                      <Input
                                        value={field.name}
                                        onChange={(e) => updateField(field.id, { name: e.target.value })}
                                        className="bg-discord-bg border-gray-600 text-discord-text"
                                        placeholder="필드명을 입력하세요"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-discord-text text-sm">타입</Label>
                                      <Select
                                        value={field.type}
                                        onValueChange={(value) => updateField(field.id, { type: value as any })}
                                      >
                                        <SelectTrigger className="bg-discord-bg border-gray-600 text-discord-text">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-discord-sidebar border-gray-600">
                                          {fieldTypes.map(type => (
                                            <SelectItem key={type.id} value={type.id}>
                                              {type.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`required-${field.id}`}
                                      checked={field.required}
                                      onCheckedChange={(checked) => updateField(field.id, { required: !!checked })}
                                    />
                                    <Label 
                                      htmlFor={`required-${field.id}`}
                                      className="text-discord-text text-sm"
                                    >
                                      필수 입력
                                    </Label>
                                  </div>

                                  {(field.type === 'select' || field.type === 'relation') && (
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`multi-${field.id}`}
                                        checked={field.multiSelect}
                                        onCheckedChange={(checked) => updateField(field.id, { multiSelect: !!checked })}
                                      />
                                      <Label 
                                        htmlFor={`multi-${field.id}`}
                                        className="text-discord-text text-sm"
                                      >
                                        다중 선택
                                      </Label>
                                    </div>
                                  )}

                                  {field.type === 'select' && (
                                    <div>
                                      <Label className="text-discord-text text-sm">선택 옵션</Label>
                                      <div className="space-y-2">
                                        {field.selectOptions?.map((option, optionIndex) => (
                                          <div key={optionIndex} className="flex gap-2">
                                            <Input
                                              value={option}
                                              onChange={(e) => updateSelectOption(field.id, optionIndex, e.target.value)}
                                              className="bg-discord-bg border-gray-600 text-discord-text"
                                              placeholder="옵션 입력"
                                            />
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => removeSelectOption(field.id, optionIndex)}
                                              className="text-discord-danger hover:bg-red-900"
                                            >
                                              <Trash2 size={14} />
                                            </Button>
                                          </div>
                                        ))}
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => addSelectOption(field.id)}
                                          className="border-gray-600 hover:bg-discord-hover"
                                        >
                                          <Plus size={14} className="mr-2" />
                                          옵션 추가
                                        </Button>
                                      </div>
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

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeField(field.id)}
                                  className="mt-2 text-discord-danger hover:bg-red-900"
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </div>
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
                onClick={handleDelete}
                variant="ghost"
                className="text-discord-danger hover:bg-red-900"
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
              onClick={handleSubmit}
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

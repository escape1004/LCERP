import React, { useState, useEffect } from 'react';
import { X, GripVertical, Plus, Trash2 } from 'lucide-react';
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

export const CategoryModal: React.FC<CategoryModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  const { categories, addCategory, updateCategory } = useERPStore();
  const [formData, setFormData] = useState({
    name: '',
    parentId: undefined,
    fields: [] as FieldDefinition[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        parentId: category.parentId,
        fields: category.fields,
      });
    } else {
      setFormData({
        name: '',
        parentId: undefined,
        fields: [],
      });
    }
    setErrors({});
  }, [category, isOpen]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = '카테고리 이름을 입력하세요.';
    }

    // Validate field names
    formData.fields.forEach((field, index) => {
      if (!field.name.trim()) {
        newErrors[`field_${index}_name`] = '필드명을 입력하세요.';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    if (category) {
      updateCategory(category.id, {
        name: formData.name,
        parentId: formData.parentId,
        fields: formData.fields,
      });
    } else {
      addCategory({
        name: formData.name,
        parentId: formData.parentId,
        fields: formData.fields,
        order: categories.length,
      });
    }

    onClose();
  };

  const addField = () => {
    const newField: FieldDefinition = {
      id: Math.random().toString(36).substring(2),
      name: '',
      type: 'text',
      required: false,
      order: formData.fields.length,
    };
    setFormData(prev => ({ ...prev, fields: [...prev.fields, newField] }));
  };

  const removeField = (index: number) => {
    const newFields = formData.fields.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, fields: newFields }));
  };

  const updateField = (index: number, updates: Partial<FieldDefinition>) => {
    const newFields = [...formData.fields];
    newFields[index] = { ...newFields[index], ...updates };
    setFormData(prev => ({ ...prev, fields: newFields }));
    
    // Clear field name error when user starts typing
    if (updates.name && errors[`field_${index}_name`]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`field_${index}_name`];
        return newErrors;
      });
    }
  };

  const moveField = (dragIndex: number, hoverIndex: number) => {
    const newFields = [...formData.fields];
    const draggedField = newFields[dragIndex];
    newFields.splice(dragIndex, 1);
    newFields.splice(hoverIndex, 0, draggedField);

    // Update order
    const reorderedFields = newFields.map((field, index) => ({
      ...field,
      order: index,
    }));

    setFormData(prev => ({ ...prev, fields: reorderedFields }));
  };

  const handleFieldDragEnd = (result: any) => {
    if (!result.destination) return;
    moveField(result.source.index, result.destination.index);
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
          <div className="space-y-6">
            {/* Category Name */}
            <div>
              <Label className="text-discord-text font-medium">
                카테고리 이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, name: e.target.value }));
                  if (errors.name) {
                    setErrors(prev => {
                      const newErrors = { ...prev };
                      delete newErrors.name;
                      return newErrors;
                    });
                  }
                }}
                className={`mt-2 bg-discord-sidebar border-gray-600 text-discord-text ${
                  errors.name ? 'border-red-500' : ''
                }`}
                placeholder="카테고리 이름을 입력하세요"
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name}</p>
              )}
            </div>

            {/* Parent Category */}
            <div>
              <Label className="text-discord-text font-medium">상위 카테고리</Label>
              <Select
                value={formData.parentId || 'none'}
                onValueChange={(value) => setFormData(prev => ({ 
                  ...prev, 
                  parentId: value === 'none' ? undefined : value 
                }))}
              >
                <SelectTrigger className="mt-2 bg-discord-sidebar border-gray-600 text-discord-text">
                  <SelectValue placeholder="상위 카테고리 선택 (선택사항)" />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-gray-600">
                  <SelectItem value="none">없음 (최상위 카테고리)</SelectItem>
                  {categories
                    .filter(cat => !cat.parentId && cat.id !== category?.id)
                    .map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fields */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label className="text-discord-text font-medium">필드 설정</Label>
                <Button
                  type="button"
                  onClick={addField}
                  size="sm"
                  className="bg-discord-accent hover:bg-blue-600"
                >
                  <Plus size={16} className="mr-1" />
                  필드 추가
                </Button>
              </div>

              <DragDropContext onDragEnd={handleFieldDragEnd}>
                <Droppable droppableId="fields">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                      {formData.fields.map((field, index) => (
                        <Draggable key={field.id} draggableId={field.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className="p-4 bg-discord-sidebar rounded-lg border border-gray-600"
                            >
                              <div className="flex items-center gap-2 mb-3">
                                <div {...provided.dragHandleProps} className="cursor-move text-discord-muted">
                                  <GripVertical size={16} />
                                </div>
                                <Input
                                  placeholder="필드명을 입력하세요"
                                  value={field.name}
                                  onChange={(e) => updateField(index, { name: e.target.value })}
                                  className={`flex-1 bg-discord-bg border-gray-700 text-discord-text ${
                                    errors[`field_${index}_name`] ? 'border-red-500' : ''
                                  }`}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeField(index)}
                                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                >
                                  <Trash2 size={16} />
                                </Button>
                              </div>
                              
                              {errors[`field_${index}_name`] && (
                                <p className="text-red-500 text-sm mb-3 ml-6">{errors[`field_${index}_name`]}</p>
                              )}

                              <div className="grid grid-cols-2 gap-4 ml-6">
                                <div>
                                  <Label className="text-discord-text text-sm">필드 타입</Label>
                                  <Select
                                    value={field.type}
                                    onValueChange={(value) => updateField(index, { 
                                      type: value as FieldDefinition['type'],
                                      selectOptions: value === 'select' ? [] : undefined,
                                      relationCategoryId: value === 'relation' ? undefined : field.relationCategoryId
                                    })}
                                  >
                                    <SelectTrigger className="mt-1 bg-discord-bg border-gray-700 text-discord-text">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-discord-sidebar border-gray-600">
                                      <SelectItem value="text">텍스트</SelectItem>
                                      <SelectItem value="number">숫자</SelectItem>
                                      <SelectItem value="date">날짜</SelectItem>
                                      <SelectItem value="longtext">긴 텍스트</SelectItem>
                                      <SelectItem value="select">선택 목록</SelectItem>
                                      <SelectItem value="relation">관계형 (다른 카테고리 참조)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="flex items-center gap-4 mt-6">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`required-${field.id}`}
                                      checked={field.required || false}
                                      onCheckedChange={(checked) => updateField(index, { required: !!checked })}
                                    />
                                    <Label htmlFor={`required-${field.id}`} className="text-discord-text text-sm">
                                      필수
                                    </Label>
                                  </div>

                                  {(field.type === 'select' || field.type === 'relation') && (
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`multi-${field.id}`}
                                        checked={field.multiSelect || false}
                                        onCheckedChange={(checked) => updateField(index, { multiSelect: !!checked })}
                                      />
                                      <Label htmlFor={`multi-${field.id}`} className="text-discord-text text-sm">
                                        다중 선택
                                      </Label>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Select Options */}
                              {field.type === 'select' && (
                                <div className="mt-4 ml-6">
                                  <Label className="text-discord-text text-sm">선택 옵션</Label>
                                  <div className="mt-2 space-y-2">
                                    {(field.selectOptions || []).map((option, optionIndex) => (
                                      <div key={optionIndex} className="flex gap-2">
                                        <Input
                                          value={option}
                                          onChange={(e) => {
                                            const newOptions = [...(field.selectOptions || [])];
                                            newOptions[optionIndex] = e.target.value;
                                            updateField(index, { selectOptions: newOptions });
                                          }}
                                          className="bg-discord-bg border-gray-700 text-discord-text"
                                          placeholder="옵션 입력"
                                        />
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            const newOptions = (field.selectOptions || []).filter((_, i) => i !== optionIndex);
                                            updateField(index, { selectOptions: newOptions });
                                          }}
                                          className="text-red-400 hover:text-red-300"
                                        >
                                          <X size={16} />
                                        </Button>
                                      </div>
                                    ))}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const newOptions = [...(field.selectOptions || []), ''];
                                        updateField(index, { selectOptions: newOptions });
                                      }}
                                      className="border-gray-600 hover:bg-discord-hover"
                                    >
                                      <Plus size={16} className="mr-1" />
                                      옵션 추가
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* Relation Category */}
                              {field.type === 'relation' && (
                                <div className="mt-4 ml-6">
                                  <Label className="text-discord-text text-sm">참조할 카테고리</Label>
                                  <Select
                                    value={field.relationCategoryId || 'none'}
                                    onValueChange={(value) => updateField(index, { 
                                      relationCategoryId: value === 'none' ? undefined : value 
                                    })}
                                  >
                                    <SelectTrigger className="mt-1 bg-discord-bg border-gray-700 text-discord-text">
                                      <SelectValue placeholder="카테고리 선택" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-discord-sidebar border-gray-600">
                                      <SelectItem value="none">선택 안함</SelectItem>
                                      {categories
                                        .filter(cat => cat.id !== category?.id)
                                        .map(cat => (
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
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button 
            onClick={handleSubmit}
            className="bg-discord-accent hover:bg-blue-600"
          >
            {category ? '수정' : '생성'}
          </Button>
        </div>
      </div>
    </div>
  );
};

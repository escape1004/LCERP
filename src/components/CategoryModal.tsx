import React, { useState, useEffect } from 'react';
import { X, GripVertical, Plus, Trash2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useERPStore } from '../hooks/useERPStore';
import { Category, FieldDefinition, NewCategory } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { toast } from './ui/use-toast';

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
  const { categories, addCategory, updateCategory, getCategoryRecords, loadRecords } = useERPStore();
  const [formData, setFormData] = useState({
    name: '',
    parentId: undefined,
    fields: [] as FieldDefinition[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateErrors, setDuplicateErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);

  // 카테고리가 변경될 때마다 레코드 로드
  useEffect(() => {
    if (category) {
      loadRecords(category.id);
    }
  }, [category, loadRecords]);

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
    setDuplicateErrors({});
  }, [category, isOpen]);

  const checkDuplicateValues = async () => {
    if (!category) return;

    try {
      const records = await window.electronAPI.getRecords(category.id);
      const newDuplicateErrors: Record<string, string[]> = {};

      category.fields.forEach(field => {
        if (field.unique) {
          const values = records.map(record => record[field.id]);
          const duplicates = values.filter((value, index) => 
            values.indexOf(value) !== index && value !== undefined && value !== null && value !== ''
          );

          if (duplicates.length > 0) {
            newDuplicateErrors[field.id] = duplicates;
          }
        }
      });

      setDuplicateErrors(newDuplicateErrors);
    } catch (error) {
      toast({
        title: '중복 값 확인에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  // unique 속성이 변경될 때마다 중복 체크 실행
  useEffect(() => {
    if (category && formData.fields.some(field => field.unique)) {
      checkDuplicateValues();
    }
  }, [category, formData.fields]);

  const validateForm = async () => {
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

    // 중복 체크
    const duplicatesValid = await checkDuplicateValues();
    
    return Object.keys(newErrors).length === 0 && duplicatesValid;
  };

  const handleSubmit = async () => {
    if (isValidating) return;
    
    const isValid = await validateForm();
    if (!isValid) return;

    if (category) {
      updateCategory(category.id, {
        name: formData.name,
        parentId: formData.parentId,
        fields: formData.fields,
        order: category.order,
      });
    } else {
      const now = new Date().toISOString();
      const newCategory: NewCategory = {
        name: formData.name,
        parentId: formData.parentId,
        fields: formData.fields,
        order: categories.length,
        createdAt: now,
        updatedAt: now,
      };
      addCategory(newCategory);
    }

    onClose();
  };

  const addField = () => {
    const newField: FieldDefinition = {
      id: Math.random().toString(36).substring(2),
      name: '',
      type: 'text',
      required: false,
      unique: false,
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

                              {/* 중복 에러 메시지 */}
                              {duplicateErrors[field.id] && (
                                <p className="text-yellow-500 text-sm mt-2 ml-6">
                                  {duplicateErrors[field.id]}
                                </p>
                              )}

                              <div className="grid grid-cols-2 gap-4 ml-6">
                                <div>
                                  <Label className="text-discord-text text-sm">필드 타입</Label>
                                  <Select
                                    value={field.type}
                                    onValueChange={(value) => updateField(index, { 
                                      type: value as FieldDefinition['type'],
                                      options: value === 'select' ? [] : undefined,
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
                                  {/* 필수값 체크박스 */}
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`required-${field.id}`}
                                      checked={field.required}
                                      onCheckedChange={(checked) => updateField(index, { required: checked === true })}
                                    />
                                    <label
                                      htmlFor={`required-${field.id}`}
                                      className="text-sm font-medium leading-none text-discord-text cursor-pointer"
                                    >
                                      필수값
                                    </label>
                                  </div>

                                  {/* 중복 불가 체크박스 */}
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`unique-${field.id}`}
                                      checked={field.unique}
                                      onCheckedChange={(checked) => updateField(index, { unique: checked === true })}
                                    />
                                    <label
                                      htmlFor={`unique-${field.id}`}
                                      className="text-sm font-medium leading-none text-discord-text cursor-pointer"
                                    >
                                      중복 불가
                                    </label>
                                  </div>

                                  {/* 다중 선택 체크박스 (select 타입일 때만) */}
                                  {field.type === 'select' && (
                                    <div className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`multiple-${field.id}`}
                                        checked={field.multiple}
                                        onCheckedChange={(checked) => updateField(index, { multiple: checked === true })}
                                      />
                                      <label
                                        htmlFor={`multiple-${field.id}`}
                                        className="text-sm font-medium leading-none text-discord-text cursor-pointer"
                                      >
                                        다중 선택
                                      </label>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* 선택 옵션 (select 타입일 때만) */}
                              {field.type === 'select' && (
                                <div className="mt-4 ml-6">
                                  <Label className="text-discord-text text-sm">옵션 목록</Label>
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {field.options?.map((option, optionIndex) => (
                                      <div key={optionIndex} className="flex items-center gap-1">
                                        <Input
                                          value={option}
                                          onChange={(e) => {
                                            const newOptions = [...(field.options || [])];
                                            newOptions[optionIndex] = e.target.value;
                                            updateField(index, { options: newOptions });
                                          }}
                                          className="w-32 bg-discord-bg border-gray-700 text-discord-text"
                                        />
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            const newOptions = [...(field.options || [])];
                                            newOptions.splice(optionIndex, 1);
                                            updateField(index, { options: newOptions });
                                          }}
                                          className="text-discord-muted hover:text-discord-text"
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
                                        const newOptions = [...(field.options || []), ''];
                                        updateField(index, { options: newOptions });
                                      }}
                                      className="text-discord-text border-gray-600 hover:bg-discord-dark"
                                    >
                                      <Plus size={16} className="mr-1" />
                                      옵션 추가
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* 관련 카테고리 선택 (relation 타입일 때만) */}
                              {field.type === 'relation' && (
                                <div className="mt-4 ml-6">
                                  <Label className="text-discord-text text-sm">관련 카테고리</Label>
                                  <Select
                                    value={field.relationCategoryId}
                                    onValueChange={(value) => updateField(index, { relationCategoryId: value })}
                                  >
                                    <SelectTrigger className="mt-1 bg-discord-bg border-gray-700 text-discord-text">
                                      <SelectValue placeholder="카테고리 선택" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-discord-sidebar border-gray-600">
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
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="text-discord-text hover:bg-discord-hover"
          >
            취소
          </Button>
          <Button 
            onClick={handleSubmit}
            className="bg-discord-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isValidating || Object.keys(errors).length > 0 || Object.keys(duplicateErrors).length > 0}
          >
            {isValidating ? '검증 중...' : category ? '수정' : '생성'}
          </Button>
        </div>
      </div>
    </div>
  );
};

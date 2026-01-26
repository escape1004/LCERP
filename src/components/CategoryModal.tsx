import React, { useState, useEffect, useRef } from 'react';
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
import { Switch } from './ui/switch';
import { TagInput } from './ui/tag-input';

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
  const [initialFormData, setInitialFormData] = useState(formData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateErrors, setDuplicateErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  // 카테고리 이름 입력 필드 ref
  const categoryNameRef = useRef<HTMLInputElement>(null);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // 모달이 열릴 때 첫 번째 필드에 포커스
  useEffect(() => {
    if (isOpen && categoryNameRef.current) {
      // 약간의 지연을 두어 모달이 완전히 렌더링된 후 포커스
      setTimeout(() => {
        categoryNameRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // 카테고리가 변경될 때마다 레코드 로드
  useEffect(() => {
    if (category) {
      loadRecords(category.id);
    }
  }, [category, loadRecords]);

  useEffect(() => {
    if (category) {
      const categoryData = {
        name: category.name,
        parentId: category.parentId,
        fields: category.fields,
      };
      setFormData(JSON.parse(JSON.stringify(categoryData)));
      setInitialFormData(JSON.parse(JSON.stringify(categoryData)));
    } else {
      const initialData = {
        name: '',
        parentId: undefined,
        fields: [],
      };
      setFormData(initialData);
      setInitialFormData(initialData);
    }
    setErrors({});
    setDuplicateErrors({});
    setIsDirty(false);
  }, [category, isOpen]);

  // formData가 변경될 때마다 isDirty 상태 업데이트
  useEffect(() => {
    if (isOpen) {
      const dirty = JSON.stringify(formData) !== JSON.stringify(initialFormData);
      setIsDirty(dirty);
    }
  }, [formData, initialFormData, isOpen]);

  const checkDuplicateValues = async () => {
    if (!category) return true;

    try {
      const records = getCategoryRecords(category.id);
      const newDuplicateErrors: Record<string, string> = {};

      formData.fields.forEach(field => {
        if (field.unique) {
          const values = records.map(record => record.data[field.id]);
          const duplicates = values.filter((value, index) => 
            values.indexOf(value) !== index && value !== undefined && value !== null && value !== ''
          );

          if (duplicates.length > 0) {
            newDuplicateErrors[field.id] = `중복된 값이 존재합니다: ${duplicates.join(', ')}`;
          }
        }
      });

      setDuplicateErrors(newDuplicateErrors);
      return Object.keys(newDuplicateErrors).length === 0;
    } catch (error) {
      toast({
        title: '중복 값 확인에 실패했습니다.',
        variant: 'destructive',
      });
      return false;
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

    // 카테고리 이름 검사
    if (!formData.name.trim()) {
      newErrors.name = '카테고리 이름을 입력하세요.';
    }

    // 필드 개수 검사
    if (formData.fields.length === 0) {
      newErrors.fields = '최소 1개의 필드가 필요합니다.';
    }

    // 필드 이름 및 관계형 필드 검사
    formData.fields.forEach((field, index) => {
      if (!field.name.trim()) {
        newErrors[`field_${index}_name`] = '필드명을 입력하세요.';
      }
      if (field.type === 'relation' && !field.relationCategoryId) {
        newErrors[`field_${index}_relation`] = '관계 카테고리를 선택해야 합니다.';
      }
      if (field.type === 'relation' && field.relationCategoryId && !field.displayFieldId) {
        newErrors[`field_${index}_displayField`] = '라벨 필드를 선택해야 합니다.';
      }
    });

    setErrors(newErrors);

    // 중복 체크
    const duplicatesValid = await checkDuplicateValues();
    
    const finalValidationResult = Object.keys(newErrors).length === 0 && duplicatesValid;
    return finalValidationResult;
  };

  const handleSubmit = async () => {
    if (!isDirty) {
      onClose();
      return;
    }
    
    if (isValidating) return;
    
    const isValid = await validateForm();
    if (!isValid) return;

    try {
      if (category) {
        updateCategory(category.id, {
          name: formData.name,
          parentId: formData.parentId,
          fields: formData.fields,
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
        await addCategory(newCategory);
      }

      onClose();
    } catch (error) {
      toast({
        title: '카테고리 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const addField = () => {
    const newField: FieldDefinition = {
      id: Math.random().toString(36).substring(2),
      name: '',
      type: 'text', // 기본값으로 text 타입 설정
      required: false,
      unique: false,
      order: formData.fields.length,
      pathMode: 'direct',
      basePath: '',
    };
    setFormData(prev => {
      const updated = { ...prev, fields: [...prev.fields, newField] };
      setTimeout(() => { validateForm(); }, 0);
      return updated;
    });
  };

  const removeField = (index: number) => {
    const newFields = formData.fields.filter((_, i) => i !== index);
    setFormData(prev => {
      const updated = { ...prev, fields: newFields };
      setTimeout(() => { validateForm(); }, 0);
      return updated;
    });
  };

  const updateField = (index: number, updates: Partial<FieldDefinition>) => {
    if (updates.type === 'file' && formData.fields.some((f, i) => f.type === 'file' && i !== index)) {
      toast({ title: '파일 필드는 한 개만 추가할 수 있습니다.', variant: 'destructive' });
      return;
    }
    const newFields = [...formData.fields];
    newFields[index] = { ...newFields[index], ...updates };
    if (updates.type === 'file' && !newFields[index].pathMode) {
      newFields[index] = { ...newFields[index], pathMode: 'direct', basePath: '' };
    }
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

  // 카테고리 경로 구하는 함수
  const getCategoryPath = (cat: Category): string[] => {
    const path: string[] = [cat.name];
    let parent = cat.parentId ? categories.find(c => c.id === cat.parentId) : null;
    while (parent) {
      path.unshift(parent.name);
      parent = parent.parentId ? categories.find(c => c.id === parent.parentId) : null;
    }
    return path;
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
                placeholder="카테고리 이름 (필수)"
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
                ref={categoryNameRef}
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
                onValueChange={(value) => {
                  setFormData(prev => ({ 
                    ...prev, 
                    parentId: value === 'none' ? undefined : value 
                  }));
                }}
              >
                <SelectTrigger className="mt-2 bg-discord-sidebar border-gray-600 text-gray-200">
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

              {errors.fields && (
                <p className="text-red-500 text-sm mb-4">{errors.fields}</p>
              )}

              <DragDropContext onDragEnd={handleFieldDragEnd}>
                <Droppable droppableId="fields">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4">
                      {formData.fields.length === 0 ? (
                        <div className="text-center py-8 text-discord-muted border-2 border-dashed border-gray-600 rounded-lg">
                          <p className="text-sm">필드를 추가해주세요</p>
                          <p className="text-xs mt-1">최소 1개의 필드가 필요합니다</p>
                        </div>
                      ) : (
                        formData.fields.map((field, index) => (
                          <Draggable key={field.id} draggableId={field.id} index={index}>
                            {(provided) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className="bg-discord-sidebar border border-gray-600 rounded-lg p-4"
                              >
                                <div className="flex flex-col gap-3">
                                  <div className="flex items-center gap-3">
                                    <div {...provided.dragHandleProps} className="cursor-grab">
                                      <GripVertical size={20} className="text-gray-500" />
                                    </div>
                                    <div className="flex-1 relative">
                                      <Input
                                        value={field.name}
                                        onChange={(e) => updateField(index, { name: e.target.value })}
                                        className="w-full bg-[#2b2d31] border-gray-600 text-gray-200"
                                        placeholder="필드명을 입력하세요"
                                      />
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeField(index)}
                                      className="h-9 w-9 text-red-400 hover:bg-red-500/10"
                                    >
                                      <Trash2 size={16} />
                                    </Button>
                                  </div>

                                  <div className="space-y-4">
                                    <div>
                                      <Label className="text-sm text-gray-400 mb-2 block">필드 타입</Label>
                                      <div className="flex items-center gap-3">
                                        <Select
                                          value={field.type}
                                          onValueChange={(value) => updateField(index, { type: value as FieldDefinition['type'] })}
                                        >
                                          <SelectTrigger className="w-[200px] bg-[#2b2d31] border-gray-600 text-gray-200">
                                            <SelectValue placeholder="필드 타입" />
                                          </SelectTrigger>
                                          <SelectContent className="bg-[#2b2d31] border-gray-600">
                                            <SelectItem value="text">텍스트</SelectItem>
                                            <SelectItem value="longtext">긴 텍스트</SelectItem>
                                            <SelectItem value="number">숫자</SelectItem>
                                            <SelectItem value="date">날짜</SelectItem>
                                            <SelectItem value="select">선택 목록</SelectItem>
                                            <SelectItem value="checkbox">체크박스</SelectItem>
                                            <SelectItem value="relation">관계형</SelectItem>
                                            <SelectItem value="file" disabled={formData.fields.some((f, i) => f.type === 'file' && i !== index)}>파일</SelectItem>
                                          </SelectContent>
                                        </Select>
                                        <div className="flex items-center gap-4 ml-auto">
                                          <div className="flex items-center gap-2">
                                            <Checkbox
                                              id={`required-${field.id}`}
                                              checked={field.required}
                                              onCheckedChange={(checked) => updateField(index, { required: checked as boolean })}
                                            />
                                            <label htmlFor={`required-${field.id}`} className="text-sm text-gray-300">
                                              필수값
                                            </label>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Checkbox
                                              id={`unique-${field.id}`}
                                              checked={field.unique}
                                              onCheckedChange={(checked) => updateField(index, { unique: checked as boolean })}
                                            />
                                            <label htmlFor={`unique-${field.id}`} className="text-sm text-gray-300">
                                              중복 불가
                                            </label>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Checkbox
                                              id={`hidden-${field.id}`}
                                              checked={field.hidden}
                                              onCheckedChange={(checked) => updateField(index, { hidden: checked as boolean })}
                                            />
                                            <label htmlFor={`hidden-${field.id}`} className="text-sm text-gray-300">
                                              미노출(리스트 숨김)
                                            </label>
                                          </div>
                                          {(field.type === 'select' || field.type === 'relation') && (
                                            <div className="flex items-center gap-2">
                                              <Checkbox
                                                id={`multiple-${field.id}`}
                                                checked={field.multiple}
                                                onCheckedChange={(checked) => updateField(index, { multiple: checked as boolean })}
                                              />
                                              <label htmlFor={`multiple-${field.id}`} className="text-sm text-gray-300">
                                                다중 선택
                                              </label>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    {field.type === 'file' && (
                                      <div>
                                        <Label className="text-sm text-gray-400 mb-2 block">첨부파일 경로 설정</Label>
                                        <div className="flex items-center gap-3">
                                          <Select
                                            value={field.pathMode ?? 'direct'}
                                            onValueChange={(value) => updateField(index, { pathMode: value as 'direct' | 'base' })}
                                          >
                                            <SelectTrigger className="w-[200px] bg-[#2b2d31] border-gray-600 text-gray-200">
                                              <SelectValue placeholder="경로 방식 선택" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#2b2d31] border-gray-600">
                                              <SelectItem value="direct">직접 경로</SelectItem>
                                              <SelectItem value="base">상대 경로</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        {field.pathMode === 'base' && (
                                          <div className="mt-2 flex items-center gap-2">
                                            <Input
                                              value={field.basePath || ''}
                                              onChange={(e) => updateField(index, { basePath: e.target.value })}
                                              placeholder="베이스 경로"
                                              className="h-10 px-3 w-full bg-[#2b2d31] border-gray-600 text-gray-200"
                                            />
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="border-gray-600 text-gray-200 hover:bg-[#3a3d44]"
                                              onClick={async () => {
                                                try {
                                                  const result = await window.electronAPI.openDirectoryDialog();
                                                  if (!result.canceled && result.filePaths.length > 0) {
                                                    updateField(index, { basePath: result.filePaths[0], pathMode: 'base' });
                                                  }
                                                } catch (e) {
                                                  toast({ title: '폴더 선택 실패', description: String(e), variant: 'destructive' });
                                                }
                                              }}
                                            >
                                              폴더 선택
                                            </Button>
                                          </div>
                                        )}
                                        <p className="text-xs text-gray-500 mt-2">
                                          상대 경로를 선택하면 DB에 저장된 파일명만 사용해 베이스 경로와 결합합니다.
                                        </p>
                                      </div>
                                    )}

                                    {field.type === 'select' && (
                                      <div>
                                        <Label className="text-sm text-gray-400 mb-2 block">옵션 목록</Label>
                                        <div className="space-y-2">
                                          <div className="flex flex-wrap gap-2">
                                            {field.options?.map((option, optionIndex) => (
                                              <div key={optionIndex} className="flex items-center bg-[#2b2d31] rounded">
                                                <Input
                                                  value={option}
                                                  onChange={(e) => {
                                                    const newOptions = [...(field.options || [])];
                                                    newOptions[optionIndex] = e.target.value;
                                                    updateField(index, { options: newOptions });
                                                  }}
                                                  className="h-10 px-3 w-full bg-[#2b2d31] border-gray-600 text-gray-200"
                                                />
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  onClick={() => {
                                                    const newOptions = field.options?.filter((_, i) => i !== optionIndex);
                                                    updateField(index, { options: newOptions });
                                                  }}
                                                  className="h-10 w-10 bg-discord-sidebar text-gray-400 hover:text-gray-200 hover:bg-discord-sidebar"
                                                >
                                                  <X size={14} />
                                                </Button>
                                              </div>
                                            ))}
                                            <Button
                                              onClick={() => updateField(index, { 
                                                options: [...(field.options || []), ''] 
                                              })}
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 px-2 text-gray-400 hover:text-gray-200"
                                            >
                                              + 옵션 추가
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {field.type === 'relation' && (
                                      <div className="space-y-2">
                                        <Label className="text-sm text-gray-400">관련 카테고리</Label>
                                        <Select
                                          value={field.relationCategoryId}
                                          onValueChange={(value) => {
                                            updateField(index, { relationCategoryId: value });
                                            if (errors[`field_${index}_relation`]) {
                                              setErrors(prev => {
                                                const newErrors = { ...prev };
                                                delete newErrors[`field_${index}_relation`];
                                                return newErrors;
                                              });
                                            }
                                          }}
                                        >
                                          <SelectTrigger className="w-full bg-[#2b2d31] border-gray-600 text-gray-200">
                                            <SelectValue placeholder="관계 카테고리 선택" />
                                          </SelectTrigger>
                                          <SelectContent className="bg-[#2b2d31] border-gray-600">
                                            {(() => {
                                              const selectableCategories = categories.filter(c => c.id !== category?.id);
                                              if (selectableCategories.length === 0) {
                                                return (
                                                  <div className="px-4 py-2 text-sm text-center text-gray-500">
                                                    선택할 카테고리가 없습니다.
                                                  </div>
                                                );
                                              }
                                              return selectableCategories.map((cat) => (
                                                <SelectItem key={cat.id} value={cat.id}>
                                                  {getCategoryPath(cat).join(' > ')}
                                                </SelectItem>
                                              ));
                                            })()}
                                          </SelectContent>
                                        </Select>
                                        {errors[`field_${index}_relation`] && (
                                          <p className="text-red-500 text-sm mt-1">
                                            {errors[`field_${index}_relation`]}
                                          </p>
                                        )}
                                        {field.relationCategoryId && (
                                          <div className="space-y-1">
                                            <Label className="text-sm text-gray-400">라벨 필드(선택 목록에 표시될 필드)</Label>
                                            <Select
                                              value={field.displayFieldId || ''}
                                              onValueChange={(value) => {
                                                updateField(index, { displayFieldId: value });
                                                if (errors[`field_${index}_displayField`]) {
                                                  setErrors(prev => {
                                                    const newErrors = { ...prev };
                                                    delete newErrors[`field_${index}_displayField`];
                                                    return newErrors;
                                                  });
                                                }
                                              }}
                                            >
                                              <SelectTrigger className="w-full bg-[#2b2d31] border-gray-600 text-gray-200">
                                                <SelectValue placeholder="라벨 필드 선택" />
                                              </SelectTrigger>
                                              <SelectContent className="bg-[#2b2d31] border-gray-600">
                                                {(() => {
                                                  const relCat = categories.find(c => c.id === field.relationCategoryId);
                                                  if (!relCat) return null;
                                                  return relCat.fields
                                                    .filter(f => f.type !== 'file' && f.type !== 'relation')
                                                    .map(f => (
                                                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                                    ));
                                                })()}
                                              </SelectContent>
                                            </Select>
                                            {errors[`field_${index}_displayField`] && (
                                              <p className="text-red-500 text-sm mt-1">
                                                {errors[`field_${index}_displayField`]}
                                              </p>
                                            )}
                                            {field.displayFieldId && (
                                              <div className="mt-2">
                                                <Label className="text-sm text-gray-400">보조 라벨 필드(선택사항, 라벨 옆에 괄호로 표시)</Label>
                                                <Select
                                                  value={field.subDisplayFieldId || 'none'}
                                                  onValueChange={(value) => updateField(index, { subDisplayFieldId: value === 'none' ? undefined : value })}
                                                >
                                                  <SelectTrigger className="w-full bg-[#2b2d31] border-gray-600 text-gray-200">
                                                    <SelectValue placeholder="보조 라벨 필드 선택 (선택사항)" />
                                                  </SelectTrigger>
                                                  <SelectContent className="bg-[#2b2d31] border-gray-600">
                                                    <SelectItem value="none">(없음)</SelectItem>
                                                    {(() => {
                                                      const relCat = categories.find(c => c.id === field.relationCategoryId);
                                                      if (!relCat) return null;
                                                      return relCat.fields
                                                        .filter(f => f.type !== 'file')
                                                        .map(f => (
                                                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                                        ));
                                                    })()}
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {duplicateErrors[field.id] && (
                                      <p className="text-red-500 text-sm mt-2">
                                        {duplicateErrors[field.id]}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-end justify-end gap-3 p-6 border-t border-gray-700">
          {category && (
            <>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-red-400 text-xs px-2 py-1 mr-auto hover:underline hover:text-red-500"
              >
                카테고리 삭제
              </button>
              {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                  <div className="bg-discord-bg rounded-lg p-6 w-full max-w-md border border-gray-700 flex flex-col items-center">
                    <div className="mb-6 text-center text-discord-text">
                      <div className="text-base font-medium mb-2">
                        정말로 이 카테고리를 삭제하시겠습니까?
                      </div>
                      <div className="text-red-400 font-semibold mb-2">
                        이 작업은 되돌릴 수 없습니다.
                      </div>
                      <div className="text-discord-muted text-sm">
                        아래에 <span className="font-semibold">카테고리를 삭제하겠습니다</span>를 입력하세요.
                      </div>
                    </div>
                    
                    {isDeleting && (
                      <div className="mb-4 p-4 bg-discord-sidebar rounded-lg border border-gray-600">
                        <div className="flex items-center justify-center gap-3">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-discord-accent"></div>
                          <div className="text-discord-text text-sm">
                            카테고리 삭제 중...
                            <div className="text-discord-muted text-xs mt-1">
                              썸네일 및 관계형 데이터 정리 중
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <Input
                      type="text"
                      value={deleteInput}
                      onChange={e => setDeleteInput(e.target.value)}
                      className="w-full mb-3 bg-discord-sidebar border-gray-600 text-discord-text"
                      placeholder="카테고리를 삭제하겠습니다"
                      disabled={isDeleting}
                    />
                    <div className="flex w-full gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1 text-discord-text hover:bg-discord-hover"
                        onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}
                        disabled={isDeleting}
                      >
                        취소
                      </Button>
                      <Button
                        variant="destructive"
                        className="flex-1 bg-discord-danger hover:bg-red-900 text-white disabled:bg-red-800 disabled:text-red-300 disabled:cursor-not-allowed"
                        disabled={deleteInput !== "카테고리를 삭제하겠습니다" || isDeleting}
                        onClick={async () => {
                          try {
                            setIsDeleting(true);
                            const result = await useERPStore.getState().deleteCategory(category.id);
                            setShowDeleteConfirm(false);
                            setDeleteInput("");
                            
                            // 삭제 결과 피드백
                            let message = '카테고리가 삭제되었습니다.';
                            if (result.thumbnailCleanupCount > 0) {
                              message += `\n${result.thumbnailCleanupCount}개 썸네일 파일이 정리되었습니다.`;
                            }
                            if (result.relationCleanupCount > 0) {
                              message += `\n${result.relationCleanupCount}개 관계형 참조가 정리되었습니다.`;
                            }
                            
                            toast({ 
                              title: '카테고리 삭제 완료', 
                              description: message,
                              duration: 5000
                            });
                            
                            onClose();
                          } catch (e) {
                            toast({ title: '카테고리 삭제 중 오류가 발생했습니다.', variant: 'destructive' });
                          } finally {
                            setIsDeleting(false);
                          }
                        }}
                      >
                        {isDeleting ? '삭제 중...' : '삭제'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
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
            disabled={
              isValidating || 
              !isDirty ||
              !formData.name.trim() || 
              formData.fields.length === 0 ||
              formData.fields.some(f => !f.name.trim()) ||
              formData.fields.some(f => f.type === 'relation' && !f.relationCategoryId) ||
              formData.fields.some(f => f.type === 'relation' && f.relationCategoryId && !f.displayFieldId)
            }
          >
            {isValidating ? '검증 중...' : category ? '수정' : '생성'}
          </Button>
        </div>
      </div>
    </div>
  );
};

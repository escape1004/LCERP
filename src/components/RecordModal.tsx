import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Check, ChevronsUpDown } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import type { Category, DataRecord, FieldDefinition, NewRecord } from '../types';
import type { ElectronAPI } from '../types/electron';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { toast } from './ui/use-toast';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category;
  record?: DataRecord | null;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  onClose,
  category,
  record,
}) => {
  const { addRecord, updateRecord, categories, getCategoryRecords, checkDuplicate } = useERPStore();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateErrors, setDuplicateErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isDuplicateChecking, setIsDuplicateChecking] = useState(false);
  const [pendingDuplicateChecks, setPendingDuplicateChecks] = useState<Set<string>>(new Set());
  const [openComboboxes, setOpenComboboxes] = useState<Record<string, boolean>>({});

  // Reset form data when modal opens/closes or record changes
  useEffect(() => {
    if (record) {
      setFormData({ ...record.data });
    } else {
      const initialData: Record<string, any> = {};
      (category?.fields ?? []).forEach(field => {
        if (field.type === 'select' && field.multiple) {
          initialData[field.id] = [];
        } else {
          initialData[field.id] = '';
        }
      });
      setFormData(initialData);
    }
    setErrors({});
    setDuplicateErrors({});
    setOpenComboboxes({});
  }, [record, category]);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    (category?.fields ?? []).forEach(field => {
      if (field.required) {
        const value = formData[field.id];
        if (!value && value !== 0 && value !== false) {
          newErrors[field.id] = `${field.name}은(는) 필수 입력 항목입니다.`;
        }
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, category?.fields]);

  const checkFieldDuplicate = useCallback(async (fieldId: string, value: any) => {
    if (!category) return;
    try {
      setIsDuplicateChecking(true);
      setPendingDuplicateChecks(prev => new Set([...prev, fieldId]));
      const isDuplicate = await checkDuplicate(category.id, fieldId, value, record?.id);
      if (isDuplicate) {
        setDuplicateErrors(prev => ({
          ...prev,
          [fieldId]: '이미 사용 중인 값입니다.'
        }));
      } else {
        setDuplicateErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldId];
          return newErrors;
        });
      }
      setPendingDuplicateChecks(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldId);
        return newSet;
      });
    } catch (error) {
      console.error('중복 체크 중 오류 발생:', error);
      setPendingDuplicateChecks(prev => {
        const newSet = new Set(prev);
        newSet.delete(fieldId);
        return newSet;
      });
    } finally {
      if (pendingDuplicateChecks.size <= 1) {
        setIsDuplicateChecking(false);
      }
    }
  }, [category, record?.id, checkDuplicate, pendingDuplicateChecks]);

  const handleSubmit = async () => {
    if (!category) {
      alert('카테고리를 먼저 선택하세요.');
      return;
    }
    const isValid = validateForm();
    if (!isValid) {
      alert('필수 입력 항목을 모두 입력해주세요.');
      return;
    }
    try {
      setIsValidating(true);
      if (record) {
        await updateRecord(record.id, formData);
      } else {
        const now = new Date().toISOString();
        const newRecord: NewRecord = {
          categoryId: category.id,
          data: formData,
          createdAt: now,
          updatedAt: now
        };
        await addRecord(newRecord);
      }
      onClose();
    } catch (error) {
      console.error('레코드 저장 중 오류 발생:', error);
      alert('항목을 저장하는 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsValidating(false);
    }
  };

  const updateFieldValue = (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value,
    }));
    
    // 필드가 unique인 경우 중복 체크 실행
    const field = (category?.fields ?? []).find(f => f.id === fieldId);
    if (field?.unique) {
      if (value !== undefined && value !== null && value !== '') {
        checkFieldDuplicate(fieldId, value);
      } else {
        // 값이 비어있는 경우 중복 에러 제거
        setDuplicateErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldId];
          return newErrors;
        });
        setPendingDuplicateChecks(prev => {
          const newSet = new Set(prev);
          newSet.delete(fieldId);
          return newSet;
        });
      }
    }
    
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const toggleCombobox = (fieldId: string) => {
    setOpenComboboxes(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId]
    }));
  };

  const renderField = (field: FieldDefinition) => {
    const value = formData[field.id] || (field.type === 'select' && field.multiple ? [] : '');
    const hasError = !!errors[field.id];
    const hasDuplicateError = !!duplicateErrors[field.id];
    const inputClassName = cn(
      "bg-discord-sidebar border-gray-600 text-discord-text",
      (hasError || hasDuplicateError) && "border-red-500"
    );

    const renderError = () => {
      if (hasError) {
        return <p className="text-red-500 text-sm mt-1">{errors[field.id]}</p>;
      }
      if (hasDuplicateError) {
        return <p className="text-red-500 text-sm mt-1">{duplicateErrors[field.id]}</p>;
      }
      return null;
    };

    switch (field.type) {
      case 'text':
      case 'number':
        return (
          <div className="space-y-1">
            <Input
              type={field.type === 'number' ? 'number' : 'text'}
              placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={inputClassName}
            />
            {renderError()}
          </div>
        );

      case 'date':
        return (
          <div className="space-y-1">
            <Input
              type="date"
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={inputClassName}
            />
            {renderError()}
          </div>
        );

      case 'longtext':
        return (
          <div className="space-y-1">
            <Textarea
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={inputClassName}
              placeholder={`${field.name} 입력`}
              rows={4}
            />
            {renderError()}
          </div>
        );

      case 'select':
        if (field.multiple) {
          return (
            <div className="space-y-2 w-full">
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={cn(inputClassName, "w-full justify-between")}
                  >
                    <span className="truncate flex-1 text-left">
                      {Array.isArray(value) && value.length > 0
                        ? `${value.length}개 선택됨`
                        : `${field.name} 선택...`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                  <Command className="bg-discord-sidebar border-none">
                    <CommandInput 
                      placeholder={`${field.name} 검색...`} 
                      className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        const pastedValues = pastedText.split(',').map(v => v.trim()).filter(v => v);
                        
                        // 기존 옵션에 있는 값만 필터링
                        const validValues = pastedValues.filter(v => 
                          field.options?.some(opt => opt.toLowerCase() === v.toLowerCase())
                        );
                        
                        if (validValues.length > 0) {
                          const currentValues = Array.isArray(value) ? value : [];
                          const newValues = [...new Set([...currentValues, ...validValues])];
                          updateFieldValue(field.id, newValues);
                          
                          // 유효하지 않은 값이 있었다면 상세한 알림
                          const invalidValues = pastedValues.filter(v => 
                            !field.options?.some(opt => opt.toLowerCase() === v.toLowerCase())
                          );
                          if (invalidValues.length > 0) {
                            toast({
                              title: "일부 값이 무시됨",
                              description: `다음 값들이 유효하지 않아 제외되었습니다: ${invalidValues.join(', ')}`,
                              variant: "destructive",
                            });
                          } else {
                            toast({
                              title: "값이 추가됨",
                              description: `${validValues.length}개의 값이 추가되었습니다.`,
                            });
                          }
                        } else {
                          toast({
                            title: "유효하지 않은 값",
                            description: `붙여넣은 모든 값이 유효하지 않습니다: ${pastedValues.join(', ')}`,
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                      <CommandEmpty className="py-2 text-sm text-discord-muted">항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {field.options?.map((option) => (
                          <CommandItem
                            key={option}
                            value={option}
                            onSelect={() => {
                              const currentValues = Array.isArray(value) ? value : [];
                              if (currentValues.includes(option)) {
                                updateFieldValue(field.id, currentValues.filter(v => v !== option));
                              } else {
                                updateFieldValue(field.id, [...currentValues, option]);
                              }
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                Array.isArray(value) && value.includes(option) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {option}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {Array.isArray(value) && value.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {value.map((item) => (
                    <div
                      key={item}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-green-600/20 text-green-500 text-xs rounded hover:bg-green-600/30"
                    >
                      <span className="max-w-[150px] truncate">{item}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newValue = value.filter((v) => v !== item);
                          updateFieldValue(field.id, newValue);
                        }}
                        className="text-green-500 hover:text-green-400 shrink-0"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        } else {
          return (
            <div className="w-full">
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={cn(inputClassName, "w-full justify-between")}
                  >
                    {value || `${field.name} 선택`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                  <Command className="bg-discord-sidebar border-none">
                    <CommandInput 
                      placeholder={`${field.name} 검색...`} 
                      className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                    />
                    <CommandList className="text-discord-text">
                      <CommandEmpty className="py-2 text-sm text-discord-muted">항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            updateFieldValue(field.id, '');
                            toggleCombobox(field.id);
                          }}
                          className="text-discord-text hover:bg-discord-hover"
                        >
                          선택 해제
                        </CommandItem>
                        {field.options?.map((option) => (
                          <CommandItem
                            key={option}
                            value={option}
                            onSelect={() => {
                              updateFieldValue(field.id, option);
                              toggleCombobox(field.id);
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                value === option ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {option}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          );
        }

      case 'relation':
        if (!field.relationCategoryId) return null;
        
        const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
        if (!relatedCategory) return null;
        
        const relatedRecords = getCategoryRecords(field.relationCategoryId);
        const displayField = relatedCategory.fields[0];

        if (field.multiple) {
          return (
            <div className="space-y-2 w-full">
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={cn(inputClassName, "w-full justify-between")}
                  >
                    <span className="truncate flex-1 text-left">
                      {Array.isArray(value) && value.length > 0
                        ? `${value.length}개 선택됨`
                        : `${field.name} 선택...`}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                  <Command className="bg-discord-sidebar border-none">
                    <CommandInput 
                      placeholder={`${field.name} 검색...`} 
                      className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        const pastedValues = pastedText.split(',').map(v => v.trim()).filter(v => v);
                        
                        // 기존 레코드에서 일치하는 값 찾기
                        const validRecords = relatedRecords.filter(record => 
                          pastedValues.some(v => 
                            record.data[displayField.id].toLowerCase() === v.toLowerCase()
                          )
                        );
                        
                        if (validRecords.length > 0) {
                          const currentValues = Array.isArray(value) ? value : [];
                          const newValues = [...new Set([...currentValues, ...validRecords.map(r => r.id)])];
                          updateFieldValue(field.id, newValues);
                          
                          // 유효하지 않은 값이 있었다면 상세한 알림
                          const invalidValues = pastedValues.filter(v => 
                            !relatedRecords.some(record => 
                              record.data[displayField.id].toLowerCase() === v.toLowerCase()
                            )
                          );
                          if (invalidValues.length > 0) {
                            toast({
                              title: "일부 값이 무시됨",
                              description: `다음 값들이 유효하지 않아 제외되었습니다: ${invalidValues.join(', ')}`,
                              variant: "destructive",
                            });
                          } else {
                            toast({
                              title: "값이 추가됨",
                              description: `${validRecords.length}개의 값이 추가되었습니다.`,
                            });
                          }
                        } else {
                          toast({
                            title: "유효하지 않은 값",
                            description: `붙여넣은 모든 값이 유효하지 않습니다: ${pastedValues.join(', ')}`,
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                    <CommandList className="max-h-[200px] overflow-y-auto">
                      <CommandEmpty className="py-2 text-sm text-discord-muted">항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {relatedRecords.map((record) => (
                          <CommandItem
                            key={record.id}
                            value={record.data[displayField.id]}
                            onSelect={() => {
                              const currentValues = Array.isArray(value) ? value : [];
                              if (currentValues.includes(record.id)) {
                                updateFieldValue(field.id, currentValues.filter(v => v !== record.id));
                              } else {
                                updateFieldValue(field.id, [...currentValues, record.id]);
                              }
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                Array.isArray(value) && value.includes(record.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {record.data[displayField.id]}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {Array.isArray(value) && value.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {value.map((recordId) => {
                    const record = relatedRecords.find(r => r.id === recordId);
                    if (!record) return null;
                    return (
                      <div
                        key={recordId}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-600/20 text-green-500 text-xs rounded hover:bg-green-600/30"
                      >
                        <span className="max-w-[150px] truncate">{record.data[displayField.id]}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const newValue = value.filter((v) => v !== recordId);
                            updateFieldValue(field.id, newValue);
                          }}
                          className="text-green-500 hover:text-green-400 shrink-0"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        } else {
          return (
            <div className="w-full">
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={cn(inputClassName, "w-full justify-between")}
                  >
                    {value ? relatedRecords.find(r => r.id === value)?.data[displayField.id] || value : `${field.name} 선택`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-discord-sidebar border-gray-600">
                  <Command className="bg-discord-sidebar border-none">
                    <CommandInput 
                      placeholder={`${field.name} 검색...`} 
                      className="h-9 bg-discord-sidebar text-discord-text border-b border-gray-600"
                    />
                    <CommandList className="text-discord-text">
                      <CommandEmpty className="py-2 text-sm text-discord-muted">항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value=""
                          onSelect={() => {
                            updateFieldValue(field.id, '');
                            toggleCombobox(field.id);
                          }}
                          className="text-discord-text hover:bg-discord-hover"
                        >
                          선택 해제
                        </CommandItem>
                        {relatedRecords.map((record) => (
                          <CommandItem
                            key={record.id}
                            value={record.data[displayField.id]}
                            onSelect={() => {
                              updateFieldValue(field.id, record.id);
                              toggleCombobox(field.id);
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                value === record.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {record.data[displayField.id]}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          );
        }

      case 'file':
        return (
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="파일 경로를 입력하거나 파일 선택 버튼을 클릭하세요"
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={inputClassName + ' flex-1'}
              readOnly
            />
            <Button
              type="button"
              onClick={async () => {
                // Electron 환경에서는 경로, 웹 환경에서는 파일명만 표시될 수 있음
                if (window.electronAPI) {
                  const result = await window.electronAPI.openFileDialog();
                  if (result && result.filePaths && result.filePaths[0]) {
                    updateFieldValue(field.id, result.filePaths[0]);
                  }
                } else {
                  // fallback: input[type=file] 사용 (웹 환경)
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.onchange = (e: any) => {
                    if (e.target.files && e.target.files[0]) {
                      updateFieldValue(field.id, e.target.files[0].path || e.target.files[0].name);
                    }
                  };
                  input.click();
                }
              }}
              className="bg-discord-accent hover:bg-blue-600"
            >
              파일 선택
            </Button>
            {renderError()}
          </div>
        );

      default:
        return null;
    }
  };

  const isSubmitDisabled = Object.keys(errors).length > 0 || 
                          Object.keys(duplicateErrors).length > 0 || 
                          isValidating ||
                          isDuplicateChecking ||
                          pendingDuplicateChecks.size > 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-discord-text">
              {record ? '항목 수정' : '새 항목 추가'}
            </h2>
            <p className="text-sm text-discord-muted mt-1">
              {category ? category.name : '카테고리를 먼저 선택하세요.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-discord-text"
          >
            <X size={24} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {(category?.fields ?? []).sort((a, b) => a.order - b.order).map(field => (
              <div key={field.id} className="space-y-2">
                <Label className="text-sm font-medium text-discord-text">
                  {field.name}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                  {field.unique && <span className="text-gray-400 ml-1 text-xs">(중복 불가)</span>}
                </Label>
                {renderField(field)}
              </div>
            ))}
            {(!category || (category?.fields?.length === 0)) && (
              <div className="text-discord-muted text-center py-8">
                카테고리를 먼저 선택하거나, 필드가 정의된 카테고리를 선택하세요.
              </div>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-3 p-6 border-t border-gray-700">
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
            disabled={isSubmitDisabled}
          >
            {isValidating ? '검증 중...' : 
             isDuplicateChecking ? '중복 체크 중...' : 
             record ? '수정' : '추가'}
          </Button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Search, Check, ChevronsUpDown, ChevronRight } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import type { Category, DataRecord, FieldDefinition, NewRecord } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { cn } from '../lib/utils';

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
  const { categories, addRecord, updateRecord, getCategoryRecords, loadRecords } = useERPStore();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateErrors, setDuplicateErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [openComboboxes, setOpenComboboxes] = useState<Record<string, boolean>>({});

  // Memoize utility functions
  const isSelectField = useCallback((field: FieldDefinition): boolean => {
    return field.type === 'select';
  }, []);

  const isMultiSelectField = (field: FieldDefinition): boolean => {
    return (field.type === 'select' || field.type === 'relation') && field.multiple === true;
  };

  // Memoize sorted fields
  const sortedFields = useMemo(() => {
    return [...category.fields].sort((a, b) => a.order - b.order);
  }, [category.fields]);

  // Memoize related records for relation fields
  const relatedRecordsMap = useMemo(() => {
    const map = new Map<string, DataRecord[]>();
    const relationFields = category.fields.filter(field => field.type === 'relation');
    
    relationFields.forEach(field => {
      if (field.relationCategoryId) {
        map.set(field.relationCategoryId, getCategoryRecords(field.relationCategoryId));
      }
    });

    return map;
  }, [category.fields, getCategoryRecords]);

  // Optimize form validation by memoizing field requirements
  const requiredFields = useMemo(() => {
    return category.fields.filter(field => field.required);
  }, [category.fields]);

  const uniqueFields = useMemo(() => {
    return category.fields.filter(field => field.unique);
  }, [category.fields]);

  // Debounced field update
  const debouncedUpdateField = useCallback((fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value,
    }));
    
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  }, [errors]);

  // Optimize duplicate check by caching results
  const duplicateCheckCache = useMemo(() => new Map<string, boolean>(), []);

  const checkDuplicates = useCallback(async (fieldId: string, value: any) => {
    const field = category.fields.find(f => f.id === fieldId);
    if (!field?.unique || value == null || value === '') return true;

    const cacheKey = `${fieldId}:${value}`;
    if (duplicateCheckCache.has(cacheKey)) {
      return duplicateCheckCache.get(cacheKey);
    }

    setIsValidating(true);
    try {
      const records = getCategoryRecords(category.id);
      const hasDuplicate = records.some(r => 
        r.id !== record?.id && 
        r.data[fieldId] === value
      );

      if (hasDuplicate) {
        setDuplicateErrors(prev => ({
          ...prev,
          [fieldId]: `이미 사용 중인 값입니다. 다른 값을 입력해주세요.`
        }));
        duplicateCheckCache.set(cacheKey, false);
        return false;
      } else {
        setDuplicateErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldId];
          return newErrors;
        });
        duplicateCheckCache.set(cacheKey, true);
        return true;
      }
    } catch (error) {
      console.error('중복 체크 중 오류 발생:', error);
      return false;
    } finally {
      setIsValidating(false);
    }
  }, [category.fields, category.id, getCategoryRecords, record?.id]);

  // Optimize form validation
  const validateForm = useCallback(async () => {
    const newErrors: Record<string, string> = {};

    // Required field validation
    for (const field of requiredFields) {
      const value = formData[field.id];
      if (!value && value !== 0 && value !== false) {
        newErrors[field.id] = `${field.name}은(는) 필수 입력 항목입니다.`;
      }
    }

    setErrors(newErrors);

    // Duplicate validation for all unique fields
    const duplicateChecks = await Promise.all(
      uniqueFields.map(field => checkDuplicates(field.id, formData[field.id]))
    );

    return Object.keys(newErrors).length === 0 && duplicateChecks.every(isValid => isValid);
  }, [formData, requiredFields, uniqueFields, checkDuplicates]);

  // Clear cache when modal closes
  useEffect(() => {
    if (!isOpen) {
      duplicateCheckCache.clear();
    }
  }, [isOpen]);

  // Load related category records when modal opens
  useEffect(() => {
    if (isOpen) {
      // Find all relation fields
      const relationFields = category.fields.filter(field => field.type === 'relation');
      
      // Load records for each related category
      relationFields.forEach(async (field) => {
        if (field.relationCategoryId) {
          await loadRecords(field.relationCategoryId);
        }
      });
    }
  }, [isOpen, category, loadRecords]);

  useEffect(() => {
    if (record) {
      setFormData({ ...record.data });
    } else {
      // Initialize form with empty values
      const initialData: Record<string, any> = {};
      category.fields.forEach(field => {
        if (isMultiSelectField(field)) {
          initialData[field.id] = [];
        } else {
          initialData[field.id] = '';
        }
      });
      setFormData(initialData);
    }
    setErrors({});
    setDuplicateErrors({});
  }, [record, category, isOpen]);

  const processFormData = (data: Record<string, any>): Record<string, any> => {
    const processedData = { ...data };

    category.fields.forEach(field => {
      const value = processedData[field.id];
      
      if (field.type === 'number' && value !== '') {
        processedData[field.id] = Number(value);
      } else if (field.type === 'date' && value) {
        processedData[field.id] = value;
      }

      // Ensure empty values are properly handled
      if (value === undefined || value === null) {
        processedData[field.id] = isMultiSelectField(field) ? [] : '';
      }
    });

    return processedData;
  };

  const handleSubmit = async () => {
    if (isValidating) {
      alert('중복 체크가 진행 중입니다. 잠시만 기다려주세요.');
      return;
    }
    
    const isValid = await validateForm();
    if (!isValid) {
      if (Object.keys(errors).length > 0) {
        alert('필수 입력 항목을 모두 입력해주세요.');
      } else if (Object.keys(duplicateErrors).length > 0) {
        alert('중복된 값이 있습니다. 수정 후 다시 시도해주세요.');
      }
      return;
    }

    try {
      setIsValidating(true);
      const processedData = processFormData(formData);

      if (record) {
        await updateRecord(record.id, processedData);
      } else {
        const now = new Date().toISOString();
        const newRecord: NewRecord = {
          categoryId: category.id,
          data: processedData,
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

  const updateFieldValue = async (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value,
    }));
    
    // Clear error when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  };

  const handleFieldBlur = async (fieldId: string) => {
    const field = category.fields.find(f => f.id === fieldId);
    if (field?.unique) {
      await checkDuplicates(fieldId, formData[fieldId]);
    }
  };

  const toggleCombobox = (fieldId: string) => {
    setOpenComboboxes(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId]
    }));
  };

  const renderField = (field: FieldDefinition) => {
    const value = formData[field.id] || (isMultiSelectField(field) ? [] : '');
    const hasError = !!errors[field.id];
    const hasDuplicateError = !!duplicateErrors[field.id];
    const errorMessage = errors[field.id] || duplicateErrors[field.id];
    const inputClassName = `bg-discord-sidebar border-gray-600 text-discord-text ${
      hasError || hasDuplicateError ? 'border-red-500' : ''
    }`;

    const renderErrorMessage = () => {
      if (!errorMessage) return null;
      return (
        <p className="text-red-500 text-sm mt-1">{errorMessage}</p>
      );
    };

    switch (field.type) {
      case 'text':
      case 'number':
        return (
          <div>
            <Input
              type={field.type}
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              onBlur={() => handleFieldBlur(field.id)}
              className={inputClassName}
              placeholder={`${field.name} 입력`}
            />
            {renderErrorMessage()}
          </div>
        );

      case 'date':
        return (
          <div>
            <Input
              type="date"
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              onBlur={() => handleFieldBlur(field.id)}
              className={inputClassName}
            />
            {renderErrorMessage()}
          </div>
        );

      case 'longtext':
        return (
          <div>
            <Textarea
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              onBlur={() => handleFieldBlur(field.id)}
              className={inputClassName}
              placeholder={`${field.name} 입력`}
              rows={4}
            />
            {renderErrorMessage()}
          </div>
        );

      case 'select':
        if (isMultiSelectField(field)) {
          return (
            <div>
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={inputClassName}
                  >
                    {Array.isArray(value) && value.length > 0 
                      ? `${value.length}개 선택됨`
                      : `${field.name} 선택`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 bg-discord-sidebar border-gray-600">
                  <Command>
                    <CommandInput placeholder={`${field.name} 검색...`} className="bg-discord-sidebar text-discord-text" />
                    <CommandList>
                      <CommandEmpty>옵션을 찾을 수 없습니다.</CommandEmpty>
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
              {/* 선택된 항목들을 태그로 표시 */}
              {Array.isArray(value) && value.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {value.map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-1 px-2 py-1 bg-discord-accent text-white text-xs rounded-full"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newValue = value.filter((v) => v !== item);
                          updateFieldValue(field.id, newValue);
                        }}
                        className="text-white hover:text-gray-200"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {renderErrorMessage()}
            </div>
          );
        } else {
          return (
            <div>
              <Select
                value={value || 'none'}
                onValueChange={(selectedValue) => updateFieldValue(field.id, selectedValue === 'none' ? '' : selectedValue)}
              >
                <SelectTrigger className={inputClassName}>
                  <SelectValue placeholder={`${field.name} 선택`} />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-gray-600">
                  <SelectItem value="none">선택 해제</SelectItem>
                  {field.options?.map(option => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderErrorMessage()}
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
            <div>
              <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openComboboxes[field.id]}
                    className={inputClassName}
                  >
                    {Array.isArray(value) && value.length > 0 
                      ? `${value.length}개 선택됨`
                      : `${field.name} 선택`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 bg-discord-sidebar border-gray-600">
                  <Command>
                    <CommandInput placeholder={`${field.name} 검색...`} className="bg-discord-sidebar text-discord-text" />
                    <CommandList>
                      <CommandEmpty>항목을 찾을 수 없습니다.</CommandEmpty>
                      <CommandGroup>
                        {relatedRecords.map((relatedRecord) => {
                          const displayValue = String(relatedRecord.data[displayField?.id] || relatedRecord.id);
                          return (
                            <CommandItem
                              key={relatedRecord.id}
                              value={displayValue}
                              onSelect={() => {
                                const currentValues = Array.isArray(value) ? value : [];
                                if (currentValues.includes(relatedRecord.id)) {
                                  updateFieldValue(field.id, currentValues.filter(v => v !== relatedRecord.id));
                                } else {
                                  updateFieldValue(field.id, [...currentValues, relatedRecord.id]);
                                }
                              }}
                              className="text-discord-text hover:bg-discord-hover"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  Array.isArray(value) && value.includes(relatedRecord.id) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {displayValue}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {/* 관계형 필드의 다중 선택에도 동일한 태그 표시 추가 */}
              {Array.isArray(value) && value.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {value.map((recordId) => {
                    const selectedRecord = relatedRecords.find(r => r.id === recordId);
                    const displayValue = selectedRecord 
                      ? String(selectedRecord.data[displayField?.id] || selectedRecord.id)
                      : recordId;
                    return (
                      <div
                        key={recordId}
                        className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white text-xs rounded-full"
                      >
                        <span>{displayValue}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const newValue = value.filter((v) => v !== recordId);
                            updateFieldValue(field.id, newValue);
                          }}
                          className="text-white hover:text-gray-200"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {renderErrorMessage()}
            </div>
          );
        } else {
          return (
            <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openComboboxes[field.id]}
                  className={inputClassName}
                >
                  {value ? (() => {
                    const selectedRecord = relatedRecords.find(r => r.id === value);
                    return selectedRecord ? String(selectedRecord.data[displayField?.id] || selectedRecord.id) : value;
                  })() : `${field.name} 선택`}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0 bg-discord-sidebar border-gray-600">
                <Command>
                  <CommandInput placeholder={`${field.name} 검색...`} className="bg-discord-sidebar text-discord-text" />
                  <CommandList>
                    <CommandEmpty>항목을 찾을 수 없습니다.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="none"
                        onSelect={() => {
                          updateFieldValue(field.id, '');
                          toggleCombobox(field.id);
                        }}
                        className="text-discord-text hover:bg-discord-hover"
                      >
                        선택 해제
                      </CommandItem>
                      {relatedRecords.map((relatedRecord) => {
                        const displayValue = String(relatedRecord.data[displayField?.id] || relatedRecord.id);
                        return (
                          <CommandItem
                            key={relatedRecord.id}
                            value={displayValue}
                            onSelect={() => {
                              updateFieldValue(field.id, relatedRecord.id);
                              toggleCombobox(field.id);
                            }}
                            className="text-discord-text hover:bg-discord-hover"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                value === relatedRecord.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {displayValue}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          );
        }

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-discord-text">
              {record ? '항목 수정' : '새 항목 추가'}
            </h2>
            <p className="text-sm text-discord-muted mt-1">
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
            {sortedFields.map(field => (
              <div key={field.id}>
                <Label className="text-discord-text font-medium">
                  {field.name}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <div className="mt-2">
                  {renderField(field)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
          <Button 
            variant="ghost" 
            onClick={onClose} 
            disabled={isValidating}
            className="text-discord-text hover:bg-discord-hover"
          >
            취소
          </Button>
          <Button 
            onClick={handleSubmit}
            className="bg-discord-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isValidating || Object.keys(errors).length > 0 || Object.keys(duplicateErrors).length > 0}
          >
            {isValidating ? '처리 중...' : record ? '수정' : '추가'}
          </Button>
        </div>
      </div>
    </div>
  );
};

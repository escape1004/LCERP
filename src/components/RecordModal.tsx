import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Check, ChevronsUpDown } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import type { Category, DataRecord, FieldDefinition, NewRecord } from '../types';
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
  const { addRecord, updateRecord, categories, getCategoryRecords } = useERPStore();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [openComboboxes, setOpenComboboxes] = useState<Record<string, boolean>>({});

  // Reset form data when modal opens/closes or record changes
  useEffect(() => {
    if (record) {
      setFormData({ ...record.data });
    } else {
      const initialData: Record<string, any> = {};
      category.fields.forEach(field => {
        if (field.type === 'select' && field.multiple) {
          initialData[field.id] = [];
        } else {
          initialData[field.id] = '';
        }
      });
      setFormData(initialData);
    }
    setErrors({});
    setOpenComboboxes({});
  }, [record, category]);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};
    
    category.fields.forEach(field => {
      if (field.required) {
        const value = formData[field.id];
        if (!value && value !== 0 && value !== false) {
          newErrors[field.id] = `${field.name}은(는) 필수 입력 항목입니다.`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, category.fields]);

  const handleSubmit = async () => {
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
    const inputClassName = cn(
      "bg-discord-sidebar border-gray-600 text-discord-text",
      hasError && "border-red-500"
    );

    switch (field.type) {
      case 'text':
      case 'number':
        return (
          <Input
            type={field.type === 'number' ? 'number' : 'text'}
            placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
            value={value}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            className={inputClassName}
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            className={inputClassName}
          />
        );

      case 'longtext':
        return (
          <Textarea
            value={value}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            className={inputClassName}
            placeholder={`${field.name} 입력`}
            rows={4}
          />
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

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-discord-text">
              {record ? '항목 상세' : '새 항목 추가'}
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

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {category.fields.map(field => (
              <div key={field.id}>
                <Label className="text-discord-text font-medium">
                  {field.name}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                <div className="mt-2">
                  {renderField(field)}
                  {errors[field.id] && (
                    <p className="text-red-500 text-sm mt-1">{errors[field.id]}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center justify-end gap-3 p-6 border-t border-gray-700">
          {record ? (
            <Button 
              onClick={onClose}
              className="bg-discord-accent hover:bg-blue-600"
            >
              닫기
            </Button>
          ) : (
            <>
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
                disabled={isValidating}
              >
                {isValidating ? '처리 중...' : '추가'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

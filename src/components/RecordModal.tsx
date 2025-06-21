import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Search, Check, ChevronsUpDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import type { Category, DataRecord, FieldDefinition, NewRecord } from '../types';
import type { ElectronAPI } from '../types/electron';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { toast } from './ui/use-toast';
import { AlertDialog } from './ui/alert-dialog';
import { DatePicker } from './ui/date-picker';

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
  const { addRecord, updateRecord, categories, getCategoryRecords, checkDuplicate, selectCategory } = useERPStore();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateErrors, setDuplicateErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isDuplicateChecking, setIsDuplicateChecking] = useState(false);
  const [pendingDuplicateChecks, setPendingDuplicateChecks] = useState<Set<string>>(new Set());
  const [openComboboxes, setOpenComboboxes] = useState<Record<string, boolean>>({});
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [alertDialogProps, setAlertDialogProps] = useState<{
    title: string;
    message: string;
    variant: 'error' | 'warning' | 'info' | 'success';
  }>({
    title: '',
    message: '',
    variant: 'info'
  });

  // 첫 번째 필드에 포커스하기 위한 ref
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(null);

  // formData의 초기값을 useMemo로 계산
  const initialFormData = React.useMemo(() => {
    if (record && category) {
      return { ...record.data };
    } else if (category) {
      const initialData: Record<string, any> = {};
      category.fields.forEach(field => {
        initialData[field.id] = field.type === 'checkbox' ? false : '';
      });
      return initialData;
    }
    return {};
  }, [record, category]);

  // isOpen이 true일 때만 formData를 초기화
  useEffect(() => {
    if (isOpen) {
      setFormData(initialFormData);
    }
  }, [isOpen, initialFormData]);

  // Reset form data when modal opens/closes or record changes
  useEffect(() => {
    if (isOpen && record && category) {
      setFormData({ ...record.data });
    } else if (isOpen && category) {
      // 새 레코드 추가 시, 모든 필드의 기본값 세팅
      const initialData: Record<string, any> = {};
      category.fields.forEach(field => {
        initialData[field.id] = field.type === 'checkbox' ? false : '';
      });
      setFormData(initialData);
    }
    setErrors({});
    setDuplicateErrors({});
    setOpenComboboxes({});
  }, [isOpen, record, category]);

  // 모달이 닫힐 때 formData를 초기화하여 이전 모달 상태가 남지 않도록 함
  useEffect(() => {
    if (!isOpen) {
      setFormData({});
    }
  }, [isOpen]);

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
    if (isOpen && category?.fields?.length > 0) {
      // 약간의 지연을 두어 모달이 완전히 렌더링된 후 포커스
      setTimeout(() => {
        if (firstFieldRef.current) {
          firstFieldRef.current.focus();
        }
      }, 200);
    }
  }, [isOpen, category]);

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

  const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'info' | 'success' = 'info') => {
    setAlertDialogProps({ title, message, variant });
    setIsAlertDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!category) {
      showAlert('오류', '카테고리를 먼저 선택하세요.', 'error');
      return;
    }
    const isValid = validateForm();
    if (!isValid) {
      showAlert('오류', '필수 입력 항목을 모두 입력해주세요.', 'error');
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
      showAlert('오류', '항목을 저장하는 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
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

  const renderField = (field: FieldDefinition, isFirstField: boolean = false) => {
    const value =
      field.type === 'select' && field.multiple
        ? formData[field.id] ?? []
        : field.type === 'checkbox'
          ? formData[field.id] ?? false
          : formData[field.id] ?? '';
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
        return (
          <div className="space-y-1">
            <Input
              type="text"
              placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={inputClassName}
              ref={isFirstField ? firstFieldRef as React.Ref<HTMLInputElement> : undefined}
            />
            {renderError()}
          </div>
        );

      case 'longtext':
        return (
          <div className="space-y-1">
            <textarea
              placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={cn(
                "flex w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors",
                "placeholder:text-gray-500",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "min-h-[100px] resize-y",
                inputClassName
              )}
              ref={isFirstField ? firstFieldRef as React.Ref<HTMLTextAreaElement> : undefined}
            />
            {renderError()}
          </div>
        );

      case 'number':
        return (
          <div className="space-y-1">
            <Input
              type="number"
              placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
              value={value}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              className={inputClassName}
              ref={isFirstField ? firstFieldRef as React.Ref<HTMLInputElement> : undefined}
            />
            {renderError()}
          </div>
        );

      case 'date':
        return (
          <div className="space-y-1">
            <DatePicker
              value={value}
              onChange={(dateValue) => updateFieldValue(field.id, dateValue)}
              className={inputClassName}
              placeholder={`${field.name}${field.required ? ' (필수)' : ''}`}
            />
            {renderError()}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-1">
            <Button
              variant="outline"
              onClick={() => updateFieldValue(field.id, !value)}
              className={cn(
                "w-full h-10 flex items-center justify-center",
                value 
                  ? "bg-discord-accent hover:bg-blue-600 border-0 text-white" 
                  : "bg-discord-danger hover:bg-red-900 border-0 text-white"
              )}
              ref={isFirstField ? firstFieldRef as React.Ref<HTMLButtonElement> : undefined}
            >
              {value ? (
                <Check className="w-6 h-6" />
              ) : (
                <X className="w-6 h-6" />
              )}
            </Button>
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
                        
                        // 기존 옵션에 있는 값들 찾기
                        const validOptions = field.options?.filter(opt => 
                          pastedValues.some(v => opt.toLowerCase() === v.toLowerCase())
                        ) || [];
                        
                        if (validOptions.length > 0) {
                          const currentValues = Array.isArray(value) ? value : [];
                          const newValues = [...new Set([...currentValues, ...validOptions])];
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
                              description: `${validOptions.length}개의 값이 추가되었습니다.`,
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
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        const pastedValue = pastedText.trim();
                        
                        // 기존 옵션에 있는 값인지 확인
                        const matchingOption = field.options?.find(opt => 
                          opt.toLowerCase() === pastedValue.toLowerCase()
                        );
                        
                        if (matchingOption) {
                          updateFieldValue(field.id, matchingOption);
                          toggleCombobox(field.id);
                          toast({
                            title: "값이 선택됨",
                            description: `"${matchingOption}"이 선택되었습니다.`,
                          });
                        } else {
                          toast({
                            title: "유효하지 않은 값",
                            description: `"${pastedValue}"는 유효한 옵션이 아닙니다.`,
                            variant: "destructive",
                          });
                        }
                      }}
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
        const displayField = field.displayFieldId
          ? relatedCategory.fields.find(f => f.id === field.displayFieldId)
          : relatedCategory.fields[0];

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
                      onPaste={(e) => {
                        e.preventDefault();
                        const pastedText = e.clipboardData.getData('text');
                        const pastedValue = pastedText.trim();
                        
                        // 기존 레코드에서 일치하는 값 찾기
                        const matchingRecord = relatedRecords.find(record => 
                          record.data[displayField.id].toLowerCase() === pastedValue.toLowerCase()
                        );
                        
                        if (matchingRecord) {
                          updateFieldValue(field.id, matchingRecord.id);
                          toggleCombobox(field.id);
                          toast({
                            title: "값이 선택됨",
                            description: `"${matchingRecord.data[displayField.id]}"이 선택되었습니다.`,
                          });
                        } else {
                          toast({
                            title: "유효하지 않은 값",
                            description: `"${pastedValue}"는 유효한 항목이 아닙니다.`,
                            variant: "destructive",
                          });
                        }
                      }}
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
                try {
                  // Electron 환경에서는 네이티브 파일 다이얼로그 사용
                  const result = await window.electronAPI.openFileDialog();
                  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
                    return;
                  }
                  
                  const selectedPath = result.filePaths[0];
                  
                  // 절대 경로를 상대 경로로 변환
                  // 앱 루트 디렉토리를 기준으로 상대 경로 계산
                  const appRoot = await window.electronAPI.getAppRoot();
                  let relativePath = selectedPath;
                  
                  // 앱 루트 디렉토리 내부의 파일인 경우 상대 경로로 변환
                  if (selectedPath.startsWith(appRoot)) {
                    relativePath = selectedPath.substring(appRoot.length + 1); // +1 for path separator
                  }
                  
                  updateFieldValue(field.id, relativePath);
                } catch (error) {
                  console.error('파일 선택 중 오류:', error);
                  showAlert('오류', '파일 선택 중 오류가 발생했습니다.', 'error');
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

  // 카테고리 경로 구하기 (ViewRecordModal 참고)
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

  // formData가 준비되지 않았으면 렌더링하지 않기
  if (!isOpen || !formData || Object.keys(formData).length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-end">
            <h2 className="text-xl font-bold text-discord-text">
              {record ? '항목 수정' : '새 항목 등록'}
            </h2>
            <span className="ml-2 text-sm text-discord-muted flex items-center">
              (
              {(() => {
                const parentPath = getParentPath(category);
                return (
                  <>
                    {parentPath.map((cat, idx) => (
                      <React.Fragment key={cat.id}>
                        <button
                          onClick={() => handleCategoryClick(cat.id)}
                          className="hover:text-discord-text hover:underline"
                        >
                          {cat.name}
                        </button>
                        <ChevronRight size={14} className="mx-1 text-discord-muted" />
                      </React.Fragment>
                    ))}
                    <span className="text-discord-muted font-semibold">{category.name}</span>
                  </>
                );
              })()}
              )
            </span>
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
            {(category?.fields ?? []).sort((a, b) => a.order - b.order).map((field, index) => (
              <div key={field.id} className="space-y-2">
                <Label className="text-sm font-medium text-discord-text">
                  {field.name}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                  {field.unique && <span className="text-gray-400 ml-1 text-xs">(중복 불가)</span>}
                </Label>
                {renderField(field, index === 0)}
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
      
      {/* 커스텀 알럿 다이얼로그 */}
      <AlertDialog
        isOpen={isAlertDialogOpen}
        onClose={() => setIsAlertDialogOpen(false)}
        title={alertDialogProps.title}
        message={alertDialogProps.message}
        variant={alertDialogProps.variant}
      />
    </div>
  );
};

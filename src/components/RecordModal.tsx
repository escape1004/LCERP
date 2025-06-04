
import React, { useState, useEffect } from 'react';
import { X, Search, Check, ChevronsUpDown } from 'lucide-react';
import { useERPStore } from '../hooks/useERPStore';
import { Category, DataRecord, FieldDefinition } from '../types';
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
  const { categories, addRecord, updateRecord, getCategoryRecords } = useERPStore();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openComboboxes, setOpenComboboxes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (record) {
      setFormData({ ...record.data });
    } else {
      // Initialize form with empty values
      const initialData: Record<string, any> = {};
      category.fields.forEach(field => {
        if (field.multiSelect) {
          initialData[field.id] = [];
        } else {
          initialData[field.id] = '';
        }
      });
      setFormData(initialData);
    }
    setErrors({});
  }, [record, category, isOpen]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    category.fields.forEach(field => {
      if (field.required) {
        const value = formData[field.id];
        if (!value || (Array.isArray(value) && value.length === 0)) {
          newErrors[field.id] = `${field.name}은(는) 필수 입력 항목입니다.`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    const processedData = { ...formData };

    // Process data based on field types
    category.fields.forEach(field => {
      const value = processedData[field.id];
      
      if (field.type === 'number' && value !== '') {
        processedData[field.id] = Number(value);
      } else if (field.type === 'date' && value) {
        processedData[field.id] = value;
      }
    });

    if (record) {
      updateRecord(record.id, processedData);
    } else {
      addRecord({
        categoryId: category.id,
        data: processedData,
      });
    }

    onClose();
  };

  const updateFieldValue = (fieldId: string, value: any) => {
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

  const toggleCombobox = (fieldId: string) => {
    setOpenComboboxes(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId]
    }));
  };

  const renderField = (field: FieldDefinition) => {
    const value = formData[field.id] || (field.multiSelect ? [] : '');
    const hasError = !!errors[field.id];

    switch (field.type) {
      case 'text':
        return (
          <Input
            value={value}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            className={`bg-discord-sidebar border-gray-600 text-discord-text ${
              hasError ? 'border-red-500' : ''
            }`}
            placeholder={`${field.name} 입력`}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={value}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            className={`bg-discord-sidebar border-gray-600 text-discord-text ${
              hasError ? 'border-red-500' : ''
            }`}
            placeholder={`${field.name} 입력`}
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            className={`bg-discord-sidebar border-gray-600 text-discord-text ${
              hasError ? 'border-red-500' : ''
            }`}
          />
        );

      case 'longtext':
        return (
          <Textarea
            value={value}
            onChange={(e) => updateFieldValue(field.id, e.target.value)}
            className={`bg-discord-sidebar border-gray-600 text-discord-text ${
              hasError ? 'border-red-500' : ''
            }`}
            placeholder={`${field.name} 입력`}
            rows={4}
          />
        );

      case 'select':
        if (field.multiSelect) {
          return (
            <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openComboboxes[field.id]}
                  className={`w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text ${
                    hasError ? 'border-red-500' : ''
                  }`}
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
                      {field.selectOptions?.map((option) => (
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
          );
        } else {
          return (
            <Select
              value={value || 'none'}
              onValueChange={(selectedValue) => updateFieldValue(field.id, selectedValue === 'none' ? '' : selectedValue)}
            >
              <SelectTrigger className={`bg-discord-sidebar border-gray-600 text-discord-text ${
                hasError ? 'border-red-500' : ''
              }`}>
                <SelectValue placeholder={`${field.name} 선택`} />
              </SelectTrigger>
              <SelectContent className="bg-discord-sidebar border-gray-600">
                <SelectItem value="none">선택 해제</SelectItem>
                {field.selectOptions?.map(option => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

      case 'relation':
        if (!field.relationCategoryId) return null;
        
        const relatedCategory = categories.find(cat => cat.id === field.relationCategoryId);
        if (!relatedCategory) return null;
        
        const relatedRecords = getCategoryRecords(field.relationCategoryId);
        const displayField = relatedCategory.fields[0];

        if (field.multiSelect) {
          return (
            <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openComboboxes[field.id]}
                  className={`w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text ${
                    hasError ? 'border-red-500' : ''
                  }`}
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
          );
        } else {
          return (
            <Popover open={openComboboxes[field.id]} onOpenChange={() => toggleCombobox(field.id)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openComboboxes[field.id]}
                  className={`w-full justify-between bg-discord-sidebar border-gray-600 text-discord-text ${
                    hasError ? 'border-red-500' : ''
                  }`}
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
          <h2 className="text-xl font-bold text-discord-text">
            {record ? '항목 수정' : '새 항목 추가'}
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
            {category.fields
              .sort((a, b) => a.order - b.order)
              .map(field => (
                <div key={field.id}>
                  <Label className="text-discord-text font-medium">
                    {field.name}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <div className="mt-2">
                    {renderField(field)}
                  </div>
                  {errors[field.id] && (
                    <p className="text-red-500 text-sm mt-1">{errors[field.id]}</p>
                  )}
                </div>
              ))}
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
            {record ? '수정' : '추가'}
          </Button>
        </div>
      </div>
    </div>
  );
};

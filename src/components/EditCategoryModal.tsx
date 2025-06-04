import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Category, FieldDefinition, NewCategory } from '../types';
import { useERPStore } from '../hooks/useERPStore';
import { v4 as uuidv4 } from 'uuid';

interface FieldEditorProps {
  field: FieldDefinition;
  onChange: (field: FieldDefinition) => void;
  onDelete: () => void;
  categories: Category[];
}

interface EditCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: Category;
}

const FieldEditor: React.FC<FieldEditorProps> = ({ field, onChange, onDelete, categories }) => {
  console.log('FieldEditor rendering with field:', JSON.stringify(field, null, 2));

  const handleRequiredChange = (checked: boolean) => {
    console.log('Required change:', { checked });
    onChange({ ...field, required: checked });
  };

  const handleUniqueChange = (checked: boolean) => {
    console.log('Unique change:', { checked });
    onChange({ ...field, unique: checked });
  };

  return (
    <div className="space-y-4 p-4 bg-discord-dark rounded-lg">
      <div className="flex items-center gap-4">
        <Input
          placeholder="필드 이름"
          value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })}
          className="flex-1"
        />
        <Select
          value={field.type}
          onValueChange={(value) => onChange({ ...field, type: value as FieldDefinition['type'] })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="필드 타입" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">텍스트</SelectItem>
            <SelectItem value="number">숫자</SelectItem>
            <SelectItem value="date">날짜</SelectItem>
            <SelectItem value="select">선택</SelectItem>
            <SelectItem value="relation">관계</SelectItem>
            <SelectItem value="longtext">긴 텍스트</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="destructive"
          size="icon"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* 필드 옵션 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 필수값 체크박스 */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`required-${field.id}`}
            checked={field.required}
            onCheckedChange={(checked) => onChange({ ...field, required: checked === true })}
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
            onCheckedChange={(checked) => onChange({ ...field, unique: checked === true })}
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
              onCheckedChange={(checked) => onChange({ ...field, multiple: checked === true })}
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

      {/* 선택 옵션 (select 타입일 때만) */}
      {field.type === 'select' && (
        <div className="space-y-2 mt-4">
          <label className="text-sm text-discord-text">옵션</label>
          <div className="flex flex-wrap gap-2">
            {field.options?.map((option, index) => (
              <div key={index} className="flex items-center gap-1">
                <Input
                  value={option}
                  onChange={(e) => {
                    const newOptions = [...(field.options || [])];
                    newOptions[index] = e.target.value;
                    onChange({ ...field, options: newOptions });
                  }}
                  className="w-32"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const newOptions = [...(field.options || [])];
                    newOptions.splice(index, 1);
                    onChange({ ...field, options: newOptions });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const newOptions = [...(field.options || []), ''];
                onChange({ ...field, options: newOptions });
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              옵션 추가
            </Button>
          </div>
        </div>
      )}

      {/* 관련 카테고리 선택 (relation 타입일 때만) */}
      {field.type === 'relation' && (
        <div className="space-y-2 mt-4">
          <label className="text-sm text-discord-text">관련 카테고리</label>
          <Select
            value={field.relationCategoryId}
            onValueChange={(value) => onChange({ ...field, relationCategoryId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="카테고리 선택" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};

export const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  isOpen,
  onClose,
  category,
}) => {
  const { categories, addCategory, updateCategory } = useERPStore();
  const [name, setName] = useState(category?.name || '');
  const [fields, setFields] = useState<FieldDefinition[]>(
    category?.fields || []
  );
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      if (!name.trim()) {
        setError('카테고리 이름을 입력해주세요.');
        return;
      }

      if (fields.length === 0) {
        setError('최소 하나의 필드가 필요합니다.');
        return;
      }

      // 필드 이름 중복 체크
      const fieldNames = new Set();
      for (const field of fields) {
        if (!field.name.trim()) {
          setError('모든 필드에 이름이 필요합니다.');
          return;
        }
        if (fieldNames.has(field.name)) {
          setError(`중복된 필드 이름이 있습니다: ${field.name}`);
          return;
        }
        fieldNames.add(field.name);
      }

      if (category) {
        // 수정
        await updateCategory(category.id, {
          ...category,
          name,
          fields: fields.map((field, index) => ({ ...field, order: index })),
        });
      } else {
        // 생성
        const now = new Date().toISOString();
        const newCategory: NewCategory = {
          name,
          fields: fields.map((field, index) => ({ ...field, order: index })),
          order: categories.length,
          createdAt: now,
          updatedAt: now,
        };
        await addCategory(newCategory);
      }

      onClose();
    } catch (error) {
      console.error('Error saving category:', error);
      setError(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    }
  };

  const addField = () => {
    console.log('Adding new field...');
    const newField: FieldDefinition = {
      id: uuidv4(),
      name: '',
      type: 'text',
      order: fields.length,
      required: false,
      unique: false,
      multiple: false,
    };
    console.log('New field created:', JSON.stringify(newField, null, 2));
    setFields([...fields, newField]);
  };

  const updateField = (index: number, updatedField: FieldDefinition) => {
    console.log('Updating field:', { index, field: JSON.stringify(updatedField, null, 2) });
    const newFields = [...fields];
    newFields[index] = updatedField;
    setFields(newFields);
  };

  const deleteField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-discord-text">
            {category ? '카테고리 수정' : '새 카테고리 추가'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-discord-text">
              카테고리 이름
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="카테고리 이름을 입력하세요"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-discord-text">필드</h3>
              <Button
                type="button"
                onClick={addField}
                className="bg-discord-accent hover:bg-discord-accent/80"
              >
                <Plus className="h-4 w-4 mr-2" />
                필드 추가
              </Button>
            </div>

            <div className="space-y-4">
              {fields.map((field, index) => (
                <FieldEditor
                  key={field.id}
                  field={field}
                  onChange={(updatedField) => updateField(index, updatedField)}
                  onDelete={() => deleteField(index)}
                  categories={categories.filter(cat => cat.id !== category?.id)}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="text-red-500 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              취소
            </Button>
            <Button type="submit">
              {category ? '저장' : '추가'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditCategoryModal; 
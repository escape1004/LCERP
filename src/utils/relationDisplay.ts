import type { Category, DataRecord, FieldDefinition } from '../types';
import { TRANSLATED_FIELD_SUFFIX, getTranslatedFieldId } from '../lib/translation';

const hasMeaningfulValue = (value: unknown): value is string | number | boolean => (
  value !== undefined
  && value !== null
  && value !== ''
  && value !== 'undefined'
  && value !== 'null'
);

const getFieldBySelectedId = (relatedCategory: Category, selectedFieldId?: string) => {
  if (!selectedFieldId) {
    return undefined;
  }

  return relatedCategory.fields.find((candidate) => (
    candidate.id === selectedFieldId || getTranslatedFieldId(candidate.id) === selectedFieldId
  ));
};

const getRecordValueBySelectedFieldId = (record: DataRecord, selectedFieldId?: string) => {
  if (!selectedFieldId) {
    return undefined;
  }

  return record.data[selectedFieldId];
};

const isTranslatedFieldSelection = (selectedFieldId?: string) => (
  Boolean(selectedFieldId?.endsWith(TRANSLATED_FIELD_SUFFIX))
);

export const getRelationPrimaryLabel = (
  record: DataRecord,
  field: FieldDefinition,
  categories: Category[]
): string => {
  const relatedCategory = categories.find((category) => category.id === field.relationCategoryId);
  if (!relatedCategory) return record.id;

  const displayField = field.displayFieldId
    ? getFieldBySelectedId(relatedCategory, field.displayFieldId)
    : relatedCategory.fields[0];

  const mainLabel = displayField
    ? getRecordValueBySelectedFieldId(record, field.displayFieldId ?? displayField.id)
    : record.id;
  return hasMeaningfulValue(mainLabel) ? String(mainLabel) : record.id;
};

export const getRelationDisplayLabel = (
  record: DataRecord,
  field: FieldDefinition,
  categories: Category[],
  getCategoryRecords: (categoryId: string) => DataRecord[]
): string => {
  const mainLabel = getRelationPrimaryLabel(record, field, categories);

  const relatedCategory = categories.find((category) => category.id === field.relationCategoryId);
  if (!relatedCategory) return mainLabel;

  const subField = getFieldBySelectedId(relatedCategory, field.subDisplayFieldId);

  if (!subField) {
    return mainLabel;
  }

  const subValue = getRecordValueBySelectedFieldId(record, field.subDisplayFieldId);
  if (!hasMeaningfulValue(subValue)) {
    return mainLabel;
  }

  if (!isTranslatedFieldSelection(field.subDisplayFieldId) && subField.type === 'relation' && subField.relationCategoryId) {
    const subRecords = getCategoryRecords(subField.relationCategoryId);
    const subRecord = subRecords.find((candidate) => candidate.id === subValue);
    if (!subRecord) {
      return mainLabel;
    }

    const subLabel = getRelationDisplayLabel(subRecord, subField, categories, getCategoryRecords);
    return hasMeaningfulValue(subLabel) ? `${mainLabel}(${subLabel})` : mainLabel;
  }

  return `${mainLabel}(${String(subValue)})`;
};

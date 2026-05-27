import type { Category, DataRecord, FieldDefinition } from '../types';

const hasMeaningfulValue = (value: unknown): value is string | number | boolean => (
  value !== undefined
  && value !== null
  && value !== ''
  && value !== 'undefined'
  && value !== 'null'
);

export const getRelationPrimaryLabel = (
  record: DataRecord,
  field: FieldDefinition,
  categories: Category[]
): string => {
  const relatedCategory = categories.find((category) => category.id === field.relationCategoryId);
  if (!relatedCategory) return record.id;

  const displayField = field.displayFieldId
    ? relatedCategory.fields.find((candidate) => candidate.id === field.displayFieldId)
    : relatedCategory.fields[0];

  const mainLabel = displayField ? record.data[displayField.id] : record.id;
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

  const subField = field.subDisplayFieldId
    ? relatedCategory.fields.find((candidate) => candidate.id === field.subDisplayFieldId)
    : undefined;

  if (!subField) {
    return mainLabel;
  }

  const subValue = record.data[subField.id];
  if (!hasMeaningfulValue(subValue)) {
    return mainLabel;
  }

  if (subField.type === 'relation' && subField.relationCategoryId) {
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

import type { Category, DataRecord, FieldDefinition } from '../types';
import { formatFieldDisplayValue } from './fieldFormat';

export const REFERRING_RECORDS_PAGE_SIZE = 50;

export function getRootCategory(category: Category, categories: Category[]): Category {
  const categoryById = new Map(categories.map((item) => [item.id, item]));
  let current = category;
  const seen = new Set<string>([current.id]);

  while (current.parentId) {
    const parent = categoryById.get(current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }

  return current;
}

export function getIncomingRelationFields(sourceCategory: Category, targetCategoryId: string): FieldDefinition[] {
  return sourceCategory.fields.filter((field) => (
    field.type === 'relation' && field.relationCategoryId === targetCategoryId
  ));
}

export function getReferringSourceCategory(category: Category, categories: Category[]): Category | null {
  if (!category.parentId) return null;

  const categoryById = new Map(categories.map((item) => [item.id, item]));
  const ancestors: Category[] = [];
  const seen = new Set<string>([category.id]);
  let current = category;

  while (current.parentId) {
    const parent = categoryById.get(current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    ancestors.push(parent);
    current = parent;
  }

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    if (getIncomingRelationFields(ancestors[index], category.id).length > 0) {
      return ancestors[index];
    }
  }

  return null;
}

export function recordReferencesTarget(
  record: DataRecord,
  relationFields: FieldDefinition[],
  targetRecordId: string,
): boolean {
  return relationFields.some((field) => {
    const value = record.data[field.id];
    if (field.multiple && Array.isArray(value)) {
      return value.some((item) => item === targetRecordId);
    }
    return value === targetRecordId;
  });
}

export function getReferringRecords(
  sourceRecords: DataRecord[],
  relationFields: FieldDefinition[],
  targetRecordId: string,
): DataRecord[] {
  if (relationFields.length === 0) return [];
  return sourceRecords.filter((record) => recordReferencesTarget(record, relationFields, targetRecordId));
}

export function getCategoryRecordLabel(record: DataRecord, category: Category): string {
  const preferredField = category.fields.find((field) => field.type === 'text' && !field.hidden)
    ?? category.fields.find((field) => field.type !== 'file' && !field.hidden)
    ?? category.fields[0];

  if (!preferredField) return record.id;

  const formatted = formatFieldDisplayValue(preferredField, record.data[preferredField.id]).trim();
  return formatted || record.id;
}

export function filterRecordsByQuery<T extends { label: string }>(items: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;
  return items.filter((item) => item.label.toLowerCase().includes(normalizedQuery));
}

export function paginateItems<T>(items: T[], page: number, pageSize = REFERRING_RECORDS_PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    currentPage,
    totalPages,
    total,
    start: total === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + pageSize, total),
  };
}

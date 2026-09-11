import { useMemo } from 'react';
import type { Category, DataRecord, FieldDefinition } from '../types';
import { filterRecords, sortRecords } from '../lib/recordQuery';
import type { FieldValue, ListFileType } from '../lib/recordFields';

interface UseRecordQueryOptions {
  records: DataRecord[];
  searchTerm: string;
  normalizedSearchTerm: string;
  normalizedMultiSearchTerms: string[];
  effectiveSearchField: string;
  isMultiValueSearchField: boolean;
  hasActiveSearch: boolean;
  fileTypeFilter: ListFileType | 'all';
  sortField: string;
  sortDirection: 'asc' | 'desc';
  fileField?: FieldDefinition;
  visibleFields: FieldDefinition[];
  fieldMap: Map<string, FieldDefinition>;
  categoryById: Map<string, Category>;
  recordsByIdByCategory: Map<string, Map<string, DataRecord>>;
  getRecordFieldValue: (record: DataRecord, fieldId: string) => FieldValue;
  getRecordReferenceCount: (recordId: string, categoryId: string) => number;
  categoryId: string;
}

export function useRecordQuery({
  records,
  searchTerm,
  normalizedSearchTerm,
  normalizedMultiSearchTerms,
  effectiveSearchField,
  isMultiValueSearchField,
  hasActiveSearch,
  fileTypeFilter,
  sortField,
  sortDirection,
  fileField,
  visibleFields,
  fieldMap,
  categoryById,
  recordsByIdByCategory,
  getRecordFieldValue,
  getRecordReferenceCount,
  categoryId,
}: UseRecordQueryOptions) {
  const search = {
    searchTerm,
    normalizedSearchTerm,
    normalizedMultiSearchTerms,
    effectiveSearchField,
    isMultiValueSearchField,
    hasActiveSearch,
    fileTypeFilter,
  };

  const filteredRecords = useMemo(
    () => filterRecords({
      records,
      search,
      fileField,
      visibleFields,
      fieldMap,
      categoryById,
      recordsByIdByCategory,
      getRecordFieldValue,
    }),
    [
      records,
      searchTerm,
      normalizedSearchTerm,
      normalizedMultiSearchTerms,
      effectiveSearchField,
      isMultiValueSearchField,
      hasActiveSearch,
      fileTypeFilter,
      fileField,
      visibleFields,
      fieldMap,
      categoryById,
      recordsByIdByCategory,
      getRecordFieldValue,
    ],
  );

  const sortedRecords = useMemo(
    () => sortRecords({
      records: filteredRecords,
      sort: { sortField, sortDirection },
      fieldMap,
      categoryById,
      recordsByIdByCategory,
      fileField,
      getRecordFieldValue,
      getRecordReferenceCount,
      categoryId,
    }),
    [
      filteredRecords,
      sortField,
      sortDirection,
      fieldMap,
      categoryById,
      recordsByIdByCategory,
      fileField,
      getRecordFieldValue,
      getRecordReferenceCount,
      categoryId,
    ],
  );

  return { filteredRecords, sortedRecords };
}

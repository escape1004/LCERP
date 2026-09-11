import { useEffect, type RefObject } from 'react';
import type { DataRecord } from '../types';

interface UseRecordListKeyboardOptions {
  disabled: boolean;
  selectedCategoryId: string | null;
  selectedRecordId: string | null;
  paginatedRecords: DataRecord[];
  sortedRecords: DataRecord[];
  currentPage: number;
  totalPages: number;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSelectRecord: (recordId: string) => void;
  onNewRecord: () => void;
  onEditRecord: (record: DataRecord) => void;
  onRefresh: () => void;
  onRandomRecord: () => void;
  onPageChange: (page: number) => void;
}

export function useRecordListKeyboard({
  disabled,
  selectedCategoryId,
  selectedRecordId,
  paginatedRecords,
  sortedRecords,
  currentPage,
  totalPages,
  searchInputRef,
  onSelectRecord,
  onNewRecord,
  onEditRecord,
  onRefresh,
  onRandomRecord,
  onPageChange,
}: UseRecordListKeyboardOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget = !!target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      );

      if (disabled) return;

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.key === 'r' || event.key === 'R')) {
        event.preventDefault();
        onRandomRecord();
        return;
      }

      if (event.key === 'F5' && selectedCategoryId) {
        event.preventDefault();
        onRefresh();
      } else if (event.ctrlKey && event.key === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.ctrlKey && event.key === 'n') {
        event.preventDefault();
        if (selectedCategoryId) onNewRecord();
      } else if (event.key === 'F2' && selectedCategoryId && selectedRecordId) {
        event.preventDefault();
        const selectedRecord = paginatedRecords.find((record) => record.id === selectedRecordId)
          || sortedRecords.find((record) => record.id === selectedRecordId);
        if (selectedRecord) onEditRecord(selectedRecord);
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (paginatedRecords.length === 0) return;
        event.preventDefault();
        const currentIndex = paginatedRecords.findIndex((record) => record.id === selectedRecordId);
        if (event.key === 'ArrowUp') {
          onSelectRecord(paginatedRecords[currentIndex <= 0 ? 0 : currentIndex - 1].id);
        } else {
          onSelectRecord(paginatedRecords[currentIndex < 0 ? 0 : Math.min(currentIndex + 1, paginatedRecords.length - 1)].id);
        }
      } else if (event.ctrlKey && event.key === 'ArrowRight') {
        if (currentPage < totalPages) onPageChange(currentPage + 1);
      } else if (event.ctrlKey && event.key === 'ArrowLeft') {
        if (currentPage > 1) onPageChange(currentPage - 1);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    currentPage,
    disabled,
    onEditRecord,
    onNewRecord,
    onPageChange,
    onRandomRecord,
    onRefresh,
    onSelectRecord,
    paginatedRecords,
    searchInputRef,
    selectedCategoryId,
    selectedRecordId,
    sortedRecords,
    totalPages,
  ]);
}

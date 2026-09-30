import React from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Category, DataRecord } from '../../types';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import {
  filterRecordsByQuery,
  getCategoryRecordLabel,
  paginateItems,
} from '../../lib/referringRecords';

export const ReferringRecordsPanel: React.FC<{
  category: Category;
  records: DataRecord[];
  onSelectRecord: (record: DataRecord) => void;
}> = ({ category, records, onSelectRecord }) => {
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);

  const labeledRecords = React.useMemo(
    () => records.map((record) => ({
      record,
      label: getCategoryRecordLabel(record, category),
    })),
    [category, records],
  );

  const filteredRecords = React.useMemo(
    () => filterRecordsByQuery(labeledRecords, query),
    [labeledRecords, query],
  );

  const paged = React.useMemo(
    () => paginateItems(filteredRecords, page),
    [filteredRecords, page],
  );

  React.useEffect(() => {
    setPage(1);
  }, [query, records]);

  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-gray-700 bg-discord-bg">
      <div className="flex-shrink-0 border-b border-gray-700 p-4">
        <div className="text-sm font-semibold text-discord-text">{category.name}</div>
        <div className="mt-1 text-xs text-discord-muted">
          이 항목을 참조하는 레코드 {records.length.toLocaleString()}개
        </div>
        <div className="relative mt-3">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-discord-muted" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="레코드 검색"
            className="h-8 bg-discord-sidebar border-gray-600 pl-8 text-xs text-discord-text"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto discord-scrollbar p-2">
        {paged.total === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-discord-muted">
            {query.trim() ? '검색 결과가 없습니다.' : '이 항목을 참조하는 레코드가 없습니다.'}
          </div>
        ) : (
          <div className="space-y-1">
            {paged.items.map(({ record, label }) => (
              <button
                key={record.id}
                type="button"
                onClick={() => onSelectRecord(record)}
                className="w-full truncate rounded-md px-2.5 py-2 text-left text-sm text-discord-text hover:bg-discord-hover"
                title={label}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {paged.total > 0 && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t border-gray-700 px-3 py-2">
          <span className="text-[11px] text-discord-muted">
            {paged.start.toLocaleString()}-{paged.end.toLocaleString()} / {paged.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="h-7 w-7 p-0 border-gray-600 hover:bg-discord-hover"
              disabled={paged.currentPage <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-7 w-7 p-0 border-gray-600 hover:bg-discord-hover"
              disabled={paged.currentPage >= paged.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
};

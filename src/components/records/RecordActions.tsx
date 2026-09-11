import React from 'react';
import { ContextMenuItem } from '../ui/context-menu';
import type { DataRecord } from '../../types';

interface RecordActionsMenuProps {
  record: DataRecord;
  showView?: boolean;
  hideViewItem?: boolean;
  onSelect: (record: DataRecord) => void;
  onView: (record: DataRecord) => void;
  onEdit: (record: DataRecord) => void;
  onDelete: (event: Event | React.SyntheticEvent, record: DataRecord) => void | Promise<void>;
}

export const RecordActionsMenu: React.FC<RecordActionsMenuProps> = ({
  record,
  showView = true,
  hideViewItem = false,
  onSelect,
  onView,
  onEdit,
  onDelete,
}) => (
  <>
    {showView && (
      <ContextMenuItem
        className={hideViewItem ? 'hidden' : undefined}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(record);
          onView(record);
        }}
      >
        상세
      </ContextMenuItem>
    )}
    <ContextMenuItem
      onClick={(event) => {
        event.stopPropagation();
        onSelect(record);
        onEdit(record);
      }}
    >
      수정
    </ContextMenuItem>
    <ContextMenuItem
      className="text-discord-danger focus:text-discord-danger"
      onClick={(event) => {
        void onDelete(event, record);
      }}
    >
      삭제
    </ContextMenuItem>
  </>
);

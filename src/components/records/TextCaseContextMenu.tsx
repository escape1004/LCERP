import React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
import { applyTextCaseToRange, type TextCaseAction } from '../../lib/textCase';
import { cn } from '../../lib/utils';

type TextCaseMenuItem = {
  action: TextCaseAction;
  label: string;
};

const TEXT_CASE_MENU_ITEMS: Array<TextCaseMenuItem | 'separator'> = [
  { action: 'sentenceUpper', label: '문장 첫 글자를 대문자로' },
  { action: 'sentenceLower', label: '문장 첫 글자를 소문자로' },
  'separator',
  { action: 'wordUpper', label: '단어 첫 글자를 대문자로' },
  { action: 'wordLower', label: '단어 첫 글자를 소문자로' },
  'separator',
  { action: 'allUpper', label: '모두 대문자로' },
  { action: 'allLower', label: '모두 소문자로' },
];

const isTextField = (node: EventTarget | null): node is HTMLInputElement | HTMLTextAreaElement => (
  node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
);

export const TextCaseContextMenu: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({
  value,
  onValueChange,
  disabled = false,
  className,
  children,
}) => {
  const fieldRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const selectionRef = React.useRef({ start: 0, end: 0 });

  const captureSelection = React.useCallback((event?: React.SyntheticEvent) => {
    const target = event?.target ?? document.activeElement;
    if (!isTextField(target)) return;
    fieldRef.current = target;
    selectionRef.current = {
      start: target.selectionStart ?? 0,
      end: target.selectionEnd ?? 0,
    };
  }, []);

  const applyAction = React.useCallback((action: TextCaseAction) => {
    const { start, end } = selectionRef.current;
    const next = applyTextCaseToRange(value, start, end, action);
    onValueChange(next.value);
    window.setTimeout(() => {
      const field = fieldRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(next.start, next.end);
    }, 0);
  }, [onValueChange, value]);

  return (
    <ContextMenu onOpenChange={(open) => { if (open) captureSelection(); }}>
      <ContextMenuTrigger asChild>
        <div
          className={cn('w-full min-w-0', className)}
          onContextMenu={captureSelection}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="z-[60] min-w-[220px]"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {TEXT_CASE_MENU_ITEMS.map((item, index) => (
          item === 'separator' ? (
            <ContextMenuSeparator key={`separator-${index}`} />
          ) : (
            <ContextMenuItem
              key={item.action}
              disabled={disabled || value.length === 0}
              onSelect={() => applyAction(item.action)}
            >
              {item.label}
            </ContextMenuItem>
          )
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
};

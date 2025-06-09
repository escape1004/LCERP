import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  onRemove?: (index: number) => void;
  className?: string;
  tagClassName?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  value = [],
  onChange,
  onRemove,
  className,
  tagClassName,
}) => {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {value.map((tag, index) => (
        <div
          key={index}
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-sm rounded bg-discord-dark text-discord-text",
            tagClassName
          )}
        >
          <span>{tag}</span>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0 hover:bg-discord-hover"
              onClick={() => onRemove(index)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}; 
import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface AnimatedModalProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

const ANIMATION_DURATION_MS = 200;

export function AnimatedModal({
  isOpen,
  children,
  className,
  contentClassName,
}: AnimatedModalProps) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const frame = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => cancelAnimationFrame(frame);
    }

    setIsVisible(false);
    const timeout = window.setTimeout(() => {
      setShouldRender(false);
    }, ANIMATION_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/50 duration-200',
        isVisible ? 'animate-in fade-in-0' : 'animate-out fade-out-0',
        className
      )}
    >
      <div
        className={cn(
          'overflow-hidden rounded-xl duration-200',
          isVisible
            ? 'animate-in fade-in-0 zoom-in-95'
            : 'animate-out fade-out-0 zoom-out-95',
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

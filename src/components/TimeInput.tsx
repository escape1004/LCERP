import React, { useRef, useEffect, useState, useCallback, ReactNode } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/tooltip";

interface TimeInputProps {
  hh: number;
  mm: number;
  ss: number;
  maxDuration: number;
  onChange: (hh: number, mm: number, ss: number) => void;
  onRegenerate: (hh: number, mm: number, ss: number) => void;
  disabled?: boolean;
  loading?: boolean;
  rightAddon?: ReactNode;
  regenerateTooltip?: ReactNode;
}

export const TimeInput: React.FC<TimeInputProps> = ({
  hh,
  mm,
  ss,
  maxDuration,
  onChange,
  onRegenerate,
  disabled = false,
  loading = false,
  rightAddon,
  regenerateTooltip
}) => {
  const hhRef = useRef<HTMLInputElement>(null);
  const mmRef = useRef<HTMLInputElement>(null);
  const ssRef = useRef<HTMLInputElement>(null);

  const [localHh, setLocalHh] = useState(hh);
  const [localMm, setLocalMm] = useState(mm);
  const [localSs, setLocalSs] = useState(ss);

  useEffect(() => {
    setLocalHh(hh);
    setLocalMm(mm);
    setLocalSs(ss);
  }, [hh, mm, ss]);

  const getMaxValue = useCallback((field: 'hh' | 'mm' | 'ss') => {
    if (field === 'hh') {
      return Math.floor(maxDuration / 3600);
    }
    if (field === 'mm') {
      const remainingSeconds = maxDuration - (localHh * 3600);
      return Math.floor(remainingSeconds / 60);
    }
    if (field === 'ss') {
      const remainingSeconds = maxDuration - (localHh * 3600 + localMm * 60);
      return Math.min(59, remainingSeconds);
    }
    return 0;
  }, [maxDuration, localHh, localMm]);

  const [sliderSec, setSliderSec] = useState(hh * 3600 + mm * 60 + ss);
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      setSliderSec(hh * 3600 + mm * 60 + ss);
    }
  }, [hh, mm, ss, isDragging]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDragging(true);
    const newSliderSec = Number(Math.round((parseFloat(e.target.value) / 100) * maxDuration));
    setSliderSec(newSliderSec);
    setTooltipPosition(parseFloat(e.target.value));
  };

  const handleSliderStart = () => {
    setShowTooltip(true);
  };

  const handleSliderLeave = () => {
    if (!isDragging) {
      setShowTooltip(false);
    }
  };

  const handleSliderCommit = () => {
    const newHh = Math.floor(sliderSec / 3600);
    const newMm = Math.floor((sliderSec % 3600) / 60);
    const newSs = sliderSec % 60;
    if (newHh !== hh || newMm !== mm || newSs !== ss) {
      onChange(newHh, newMm, newSs);
    }
    setShowTooltip(false);
    setTimeout(() => setIsDragging(false), 0);
  };

  const moveToNextField = (currentField: 'hh' | 'mm' | 'ss', value: string) => {
    if (value.length === 2) {
      if (currentField === 'hh' && mmRef.current) {
        mmRef.current.focus();
        mmRef.current.select();
      } else if (currentField === 'mm' && ssRef.current) {
        ssRef.current.focus();
        ssRef.current.select();
      }
    }
  };

  const handleInputChange = useCallback((field: 'hh' | 'mm' | 'ss', value: string) => {
    let numValue = parseInt(value) || 0;

    if (field === 'hh') {
      numValue = Math.min(numValue, getMaxValue('hh'));
      setLocalHh(numValue);
    } else if (field === 'mm') {
      numValue = Math.min(numValue, getMaxValue('mm'));
      setLocalMm(numValue);
    } else {
      numValue = Math.min(numValue, getMaxValue('ss'));
      setLocalSs(numValue);
    }

    setTimeout(() => {
      moveToNextField(field, value);
    }, 0);
  }, [getMaxValue]);

  const handleInputBlur = useCallback((field: 'hh' | 'mm' | 'ss') => {
    if (isRegenerating) {
      return;
    }

    const newHh = field === 'hh' ? localHh : hh;
    const newMm = field === 'mm' ? localMm : mm;
    const newSs = field === 'ss' ? localSs : ss;
    const newTotal = newHh * 3600 + newMm * 60 + newSs;

    if (newTotal > maxDuration) {
      let d = maxDuration;
      const finalHh = Math.floor(d / 3600);
      d %= 3600;
      const finalMm = Math.floor(d / 60);
      const finalSs = d % 60;
      onChange(finalHh, finalMm, finalSs);
    } else {
      onChange(newHh, newMm, newSs);
    }
  }, [localHh, localMm, localSs, hh, mm, ss, maxDuration, onChange, isRegenerating]);

  const handleKeyDown = useCallback((field: 'hh' | 'mm' | 'ss', e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputBlur(field);
      onRegenerate(localHh, localMm, localSs);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const currentValue = field === 'hh' ? localHh : field === 'mm' ? localMm : localSs;
      const maxValue = getMaxValue(field);
      const newValue = e.key === 'ArrowUp'
        ? Math.min(currentValue + 1, maxValue)
        : Math.max(currentValue - 1, 0);

      handleInputChange(field, newValue.toString());
    }
  }, [localHh, localMm, localSs, getMaxValue, onRegenerate, handleInputChange, handleInputBlur]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleRegenerateClick = () => {
    setIsRegenerating(true);

    const newTotal = localHh * 3600 + localMm * 60 + localSs;
    if (newTotal > maxDuration) {
      let d = maxDuration;
      const finalHh = Math.floor(d / 3600);
      d %= 3600;
      const finalMm = Math.floor(d / 60);
      const finalSs = d % 60;
      onChange(finalHh, finalMm, finalSs);
      onRegenerate(finalHh, finalMm, finalSs);
    } else {
      onChange(localHh, localMm, localSs);
      onRegenerate(localHh, localMm, localSs);
    }

    setTimeout(() => {
      setIsRegenerating(false);
    }, 100);
  };

  const inputClassName = `w-12 px-2 py-1 rounded border text-sm text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${disabled ? 'border-gray-700 bg-gray-800/70 text-gray-500 cursor-not-allowed opacity-60' : 'border-gray-600 bg-discord-bg text-discord-text focus:outline-none focus:ring-2 focus:ring-discord-accent'}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-xs relative">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={maxDuration > 0 ? (sliderSec / maxDuration) * 100 : 0}
          onChange={handleSliderChange}
          onMouseDown={handleSliderStart}
          onTouchStart={handleSliderStart}
          onMouseUp={handleSliderCommit}
          onTouchEnd={handleSliderCommit}
          onMouseLeave={handleSliderLeave}
          className={`slider w-full ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={disabled}
        />

        {showTooltip && (
          <div
            className="absolute -top-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600 shadow-lg pointer-events-none z-10"
            style={{ left: `${tooltipPosition}%` }}
          >
            {formatTime(sliderSec)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <input
                key="hh-input"
                ref={hhRef}
                type="number"
                min={0}
                max={getMaxValue('hh')}
                value={localHh}
                onChange={e => handleInputChange('hh', e.target.value)}
                onKeyDown={e => handleKeyDown('hh', e)}
                onBlur={() => handleInputBlur('hh')}
                className={inputClassName}
                placeholder="시"
                disabled={disabled}
              />
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">시</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-discord-muted">:</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <input
                key="mm-input"
                ref={mmRef}
                type="number"
                min={0}
                max={getMaxValue('mm')}
                value={localMm}
                onChange={e => handleInputChange('mm', e.target.value)}
                onKeyDown={e => handleKeyDown('mm', e)}
                onBlur={() => handleInputBlur('mm')}
                className={inputClassName}
                placeholder="분"
                disabled={disabled}
              />
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">분</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="text-discord-muted">:</span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <input
                key="ss-input"
                ref={ssRef}
                type="number"
                min={0}
                max={getMaxValue('ss')}
                value={localSs}
                onChange={e => handleInputChange('ss', e.target.value)}
                onKeyDown={e => handleKeyDown('ss', e)}
                onBlur={() => handleInputBlur('ss')}
                className={inputClassName}
                placeholder="초"
                disabled={disabled}
              />
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">초</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  handleRegenerateClick();
                }}
                onMouseUp={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                disabled={disabled || loading}
                className={`px-3 py-1 text-xs border rounded transition-colors ${disabled ? 'border-gray-700 bg-gray-800/70 text-gray-500 cursor-not-allowed opacity-60' : 'text-discord-muted bg-transparent hover:bg-discord-hover border-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading ? '재생성 중...' : '썸네일 재생성'}
              </button>
            </TooltipTrigger>
            {regenerateTooltip ? (
              <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">
                {regenerateTooltip}
              </TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
        {rightAddon}
      </div>
    </div>
  );
};

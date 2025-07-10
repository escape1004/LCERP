import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/tooltip";

interface TimeInputProps {
  hh: number;
  mm: number;
  ss: number;
  maxDuration: number; // 전체 duration(초)
  onChange: (hh: number, mm: number, ss: number) => void;
  onRegenerate: (hh: number, mm: number, ss: number) => void;
  disabled?: boolean;
  loading?: boolean;
}

export const TimeInput: React.FC<TimeInputProps> = ({
  hh,
  mm,
  ss,
  maxDuration,
  onChange,
  onRegenerate,
  disabled = false,
  loading = false
}) => {
  const hhRef = useRef<HTMLInputElement>(null);
  const mmRef = useRef<HTMLInputElement>(null);
  const ssRef = useRef<HTMLInputElement>(null);

  // 로컬 상태로 입력값 관리 (포커스 유지를 위해)
  const [localHh, setLocalHh] = useState(hh);
  const [localMm, setLocalMm] = useState(mm);
  const [localSs, setLocalSs] = useState(ss);

  // 외부에서 값이 변경되면 로컬 상태 동기화
  useEffect(() => {
    setLocalHh(hh);
    setLocalMm(mm);
    setLocalSs(ss);
  }, [hh, mm, ss]);

  // 각 필드의 동적 최대값 계산 함수
  const getMaxValue = useCallback((field: 'hh' | 'mm' | 'ss') => {
    if (field === 'hh') {
      return Math.floor(maxDuration / 3600);
    } else if (field === 'mm') {
      const remainingSeconds = maxDuration - (localHh * 3600);
      return Math.floor(remainingSeconds / 60);
    } else if (field === 'ss') {
      const remainingSeconds = maxDuration - (localHh * 3600 + localMm * 60);
      return Math.min(59, remainingSeconds);
    }
    return 0;
  }, [maxDuration, localHh, localMm]);

  const maxHh = getMaxValue('hh');
  const maxMm = getMaxValue('mm');
  const maxSs = getMaxValue('ss');
  
  const [sliderSec, setSliderSec] = useState(hh * 3600 + mm * 60 + ss);
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false); // 재생성 중 플래그
  
  // 슬라이더 값이 외부에서 바뀌면 동기화 (드래그 중이 아닐 때만)
  useEffect(() => {
    if (!isDragging) {
      const newTotalSec = hh * 3600 + mm * 60 + ss;
      setSliderSec(newTotalSec);
    }
  }, [hh, mm, ss, isDragging]);

  // 슬라이더 변경 처리 (드래그 중)
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDragging(true);
    const newSliderSec = Number(Math.round((parseFloat(e.target.value) / 100) * maxDuration));
    setSliderSec(newSliderSec);
    
    // 툴크 위치 계산 (슬라이더의 상대적 위치)
    const rect = e.target.getBoundingClientRect();
    const percentage = parseFloat(e.target.value);
    setTooltipPosition(percentage);
  };

  // 슬라이더 마우스/터치 시작
  const handleSliderStart = (e: React.MouseEvent | React.TouchEvent) => {
    setShowTooltip(true);
  };

  // 슬라이더에서 마우스가 벗어날 때
  const handleSliderLeave = () => {
    if (!isDragging) {
      setShowTooltip(false);
    }
  };

  // 슬라이더 드래그 종료(커밋)
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

  // 자동 포커스 이동 함수
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

  // 입력값 검증 및 변경 (로컬 상태만 업데이트)
  const handleInputChange = useCallback((field: 'hh' | 'mm' | 'ss', value: string) => {
    let numValue = parseInt(value) || 0;
    
    // 각 필드별 동적 최대값 제한
    if (field === 'hh') {
      numValue = Math.min(numValue, getMaxValue('hh'));
      setLocalHh(numValue);
    } else if (field === 'mm') {
      numValue = Math.min(numValue, getMaxValue('mm'));
      setLocalMm(numValue);
    } else if (field === 'ss') {
      numValue = Math.min(numValue, getMaxValue('ss'));
      setLocalSs(numValue);
    }
    
    // 자동 포커스 이동
    setTimeout(() => {
      moveToNextField(field, value);
    }, 0);
  }, [getMaxValue]);

  // 입력 필드에서 포커스가 벗어날 때 부모에게 값 전달
  const handleInputBlur = useCallback((field: 'hh' | 'mm' | 'ss') => {
    // 재생성 중이면 onChange 호출하지 않음
    if (isRegenerating) {
      return;
    }
    
    const newHh = field === 'hh' ? localHh : hh;
    const newMm = field === 'mm' ? localMm : mm;
    const newSs = field === 'ss' ? localSs : ss;
    
    // 전체 duration 체크
    const newTotal = newHh * 3600 + newMm * 60 + newSs;
    
    if (newTotal > maxDuration) {
      // duration을 초과하면 최대값으로 보정
      let d = maxDuration;
      const finalHh = Math.floor(d / 3600);
      d = d % 3600;
      const finalMm = Math.floor(d / 60);
      const finalSs = d % 60;
      onChange(finalHh, finalMm, finalSs);
    } else {
      onChange(newHh, newMm, newSs);
    }
  }, [localHh, localMm, localSs, hh, mm, ss, maxDuration, onChange, isRegenerating]);

  // 키보드 이벤트 처리
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

  // 시간 포맷팅
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 재생성 버튼 클릭 시 재생성 실행
  const handleRegenerateClick = () => {
    // 재생성 중 플래그 설정
    setIsRegenerating(true);
    
    // 즉시 실행
    const executeRegenerate = () => {
      // 현재 로컬 상태의 값을 부모에게 전달
      const newTotal = localHh * 3600 + localMm * 60 + localSs;
      
      if (newTotal > maxDuration) {
        // duration을 초과하면 최대값으로 보정
        let d = maxDuration;
        const finalHh = Math.floor(d / 3600);
        d = d % 3600;
        const finalMm = Math.floor(d / 60);
        const finalSs = d % 60;
        onChange(finalHh, finalMm, finalSs);
        onRegenerate(finalHh, finalMm, finalSs);
      } else {
        onChange(localHh, localMm, localSs);
        onRegenerate(localHh, localMm, localSs);
      }
      
      // 재생성 완료 후 플래그 리셋
      setTimeout(() => {
        setIsRegenerating(false);
      }, 100);
    };
    
    // 즉시 실행
    executeRegenerate();
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 슬라이더 */}
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
          className="slider w-full"
          disabled={disabled}
        />
        
        {/* 툴팁 */}
        {showTooltip && (
          <div 
            className="absolute -top-8 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded border border-gray-600 shadow-lg pointer-events-none z-10"
            style={{ left: `${tooltipPosition}%` }}
          >
            {formatTime(sliderSec)}
          </div>
        )}
      </div>

      {/* 시간 입력 필드들 */}
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
                className="w-12 px-2 py-1 rounded border border-gray-600 bg-discord-bg text-discord-text text-sm focus:outline-none focus:ring-2 focus:ring-discord-accent text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                className="w-12 px-2 py-1 rounded border border-gray-600 bg-discord-bg text-discord-text text-sm focus:outline-none focus:ring-2 focus:ring-discord-accent text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                className="w-12 px-2 py-1 rounded border border-gray-600 bg-discord-bg text-discord-text text-sm focus:outline-none focus:ring-2 focus:ring-discord-accent text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="초"
                disabled={disabled}
              />
            </TooltipTrigger>
            <TooltipContent side="top" align="center" className="relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words">초</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* 재생성 버튼 */}
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
        className="px-3 py-1 text-xs text-discord-muted bg-transparent hover:bg-discord-hover border border-gray-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '재생성 중...' : '썸네일 재생성'}
      </button>
    </div>
  );
}; 
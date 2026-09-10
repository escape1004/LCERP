import React from 'react';
import { Bookmark, Clock, Maximize, Minimize, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import type { LoopRange, MediaBookmark } from './types';
import { PLAYBACK_SPEEDS, formatMediaTime, getLoopRangePercents, getSeekBarStyle, hasBookmarkAtTime } from './viewerLogic';

const tooltipClassName = "relative bg-[#23272a] bg-opacity-95 text-white border border-gray-700 rounded shadow-2xl px-3 py-2 text-xs after:content-[''] after:absolute after:left-1/2 after:top-full after:-translate-x-1/2 after:border-8 after:border-x-transparent after:border-b-transparent after:border-t-[#23272a] after:mt-0.5 max-w-xs break-words";

interface ViewerToolbarProps {
  showControls: boolean;
  currentTime: number;
  duration: number;
  loopRange: LoopRange | null;
  loopDraft: LoopRange | null;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isLooping: boolean;
  playbackSpeed: number;
  showSpeedMenu: boolean;
  isFullscreen: boolean;
  showBookmarks?: boolean;
  bookmarks?: MediaBookmark[];
  timelinePreview: React.ReactNode;
  overlayClassName?: string;
  onSeek: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekBarMouseDown: (event: React.MouseEvent<HTMLInputElement>) => void;
  onTimelinePreviewMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  onTimelinePreviewLeave: () => void;
  onPlayPause: () => void;
  onMuteToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onLoopToggle: () => void;
  onSpeedMenuToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onFullscreenToggle: () => void;
  onBookmarkClick?: (time: number) => void;
  onBookmarkContextMenu?: (time: number) => void;
  onToggleBookmark?: () => void;
}

export const ViewerToolbar: React.FC<ViewerToolbarProps> = ({
  showControls,
  currentTime,
  duration,
  loopRange,
  loopDraft,
  isPlaying,
  isMuted,
  volume,
  isLooping,
  playbackSpeed,
  showSpeedMenu,
  isFullscreen,
  showBookmarks = false,
  bookmarks = [],
  timelinePreview,
  overlayClassName = 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300',
  onSeek,
  onSeekBarMouseDown,
  onTimelinePreviewMove,
  onTimelinePreviewLeave,
  onPlayPause,
  onMuteToggle,
  onVolumeChange,
  onLoopToggle,
  onSpeedMenuToggle,
  onSpeedChange,
  onFullscreenToggle,
  onBookmarkClick,
  onBookmarkContextMenu,
  onToggleBookmark,
}) => {
  const visibleRange = loopDraft || loopRange;
  const percents = getLoopRangePercents(visibleRange, duration);
  const bookmarked = hasBookmarkAtTime(bookmarks, currentTime);

  return (
    <div className={`${overlayClassName} ${showControls ? 'opacity-100' : 'opacity-0'}`}>
      <div className="mb-4">
        <div
          className="relative w-full"
          onMouseMove={onTimelinePreviewMove}
          onMouseLeave={onTimelinePreviewLeave}
        >
          {timelinePreview}
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={currentTime}
            onChange={onSeek}
            onMouseDown={onSeekBarMouseDown}
            style={getSeekBarStyle(visibleRange, duration)}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
            id="seekbar"
          />
          {percents && (
            <div className="pointer-events-none absolute inset-x-0 top-[12px] z-[1] h-2">
              <div
                className="absolute left-0 top-0 h-full w-[2px] -translate-x-1/2 rounded-full bg-[#c7d2fe] shadow-[0_0_6px_rgba(199,210,254,0.55)]"
                style={{ left: `${percents.startPercent}%` }}
              />
              <div
                className="absolute left-0 top-0 h-full w-[2px] -translate-x-1/2 rounded-full bg-[#c7d2fe] shadow-[0_0_6px_rgba(199,210,254,0.55)]"
                style={{ left: `${percents.endPercent}%` }}
              />
            </div>
          )}
          {showBookmarks && bookmarks.map((bookmark) => (
            <div
              key={bookmark.time}
              style={{
                position: 'absolute',
                left: `${(bookmark.time / duration) * 100}%`,
                top: 0,
                width: 12,
                height: 12,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                cursor: 'pointer',
                zIndex: 10,
                transition: 'all 0.2s ease-in-out',
              }}
              className="bg-red-500/60 shadow-md shadow-red-500/30 border border-white/10 hover:bg-red-500 hover:shadow-lg hover:shadow-red-500/60"
              onClick={() => onBookmarkClick?.(bookmark.time)}
              onContextMenu={(event) => {
                event.preventDefault();
                onBookmarkContextMenu?.(bookmark.time);
              }}
              title={`북마크: ${formatMediaTime(bookmark.time)} (클릭: 이동, 우클릭: 삭제)`}
            />
          ))}
        </div>
        <div className="flex justify-between text-white text-xs mt-1">
          <span>{formatMediaTime(currentTime)}</span>
          <span>{loopRange ? `${formatMediaTime(loopRange.start)} - ${formatMediaTime(loopRange.end)} · ` : ''}{formatMediaTime(duration)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onPlayPause} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors">
                  {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className={tooltipClassName}>{isPlaying ? '일시정지' : '재생'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={onMuteToggle} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors">
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className={tooltipClassName}>{isMuted ? '음소거 해제' : '음소거'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(event) => onVolumeChange(parseFloat(event.target.value))}
              className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
              id="volume-slider"
            />
          </div>
          {showBookmarks && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggleBookmark}
                    className={`w-8 h-8 flex items-center justify-center transition-colors ${
                      bookmarked
                        ? 'text-blue-400'
                        : 'text-white hover:text-gray-300'
                    }`}
                  >
                    <Bookmark size={20} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className={tooltipClassName}>{bookmarked ? '북마크 삭제' : '현재 위치 북마크'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onLoopToggle} className={`w-8 h-8 flex items-center justify-center transition-colors ${isLooping ? 'text-blue-400' : 'text-white hover:text-gray-300'}`}>
                  <RotateCcw size={20} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className={tooltipClassName}>{isLooping ? '반복 해제' : '반복 재생'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="relative">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onSpeedMenuToggle}
                    className={`w-8 h-8 flex items-center justify-center transition-colors ${
                      playbackSpeed !== 1 ? 'text-blue-400' : 'text-white hover:text-gray-300'
                    }`}
                    data-speed-menu
                  >
                    <Clock size={20} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className={tooltipClassName}>{`재생 속도: ${playbackSpeed}x ([, ] 키로 변경)`}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 bg-discord-sidebar border border-gray-700 rounded-lg shadow-lg z-50 min-w-[120px]" data-speed-menu>
                <div className="p-2 text-xs text-discord-muted border-b border-gray-700">
                  재생 속도
                </div>
                {PLAYBACK_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => onSpeedChange(speed)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-discord-hover transition-colors ${
                      playbackSpeed === speed ? 'text-discord-accent bg-discord-hover' : 'text-discord-text'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onFullscreenToggle} className="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition-colors ml-auto">
                  {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center" className={tooltipClassName}>{isFullscreen ? '전체화면 해제' : '전체화면'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
};

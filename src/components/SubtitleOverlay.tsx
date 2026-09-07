import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveSubtitleCues,
  getCueOpacity,
  getCuePosition,
  SubtitleCue,
  SubtitleSpan,
} from '../lib/subtitle';

type SubtitleSize = 'small' | 'medium' | 'large';
type SubtitleColor = 'white' | 'yellow';
type SubtitleBackground = 'none' | 'translucent' | 'dark';

interface SubtitleOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  sourceKey?: string | null;
  cues: SubtitleCue[];
  currentTime: number;
  offsetSeconds: number;
  size: SubtitleSize;
  color: SubtitleColor;
  background: SubtitleBackground;
}

const SIZE_SCALE = { small: 0.85, medium: 1, large: 1.25 };

const getVideoPictureBox = (video: HTMLVideoElement, parent: HTMLElement) => {
  const videoRect = video.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const scaleX = parentRect.width / Math.max(1, parent.offsetWidth);
  const scaleY = parentRect.height / Math.max(1, parent.offsetHeight);
  const { videoWidth, videoHeight } = video;

  let pictureLeft = videoRect.left;
  let pictureTop = videoRect.top;
  let pictureWidth = videoRect.width;
  let pictureHeight = videoRect.height;

  if (videoWidth > 0 && videoHeight > 0 && videoRect.width > 0 && videoRect.height > 0) {
    const fit = Math.min(videoRect.width / videoWidth, videoRect.height / videoHeight);
    pictureWidth = videoWidth * fit;
    pictureHeight = videoHeight * fit;
    pictureLeft = videoRect.left + (videoRect.width - pictureWidth) / 2;
    pictureTop = videoRect.top + (videoRect.height - pictureHeight) / 2;
  }

  return {
    left: (pictureLeft - parentRect.left) / scaleX,
    top: (pictureTop - parentRect.top) / scaleY,
    width: pictureWidth / scaleX,
    height: pictureHeight / scaleY,
  };
};

const alignmentToFlex = (alignment = 2) => {
  const justifyContent = alignment % 3 === 1 ? 'flex-start' : alignment % 3 === 0 ? 'flex-end' : 'center';
  const alignItems = alignment <= 3 ? 'flex-end' : alignment <= 6 ? 'center' : 'flex-start';
  const textAlign = justifyContent === 'flex-start' ? 'left' : justifyContent === 'flex-end' ? 'right' : 'center';
  return { justifyContent, alignItems, textAlign };
};

const buildOutlineShadow = (color: string, width: number, shadowColor: string, shadow: number) => {
  const parts: string[] = [];
  const outline = Math.min(6, Math.max(0, Math.round(width)));
  for (let x = -outline; x <= outline; x += 1) {
    for (let y = -outline; y <= outline; y += 1) {
      if (x === 0 && y === 0) continue;
      if (x * x + y * y > outline * outline) continue;
      parts.push(`${x}px ${y}px 0 ${color}`);
    }
  }
  if (shadow > 0) parts.push(`${shadow}px ${shadow}px ${Math.max(1, shadow)}px ${shadowColor}`);
  return parts.join(', ');
};

const spanStyle = (span: SubtitleSpan, cue: SubtitleCue, pixelSize: number) => ({
  fontWeight: span.bold ? 700 : 400,
  fontStyle: span.italic ? 'italic' : 'normal',
  textDecoration: [span.underline ? 'underline' : '', span.strikeout ? 'line-through' : ''].filter(Boolean).join(' ') || 'none',
  color: span.color || cue.color || '#fff',
  fontFamily: `"${span.fontName || cue.fontName || 'Noto Sans KR'}", "Noto Sans KR", sans-serif`,
  fontSize: `${pixelSize * ((span.fontSize || cue.fontSize || 20) / (cue.fontSize || 20))}px`,
});

const CueText: React.FC<{ cue: SubtitleCue; pixelSize: number; color: string }> = ({ cue, pixelSize, color }) => {
  if (cue.spans?.length) {
    return (
      <>
        {cue.spans.map((span, index) => (
          <span key={`${index}-${span.text}`} style={spanStyle(span, cue, pixelSize)}>
            {span.text}
          </span>
        ))}
      </>
    );
  }

  return <span style={{ color }}>{cue.text}</span>;
};

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  videoRef,
  sourceKey,
  cues,
  currentTime,
  offsetSeconds,
  size,
  color,
  background,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const activeCues = useMemo(
    () => getActiveSubtitleCues(cues, currentTime, offsetSeconds),
    [cues, currentTime, offsetSeconds],
  );

  useEffect(() => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const parent = overlay?.offsetParent instanceof HTMLElement ? overlay.offsetParent : overlay?.parentElement;
    if (!video || !parent) return undefined;

    const update = () => setBox(getVideoPictureBox(video, parent));
    update();

    const observer = new ResizeObserver(update);
    observer.observe(video);
    observer.observe(parent);
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('loadeddata', update);
    video.addEventListener('resize', update);
    window.addEventListener('resize', update);

    return () => {
      observer.disconnect();
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('loadeddata', update);
      video.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
    };
  }, [sourceKey, videoRef]);

  const scale = SIZE_SCALE[size];
  const userColor = color === 'yellow' ? '#fde047' : '#ffffff';
  const userBackground = background === 'none'
    ? 'transparent'
    : background === 'dark'
      ? 'rgba(0,0,0,0.9)'
      : 'rgba(0,0,0,0.65)';

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute z-10 overflow-hidden"
      style={box.width > 0 && box.height > 0
        ? { left: box.left, top: box.top, width: box.width, height: box.height }
        : { display: 'none' }}
    >
      {activeCues.map((cue, index) => {
        const playRes = cue.playRes || { x: 384, y: 288 };
        const position = getCuePosition(cue, currentTime, offsetSeconds);
        const opacity = getCueOpacity(cue, currentTime, offsetSeconds);
        const pixelSize = Math.max(12, ((cue.fontSize || 20) / playRes.y) * box.height * scale);
        const isAss = cue.format === 'ass';
        const alignment = cue.alignment || 2;
        const flex = alignmentToFlex(alignment);
        const outline = buildOutlineShadow(
          cue.outlineColor || 'rgba(0,0,0,1)',
          Math.max(0, (cue.outline || 0) * scale),
          cue.shadowColor || 'rgba(0,0,0,0.8)',
          Math.max(0, (cue.shadow || 0) * scale),
        );
        const boxBackground = isAss && cue.borderStyle === 3
          ? (cue.shadowColor || 'rgba(0,0,0,0.8)')
          : (!isAss || (!position && alignment <= 3)
            ? userBackground
            : 'transparent');
        const textColor = isAss ? (cue.color || userColor) : userColor;
        const marginL = ((cue.marginL || 0) / playRes.x) * 100;
        const marginR = ((cue.marginR || 0) / playRes.x) * 100;
        const marginV = ((cue.marginV || 0) / playRes.y) * 100;

        const layout = position
          ? {
              left: `${(position.x / playRes.x) * 100}%`,
              top: `${(position.y / playRes.y) * 100}%`,
              transform: `translate(${alignment % 3 === 1 ? '0' : alignment % 3 === 0 ? '-100%' : '-50%'}, ${
                alignment <= 3 ? '-100%' : alignment <= 6 ? '-50%' : '0'
              }) rotate(${-(cue.rotation || 0)}deg)`,
              maxWidth: `${Math.max(20, 100 - marginL - marginR)}%`,
            }
          : {
              left: `${marginL}%`,
              top: 0,
              width: `${Math.max(0, 100 - marginL - marginR)}%`,
              height: '100%',
              display: 'flex',
              justifyContent: flex.justifyContent,
              alignItems: flex.alignItems,
              paddingTop: alignment >= 7 ? `${marginV}%` : 0,
              paddingBottom: alignment <= 3 ? `${marginV}%` : 0,
              transform: `rotate(${-(cue.rotation || 0)}deg)`,
            };

        return (
          <div
            key={`${cue.start}-${cue.end}-${cue.layer || 0}-${index}`}
            className="absolute whitespace-pre-line leading-snug"
            style={{
              ...layout,
              zIndex: 10 + (cue.layer || 0),
              opacity,
              textAlign: flex.textAlign as React.CSSProperties['textAlign'],
              fontSize: `${pixelSize}px`,
              fontWeight: cue.bold ? 700 : 600,
              fontStyle: cue.italic ? 'italic' : 'normal',
              color: textColor,
              fontFamily: `"${cue.fontName || 'Noto Sans KR'}", "Noto Sans KR", sans-serif`,
            }}
          >
            <span
              className="inline-block max-w-full rounded px-1.5 py-0.5"
              style={{
                backgroundColor: boxBackground,
                textShadow: isAss && cue.borderStyle !== 3 ? outline : '0 1px 3px rgba(0,0,0,0.95)',
                textDecoration: [cue.underline ? 'underline' : '', cue.strikeout ? 'line-through' : ''].filter(Boolean).join(' ') || undefined,
              }}
            >
              <CueText cue={cue} pixelSize={pixelSize} color={textColor} />
            </span>
          </div>
        );
      })}
    </div>
  );
};

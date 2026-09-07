import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { decompressFrames, parseGIF, ParsedFrame } from 'gifuct-js';

interface AnimatedGifProps extends React.CanvasHTMLAttributes<HTMLCanvasElement> {
  src: string;
  paused: boolean;
}

const loadGifBuffer = async (src: string): Promise<ArrayBuffer> => {
  if (!src.startsWith('data:')) {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`GIF 요청 실패: ${response.status}`);
    }
    return response.arrayBuffer();
  }

  const commaIndex = src.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('잘못된 GIF 데이터 URL입니다.');
  }

  const metadata = src.slice(0, commaIndex);
  const encodedData = src.slice(commaIndex + 1);
  if (metadata.includes(';base64')) {
    const binary = window.atob(encodedData);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  }

  return new TextEncoder().encode(decodeURIComponent(encodedData)).buffer;
};

export const AnimatedGif = forwardRef<HTMLCanvasElement, AnimatedGifProps>(
  ({ src, paused, ...canvasProps }, forwardedRef) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const patchCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const framesRef = useRef<ParsedFrame[]>([]);
    const frameIndexRef = useRef(0);
    const previousFrameRef = useRef<ParsedFrame | null>(null);
    const restoreImageDataRef = useRef<ImageData | null>(null);
    const timeoutRef = useRef<number | null>(null);
    const pausedRef = useRef(paused);
    const loadGenerationRef = useRef(0);

    useImperativeHandle(forwardedRef, () => canvasRef.current as HTMLCanvasElement);

    const clearScheduledFrame = useCallback(() => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }, []);

    const drawNextFrame = useCallback(() => {
      timeoutRef.current = null;
      if (pausedRef.current) return;

      const canvas = canvasRef.current;
      const frames = framesRef.current;
      if (!canvas || frames.length === 0) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      if (frameIndexRef.current === 0 && previousFrameRef.current) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        previousFrameRef.current = null;
        restoreImageDataRef.current = null;
      }

      const previousFrame = previousFrameRef.current;
      if (previousFrame?.disposalType === 2) {
        const { left, top, width, height } = previousFrame.dims;
        context.clearRect(left, top, width, height);
      } else if (previousFrame?.disposalType === 3 && restoreImageDataRef.current) {
        context.putImageData(restoreImageDataRef.current, 0, 0);
      }

      const frame = frames[frameIndexRef.current];
      if (frame.disposalType === 3) {
        restoreImageDataRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
      } else {
        restoreImageDataRef.current = null;
      }

      let patchCanvas = patchCanvasRef.current;
      if (!patchCanvas) {
        patchCanvas = document.createElement('canvas');
        patchCanvasRef.current = patchCanvas;
      }

      patchCanvas.width = frame.dims.width;
      patchCanvas.height = frame.dims.height;
      const patchContext = patchCanvas.getContext('2d');
      if (!patchContext) return;

      patchContext.putImageData(
        new ImageData(frame.patch, frame.dims.width, frame.dims.height),
        0,
        0
      );
      context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

      previousFrameRef.current = frame;
      frameIndexRef.current = (frameIndexRef.current + 1) % frames.length;
      timeoutRef.current = window.setTimeout(drawNextFrame, Math.max(20, frame.delay || 100));
    }, []);

    useEffect(() => {
      pausedRef.current = paused;
      if (!paused && framesRef.current.length > 0 && timeoutRef.current === null) {
        drawNextFrame();
      }
    }, [drawNextFrame, paused]);

    useEffect(() => {
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      clearScheduledFrame();
      framesRef.current = [];
      frameIndexRef.current = 0;
      previousFrameRef.current = null;
      restoreImageDataRef.current = null;

      void loadGifBuffer(src)
        .then((buffer) => {
          if (loadGenerationRef.current !== generation) return;

          const gif = parseGIF(buffer);
          const frames = decompressFrames(gif, true);
          const canvas = canvasRef.current;
          if (!canvas || frames.length === 0) return;

          canvas.width = gif.lsd.width;
          canvas.height = gif.lsd.height;
          framesRef.current = frames;
          drawNextFrame();
        })
        .catch((error) => {
          console.error('GIF 디코딩 실패:', error);
        });

      return () => {
        loadGenerationRef.current += 1;
        clearScheduledFrame();
      };
    }, [clearScheduledFrame, drawNextFrame, src]);

    return <canvas ref={canvasRef} {...canvasProps} />;
  }
);

AnimatedGif.displayName = 'AnimatedGif';

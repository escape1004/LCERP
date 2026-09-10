import { expect, test } from 'vitest';
import {
  getActiveSubtitleCues,
  getCueOpacity,
  getCuePosition,
  parseSubtitle,
  type SubtitleCue,
} from './subtitle';

test('parses SRT and VTT cues', () => {
  const srt = [
    '1',
    '00:00:01,000 --> 00:00:02,500',
    'Hello',
    '',
    '2',
    '00:00:03,000 --> 00:00:04,000',
    'World',
  ].join('\n');

  const vtt = [
    'WEBVTT',
    '',
    '00:00:01.000 --> 00:00:02.000',
    'Cue',
  ].join('\n');

  expect(parseSubtitle(srt, 'clip.srt')).toEqual([
    { start: 1, end: 2.5, text: 'Hello', format: 'plain' },
    { start: 3, end: 4, text: 'World', format: 'plain' },
  ]);
  expect(parseSubtitle(vtt, 'clip.vtt')).toEqual([
    { start: 1, end: 2, text: 'Cue', format: 'plain' },
  ]);
});

test('skips broken subtitle blocks instead of throwing', () => {
  const broken = [
    'not a cue',
    '',
    '00:00:05,000 --> 00:00:04,000',
    'inverted',
    '',
    'aa:bb:cc --> 00:00:01,000',
    'bad start',
    '',
    '00:00:01,000 --> nope',
    'bad end',
    '',
    '00:00:01,000 --> 00:00:02,000',
    '',
    '00:00:08,000 --> 00:00:09,000',
    'kept',
  ].join('\n');

  expect(parseSubtitle(broken, 'clip.srt')).toEqual([
    { start: 8, end: 9, text: 'kept', format: 'plain' },
  ]);
  expect(parseSubtitle('', 'clip.srt')).toEqual([]);
});

test('parses ASS dialogue and ignores empty or invalid events', () => {
  const ass = [
    '[Script Info]',
    'PlayResX: 1280',
    'PlayResY: 720',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, Alignment',
    'Style: Default,Arial,24,&H00FFFFFF,2',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Hello {\\b1}world',
    'Dialogue: 0,0:00:03.00,0:00:02.00,Default,,0,0,0,,inverted',
    'Dialogue: 0,bad,0:00:04.00,Default,,0,0,0,,broken time',
    'Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,',
  ].join('\n');

  const cues = parseSubtitle(ass, 'clip.ass');
  expect(cues).toHaveLength(1);
  expect(cues[0].text).toBe('Hello world');
  expect(cues[0].format).toBe('ass');
  expect(cues[0].playRes).toEqual({ x: 1280, y: 720 });
});

test('filters active cues and interpolates fade/move helpers', () => {
  const cues: SubtitleCue[] = [
    { start: 1, end: 3, text: 'first', layer: 1 },
    { start: 2, end: 4, text: 'second', layer: 0 },
    {
      start: 10,
      end: 12,
      text: 'fade',
      fadeIn: 0.5,
      fadeOut: 0.5,
      move: { x1: 0, y1: 0, x2: 100, y2: 50, t1: 0, t2: 2000 },
    },
  ];

  expect(getActiveSubtitleCues(cues, 2.5, 0).map((cue) => cue.text)).toEqual(['second', 'first']);
  expect(getActiveSubtitleCues(cues, 0, 0)).toEqual([]);
  expect(getCueOpacity(cues[2], 10.25, 0)).toBe(0.5);
  expect(getCueOpacity(cues[2], 11, 0)).toBe(1);
  expect(getCuePosition(cues[2], 11, 0)).toEqual({ x: 50, y: 25 });
  expect(getCuePosition(cues[0], 1.5, 0)).toBeUndefined();
});

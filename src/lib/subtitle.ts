export interface SubtitleSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeout?: boolean;
  color?: string;
  fontSize?: number;
  fontName?: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
  format?: 'plain' | 'ass';
  layer?: number;
  alignment?: number;
  position?: { x: number; y: number };
  move?: { x1: number; y1: number; x2: number; y2: number; t1: number; t2: number };
  playRes?: { x: number; y: number };
  color?: string;
  outlineColor?: string;
  shadowColor?: string;
  outline?: number;
  shadow?: number;
  fontSize?: number;
  fontName?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikeout?: boolean;
  borderStyle?: number;
  marginL?: number;
  marginR?: number;
  marginV?: number;
  rotation?: number;
  fadeIn?: number;
  fadeOut?: number;
  spans?: SubtitleSpan[];
}

interface AssStyle {
  name: string;
  fontName: string;
  fontSize: number;
  color: string;
  outlineColor: string;
  shadowColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeout: boolean;
  outline: number;
  shadow: number;
  borderStyle: number;
  alignment: number;
  marginL: number;
  marginR: number;
  marginV: number;
}

const DEFAULT_PLAY_RES = { x: 384, y: 288 };

const parseTimestamp = (value: string) => {
  const parts = value.trim().replace(',', '.').split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
};

const parseBlockSubtitles = (content: string) => {
  const cues: SubtitleCue[] = [];
  const blocks = content
    .replace(/^\uFEFF?WEBVTT[^\r\n]*/i, '')
    .split(/\r?\n\s*\r?\n/);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    const timelineIndex = lines.findIndex(line => line.includes('-->'));
    if (timelineIndex < 0) continue;

    const [rawStart, rawEnd] = lines[timelineIndex].split('-->');
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd.trim().split(/\s+/)[0]);
    const text = lines.slice(timelineIndex + 1).join('\n').trim();
    if (start === null || end === null || end <= start || !text) continue;

    cues.push({ start, end, text, format: 'plain' });
  }

  return cues;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseAssColor = (value?: string, fallback = 'rgba(255,255,255,1)') => {
  if (!value) return fallback;
  const hex = value.replace(/[&Hh]/g, '').trim();
  if (!/^[0-9A-Fa-f]{6,8}$/.test(hex)) return fallback;
  const padded = hex.padStart(8, '0');
  const alpha = 1 - parseInt(padded.slice(0, 2), 16) / 255;
  const blue = parseInt(padded.slice(2, 4), 16);
  const green = parseInt(padded.slice(4, 6), 16);
  const red = parseInt(padded.slice(6, 8), 16);
  return `rgba(${red},${green},${blue},${clamp(alpha, 0, 1)})`;
};

const parseAssAlpha = (value: string, currentColor?: string) => {
  const hex = value.replace(/[&Hh]/g, '').trim();
  if (!/^[0-9A-Fa-f]{1,2}$/.test(hex)) return currentColor;
  const alpha = 1 - parseInt(hex.padStart(2, '0'), 16) / 255;
  const match = (currentColor || 'rgba(255,255,255,1)').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return currentColor;
  return `rgba(${match[1]},${match[2]},${match[3]},${clamp(alpha, 0, 1)})`;
};

const parseBooleanFlag = (value?: string) => {
  const numeric = Number(value);
  return numeric === -1 || numeric === 1;
};

const parseLegacyAlignment = (value: number) => {
  if (value >= 1 && value <= 3) return value;
  if (value >= 5 && value <= 7) return value + 2;
  if (value >= 9 && value <= 11) return value - 5;
  return 2;
};

const createDefaultStyle = (name = 'Default'): AssStyle => ({
  name,
  fontName: 'Noto Sans KR',
  fontSize: 20,
  color: 'rgba(255,255,255,1)',
  outlineColor: 'rgba(0,0,0,1)',
  shadowColor: 'rgba(0,0,0,0.8)',
  bold: false,
  italic: false,
  underline: false,
  strikeout: false,
  outline: 2,
  shadow: 1,
  borderStyle: 1,
  alignment: 2,
  marginL: 10,
  marginR: 10,
  marginV: 20,
});

const splitCsv = (line: string) => {
  const values: string[] = [];
  let current = '';
  for (const char of line) {
    if (char === ',') {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
};

const readField = (format: string[], values: string[], name: string) => {
  const index = format.findIndex(field => field.toLowerCase() === name.toLowerCase());
  return index >= 0 ? values[index] : undefined;
};

const parseStyleLine = (format: string[], values: string[]): AssStyle | null => {
  const name = readField(format, values, 'Name');
  if (!name) return null;
  const alignmentValue = Number(readField(format, values, 'Alignment') || 2);
  return {
    name,
    fontName: readField(format, values, 'Fontname') || 'Noto Sans KR',
    fontSize: Number(readField(format, values, 'Fontsize') || 20) || 20,
    color: parseAssColor(readField(format, values, 'PrimaryColour')),
    outlineColor: parseAssColor(readField(format, values, 'OutlineColour') || readField(format, values, 'TertiaryColour'), 'rgba(0,0,0,1)'),
    shadowColor: parseAssColor(readField(format, values, 'BackColour'), 'rgba(0,0,0,0.8)'),
    bold: parseBooleanFlag(readField(format, values, 'Bold')),
    italic: parseBooleanFlag(readField(format, values, 'Italic')),
    underline: parseBooleanFlag(readField(format, values, 'Underline')),
    strikeout: parseBooleanFlag(readField(format, values, 'StrikeOut')),
    outline: Number(readField(format, values, 'Outline') || 2) || 0,
    shadow: Number(readField(format, values, 'Shadow') || 1) || 0,
    borderStyle: Number(readField(format, values, 'BorderStyle') || 1) || 1,
    alignment: alignmentValue >= 1 && alignmentValue <= 9 ? alignmentValue : parseLegacyAlignment(alignmentValue),
    marginL: Number(readField(format, values, 'MarginL') || 10) || 0,
    marginR: Number(readField(format, values, 'MarginR') || 10) || 0,
    marginV: Number(readField(format, values, 'MarginV') || 20) || 0,
  };
};

const readParenthesized = (block: string, start: number) => {
  if (block[start] !== '(') return { value: '', next: start };
  let depth = 0;
  for (let index = start; index < block.length; index += 1) {
    if (block[index] === '(') depth += 1;
    if (block[index] === ')') {
      depth -= 1;
      if (depth === 0) {
        return { value: block.slice(start + 1, index), next: index + 1 };
      }
    }
  }
  return { value: block.slice(start + 1), next: block.length };
};

const applyOverrideTags = (
  block: string,
  style: AssStyle,
  styles: Map<string, AssStyle>,
  baseStyle: AssStyle,
  extras: {
    alignment: number;
    position: { x: number; y: number } | null;
    move: SubtitleCue['move'];
    fadeIn: number;
    fadeOut: number;
    rotation: number;
    drawing: boolean;
  },
) => {
  let index = 0;
  while (index < block.length) {
    if (block[index] !== '\\') {
      index += 1;
      continue;
    }
    index += 1;
    const remaining = block.slice(index);

    if (remaining.startsWith('pos')) {
      const parsed = readParenthesized(block, index + 3);
      const [x, y] = parsed.value.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) extras.position = { x, y };
      index = parsed.next;
      continue;
    }
    if (remaining.startsWith('move')) {
      const parsed = readParenthesized(block, index + 4);
      const [x1, y1, x2, y2, t1, t2] = parsed.value.split(',').map(Number);
      if ([x1, y1, x2, y2].every(Number.isFinite)) {
        extras.move = {
          x1, y1, x2, y2,
          t1: Number.isFinite(t1) ? t1 : 0,
          t2: Number.isFinite(t2) ? t2 : 0,
        };
        extras.position = { x: x1, y: y1 };
      }
      index = parsed.next;
      continue;
    }
    if (remaining.startsWith('fad')) {
      const parsed = readParenthesized(block, index + (remaining.startsWith('fade') ? 4 : 3));
      const values = parsed.value.split(',').map(Number);
      if (values.length === 2) {
        extras.fadeIn = (values[0] || 0) / 1000;
        extras.fadeOut = (values[1] || 0) / 1000;
      } else if (values.length >= 7) {
        extras.fadeIn = ((values[4] || 0) - (values[3] || 0)) / 1000;
        extras.fadeOut = ((values[6] || 0) - (values[5] || 0)) / 1000;
      }
      index = parsed.next;
      continue;
    }
    if (remaining.startsWith('t')) {
      const parsed = readParenthesized(block, index + 1);
      const inner = parsed.value.replace(/^[\d\s,.-]+/, '');
      applyOverrideTags(inner.startsWith('\\') ? inner : `\\${inner}`, style, styles, baseStyle, extras);
      index = parsed.next;
      continue;
    }

    const fnMatch = remaining.match(/^fn([^\\}]+)/);
    if (fnMatch) {
      style.fontName = fnMatch[1].trim() || style.fontName;
      index += fnMatch[0].length;
      continue;
    }

    const colorMatch = remaining.match(/^(?:1?c|c)&H([0-9A-Fa-f]{6,8})&?/);
    if (colorMatch) {
      style.color = parseAssColor(`&H${colorMatch[1]}&`, style.color);
      index += colorMatch[0].length;
      continue;
    }
    const outlineColorMatch = remaining.match(/^3c&H([0-9A-Fa-f]{6,8})&?/);
    if (outlineColorMatch) {
      style.outlineColor = parseAssColor(`&H${outlineColorMatch[1]}&`, style.outlineColor);
      index += outlineColorMatch[0].length;
      continue;
    }
    const shadowColorMatch = remaining.match(/^4c&H([0-9A-Fa-f]{6,8})&?/);
    if (shadowColorMatch) {
      style.shadowColor = parseAssColor(`&H${shadowColorMatch[1]}&`, style.shadowColor);
      index += shadowColorMatch[0].length;
      continue;
    }
    const alphaMatch = remaining.match(/^(?:1?a|alpha)&H([0-9A-Fa-f]{1,2})&?/);
    if (alphaMatch) {
      style.color = parseAssAlpha(alphaMatch[1], style.color) || style.color;
      index += alphaMatch[0].length;
      continue;
    }

    const resetMatch = remaining.match(/^r([^\\]*)/);
    if (resetMatch) {
      const nextStyle = styles.get(resetMatch[1].trim()) || baseStyle;
      Object.assign(style, { ...nextStyle });
      extras.alignment = nextStyle.alignment;
      index += resetMatch[0].length;
      continue;
    }

    const simpleMatch = remaining.match(/^(an|a|b|i|u|s|fs|fscx|fscy|bord|shad|frz|p)(-?[\d.]+)?/);
    if (simpleMatch) {
      const tag = simpleMatch[1];
      const numeric = simpleMatch[2] === undefined ? 1 : Number(simpleMatch[2]);
      if (tag === 'an' && numeric >= 1 && numeric <= 9) extras.alignment = numeric;
      if (tag === 'a') extras.alignment = parseLegacyAlignment(numeric);
      if (tag === 'b') style.bold = numeric !== 0;
      if (tag === 'i') style.italic = numeric !== 0;
      if (tag === 'u') style.underline = numeric !== 0;
      if (tag === 's') style.strikeout = numeric !== 0;
      if (tag === 'fs' && Number.isFinite(numeric)) style.fontSize = numeric;
      if ((tag === 'fscx' || tag === 'fscy') && Number.isFinite(numeric)) {
        style.fontSize = Math.max(1, style.fontSize * (numeric / 100));
      }
      if (tag === 'bord' && Number.isFinite(numeric)) style.outline = numeric;
      if (tag === 'shad' && Number.isFinite(numeric)) style.shadow = numeric;
      if (tag === 'frz' && Number.isFinite(numeric)) extras.rotation = numeric;
      if (tag === 'p') extras.drawing = numeric > 0;
      index += simpleMatch[0].length;
      continue;
    }

    const skipMatch = remaining.match(/^(?:k[fo]?|K|q|be|blur|fsp|fax|fay|frx|fry|clip|iclip|org|xbord|ybord|xshad|yshad)[^\\]*/);
    index += skipMatch ? skipMatch[0].length : 1;
  }
};

const parseAssText = (
  rawText: string,
  baseStyle: AssStyle,
  styles: Map<string, AssStyle>,
) => {
  const style = { ...baseStyle };
  const extras = {
    alignment: baseStyle.alignment,
    position: null as { x: number; y: number } | null,
    move: undefined as SubtitleCue['move'],
    fadeIn: 0,
    fadeOut: 0,
    rotation: 0,
    drawing: false,
  };
  const spans: SubtitleSpan[] = [];
  let buffer = '';

  const flush = () => {
    if (!buffer || extras.drawing) {
      buffer = '';
      return;
    }
    spans.push({
      text: buffer,
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      strikeout: style.strikeout,
      color: style.color,
      fontSize: style.fontSize,
      fontName: style.fontName,
    });
    buffer = '';
  };

  const decoded = rawText
    .replace(/\\h/g, '\u00a0')
    .replace(/\\[Nn]/g, '\n');

  for (let index = 0; index < decoded.length; index += 1) {
    if (decoded[index] === '{') {
      const end = decoded.indexOf('}', index);
      if (end < 0) break;
      flush();
      applyOverrideTags(decoded.slice(index + 1, end), style, styles, baseStyle, extras);
      index = end;
      continue;
    }
    buffer += decoded[index];
  }
  flush();

  return {
    spans: spans.filter(span => span.text.length > 0),
    extras,
    style,
  };
};

const parseAssSubtitles = (content: string) => {
  const cues: SubtitleCue[] = [];
  const styles = new Map<string, AssStyle>([['Default', createDefaultStyle()]]);
  let playRes = { ...DEFAULT_PLAY_RES };
  let styleFormat = ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'];
  let eventFormat = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];
  let section = '';

  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('!:')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).toLowerCase();
      continue;
    }

    if (section.includes('script')) {
      const [key, ...rest] = line.split(':');
      const value = rest.join(':').trim();
      if (/^playresx$/i.test(key)) playRes = { ...playRes, x: Number(value) || playRes.x };
      if (/^playresy$/i.test(key)) playRes = { ...playRes, y: Number(value) || playRes.y };
      continue;
    }

    if (section.includes('style')) {
      if (/^format\s*:/i.test(line)) {
        styleFormat = line.slice(line.indexOf(':') + 1).split(',').map(value => value.trim());
        continue;
      }
      if (/^style\s*:/i.test(line)) {
        const values = splitCsv(line.slice(line.indexOf(':') + 1));
        const style = parseStyleLine(styleFormat, values);
        if (style) styles.set(style.name, style);
      }
      continue;
    }

    if (!section.includes('event')) continue;

    if (/^format\s*:/i.test(line)) {
      eventFormat = line.slice(line.indexOf(':') + 1).split(',').map(value => value.trim());
      continue;
    }

    if (!/^dialogue\s*:/i.test(line)) continue;

    const values = line.slice(line.indexOf(':') + 1).split(',');
    if (values.length > eventFormat.length) {
      values.splice(eventFormat.length - 1, values.length - eventFormat.length + 1, values.slice(eventFormat.length - 1).join(','));
    }

    const start = parseTimestamp(readField(eventFormat, values, 'Start') || '');
    const end = parseTimestamp(readField(eventFormat, values, 'End') || '');
    const rawText = readField(eventFormat, values, 'Text') || '';
    const styleName = readField(eventFormat, values, 'Style') || 'Default';
    const baseStyle = { ...(styles.get(styleName) || styles.get('Default') || createDefaultStyle()) };
    const marginL = Number(readField(eventFormat, values, 'MarginL') || baseStyle.marginL);
    const marginR = Number(readField(eventFormat, values, 'MarginR') || baseStyle.marginR);
    const marginV = Number(readField(eventFormat, values, 'MarginV') || baseStyle.marginV);
    const parsed = parseAssText(rawText, baseStyle, styles);
    const text = parsed.spans.map(span => span.text).join('').trim();

    if (start === null || end === null || end <= start || !text) continue;

    cues.push({
      start,
      end,
      text,
      format: 'ass',
      layer: Number(readField(eventFormat, values, 'Layer') || 0) || 0,
      alignment: parsed.extras.alignment,
      position: parsed.extras.position || undefined,
      move: parsed.extras.move,
      playRes,
      color: parsed.style.color,
      outlineColor: parsed.style.outlineColor,
      shadowColor: parsed.style.shadowColor,
      outline: parsed.style.outline,
      shadow: parsed.style.shadow,
      fontSize: parsed.style.fontSize,
      fontName: parsed.style.fontName,
      bold: parsed.style.bold,
      italic: parsed.style.italic,
      underline: parsed.style.underline,
      strikeout: parsed.style.strikeout,
      borderStyle: parsed.style.borderStyle,
      marginL,
      marginR,
      marginV,
      rotation: parsed.extras.rotation,
      fadeIn: parsed.extras.fadeIn,
      fadeOut: parsed.extras.fadeOut,
      spans: parsed.spans,
    });
  }

  return cues;
};

export const parseSubtitle = (content: string, fileName: string) => (
  /\.(ass|ssa)$/i.test(fileName) ? parseAssSubtitles(content) : parseBlockSubtitles(content)
);

export const getActiveSubtitleCues = (cues: SubtitleCue[], currentTime: number, offsetSeconds: number) => (
  cues
    .filter(cue => (
      currentTime >= cue.start + offsetSeconds
      && currentTime <= cue.end + offsetSeconds
    ))
    .sort((left, right) => (left.layer || 0) - (right.layer || 0))
);

export const getCueOpacity = (cue: SubtitleCue, currentTime: number, offsetSeconds: number) => {
  const localTime = currentTime - (cue.start + offsetSeconds);
  const duration = cue.end - cue.start;
  let opacity = 1;
  if (cue.fadeIn && localTime < cue.fadeIn) {
    opacity = localTime / cue.fadeIn;
  }
  if (cue.fadeOut && localTime > duration - cue.fadeOut) {
    opacity = Math.min(opacity, (duration - localTime) / cue.fadeOut);
  }
  return clamp(opacity, 0, 1);
};

export const getCuePosition = (cue: SubtitleCue, currentTime: number, offsetSeconds: number) => {
  if (!cue.move) return cue.position;
  const elapsedMs = (currentTime - (cue.start + offsetSeconds)) * 1000;
  const durationMs = (cue.end - cue.start) * 1000;
  const startMs = cue.move.t1 || 0;
  const endMs = cue.move.t2 || durationMs;
  const progress = endMs <= startMs ? 1 : clamp((elapsedMs - startMs) / (endMs - startMs), 0, 1);
  return {
    x: cue.move.x1 + (cue.move.x2 - cue.move.x1) * progress,
    y: cue.move.y1 + (cue.move.y2 - cue.move.y1) * progress,
  };
};

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

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

    cues.push({ start, end, text });
  }

  return cues;
};

const parseAssSubtitles = (content: string) => {
  const cues: SubtitleCue[] = [];
  let format = ['Layer', 'Start', 'End', 'Style', 'Name', 'MarginL', 'MarginR', 'MarginV', 'Effect', 'Text'];

  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^Format\s*:/i.test(line)) {
      format = line.slice(line.indexOf(':') + 1).split(',').map(value => value.trim());
      continue;
    }
    if (!/^Dialogue\s*:/i.test(line)) continue;

    const values = line.slice(line.indexOf(':') + 1).split(',');
    if (values.length > format.length) {
      values.splice(format.length - 1, values.length - format.length + 1, values.slice(format.length - 1).join(','));
    }

    const start = parseTimestamp(values[format.findIndex(value => value.toLowerCase() === 'start')] || '');
    const end = parseTimestamp(values[format.findIndex(value => value.toLowerCase() === 'end')] || '');
    const rawText = values[format.findIndex(value => value.toLowerCase() === 'text')] || '';
    const text = rawText
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, '\n')
      .replace(/\\h/g, ' ')
      .trim();

    if (start === null || end === null || end <= start || !text) continue;
    cues.push({ start, end, text });
  }

  return cues;
};

export const parseSubtitle = (content: string, fileName: string) => (
  /\.ass$/i.test(fileName) ? parseAssSubtitles(content) : parseBlockSubtitles(content)
);

import { expect, test } from 'vitest';
import {
  applyFilenamePatternToFields,
  extractFilenameTokens,
  parseFilenameByPattern,
} from './filenamePattern';

const fields = [
  { id: 'file', type: 'file' as const, filenamePattern: '%N - %D [%A]', filenameTokenFields: { N: 'title', D: 'released', A: 'actor' } },
  { id: 'title', type: 'text' as const, textPrefix: '[', textSuffix: ']' },
  { id: 'released', type: 'date' as const },
  { id: 'actor', type: 'relation' as const },
  { id: 'tags', type: 'select' as const, multiple: true, options: ['Action', 'Drama'] },
  { id: 'score', type: 'number' as const },
  { id: 'done', type: 'checkbox' as const },
];

test('extracts unique filename tokens in order', () => {
  expect(extractFilenameTokens('%N - %D [%A] %n')).toEqual(['N', 'D', 'A']);
  expect(extractFilenameTokens('no-tokens')).toEqual([]);
});

test('parses token values from a filename', () => {
  expect(parseFilenameByPattern('C:\\media\\[Movie] - 2024-03-09 [Ada].mp4', '%N - %D [%A]')).toEqual({
    N: '[Movie]',
    D: '2024-03-09',
    A: 'Ada',
  });
});

test('returns null for empty patterns, missing names, or unmatched literals', () => {
  expect(parseFilenameByPattern('clip.mp4', '   ')).toBeNull();
  expect(parseFilenameByPattern('C:\\folder\\', '%N')).toBeNull();
  expect(parseFilenameByPattern('clip.mp4', 'literal-only')).toBeNull();
  expect(parseFilenameByPattern('aaa.mp4', '%N - %D')).toBeNull();
});

test('fills empty fields from a filename and skips filled or ambiguous values', () => {
  const nextValues = applyFilenamePatternToFields({
    filePath: 'C:\\media\\[Movie] - 2024-03-09 [Ada].mp4',
    fileField: fields[0],
    fields,
    currentValues: { title: 'already set' },
    findRelationMatches: (_field, tokenValue) => (
      tokenValue.toLowerCase() === 'ada' ? [{ id: 'actor-1' }] : []
    ),
  });

  expect(nextValues).toEqual({
    released: '2024-03-09',
    actor: 'actor-1',
  });
});

test('does not apply relation tokens when zero or multiple records match', () => {
  const noMatch = applyFilenamePatternToFields({
    filePath: 'Title - 2024-01-01 [Unknown].mp4',
    fileField: fields[0],
    fields,
    currentValues: {},
    findRelationMatches: () => [],
  });
  expect(noMatch.actor).toBeUndefined();

  const manyMatches = applyFilenamePatternToFields({
    filePath: 'Title - 2024-01-01 [Ada].mp4',
    fileField: fields[0],
    fields,
    currentValues: {},
    findRelationMatches: () => [{ id: 'a' }, { id: 'b' }],
  });
  expect(manyMatches.actor).toBeUndefined();
});

test('parses number, select, checkbox, and invalid date tokens', () => {
  const mappedField = {
    id: 'file',
    type: 'file' as const,
    filenamePattern: '%T_%S_%C_%X',
    filenameTokenFields: { T: 'score', S: 'tags', C: 'done', X: 'released' },
  };

  const nextValues = applyFilenamePatternToFields({
    filePath: '12.5_Action_yes_not-a-date.mp4',
    fileField: mappedField,
    fields: [mappedField, ...fields.slice(1)],
    currentValues: {},
    findRelationMatches: () => [],
  });

  expect(nextValues).toEqual({
    score: 12.5,
    tags: ['Action'],
    done: true,
  });
});

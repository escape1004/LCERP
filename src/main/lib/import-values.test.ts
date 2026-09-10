import { expect, test } from 'vitest';
import { format, isValid } from 'date-fns';
import { parseFlexibleDateValue } from '../../lib/dateParse';
import {
  createDefaultRecordData,
  getHeaderFieldMap,
  parseArrayImportValue,
  parseBooleanImportValue,
  parseImportedFieldValue,
  parsePercentageImportPart,
  resolveImportedRelationValue,
} from './import-values';

function normalizeImportedDateValue(rawValue: unknown) {
  if (rawValue instanceof Date && isValid(rawValue)) {
    return format(rawValue, 'yyyy-MM-dd');
  }
  const text = String(rawValue ?? '').trim();
  if (!text) return '';
  const parsed = parseFlexibleDateValue(text);
  return parsed === null ? text : parsed;
}

test('parses boolean import values from several representations', () => {
  expect(parseBooleanImportValue(true)).toBe(true);
  expect(parseBooleanImportValue(0)).toBe(false);
  expect(parseBooleanImportValue('YES')).toBe(true);
  expect(parseBooleanImportValue('off')).toBe(false);
});

test('parses arrays from JSON, delimiters, and corrupt JSON', () => {
  expect(parseArrayImportValue('["Ada", "Ben"]')).toEqual(['Ada', 'Ben']);
  expect(parseArrayImportValue('Ada; Ben\nCara')).toEqual(['Ada', 'Ben', 'Cara']);
  expect(parseArrayImportValue('{not-json}')).toEqual(['{not-json}']);
  expect(parseArrayImportValue('{"oops":')).toEqual(['{"oops":']);
  expect(parseArrayImportValue('')).toEqual([]);
});

test('converts imported field values by type', () => {
  expect(parseImportedFieldValue({ type: 'number' }, '12.5')).toBe(12.5);
  expect(parseImportedFieldValue({ type: 'number' }, 'n/a')).toBe('n/a');
  expect(parseImportedFieldValue({ type: 'checkbox' }, '1')).toBe(true);
  expect(parseImportedFieldValue({ type: 'checkbox' }, null)).toBe(false);
  expect(parseImportedFieldValue({ type: 'select', multiple: true }, 'A, B')).toEqual(['A', 'B']);
  expect(parseImportedFieldValue({ type: 'date' }, '2024.03.09', normalizeImportedDateValue)).toBe('2024-03-09');
  expect(parseImportedFieldValue({ type: 'date' }, 'not-a-date', normalizeImportedDateValue)).toBe('not-a-date');
  expect(parseImportedFieldValue({ type: 'date' }, '', normalizeImportedDateValue)).toBe('');
  expect(parseImportedFieldValue({ type: 'date' }, new Date(2024, 2, 9))).toBe('2024-03-09');
  expect(parseImportedFieldValue({ type: 'date' }, 45360, (value) => {
    expect(value).toBe(45360);
    return '2024-03-09';
  })).toBe('2024-03-09');
  expect(parseImportedFieldValue({ type: 'percentage' }, '{"value":3,"max":10}')).toEqual({ value: 3, max: 10 });
  expect(parseImportedFieldValue({ type: 'percentage' }, '3/10')).toEqual({ value: 3, max: 10 });
  expect(parseImportedFieldValue({ type: 'percentage' }, '{not json}')).toEqual({ value: 0, max: 0 });
  expect(parsePercentageImportPart('nope')).toBe(0);
});

test('resolves relation names and counts missing or ambiguous ids', () => {
  const field = { id: 'actor', type: 'relation', multiple: false };
  const resolvers = new Map([
    ['actor', { lookup: new Map([['ada', ['actor-1']], ['twin', ['a', 'b']]]) }],
  ]);

  expect(resolveImportedRelationValue(field, 'Ada', resolvers)).toEqual({
    value: 'actor-1',
    unresolvedCount: 0,
  });
  expect(resolveImportedRelationValue(field, 'Missing', resolvers)).toEqual({
    value: '',
    unresolvedCount: 1,
  });
  expect(resolveImportedRelationValue(field, 'twin', resolvers)).toEqual({
    value: '',
    unresolvedCount: 1,
  });
  expect(resolveImportedRelationValue({ ...field, multiple: true }, 'Ada, Ghost', resolvers)).toEqual({
    value: ['actor-1'],
    unresolvedCount: 1,
  });
});

test('builds default record data and header maps', () => {
  const fields = [
    { id: 'title', name: 'Title', type: 'text' },
    { id: 'tags', name: 'Tags', type: 'select', multiple: true },
    { id: 'done', name: 'Done', type: 'checkbox' },
  ];

  expect(createDefaultRecordData(fields)).toEqual({
    title: '',
    tags: [],
    done: false,
  });

  const headers = getHeaderFieldMap(fields);
  expect(headers.get('title')?.id).toBe('title');
  expect(headers.get('tags')?.id).toBe('tags');
});

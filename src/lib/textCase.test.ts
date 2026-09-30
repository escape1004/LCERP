import { expect, test } from 'vitest';
import { applyTextCase, applyTextCaseToRange } from './textCase';

test('changes only the first letter of each sentence', () => {
  expect(applyTextCase('hello world. this is a test! okay', 'sentenceUpper'))
    .toBe('Hello world. This is a test! Okay');
  expect(applyTextCase('Hello WORLD. This IS a test.', 'sentenceLower'))
    .toBe('hello WORLD. this IS a test.');
  expect(applyTextCase('  hello.  world', 'sentenceUpper')).toBe('  Hello.  World');
});

test('changes only the first letter of each word', () => {
  expect(applyTextCase('hello WORLD from local-erp', 'wordUpper'))
    .toBe('Hello WORLD From Local-erp');
  expect(applyTextCase('Hello WORLD From Local', 'wordLower'))
    .toBe('hello wORLD from local');
});

test('changes the entire string case', () => {
  expect(applyTextCase('Hello World', 'allUpper')).toBe('HELLO WORLD');
  expect(applyTextCase('Hello World', 'allLower')).toBe('hello world');
});

test('applies the transform to a selection or the whole value', () => {
  expect(applyTextCaseToRange('hello world', 0, 5, 'allUpper')).toEqual({
    value: 'HELLO world',
    start: 0,
    end: 5,
  });
  expect(applyTextCaseToRange('hello world', 6, 6, 'wordUpper')).toEqual({
    value: 'Hello World',
    start: 0,
    end: 11,
  });
});

test('leaves korean text unchanged while still casing latin letters', () => {
  expect(applyTextCase('hello 한글. next world', 'sentenceUpper'))
    .toBe('Hello 한글. Next world');
  expect(applyTextCase('한글 hello', 'wordUpper')).toBe('한글 Hello');
  expect(applyTextCase('한글 hello', 'allUpper')).toBe('한글 HELLO');
});

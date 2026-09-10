import assert from 'node:assert/strict';
import test from 'node:test';
import { extractResponseText } from './openai-response.ts';

test('extractResponseText prefers output_text', () => {
  assert.equal(extractResponseText({ output_text: '  Hello  ' }), 'Hello');
});

test('extractResponseText joins output content parts', () => {
  assert.equal(
    extractResponseText({
      output: [
        { content: [{ type: 'output_text', text: '한' }, { type: 'output_text', text: '글' }] }
      ]
    }),
    '한\n글'
  );
  assert.equal(extractResponseText({ output: [] }), '');
});

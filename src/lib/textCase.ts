export type TextCaseAction =
  | 'sentenceUpper'
  | 'sentenceLower'
  | 'wordUpper'
  | 'wordLower'
  | 'allUpper'
  | 'allLower';

const LETTER_PATTERN = /\p{L}/u;
const SENTENCE_END_PATTERN = /[.!?…。！？]/u;
const WORD_BOUNDARY_PATTERN = /\s/u;

const changeLetterCase = (letter: string, toUpper: boolean) => (
  toUpper ? letter.toLocaleUpperCase() : letter.toLocaleLowerCase()
);

const changeInitialLetters = (
  text: string,
  toUpper: boolean,
  isBoundary: (character: string) => boolean,
) => {
  let awaitingLetter = true;

  return Array.from(text).map((character) => {
    if (awaitingLetter && LETTER_PATTERN.test(character)) {
      awaitingLetter = false;
      return changeLetterCase(character, toUpper);
    }

    if (isBoundary(character)) {
      awaitingLetter = true;
    }

    return character;
  }).join('');
};

export const changeSentenceInitialCase = (text: string, toUpper: boolean) => (
  changeInitialLetters(text, toUpper, (character) => SENTENCE_END_PATTERN.test(character))
);

export const changeWordInitialCase = (text: string, toUpper: boolean) => (
  changeInitialLetters(text, toUpper, (character) => WORD_BOUNDARY_PATTERN.test(character))
);

export const changeAllCase = (text: string, toUpper: boolean) => (
  toUpper ? text.toLocaleUpperCase() : text.toLocaleLowerCase()
);

export const applyTextCase = (text: string, action: TextCaseAction) => {
  switch (action) {
    case 'sentenceUpper':
      return changeSentenceInitialCase(text, true);
    case 'sentenceLower':
      return changeSentenceInitialCase(text, false);
    case 'wordUpper':
      return changeWordInitialCase(text, true);
    case 'wordLower':
      return changeWordInitialCase(text, false);
    case 'allUpper':
      return changeAllCase(text, true);
    case 'allLower':
      return changeAllCase(text, false);
    default:
      return text;
  }
};

export const applyTextCaseToRange = (
  value: string,
  start: number,
  end: number,
  action: TextCaseAction,
) => {
  const from = Math.max(0, Math.min(start, end, value.length));
  const to = Math.max(0, Math.min(Math.max(start, end), value.length));
  const hasSelection = from !== to;
  const targetStart = hasSelection ? from : 0;
  const targetEnd = hasSelection ? to : value.length;
  const transformed = applyTextCase(value.slice(targetStart, targetEnd), action);

  return {
    value: `${value.slice(0, targetStart)}${transformed}${value.slice(targetEnd)}`,
    start: targetStart,
    end: targetStart + transformed.length,
  };
};

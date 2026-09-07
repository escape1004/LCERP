import { parseFlexibleDateValue } from './dateParse';

type FilenameTargetField = {
  id: string;
  type: 'text' | 'number' | 'percentage' | 'date' | 'select' | 'relation' | 'file' | 'checkbox' | 'longtext';
  multiple?: boolean;
  options?: string[];
  textPrefix?: string;
  textSuffix?: string;
  filenamePattern?: string;
  filenameTokenFields?: Record<string, string>;
};

type FilenameRelationRecord = {
  id: string;
};

export const extractFilenameTokens = (pattern: string) => {
  const tokens: string[] = [];
  const seen = new Set<string>();

  for (const match of pattern.matchAll(/%([A-Za-z])/g)) {
    const token = match[1].toUpperCase();
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
};

const stripFileExtension = (filePath: string) => {
  const fileName = filePath.replace(/^.*[\\/]/, '');
  const extensionIndex = fileName.lastIndexOf('.');
  return extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const parseFilenameByPattern = (filePath: string, pattern: string) => {
  const normalizedPattern = pattern.trim();
  if (!normalizedPattern) return null;

  const fileName = stripFileExtension(filePath).trim();
  if (!fileName) return null;

  const parts: Array<{ type: 'token'; token: string } | { type: 'literal'; value: string }> = [];
  let index = 0;

  while (index < normalizedPattern.length) {
    const current = normalizedPattern[index];
    const next = normalizedPattern[index + 1];
    if (current === '%' && next && /[A-Za-z]/.test(next)) {
      parts.push({ type: 'token', token: next.toUpperCase() });
      index += 2;
      continue;
    }

    let literal = '';
    while (index < normalizedPattern.length) {
      const literalCurrent = normalizedPattern[index];
      const literalNext = normalizedPattern[index + 1];
      if (literalCurrent === '%' && literalNext && /[A-Za-z]/.test(literalNext)) break;
      literal += literalCurrent;
      index += 1;
    }
    if (literal) parts.push({ type: 'literal', value: literal });
  }

  const tokenIndexes = parts
    .map((part, partIndex) => (part.type === 'token' ? partIndex : -1))
    .filter((partIndex) => partIndex >= 0);
  const lastTokenPartIndex = tokenIndexes[tokenIndexes.length - 1];
  if (lastTokenPartIndex === undefined) return null;

  const regexBody = parts.map((part, partIndex) => {
    if (part.type === 'token') {
      return partIndex === lastTokenPartIndex ? '(.+)' : '(.+?)';
    }
    return escapeRegExp(part.value).replace(/\\ +/g, '\\s+').replace(/ +/g, '\\s+');
  }).join('');

  const match = fileName.match(new RegExp(`^${regexBody}$`));
  if (!match) return null;

  const values: Record<string, string> = {};
  let captureIndex = 1;
  for (const part of parts) {
    if (part.type !== 'token') continue;
    const captured = (match[captureIndex] || '').trim();
    captureIndex += 1;
    if (captured) values[part.token] = captured;
  }

  return Object.keys(values).length > 0 ? values : null;
};

const isEmptyFieldValue = (field: FilenameTargetField, value: unknown) => {
  if (field.type === 'checkbox') return value === undefined || value === null;
  if ((field.type === 'select' || field.type === 'relation') && field.multiple) {
    return !Array.isArray(value) || value.length === 0;
  }
  if (field.type === 'percentage') {
    if (!value || typeof value !== 'object') return true;
    const current = Number((value as { value?: unknown }).value);
    const max = Number((value as { max?: unknown }).max);
    return (!Number.isFinite(current) || current === 0) && (!Number.isFinite(max) || max === 0);
  }
  return value === undefined || value === null || value === '';
};

const parseNumberToken = (raw: string) => {
  const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseCheckboxToken = (raw: string) => {
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'o', 'ㅇ'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'x', 'ㄴ'].includes(normalized)) return false;
  return null;
};

export const applyFilenamePatternToFields = <
  TField extends FilenameTargetField,
  TRecord extends FilenameRelationRecord,
>({
  filePath,
  fileField,
  fields,
  currentValues,
  dateFormats = [],
  findRelationMatches,
}: {
  filePath: string;
  fileField: TField;
  fields: TField[];
  currentValues: Record<string, unknown>;
  dateFormats?: string[];
  findRelationMatches: (field: TField, tokenValue: string) => TRecord[];
}) => {
  const pattern = fileField.filenamePattern?.trim() || '';
  const mappings = fileField.filenameTokenFields || {};
  const parsed = parseFilenameByPattern(filePath, pattern);
  if (!parsed) return {};

  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const nextValues: Record<string, unknown> = {};

  for (const token of extractFilenameTokens(pattern)) {
    const fieldId = mappings[token];
    const rawValue = parsed[token];
    const targetField = fieldId ? fieldById.get(fieldId) : undefined;
    if (!targetField || !rawValue || targetField.type === 'file') continue;
    if (!isEmptyFieldValue(targetField, nextValues[targetField.id] ?? currentValues[targetField.id])) continue;

    if (targetField.type === 'text' || targetField.type === 'longtext') {
      let textValue = rawValue;
      const prefix = targetField.textPrefix ?? '';
      const suffix = targetField.textSuffix ?? '';
      if (prefix && textValue.startsWith(prefix)) textValue = textValue.slice(prefix.length);
      if (suffix && textValue.endsWith(suffix)) textValue = textValue.slice(0, textValue.length - suffix.length);
      nextValues[targetField.id] = textValue;
      continue;
    }

    if (targetField.type === 'number') {
      const numeric = parseNumberToken(rawValue);
      if (numeric !== null) nextValues[targetField.id] = numeric;
      continue;
    }

    if (targetField.type === 'percentage') {
      const ratio = rawValue.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
      if (ratio) {
        nextValues[targetField.id] = {
          value: Number(ratio[1]),
          max: Number(ratio[2]),
        };
        continue;
      }
      const numeric = parseNumberToken(rawValue);
      if (numeric !== null) {
        const current = currentValues[targetField.id] as { max?: number } | undefined;
        nextValues[targetField.id] = {
          value: numeric,
          max: Number(current?.max) || 0,
        };
      }
      continue;
    }

    if (targetField.type === 'date') {
      const parsedDate = parseFlexibleDateValue(rawValue, dateFormats);
      if (parsedDate) nextValues[targetField.id] = parsedDate;
      continue;
    }

    if (targetField.type === 'select') {
      const options = targetField.options || [];
      const matched = options.filter((option) => option.trim().toLowerCase() === rawValue.toLowerCase());
      if (matched.length !== 1) continue;
      nextValues[targetField.id] = targetField.multiple ? [matched[0]] : matched[0];
      continue;
    }

    if (targetField.type === 'checkbox') {
      const checked = parseCheckboxToken(rawValue);
      if (checked !== null) nextValues[targetField.id] = checked;
      continue;
    }

    if (targetField.type === 'relation') {
      const matches = findRelationMatches(targetField, rawValue);
      if (matches.length !== 1) continue;
      nextValues[targetField.id] = targetField.multiple ? [matches[0].id] : matches[0].id;
    }
  }

  return nextValues;
};

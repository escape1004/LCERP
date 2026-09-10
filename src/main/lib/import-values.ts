import { format, isValid } from 'date-fns';

export function parseBooleanImportValue(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['true', '1', 'y', 'yes', 'o', 'on'].includes(normalized);
}

export function parseArrayImportValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const text = String(value ?? '').trim();
  if (!text) return [];

  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Fall through to delimiter parsing.
    }
  }

  return text
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parsePercentageImportPart(value) {
  if (value === null || value === undefined) return 0;
  const text = String(value).trim();
  if (text === '') return 0;
  const numericValue = Number(text);
  return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
}

export function normalizePercentageImportValue(value, max) {
  const safeMax = parsePercentageImportPart(max);
  return {
    value: Math.min(parsePercentageImportPart(value), safeMax),
    max: safeMax
  };
}

export function defaultNormalizeImportDateValue(rawValue) {
  if (rawValue instanceof Date && isValid(rawValue)) {
    return format(rawValue, 'yyyy-MM-dd');
  }

  const text = String(rawValue ?? '').trim();
  return text;
}

export function parseImportedFieldValue(field, rawValue, normalizeDate = defaultNormalizeImportDateValue) {
  if (rawValue === null || rawValue === undefined) {
    return field?.multiple ? [] : field?.type === 'checkbox' ? false : '';
  }

  const text = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  if (text === '') {
    return field?.multiple ? [] : field?.type === 'checkbox' ? false : '';
  }

  switch (field?.type) {
    case 'number':
    case 'percentage': {
      if (field?.type === 'percentage') {
        if (typeof text === 'string') {
          const trimmedText = text.trim();
          if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmedText);
              return normalizePercentageImportValue(parsed?.value, parsed?.max);
            } catch {
              // Fall through to delimiter parsing.
            }
          }

          if (trimmedText.includes('/')) {
            const [currentPart, maxPart] = trimmedText.split('/', 2);
            return normalizePercentageImportValue(currentPart, maxPart);
          }
        }

        return normalizePercentageImportValue(text, 0);
      }
      const numericValue = Number(text);
      return Number.isFinite(numericValue) ? numericValue : String(text);
    }
    case 'checkbox':
      return parseBooleanImportValue(text);
    case 'select':
    case 'relation':
      return field?.multiple ? parseArrayImportValue(text) : String(text);
    case 'file':
      return String(text);
    case 'date':
      return normalizeDate(text);
    case 'text':
    default:
      return String(text);
  }
}

export function resolveImportedRelationValue(field, rawValue, relationResolvers) {
  const resolver = relationResolvers.get(field.id);
  if (!resolver) {
    return {
      value: field.multiple ? parseArrayImportValue(rawValue) : String(rawValue ?? ''),
      unresolvedCount: 0
    };
  }

  const sourceValues = field.multiple ? parseArrayImportValue(rawValue) : [String(rawValue ?? '').trim()].filter(Boolean);
  const resolvedIds = [];
  let unresolvedCount = 0;

  sourceValues.forEach((sourceValue) => {
    const normalized = String(sourceValue).trim().toLowerCase();
    if (!normalized) return;

    const matches = resolver.lookup.get(normalized) || [];
    if (matches.length === 1) {
      resolvedIds.push(matches[0]);
      return;
    }

    unresolvedCount += 1;
  });

  return {
    value: field.multiple ? Array.from(new Set(resolvedIds)) : (resolvedIds[0] || ''),
    unresolvedCount
  };
}

export function createDefaultRecordData(fields) {
  return fields.reduce((acc, field) => {
    if (field.multiple) {
      acc[field.id] = [];
    } else if (field.type === 'checkbox') {
      acc[field.id] = false;
    } else {
      acc[field.id] = '';
    }
    return acc;
  }, {});
}

export function getHeaderFieldMap(fields) {
  const map = new Map();
  fields.forEach((field) => {
    const keys = [field.id, field.name]
      .filter(Boolean)
      .map((key) => String(key).trim().toLowerCase());

    for (const key of keys) {
      if (key) {
        map.set(key, field);
      }
    }
  });
  return map;
}

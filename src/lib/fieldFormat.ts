type TextAffixField = {
  type: string;
  textPrefix?: string;
  textSuffix?: string;
};

export const hasTextAffixes = (field: TextAffixField) =>
  field.type === 'text' && Boolean(field.textPrefix || field.textSuffix);

export const formatFieldDisplayValue = (field: TextAffixField, value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const rawText = String(value);

  if (field.type !== 'text') {
    return rawText;
  }

  return `${field.textPrefix ?? ''}${rawText}${field.textSuffix ?? ''}`;
};

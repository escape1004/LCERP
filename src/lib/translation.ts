export const TRANSLATED_FIELD_SUFFIX = '__translated';
export const TRANSLATION_META_FIELD_SUFFIX = '__translationMeta';
export const OPENAI_TRANSLATION_MODEL = 'gpt-5.6-luna';

type TranslationCapableField = {
  type: string;
  enableTranslation?: boolean;
};

export type TranslationMeta = {
  provider: 'openai';
  model: string;
  autoTranslated: boolean;
  targetLanguage: string;
  translatedAt: string;
};

export const getTranslatedFieldId = (fieldId: string) => `${fieldId}${TRANSLATED_FIELD_SUFFIX}`;

export const getTranslationMetaFieldId = (fieldId: string) => `${fieldId}${TRANSLATION_META_FIELD_SUFFIX}`;

export const isTranslationSupportedField = (field: TranslationCapableField) => (
  field.type === 'text' || field.type === 'longtext'
);

export const isTranslationEnabledField = (field: TranslationCapableField) => (
  isTranslationSupportedField(field) && Boolean(field.enableTranslation)
);

export const getTranslatedFieldValue = (
  recordData: Record<string, unknown> | null | undefined,
  fieldId: string
) => {
  const translatedValue = recordData?.[getTranslatedFieldId(fieldId)];
  return typeof translatedValue === 'string' ? translatedValue : '';
};

export const getTranslationMeta = (
  recordData: Record<string, unknown> | null | undefined,
  fieldId: string
) => {
  const meta = recordData?.[getTranslationMetaFieldId(fieldId)];
  return meta && typeof meta === 'object' ? (meta as TranslationMeta) : null;
};

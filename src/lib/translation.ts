export const TRANSLATED_FIELD_SUFFIX = '__translated';
export const TRANSLATION_META_FIELD_SUFFIX = '__translationMeta';
export const OPENAI_TRANSLATION_MODEL = 'gpt-5.6-luna';
export const OPENAI_TRANSLATION_MODELS = [
  {
    value: OPENAI_TRANSLATION_MODEL,
    label: 'GPT-5.6 Luna (권장)',
    description: '번역 품질과 문맥 이해를 우선하는 기본 모델',
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT-5 mini',
    description: '품질과 처리 비용의 균형이 좋은 모델',
  },
  {
    value: 'gpt-5-nano',
    label: 'GPT-5 nano',
    description: '짧고 단순한 문장을 빠르고 저렴하게 처리하는 모델',
  },
  {
    value: 'gpt-4.1-mini',
    label: 'GPT-4.1 mini',
    description: '안정적인 범용 번역을 위한 이전 세대 경량 모델',
  },
] as const;

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

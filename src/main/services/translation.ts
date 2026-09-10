import { extractResponseText } from '../lib/openai-response';
import { normalizeTranslationModel, normalizeTranslationTargetLanguage } from '../lib/config-normalize';
import { appConfig } from '../app/state';

export { extractResponseText };

export function getTranslationLanguageLabel(language) {
  switch (normalizeTranslationTargetLanguage(language)) {
    case 'en':
      return 'English';
    case 'ja':
      return 'Japanese';
    case 'zh-CN':
      return 'Simplified Chinese';
    case 'zh-TW':
      return 'Traditional Chinese';
    case 'ko':
    default:
      return 'Korean';
  }
}

export async function translateTextWithOpenAi(text, targetLanguage, model) {
  const apiKey = String(appConfig.openAiApiKey || '').trim();
  if (!apiKey) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다.');
  }

  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return '';
  }

  const languageLabel = getTranslationLanguageLabel(targetLanguage);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: normalizeTranslationModel(model),
        store: false,
        input: `Detect the source language automatically and translate the text into ${languageLabel}.\nReturn only the translated text.\nDo not add explanations, labels, notes, or quotation marks.\nIf the input is already in ${languageLabel}, return it unchanged.\n\nText:\n${normalizedText}`
      }),
      signal: controller.signal
    });

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiError = responseBody?.error?.message || `OpenAI API 요청에 실패했습니다. (${response.status})`;
      const error: any = new Error(apiError);
      error.status = response.status;
      error.code = responseBody?.error?.code;
      error.type = responseBody?.error?.type;
      throw error;
    }

    const translatedText = extractResponseText(responseBody);
    if (!translatedText) {
      throw new Error('번역 결과를 읽지 못했습니다.');
    }

    return translatedText;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('번역 요청 시간이 초과되었습니다.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

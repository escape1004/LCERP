export function extractResponseText(responseBody) {
  if (typeof responseBody?.output_text === 'string' && responseBody.output_text.trim()) {
    return responseBody.output_text.trim();
  }

  if (Array.isArray(responseBody?.output)) {
    const textParts = [];
    responseBody.output.forEach((item) => {
      if (!Array.isArray(item?.content)) return;
      item.content.forEach((content) => {
        if (content?.type === 'output_text' && typeof content?.text === 'string') {
          textParts.push(content.text);
        }
      });
    });

    if (textParts.length > 0) {
      return textParts.join('\n').trim();
    }
  }

  return '';
}

export const resolveFilePath = (
  rawPath: string | null | undefined,
  field?: { pathMode?: 'direct' | 'base'; basePath?: string }
): string | null => {
  if (!rawPath || rawPath === '' || rawPath === '-') return null;
  if (!field || field.pathMode !== 'base' || !field.basePath) return rawPath;

  const fileName = rawPath.split(/[\\/]/).pop();
  if (!fileName) return rawPath;

  const basePath = field.basePath;
  const sep = basePath.includes('\\') ? '\\' : '/';
  const trimmedBase =
    basePath.endsWith('\\') || basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

  return `${trimmedBase}${sep}${fileName}`;
};

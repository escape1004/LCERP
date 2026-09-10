export function getSqlPlaceholders(count) {
  return Array.from({ length: count }, () => '?').join(', ');
}

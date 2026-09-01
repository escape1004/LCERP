export function isSeparatorCategory(category?: { itemType?: string } | null): boolean {
  return category?.itemType === 'separator';
}

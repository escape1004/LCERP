import { getSqlPlaceholders } from '../lib/sql';

export function cleanupRelationReferencesForDatabase(database, categoryId) {
  try {
    const targetCategory = database.prepare('SELECT profileId FROM categories WHERE id = ?').get(categoryId);
    if (!targetCategory) return 0;

    const relatedCategories = database
      .prepare('SELECT id, fields FROM categories WHERE profileId = ?')
      .all(targetCategory.profileId)
      .map((category) => {
        try {
          const fields = JSON.parse(category.fields);
          if (!Array.isArray(fields)) return { id: category.id, relationFields: [] };
          return {
            id: category.id,
            relationFields: fields.filter(
              (field) => field?.type === 'relation' && field.relationCategoryId === categoryId
            )
          };
        } catch {
          return { id: category.id, relationFields: [] };
        }
      })
      .filter((category) => category.relationFields.length > 0);

    if (relatedCategories.length === 0) return 0;

    const relatedCategoryIds = relatedCategories.map((category) => category.id);
    const records = database.prepare(`
      SELECT id, categoryId, data
      FROM records
      WHERE profileId = ? AND categoryId IN (${getSqlPlaceholders(relatedCategoryIds.length)})
    `).all(targetCategory.profileId, ...relatedCategoryIds);
    const recordsByCategoryId = new Map();
    records.forEach((record) => {
      const categoryRecords = recordsByCategoryId.get(record.categoryId) || [];
      categoryRecords.push(record);
      recordsByCategoryId.set(record.categoryId, categoryRecords);
    });

    const updateRecord = database.prepare('UPDATE records SET data = ? WHERE id = ?');
    let updatedCount = 0;

    relatedCategories.forEach((category) => {
      (recordsByCategoryId.get(category.id) || []).forEach((record) => {
        let data;
        try {
          data = JSON.parse(record.data);
        } catch {
          return;
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return;

        let hasChanges = false;

        category.relationFields.forEach((field) => {
          const value = data[field.id];

          if (field.multiple && Array.isArray(value)) {
            const filteredValue = value.filter((id) => id !== categoryId);
            if (filteredValue.length !== value.length) {
              data[field.id] = filteredValue;
              hasChanges = true;
            }
          } else if (value === categoryId) {
            data[field.id] = null;
            hasChanges = true;
          }
        });

        if (hasChanges) {
          updateRecord.run(JSON.stringify(data), record.id);
          updatedCount += 1;
        }
      });
    });

    return updatedCount;
  } catch {
    return 0;
  }
}

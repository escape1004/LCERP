import crypto from 'crypto';
import { currentProfileId, DEFAULT_PROFILE_COLOR, setCurrentProfileId } from '../app/state';
import { getSqlPlaceholders } from '../lib/sql';
import { db } from './connection';

export { getSqlPlaceholders };

export function getCurrentProfileIdOrThrow() {
  if (!currentProfileId) {
    throw new Error('Profile is not selected.');
  }

  return currentProfileId;
}

export function getProfileById(profileId) {
  return db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId) || null;
}

export function ensureCurrentProfileExists() {
  if (!currentProfileId) return null;

  const profile = getProfileById(currentProfileId);
  if (!profile) {
    setCurrentProfileId(null);
    return null;
  }

  return profile;
}

export function getScopedCategory(categoryId, profileId = getCurrentProfileIdOrThrow()) {
  return db.prepare('SELECT * FROM categories WHERE id = ? AND profileId = ?').get(categoryId, profileId) || null;
}

export function getScopedRecord(recordId, profileId = getCurrentProfileIdOrThrow()) {
  return db.prepare('SELECT * FROM records WHERE id = ? AND profileId = ?').get(recordId, profileId) || null;
}

export function ensureCategoryBelongsToCurrentProfile(categoryId) {
  const category = getScopedCategory(categoryId);
  if (!category) {
    throw new Error('Category not found in current profile.');
  }

  return category;
}

export function getCategorySubtreeIds(rootCategoryId, profileId) {
  const categories = db.prepare('SELECT id, parentId FROM categories WHERE profileId = ?').all(profileId);
  const childrenByParentId = new Map();

  categories.forEach(category => {
    const key = category.parentId || '__root__';
    if (!childrenByParentId.has(key)) {
      childrenByParentId.set(key, []);
    }
    childrenByParentId.get(key).push(category.id);
  });

  const subtreeIds = [];
  const stack = [rootCategoryId];

  while (stack.length > 0) {
    const categoryId = stack.pop();
    subtreeIds.push(categoryId);

    const childIds = childrenByParentId.get(categoryId) || [];
    childIds.forEach(childId => stack.push(childId));
  }

  return subtreeIds;
}

export function ensureRecordBelongsToCurrentProfile(recordId) {
  const record = getScopedRecord(recordId);
  if (!record) {
    throw new Error('Record not found in current profile.');
  }

  return record;
}

export function createProfile(name, avatarColor = DEFAULT_PROFILE_COLOR) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    throw new Error('Profile name is required.');
  }

  const now = new Date().toISOString();
  const profile = {
    id: crypto.randomUUID(),
    name: normalizedName,
    avatarColor: avatarColor || DEFAULT_PROFILE_COLOR,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO profiles (id, name, avatarColor, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(profile.id, profile.name, profile.avatarColor, profile.createdAt, profile.updatedAt);

  return profile;
}

export function ensureDefaultProfile() {
  const existingProfile = db.prepare('SELECT * FROM profiles ORDER BY createdAt ASC LIMIT 1').get();
  if (existingProfile) {
    return existingProfile;
  }

  return createProfile('기본 프로필', DEFAULT_PROFILE_COLOR);
}

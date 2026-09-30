import { expect, test } from 'vitest';
import type { Category, DataRecord, FieldDefinition } from '../types';
import {
  filterRecordsByQuery,
  getCategoryRecordLabel,
  getIncomingRelationFields,
  getReferringRecords,
  getReferringSourceCategory,
  getRootCategory,
  paginateItems,
} from './referringRecords';

const actorField = {
  id: 'actor',
  name: '배우',
  type: 'relation',
  relationCategoryId: 'actors',
} as FieldDefinition;

const tagsField = {
  id: 'tags',
  name: '태그',
  type: 'relation',
  relationCategoryId: 'actors',
  multiple: true,
} as FieldDefinition;

const rootCategory = {
  id: 'movies',
  name: '영화',
  fields: [
    { id: 'title', name: '제목', type: 'text' } as FieldDefinition,
    actorField,
    tagsField,
  ],
} as Category;

const actorCategory = {
  id: 'actors',
  name: '배우',
  parentId: 'movies',
  fields: [{ id: 'name', name: '이름', type: 'text' } as FieldDefinition],
} as Category;

const nestedCategory = {
  id: 'roles',
  name: '배역',
  parentId: 'actors',
  fields: [],
} as Category;

test('walks up to the root category', () => {
  expect(getRootCategory(nestedCategory, [rootCategory, actorCategory, nestedCategory]).id).toBe('movies');
  expect(getRootCategory(rootCategory, [rootCategory]).id).toBe('movies');
});

test('prefers the highest ancestor that actually references the current category', () => {
  const parentOnly = {
    ...actorCategory,
    fields: [{
      id: 'role',
      name: '배역',
      type: 'relation',
      relationCategoryId: 'roles',
    } as FieldDefinition],
  };
  const rootWithRelation = {
    ...rootCategory,
    fields: [{
      id: 'lead',
      name: '주연',
      type: 'relation',
      relationCategoryId: 'roles',
    } as FieldDefinition],
  };

  expect(getReferringSourceCategory(nestedCategory, [rootCategory, parentOnly, nestedCategory])?.id).toBe('actors');
  expect(getReferringSourceCategory(nestedCategory, [rootWithRelation, parentOnly, nestedCategory])?.id).toBe('movies');
  expect(getReferringSourceCategory(rootCategory, [rootCategory])).toBeNull();
});

test('finds unique root records that reference a subcategory record', () => {
  const records = [
    { id: 'm1', categoryId: 'movies', data: { title: 'Alpha', actor: 'a1' } },
    { id: 'm2', categoryId: 'movies', data: { title: 'Beta', actor: 'a2', tags: ['a1'] } },
    { id: 'm3', categoryId: 'movies', data: { title: 'Gamma', actor: 'a1', tags: ['a1'] } },
  ] as DataRecord[];

  const fields = getIncomingRelationFields(rootCategory, 'actors');
  const referring = getReferringRecords(records, fields, 'a1');

  expect(fields.map((field) => field.id)).toEqual(['actor', 'tags']);
  expect(referring.map((record) => record.id)).toEqual(['m1', 'm2', 'm3']);
});

test('labels records from the first visible text field and paginates large lists', () => {
  expect(getCategoryRecordLabel(
    { id: 'm1', categoryId: 'movies', data: { title: 'Alpha' } } as DataRecord,
    rootCategory,
  )).toBe('Alpha');

  const items = Array.from({ length: 120 }, (_, index) => ({ label: `Item ${index + 1}` }));
  const page = paginateItems(items, 3, 50);
  expect(page.total).toBe(120);
  expect(page.currentPage).toBe(3);
  expect(page.start).toBe(101);
  expect(page.end).toBe(120);
  expect(page.items).toHaveLength(20);
  expect(filterRecordsByQuery(
    [{ label: 'Alpha' }, { label: 'Beta' }, { label: 'Alpine' }],
    'alp',
  ).map((item) => item.label)).toEqual(['Alpha', 'Alpine']);
});

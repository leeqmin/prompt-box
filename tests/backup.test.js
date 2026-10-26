import { test, assert } from './harness.js';
import {
  BACKUP_APP, SCHEMA_VERSION, backupFileName, buildBackup, validateBackup, planMerge, sanitizeIncoming,
} from '../js/backup.js';

test('backup constants', () => {
  assert.equal(BACKUP_APP, 'prompt-box');
  assert.equal(SCHEMA_VERSION, 1);
});

test('backupFileName uses local date', () => {
  assert.equal(backupFileName(new Date(2026, 9, 6)), 'prompt-box-backup-2026-10-06.json');
});

test('buildBackup shape', () => {
  const b = buildBackup([{ id: 'a' }], [{ id: 'i' }], 5);
  assert.deepEqual(b, { app: 'prompt-box', schemaVersion: 1, exportedAt: 5, prompts: [{ id: 'a' }], images: [{ id: 'i' }] });
});

test('validateBackup rejects wrong app / future schema / missing fields', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ app: 'x' }).ok, false);
  assert.match(validateBackup({ app: 'prompt-box', schemaVersion: 2, prompts: [], images: [] }).error, /새 버전/);
  assert.equal(validateBackup({ app: 'prompt-box', schemaVersion: 1, prompts: [{ id: 'a' }], images: [] }).ok, false);
  assert.equal(validateBackup({ app: 'prompt-box', schemaVersion: 1, prompts: [], images: 'x' }).ok, false);
  assert.equal(validateBackup(buildBackup([], [], 0)).ok, true);
  assert.equal(validateBackup(buildBackup([{ id: 'a', title: 't', updatedAt: 1, results: [] }], [], 0)).ok, true);
});

test('planMerge add/overwrite/same by updatedAt', () => {
  const local = [{ id: 'a', updatedAt: 5 }, { id: 'b', updatedAt: 5 }, { id: 'd', updatedAt: 9 }];
  const plan = planMerge(local, [{ id: 'a', updatedAt: 9 }, { id: 'b', updatedAt: 5 }, { id: 'c', updatedAt: 1 }, { id: 'd', updatedAt: 3 }]);
  assert.deepEqual([plan.add, plan.overwrite, plan.same].map(xs => xs.map(p => p.id)), [['c'], ['a'], ['b', 'd']]);
});

test('sanitizeIncoming drops missing image ids and unused images', () => {
  const r = sanitizeIncoming([{ id: 'p', results: [{ imageIds: ['i1', 'gone'] }] }], [{ id: 'i1' }, { id: 'unused' }]);
  assert.deepEqual(r.prompts[0].results[0].imageIds, ['i1']);
  assert.deepEqual(r.images.map(i => i.id), ['i1']);
});

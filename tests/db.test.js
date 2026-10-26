import { test, assert } from './harness.js';
import {
  openDb, listPrompts, getPrompt, putPrompt, deletePrompt, savePromptWithImages, putImage, getImage, listImages,
  cleanupOrphanImages, getMeta, setMeta, applyImport, deleteDatabase,
} from '../js/db.js';
import { newPrompt, newResult, duplicatePrompt } from '../js/model.js';

async function withDb(fn) {
  const name = 'prompt-box-test-' + Math.random().toString(36).slice(2);
  const db = await openDb(name);
  try {
    await fn(db);
  } finally {
    db.close();
    await deleteDatabase(name);
  }
}

const blob = () => new Blob(['img'], { type: 'image/jpeg' });
const promptWith = (imageIds, id) => ({ ...newPrompt(1, id), title: 't', results: [{ ...newResult('2026-10-26'), imageIds }] });

test('put/list/get/delete round trip', () => withDb(async db => {
  const p = { ...newPrompt(1, 'a'), title: '하나' };
  await putPrompt(db, p);
  assert.deepEqual((await listPrompts(db)).map(x => x.id), ['a']);
  assert.equal((await getPrompt(db, 'a')).title, '하나');
  await deletePrompt(db, 'a');
  assert.equal(await getPrompt(db, 'a'), undefined);
}));

test('putImage/getImage keep blob and size', () => withDb(async db => {
  const id = await putImage(db, { blob: blob(), width: 10, height: 20 });
  const img = await getImage(db, id);
  assert.deepEqual([img.width, img.height, img.blob.size, typeof img.createdAt], [10, 20, 3, 'number']);
}));

test('deletePrompt removes its images', () => withDb(async db => {
  const i1 = await putImage(db, { blob: blob(), width: 1, height: 1 });
  await putPrompt(db, promptWith([i1], 'p'));
  await deletePrompt(db, 'p');
  assert.deepEqual(await listImages(db), []);
}));

test('savePromptWithImages removes images dropped from results', () => withDb(async db => {
  const keep = await putImage(db, { blob: blob(), width: 1, height: 1 });
  const drop = await putImage(db, { blob: blob(), width: 1, height: 1 });
  const before = { ...newPrompt(1, 'p'), title: 't', results: [
    { ...newResult('2026-10-26', 'r1'), imageIds: [keep] }, { ...newResult('2026-10-26', 'r2'), imageIds: [drop] }] };
  await savePromptWithImages(db, before, null);
  const after = { ...before, results: [before.results[0]] };
  await savePromptWithImages(db, after, before);
  assert.deepEqual((await listImages(db)).map(i => i.id), [keep]);
}));

test('duplicate saved separately keeps source images', () => withDb(async db => {
  const i1 = await putImage(db, { blob: blob(), width: 1, height: 1 });
  const source = promptWith([i1], 'src');
  await putPrompt(db, source);
  const copy = duplicatePrompt(source, 2, 'copy');
  await savePromptWithImages(db, copy, null);
  await deletePrompt(db, 'copy');
  assert.deepEqual((await listImages(db)).map(i => i.id), [i1]);
}));

test('cleanupOrphanImages removes unlinked only', () => withDb(async db => {
  const linked = await putImage(db, { blob: blob(), width: 1, height: 1 });
  await putImage(db, { blob: blob(), width: 1, height: 1 });
  await putPrompt(db, promptWith([linked], 'p'));
  assert.equal(await cleanupOrphanImages(db), 1);
  assert.deepEqual((await listImages(db)).map(i => i.id), [linked]);
}));

test('meta get/set', () => withDb(async db => {
  assert.equal(await getMeta(db, 'lastBackupAt'), undefined);
  await setMeta(db, 'lastBackupAt', 123);
  assert.equal(await getMeta(db, 'lastBackupAt'), 123);
}));

test('applyImport adds and overwrites, dropping replaced images', () => withDb(async db => {
  const old = await putImage(db, { blob: blob(), width: 1, height: 1 });
  await putPrompt(db, { ...promptWith([old], 'a'), updatedAt: 1 });
  const incomingA = { ...promptWith(['new'], 'a'), updatedAt: 5 };
  const incomingB = { ...newPrompt(1, 'b'), title: 'b' };
  await applyImport(db, { add: [incomingB], overwrite: [incomingA] },
    [{ id: 'new', blob: blob(), width: 2, height: 2, createdAt: 1 }]);
  assert.deepEqual((await listPrompts(db)).map(p => p.id).sort(), ['a', 'b']);
  assert.deepEqual((await listImages(db)).map(i => i.id), ['new']);
}));

test('applyImport is atomic', () => withDb(async db => {
  await putPrompt(db, { ...newPrompt(1, 'a'), title: 'a' });
  const broken = { title: 'no id' };   // keyPath 'id' 없음 → 트랜잭션 실패
  await assert.rejects(applyImport(db, { add: [{ ...newPrompt(1, 'b'), title: 'b' }, broken], overwrite: [] }, []));
  assert.deepEqual((await listPrompts(db)).map(p => p.id), ['a']);
}));

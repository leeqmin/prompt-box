import { test, assert } from './harness.js';
import { exportBackup, readBackupFile, prepareImport, commitImport } from '../js/backup.js';
import { openDb, deleteDatabase, putPrompt, putImage, listPrompts, listImages, getImage, getMeta } from '../js/db.js';
import { newPrompt, newResult } from '../js/model.js';

async function freshDb() {
  const name = 'prompt-box-test-' + Math.random().toString(36).slice(2);
  return { name, db: await openDb(name) };
}
async function drop({ name, db }) {
  db.close();
  await deleteDatabase(name);
}

async function seed(db) {
  const bytes = new Uint8Array([255, 216, 255, 1, 2, 3, 4, 5]);
  const imageId = await putImage(db, { blob: new Blob([bytes], { type: 'image/jpeg' }), width: 8, height: 4 });
  await putPrompt(db, { ...newPrompt(10, 'a'), title: '하나', results: [{ ...newResult('2026-10-27', 'r'), imageIds: [imageId], text: '$x$' }] });
  await putPrompt(db, { ...newPrompt(20, 'b'), title: '둘' });
  return imageId;
}

test('export → wipe → import round trip keeps prompts and photos', async () => {
  const src = await freshDb();
  const imageId = await seed(src.db);
  const { fileName, blob } = await exportBackup(src.db);
  assert.match(fileName, /^prompt-box-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(typeof await getMeta(src.db, 'lastBackupAt'), 'number');
  await drop(src);

  const dst = await freshDb();
  try {
    const obj = await readBackupFile(new File([blob], fileName, { type: 'application/json' }));
    const prepared = await prepareImport(dst.db, obj);
    assert.equal(prepared.ok, true);
    assert.deepEqual(prepared.summary, { add: 2, overwrite: 0, same: 0 });
    await commitImport(dst.db, prepared);
    assert.deepEqual((await listPrompts(dst.db)).map(p => p.title).sort(), ['둘', '하나']);
    const img = await getImage(dst.db, imageId);
    assert.deepEqual([img.width, img.height, img.blob.size, img.blob.type], [8, 4, 8, 'image/jpeg']);
  } finally {
    await drop(dst);
  }
});

test('importing the same backup again reports all unchanged', async () => {
  const s = await freshDb();
  try {
    await seed(s.db);
    const { blob } = await exportBackup(s.db);
    const prepared = await prepareImport(s.db, await readBackupFile(new File([blob], 'b.json')));
    assert.deepEqual(prepared.summary, { add: 0, overwrite: 0, same: 2 });
  } finally {
    await drop(s);
  }
});

test('broken JSON is rejected with a message', async () => {
  await assert.rejects(readBackupFile(new File(['{not json'], 'x.json')), /읽을 수 없습니다/);
});

test('other app file is rejected and DB unchanged', async () => {
  const s = await freshDb();
  try {
    await seed(s.db);
    const prepared = await prepareImport(s.db, { app: 'other', prompts: [] });
    assert.equal(prepared.ok, false);
    assert.equal((await listPrompts(s.db)).length, 2);
    assert.equal((await listImages(s.db)).length, 1);
  } finally {
    await drop(s);
  }
});

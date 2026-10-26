// IndexedDB 저장소: prompts(프롬프트), images(사진 Blob), meta(설정값).
import { imageIdsOf } from './model.js';

const VERSION = 1;

const done = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const finished = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('트랜잭션이 취소되었습니다.'));
});

export function openDb(name = 'prompt-box') {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('NO_INDEXEDDB'));
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(name, VERSION);
    } catch {
      reject(new Error('NO_INDEXEDDB'));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('prompts', { keyPath: 'id' });
      db.createObjectStore('images', { keyPath: 'id' });
      db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error('NO_INDEXEDDB'));
    req.onblocked = () => reject(new Error('NO_INDEXEDDB'));
  });
}

export function deleteDatabase(name) {
  return done(indexedDB.deleteDatabase(name));
}

const store = (db, name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);

export const listPrompts = db => done(store(db, 'prompts').getAll());
export const getPrompt = (db, id) => done(store(db, 'prompts').get(id));
export const listImages = db => done(store(db, 'images').getAll());
export const getImage = (db, id) => done(store(db, 'images').get(id));
export const getMeta = (db, key) => done(store(db, 'meta').get(key));
export const setMeta = (db, key, value) => done(store(db, 'meta', 'readwrite').put(value, key));

export function putPrompt(db, prompt) {
  return done(store(db, 'prompts', 'readwrite').put(prompt));
}

export async function putImage(db, { blob, width, height }) {
  const id = crypto.randomUUID();
  await done(store(db, 'images', 'readwrite').put({ id, blob, width, height, createdAt: Date.now() }));
  return id;
}

export async function deletePrompt(db, id) {
  const prompt = await getPrompt(db, id);
  const tx = db.transaction(['prompts', 'images'], 'readwrite');
  tx.objectStore('prompts').delete(id);
  if (prompt) for (const imageId of imageIdsOf(prompt)) tx.objectStore('images').delete(imageId);
  return finished(tx);
}

/** 프롬프트를 저장하면서, 이전 버전에는 있었지만 지금은 없는 사진을 같이 지운다. */
export function savePromptWithImages(db, prompt, previous) {
  const keep = new Set(imageIdsOf(prompt));
  const tx = db.transaction(['prompts', 'images'], 'readwrite');
  tx.objectStore('prompts').put(prompt);
  if (previous) for (const id of imageIdsOf(previous)) if (!keep.has(id)) tx.objectStore('images').delete(id);
  return finished(tx);
}

export async function cleanupOrphanImages(db) {
  const [prompts, images] = await Promise.all([listPrompts(db), listImages(db)]);
  const used = new Set(prompts.flatMap(imageIdsOf));
  const orphans = images.filter(i => !used.has(i.id));
  if (!orphans.length) return 0;
  const tx = db.transaction('images', 'readwrite');
  for (const i of orphans) tx.objectStore('images').delete(i.id);
  await finished(tx);
  return orphans.length;
}

/** 백업 불러오기: 한 트랜잭션. 덮어쓰는 프롬프트의 이전 사진 중 새 버전에 없는 것은 지운다. */
export async function applyImport(db, { add, overwrite }, images) {
  const previous = await Promise.all(overwrite.map(p => getPrompt(db, p.id)));
  const tx = db.transaction(['prompts', 'images'], 'readwrite');
  const prompts = tx.objectStore('prompts');
  const imageStore = tx.objectStore('images');
  const result = finished(tx);
  try {
    for (const img of images) imageStore.put(img);
    for (const p of [...add, ...overwrite]) prompts.put(p);
    overwrite.forEach((p, i) => {
      const keep = new Set(imageIdsOf(p));
      if (previous[i]) for (const id of imageIdsOf(previous[i])) if (!keep.has(id)) imageStore.delete(id);
    });
  } catch (err) {
    tx.abort();
    await result.catch(() => {});
    throw err;
  }
  return result;
}

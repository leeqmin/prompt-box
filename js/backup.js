// 백업 파일 형식과 합치기 규칙. 이 위쪽은 순수 함수, 파일·DB를 다루는 부분은 아래쪽에 둔다.
import { imageIdsOf } from './model.js';
import { listPrompts, listImages, applyImport, setMeta } from './db.js';

export const BACKUP_APP = 'prompt-box';
export const SCHEMA_VERSION = 1;

const pad = n => String(n).padStart(2, '0');

export function backupFileName(date = new Date()) {
  return `prompt-box-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export function buildBackup(prompts, images, exportedAt = Date.now()) {
  return { app: BACKUP_APP, schemaVersion: SCHEMA_VERSION, exportedAt, prompts, images };
}

export function validateBackup(obj) {
  const bad = error => ({ ok: false, error });
  if (!obj || typeof obj !== 'object' || obj.app !== BACKUP_APP) return bad('이 앱의 백업 파일이 아닙니다.');
  if (typeof obj.schemaVersion !== 'number') return bad('백업 파일의 버전 정보가 없습니다.');
  if (obj.schemaVersion > SCHEMA_VERSION) return bad('새 버전 앱에서 만든 백업입니다. 앱을 새로고침한 뒤 다시 시도해 주세요.');
  if (!Array.isArray(obj.prompts) || !Array.isArray(obj.images)) return bad('백업 파일 내용이 올바르지 않습니다.');
  for (const p of obj.prompts) {
    if (!p || typeof p.id !== 'string' || typeof p.title !== 'string' || typeof p.updatedAt !== 'number') {
      return bad('백업 파일 안의 프롬프트 형식이 올바르지 않습니다.');
    }
  }
  return { ok: true };
}

export function planMerge(localPrompts, incomingPrompts) {
  const local = new Map(localPrompts.map(p => [p.id, p]));
  const plan = { add: [], overwrite: [], same: [] };
  for (const p of incomingPrompts) {
    const mine = local.get(p.id);
    if (!mine) plan.add.push(p);
    else if (p.updatedAt > mine.updatedAt) plan.overwrite.push(p);
    else plan.same.push(p);
  }
  return plan;
}

export function sanitizeIncoming(prompts, images) {
  const available = new Set(images.map(i => i.id));
  const cleaned = prompts.map(p => ({
    ...p,
    results: (p.results || []).map(r => ({ ...r, imageIds: (r.imageIds || []).filter(id => available.has(id)) })),
  }));
  const used = new Set(cleaned.flatMap(imageIdsOf));
  return { prompts: cleaned, images: images.filter(i => used.has(i.id)) };
}

// ---- 파일·DB

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(data, type) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportBackup(db) {
  const [prompts, images] = await Promise.all([listPrompts(db), listImages(db)]);
  const encoded = [];
  for (const img of images) {
    encoded.push({ id: img.id, type: img.blob.type || 'image/jpeg', data: await blobToBase64(img.blob),
      width: img.width, height: img.height, createdAt: img.createdAt });
  }
  const blob = new Blob([JSON.stringify(buildBackup(prompts, encoded))], { type: 'application/json' });
  await setMeta(db, 'lastBackupAt', Date.now());
  return { fileName: backupFileName(), blob };
}

export async function readBackupFile(file) {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다.');
  }
}

export async function prepareImport(db, obj) {
  const check = validateBackup(obj);
  if (!check.ok) return check;
  const { prompts, images } = sanitizeIncoming(obj.prompts, obj.images);
  const plan = planMerge(await listPrompts(db), prompts);
  const keep = new Set([...plan.add, ...plan.overwrite].flatMap(imageIdsOf));
  let decoded;
  try {
    decoded = images.filter(i => keep.has(i.id)).map(i => ({
      id: i.id, blob: base64ToBlob(i.data, i.type || 'image/jpeg'), width: i.width, height: i.height,
      createdAt: i.createdAt || Date.now(),
    }));
  } catch {
    return { ok: false, error: '백업 파일 안의 사진이 손상되었습니다.' };
  }
  return { ok: true, plan, images: decoded,
    summary: { add: plan.add.length, overwrite: plan.overwrite.length, same: plan.same.length } };
}

export function commitImport(db, prepared) {
  return applyImport(db, prepared.plan, prepared.images);
}

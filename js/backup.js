// 백업 파일 형식과 합치기 규칙. 이 위쪽은 순수 함수, 파일·DB를 다루는 부분은 아래쪽에 둔다.
import { imageIdsOf } from './model.js';

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

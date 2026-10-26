// 시작, 해시 라우팅, 화면 전환, 이탈 경고, 백업 안내 띠.
import { openDb, listPrompts, cleanupOrphanImages, getMeta } from './db.js';
import { renderList, loadListState } from './views/list.js';
import { el, setBanner } from './ui.js';

export const APP_VERSION = '1.0.0';
const BACKUP_REMIND_DAYS = 14;

const views = {
  detail: () => import('./views/detail.js'),
  edit: () => import('./views/edit.js'),
  settings: () => import('./views/settings.js'),
};

export const app = {
  db: null,
  prompts: [],
  listState: loadListState(),
  async refresh() {
    this.prompts = await listPrompts(this.db);
    await updateBackupBanner();
  },
};

// ---- 이탈 경고 (수정 화면이 등록)
let leaveGuard = null;
export function registerLeaveGuard(fn) { leaveGuard = fn; }
export function clearLeaveGuard() { leaveGuard = null; }

let currentHash = location.hash || '#/';
let ignoreNextHashChange = false;

function parse(hash) {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) return { view: parts[2] === 'edit' ? 'edit' : 'detail', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'new') return { view: 'edit', id: null };
  if (parts[0] === 'settings') return { view: 'settings' };
  return { view: 'list' };
}

export function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function onHashChange() {
  if (ignoreNextHashChange) {
    ignoreNextHashChange = false;
    return;
  }
  if (leaveGuard && location.hash !== currentHash) {
    const target = location.hash;
    const ok = await leaveGuard();
    if (!ok) {
      ignoreNextHashChange = true;
      location.hash = currentHash;   // 이동 취소: 수정 화면과 입력 내용은 그대로
      return;
    }
    clearLeaveGuard();
    if (location.hash !== target) return;
  }
  route();
}

let routeSeq = 0;
export async function route() {
  const seq = ++routeSeq;
  currentHash = location.hash || '#/';
  const r = parse(currentHash);
  document.body.dataset.view = r.view;
  const list = document.getElementById('list-pane');
  const detail = document.getElementById('detail-pane');
  renderList(list, app, r.id);
  if (r.view === 'list') {
    detail.replaceChildren(el('div', { class: 'placeholder muted', text: '왼쪽에서 프롬프트를 고르거나 새로 만드세요.' }));
    return;
  }
  const module = await views[r.view]();
  if (seq !== routeSeq) return;   // 그 사이 다른 화면으로 이동함
  if (r.view === 'detail') await module.renderDetail(detail, app, r.id);
  else if (r.view === 'edit') await module.renderEdit(detail, app, r.id);
  else await module.renderSettings(detail, app);
  detail.scrollTop = 0;
  if (window.matchMedia('(max-width: 767px)').matches) window.scrollTo(0, 0);
}

export async function updateBackupBanner() {
  const last = await getMeta(app.db, 'lastBackupAt');
  const stale = last ? Date.now() - last > BACKUP_REMIND_DAYS * 86400000 : app.prompts.length > 0;
  setBanner('backup', stale ? { text: '백업한 지 오래됐어요.', actionText: '지금 백업', onAction: () => go('#/settings') } : null);
}

async function start() {
  try {
    app.db = await openDb();
  } catch {
    document.getElementById('layout').replaceChildren(el('div', { class: 'fatal' },
      el('h2', { text: '이 브라우저에서는 저장할 수 없습니다.' }),
      el('p', { text: '사생활 보호(시크릿) 모드이거나 저장이 막혀 있을 수 있습니다. 일반 창의 Chrome, Edge, Safari에서 열어 주세요.' })));
    return;
  }
  await cleanupOrphanImages(app.db);
  await app.refresh();
  window.addEventListener('hashchange', onHashChange);
  await route();
}

start();

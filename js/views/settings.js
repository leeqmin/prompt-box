// 설정 화면: 백업 저장·불러오기, 저장 공간, 앱 버전.
import { exportBackup, readBackupFile, prepareImport, commitImport } from '../backup.js';
import { getMeta } from '../db.js';
import { el, confirmDialog, toast, formatDate } from '../ui.js';
import { APP_VERSION, updateBackupBanner, route } from '../main.js';

const mb = bytes => (bytes / 1024 / 1024).toFixed(1);

export async function renderSettings(container, app) {
  const status = el('p', { class: 'muted' });
  const usage = el('p', { class: 'muted', text: '확인 중…' });
  const message = el('div', { class: 'errors', role: 'alert' });

  async function drawStatus() {
    const last = await getMeta(app.db, 'lastBackupAt');
    status.textContent = last ? `마지막 백업: ${formatDate(last)}` : '아직 백업한 적이 없습니다.';
    if (navigator.storage && navigator.storage.estimate) {
      const { usage: used = 0, quota = 0 } = await navigator.storage.estimate();
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      usage.textContent = `저장 공간 사용량: ${mb(used)} MB / 약 ${mb(quota)} MB${persisted ? ' · 영구 저장' : ''}`;
    } else {
      usage.textContent = '이 브라우저는 사용량을 알려 주지 않습니다.';
    }
  }

  async function save() {
    try {
      const { fileName, blob } = await exportBackup(app.db);
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: fileName });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(`${fileName} 파일로 저장했습니다.`);
      await updateBackupBanner();
      await drawStatus();
    } catch {
      toast('백업 파일을 만들지 못했습니다.');
    }
  }

  async function load(file) {
    message.replaceChildren();
    try {
      const prepared = await prepareImport(app.db, await readBackupFile(file));
      if (!prepared.ok) {
        message.append(el('p', { text: prepared.error }));
        return;
      }
      const { add, overwrite, same } = prepared.summary;
      if (!add && !overwrite) {
        toast(`바뀔 내용이 없습니다. (그대로 ${same}개)`);
        return;
      }
      const ok = await confirmDialog(`새로 ${add}개, 덮어씀 ${overwrite}개, 그대로 ${same}개입니다. 불러올까요?`
        + (overwrite ? ' 덮어쓰는 항목은 백업 파일 쪽이 더 최근에 고친 것입니다.' : ''), { okText: '불러오기' });
      if (!ok) return;
      await commitImport(app.db, prepared);
      await app.refresh();
      toast('불러왔습니다.');
      await route();
    } catch (err) {
      message.append(el('p', { text: (err && err.message) || '불러오지 못했습니다.' }));
    }
  }

  const fileInput = el('input', { type: 'file', accept: '.json,application/json', hidden: true,
    onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await load(f); } });

  container.replaceChildren(
    el('a', { class: 'btn small back-link', href: '#/', text: '← 목록' }),
    el('h2', { text: '설정' }),
    el('h3', { text: '백업' }),
    el('p', { text: '프롬프트와 사진은 이 기기 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 함께 사라지니 가끔 백업 파일로 저장해 두세요. 다른 기기로 옮기거나 다른 사람에게 넘길 때도 이 파일을 씁니다.' }),
    status,
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary', text: '백업 파일로 저장', onclick: save }),
      el('button', { class: 'btn', text: '백업 파일 불러오기', onclick: () => fileInput.click() }), fileInput),
    el('p', { class: 'muted', text: '불러오기는 지금 데이터와 합칩니다. 같은 프롬프트는 더 최근에 고친 쪽이 남습니다.' }),
    message,
    el('h3', { text: '저장 공간' }),
    usage,
    el('h3', { text: '앱 정보' }),
    el('p', { class: 'muted', text: `버전 ${APP_VERSION} · 서버로 아무것도 보내지 않습니다.` }));
  await drawStatus();
}

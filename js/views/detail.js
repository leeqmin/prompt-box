// 상세 화면: 본문 복사, 결과 문항 접기·펴기, 사진 크게 보기, 수정·복제·삭제.
import { duplicatePrompt, ratingCounts } from '../model.js';
import { getPrompt, putPrompt, deletePrompt, getImage } from '../db.js';
import { renderMath } from '../math.js';
import { el, confirmDialog, toast, formatDate, VERDICT_LABEL } from '../ui.js';
import { go } from '../main.js';

let objectUrls = [];
function releaseUrls() {
  objectUrls.forEach(u => URL.revokeObjectURL(u));
  objectUrls = [];
}

export function openImageViewer(url) {
  const dialog = el('dialog', { class: 'viewer', onclick: () => dialog.close() }, el('img', { src: url, alt: '사진 크게 보기' }));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

export async function imageThumbs(db, ids, extra = () => null) {
  const box = el('div', { class: 'thumbs' });
  for (const id of ids) {
    const img = await getImage(db, id);
    if (!img) continue;
    const url = URL.createObjectURL(img.blob);
    objectUrls.push(url);
    box.append(el('div', { class: 'thumb' },
      el('img', { src: url, alt: '결과 사진', loading: 'lazy', onclick: () => openImageViewer(url) }), extra(id)));
  }
  return box;
}

const RATING = { good: '좋음', bad: '나쁨' };
const firstLine = s => (s || '').split('\n')[0].slice(0, 60);

async function copyText(text, fallbackNode) {
  try {
    await navigator.clipboard.writeText(text);
    toast('복사됨');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(fallbackNode);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    toast('직접 복사해 주세요 (선택해 두었습니다)');
  }
}

export async function renderDetail(container, app, id) {
  releaseUrls();
  const prompt = await getPrompt(app.db, id);
  if (!prompt) {
    container.replaceChildren(el('div', { class: 'empty' }, el('p', { text: '프롬프트를 찾을 수 없습니다.' }),
      el('a', { class: 'btn', href: '#/', text: '목록으로' })));
    return;
  }

  let sourceLink = null;
  if (prompt.sourceId) {
    const source = await getPrompt(app.db, prompt.sourceId);
    sourceLink = el('p', { class: 'muted' }, source
      ? el('a', { href: `#/p/${source.id}`, text: `「${source.title}」에서 복제` })
      : '원본 삭제됨 (복제본)');
  }

  const bodyBox = el('div', { class: 'body-box', text: prompt.body || '(본문 없음)' });
  const counts = ratingCounts(prompt);

  const results = [];
  for (const [i, r] of prompt.results.entries()) {
    const text = el('div');
    renderMath(text, r.text || '(문항 텍스트 없음)');
    results.push(el('details', { class: 'result' },
      el('summary', {},
        el('strong', { text: `결과 ${i + 1}` }),
        r.rating ? el('span', { class: `verdict v-${r.rating}`, text: RATING[r.rating] }) : null,
        el('span', { class: 'muted', text: [r.date, firstLine(r.reason)].filter(Boolean).join(' · ') })),
      el('div', { class: 'result-body stack' },
        text,
        r.imageIds.length ? await imageThumbs(app.db, r.imageIds) : null,
        r.reason ? el('div', {}, el('label', { text: '이유' }), el('div', { class: 'math-text', text: r.reason })) : null,
        r.note ? el('div', {}, el('label', { text: '메모' }), el('div', { class: 'math-text', text: r.note })) : null)));
  }

  // replaceChildren은 null을 "null" 글자로 넣으므로, 비어 있는 부분은 걸러서 넘긴다
  container.replaceChildren(...[
    el('a', { class: 'btn small back-link', href: '#/', text: '← 목록' }),
    el('h2', { text: prompt.title }),
    el('div', { class: 'meta-line' },
      el('span', { class: `verdict v-${prompt.verdict}`, text: VERDICT_LABEL[prompt.verdict] }),
      el('span', { class: 'muted', text: prompt.detail ? `자세함 ${prompt.detail}` : '자세함 -' }),
      el('span', { class: 'muted', text: [prompt.subject, prompt.unit, prompt.format].filter(Boolean).join(' · ') }),
      el('span', { class: 'muted', text: `고친 날 ${formatDate(prompt.updatedAt)}` })),
    prompt.tags.length ? el('div', { class: 'tags' }, prompt.tags.map(t => el('span', { class: 'tag', text: '#' + t }))) : null,
    sourceLink,
    prompt.memo ? el('div', {}, el('label', { text: '메모' }), el('div', { class: 'math-text', text: prompt.memo })) : null,
    el('div', { class: 'row' }, el('h3', { text: '프롬프트 본문' }),
      el('button', { class: 'btn small', text: '복사', onclick: () => copyText(prompt.body, bodyBox) })),
    bodyBox,
    el('h3', { text: `결과 문항 (${prompt.results.length}/3) · 좋음 ${counts.good} · 나쁨 ${counts.bad}` }),
    results.length ? el('div', { class: 'results' }, results)
      : el('p', { class: 'muted', text: '아직 결과 문항이 없습니다. 「수정」에서 추가하세요.' }),
    el('div', { class: 'actions' },
      el('a', { class: 'btn primary', href: `#/p/${prompt.id}/edit`, text: '수정' }),
      el('button', { class: 'btn', text: '복제해서 새 버전으로', onclick: async () => {
        const copy = duplicatePrompt(prompt);
        await putPrompt(app.db, copy);
        await app.refresh();
        toast(`「${copy.title}」을(를) 만들었습니다.`);
        go(`#/p/${copy.id}`);
      } }),
      el('button', { class: 'btn danger', text: '삭제', onclick: async () => {
        if (!await confirmDialog(`「${prompt.title}」을(를) 삭제할까요? 결과 문항과 사진도 함께 지워집니다.`, { okText: '삭제', danger: true })) return;
        await deletePrompt(app.db, prompt.id);
        await app.refresh();
        toast('삭제했습니다.');
        go('#/');
      } })),
  ].filter(Boolean));
}

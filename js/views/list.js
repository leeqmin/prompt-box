// 목록 화면: 탭(전체/좋은/나쁜), 검색, 필터, 정렬, 카드.
import { filterPrompts, sortPrompts, ratingCounts, distinctValues } from '../model.js';
import { el, formatDate, VERDICT_LABEL } from '../ui.js';

const KEY = 'prompt-box:list';
const DEFAULT = { tab: 'all', query: '', subject: '', tag: '', detail: null, sort: 'updated' };

export function loadListState() {
  try {
    return { ...DEFAULT, ...JSON.parse(sessionStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULT };
  }
}

function saveListState(state) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* 저장 못 해도 목록은 동작 */ }
}

const TABS = [['all', '전체'], ['good', '좋은 프롬프트'], ['bad', '나쁜 프롬프트']];
const SORTS = [['updated', '최근 수정순'], ['detail', '자세함 높은순'], ['good', '결과 좋음 많은순']];

export function renderList(container, app, selectedId) {
  const state = app.listState;
  const update = patch => {
    Object.assign(state, patch);
    saveListState(state);
    renderList(container, app, selectedId);
  };
  // 검색창은 다시 만들지 않는다: 입력 중에 요소를 바꾸면 한글 조합이 끊긴다. 결과 부분만 다시 그린다.
  let composing = false;
  const search = el('input', { type: 'search', placeholder: '검색 (제목·본문·메모·태그·결과)', value: state.query,
    oninput: e => { if (!composing) applyQuery(e.target.value); },
    oncompositionstart: () => { composing = true; },
    oncompositionend: e => { composing = false; applyQuery(e.target.value); } });
  const resultsArea = el('div');
  function applyQuery(query) {
    state.query = query;
    saveListState(state);
    drawResults();
  }

  const select = (value, options, onchange, label) => el('select', { 'aria-label': label, onchange: e => onchange(e.target.value) },
    options.map(([v, text]) => el('option', { value: v, text, selected: String(v) === String(value ?? '') })));

  const controls = el('div', { class: 'list-controls' },
    el('div', { class: 'tabs', role: 'tablist' }, TABS.map(([tab, text]) => el('button', {
      class: tab === state.tab ? 'tab active' : 'tab', role: 'tab', 'aria-selected': String(tab === state.tab), text,
      onclick: () => update({ tab }),
    }))),
    search,
    el('div', { class: 'row wrap' },
      select(state.subject, [['', '과목 전체'], ...distinctValues(app.prompts, 'subject').map(v => [v, v])],
        v => update({ subject: v }), '과목'),
      select(state.tag, [['', '태그 전체'], ...distinctValues(app.prompts, 'tags').map(v => [v, '#' + v])],
        v => update({ tag: v }), '태그'),
      select(state.detail ?? '', [['', '자세함 전체'], ...[1, 2, 3, 4, 5].map(n => [n, `자세함 ${n}`])],
        v => update({ detail: v === '' ? null : Number(v) }), '자세함'),
      select(state.sort, SORTS, v => update({ sort: v }), '정렬')));

  function drawResults() {
    const shown = sortPrompts(filterPrompts(app.prompts, state), state.sort);
    let body;
    if (!app.prompts.length) {
      body = el('div', { class: 'empty' }, el('p', { text: '아직 프롬프트가 없습니다.' }),
        el('a', { class: 'btn primary', href: '#/new', text: '새 프롬프트' }));
    } else if (!shown.length) {
      body = el('div', { class: 'empty' }, el('p', { text: '조건에 맞는 프롬프트가 없습니다.' }));
    } else {
      body = el('ul', { class: 'cards' }, shown.map(p => card(p, p.id === selectedId)));
    }
    resultsArea.replaceChildren(el('p', { class: 'muted count', text: `${shown.length}개` }), body);
  }

  drawResults();
  container.replaceChildren(controls, resultsArea);
}

function card(p, selected) {
  const counts = ratingCounts(p);
  return el('li', {}, el('a', { class: selected ? 'card selected' : 'card', href: `#/p/${p.id}` },
    el('div', { class: 'card-title' }, el('span', { class: `verdict v-${p.verdict}`, text: VERDICT_LABEL[p.verdict] }),
      el('strong', { text: p.title || '(제목 없음)' })),
    el('div', { class: 'muted', text: [p.subject, p.unit, p.format].filter(Boolean).join(' · ') }),
    p.tags.length ? el('div', { class: 'tags' }, p.tags.map(t => el('span', { class: 'tag', text: '#' + t }))) : null,
    el('div', { class: 'card-meta' },
      el('span', { text: p.detail ? `자세함 ${p.detail}` : '자세함 -' }),
      el('span', { text: `좋음 ${counts.good} · 나쁨 ${counts.bad}` }),
      el('span', { text: formatDate(p.updatedAt) }))));
}

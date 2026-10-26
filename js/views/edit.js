// 수정 화면: 새 프롬프트 만들기와 고치기. 결과 문항 최대 3개, 사진 붙여넣기·선택·끌어다 놓기, 수식 미리보기.
import { newPrompt, newResult, canAddResult, validatePrompt, distinctValues, MAX_RESULTS } from '../model.js';
import { getPrompt, savePromptWithImages, putImage, cleanupOrphanImages, getMeta, setMeta } from '../db.js';
import { imageFilesFromClipboard, imageFilesFromList, processFiles } from '../images.js';
import { renderMath } from '../math.js';
import { el, confirmDialog, toast, setBanner, VERDICT_LABEL } from '../ui.js';
import { imageThumbs } from './detail.js';
import { go, registerLeaveGuard, clearLeaveGuard } from '../main.js';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** 버튼 여러 개 중 하나 고르기. options = [[value, label], ...] */
function choice(options, current, onPick, label) {
  const group = el('div', { class: 'choice', role: 'group', 'aria-label': label });
  const draw = value => group.replaceChildren(...options.map(([v, text]) => el('button', {
    type: 'button', class: v === value ? 'btn on' : 'btn', 'aria-pressed': String(v === value), text,
    onclick: () => { onPick(v); draw(v); },
  })));
  draw(current);
  return group;
}

function isQuotaError(err) {
  return err && (err.name === 'QuotaExceededError' || /quota/i.test(String(err.message)));
}

function storageFull() {
  setBanner('storage', { text: '저장 공간이 부족합니다. 백업 후 사진을 정리해 주세요.', actionText: '설정', onAction: () => go('#/settings') });
}

export async function renderEdit(container, app, id) {
  const previous = id ? await getPrompt(app.db, id) : null;
  if (id && !previous) {
    container.replaceChildren(el('div', { class: 'empty' }, el('p', { text: '프롬프트를 찾을 수 없습니다.' }),
      el('a', { class: 'btn', href: '#/', text: '목록으로' })));
    return;
  }
  const draft = previous ? structuredClone(previous) : newPrompt();
  let dirty = false;

  const onBeforeUnload = e => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  };
  const release = () => {
    dirty = false;
    clearLeaveGuard();
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
  const touch = () => {
    if (dirty) return;
    dirty = true;
    window.addEventListener('beforeunload', onBeforeUnload);
  };
  registerLeaveGuard(async () => {
    if (!dirty) return true;
    const ok = await confirmDialog('저장하지 않은 내용이 있습니다. 나갈까요?', { okText: '나가기', cancelText: '계속 수정' });
    if (ok) {
      release();
      cleanupOrphanImages(app.db).catch(() => {});   // 이번 편집에서 넣고 저장하지 않은 사진 정리
    }
    return ok;
  });

  const field = (labelText, input) => el('div', {}, el('label', { text: labelText }), input);
  const listId = name => `dl-${name}`;
  const datalist = name => el('datalist', { id: listId(name) },
    distinctValues(app.prompts, name).map(v => el('option', { value: v })));
  const textInput = (key, attrs = {}) => el('input', {
    type: 'text', value: draft[key], ...attrs,
    oninput: e => { draft[key] = e.target.value; touch(); },
  });
  const area = (key, attrs = {}) => {
    const t = el('textarea', { ...attrs, oninput: e => { draft[key] = e.target.value; touch(); } });
    t.value = draft[key];
    return t;
  };

  const errors = el('div', { class: 'errors', role: 'alert' });
  const resultsBox = el('div', { class: 'stack' });
  const addButton = el('button', { type: 'button', class: 'btn', text: '결과 추가', onclick: () => {
    if (!canAddResult(draft)) return;
    draft.results.push(newResult(today()));
    touch();
    drawResults();
  } });

  async function addImages(result, files, redraw) {
    if (!files.length) return;
    try {
      const { ids, skipped } = await processFiles(files, img => putImage(app.db, img));
      if (ids.length) {
        result.imageIds.push(...ids);
        touch();
        await redraw();
      }
      if (skipped.length) toast(`${skipped.join(', ')}은(는) 열 수 없는 사진이라 건너뛰었습니다.`);
    } catch (err) {
      if (isQuotaError(err)) storageFull();
      else toast('사진을 저장하지 못했습니다.');
    }
  }

  function resultEditor(result, index) {
    const preview = el('div', { class: 'preview muted' });
    const updatePreview = debounce(() => {
      preview.classList.toggle('muted', !result.text);
      renderMath(preview, result.text || '수식 미리보기');
    }, 300);
    renderMath(preview, result.text || '수식 미리보기');
    preview.classList.toggle('muted', !result.text);

    const text = el('textarea', { placeholder: '문항 텍스트 ($수식$ 사용 가능, 사진은 Ctrl+V로 붙여넣기)',
      oninput: e => { result.text = e.target.value; touch(); updatePreview(); } });
    text.value = result.text;

    const photos = el('div');
    const drawPhotos = async () => {
      photos.replaceChildren(await imageThumbs(app.db, result.imageIds, imageId => el('button', {
        type: 'button', class: 'btn', title: '사진 삭제', 'aria-label': '사진 삭제', text: '✕',
        onclick: async () => {
          result.imageIds = result.imageIds.filter(x => x !== imageId);
          touch();
          await drawPhotos();
        },
      })));
    };
    drawPhotos();

    const fileInput = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true,
      onchange: async e => { await addImages(result, imageFilesFromList(e.target.files), drawPhotos); e.target.value = ''; } });
    const drop = el('div', { class: 'dropzone' }, '사진을 여기로 끌어다 놓거나 ',
      el('button', { type: 'button', class: 'btn small', text: '사진 선택', onclick: () => fileInput.click() }), fileInput);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', async e => {
      e.preventDefault();
      drop.classList.remove('over');
      await addImages(result, imageFilesFromList(e.dataTransfer.files), drawPhotos);
    });

    const reason = el('textarea', { placeholder: '좋았던 점·나빴던 점', oninput: e => { result.reason = e.target.value; touch(); } });
    reason.value = result.reason;

    const card = el('section', { class: 'result result-edit', 'aria-label': `결과 ${index + 1}` },
      el('div', { class: 'result-body stack' },
        el('div', { class: 'row', style: 'justify-content: space-between' }, el('strong', { text: `결과 ${index + 1}` }),
          el('button', { type: 'button', class: 'btn small danger', text: '이 결과 삭제', onclick: async () => {
            if (!await confirmDialog(`결과 ${index + 1}을(를) 삭제할까요? 저장하면 사진도 함께 지워집니다.`, { okText: '삭제', danger: true })) return;
            draft.results.splice(index, 1);
            touch();
            drawResults();
          } })),
        field('문항', text), preview, photos, drop,
        field('평가', choice([['good', '좋음'], ['bad', '나쁨'], [null, '없음']], result.rating, v => { result.rating = v; touch(); }, '평가')),
        field('이유', reason),
        el('div', { class: 'row wrap' },
          el('div', { style: 'flex: 1 1 140px' }, field('날짜', el('input', { type: 'date', value: result.date,
            oninput: e => { result.date = e.target.value; touch(); } }))),
          el('div', { style: 'flex: 2 1 200px' }, field('문항 ID·메모', el('input', { type: 'text', value: result.note,
            oninput: e => { result.note = e.target.value; touch(); } }))))));
    // 이미지가 든 붙여넣기만 가로챈다. 글자만 있으면 평소처럼 입력된다.
    card.addEventListener('paste', async e => {
      const files = imageFilesFromClipboard(e);
      if (!files.length) return;
      e.preventDefault();
      await addImages(result, files, drawPhotos);
    });
    return card;
  }

  function drawResults() {
    resultsBox.replaceChildren(...draft.results.map(resultEditor));
    addButton.hidden = !canAddResult(draft);
    countLabel.textContent = `결과 문항 (${draft.results.length}/${MAX_RESULTS})`;
  }
  const countLabel = el('h3');

  async function save() {
    const tags = tagsInput.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
    draft.tags = [...new Set(tags)];
    draft.title = draft.title.trim();
    const problems = validatePrompt(draft);
    errors.replaceChildren(...problems.map(p => el('p', { text: p })));
    if (problems.length) {
      errors.scrollIntoView({ block: 'center' });
      return;
    }
    draft.updatedAt = Date.now();
    try {
      await savePromptWithImages(app.db, draft, previous);
    } catch (err) {
      if (isQuotaError(err)) storageFull();
      else toast('저장하지 못했습니다. 다시 시도해 주세요.');
      return;
    }
    setBanner('storage', null);
    release();
    cleanupOrphanImages(app.db).catch(() => {});
    if (!await getMeta(app.db, 'persistRequested')) {
      await setMeta(app.db, 'persistRequested', true);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    }
    await app.refresh();
    toast('저장했습니다.');
    go(`#/p/${draft.id}`);
  }

  const tagsInput = el('input', { type: 'text', value: draft.tags.join(', '), placeholder: '쉼표로 구분 (예: 그래프, 교점)', oninput: touch });

  drawResults();
  container.replaceChildren(
    el('a', { class: 'btn small back-link', href: previous ? `#/p/${draft.id}` : '#/', text: '← 돌아가기' }),
    el('h2', { text: previous ? '프롬프트 수정' : '새 프롬프트' }),
    errors,
    field('제목 (필수)', textInput('title', { required: true, placeholder: '예: 정적분 함수 만들어보기' })),
    el('div', { class: 'row wrap' },
      el('div', { style: 'flex: 1 1 140px' }, field('과목', textInput('subject', { list: listId('subject') }))),
      el('div', { style: 'flex: 1 1 140px' }, field('단원', textInput('unit', { list: listId('unit') }))),
      el('div', { style: 'flex: 1 1 140px' }, field('형식', textInput('format', { list: listId('format'), placeholder: '예: A형, B형' })))),
    datalist('subject'), datalist('unit'), datalist('format'),
    field('태그', tagsInput),
    field('판정', choice(['good', 'bad', 'undecided'].map(v => [v, VERDICT_LABEL[v]]), draft.verdict, v => { draft.verdict = v; touch(); }, '판정')),
    field('자세함 (1 대략적인 지시 ~ 5 아주 구체적인 지시)',
      choice([[null, '없음'], ...[1, 2, 3, 4, 5].map(n => [n, String(n)])], draft.detail, v => { draft.detail = v; touch(); }, '자세함')),
    field('프롬프트 본문', area('body', { rows: 10 })),
    field('메모', area('memo', { rows: 3, placeholder: '언제 쓰면 좋은지 등' })),
    countLabel, resultsBox, addButton,
    el('div', { class: 'actions sticky-actions' },
      el('button', { type: 'button', class: 'btn primary', text: '저장', onclick: save }),
      el('button', { type: 'button', class: 'btn', text: '취소', onclick: () => go(previous ? `#/p/${draft.id}` : '#/') })));
}

// 공통 화면 요소: DOM 헬퍼, 확인 창, 토스트, 상단 안내 띠.

/** el('button', {class: 'btn', onclick: fn, text: '저장'}, child...) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

export function confirmDialog(message, { okText = '확인', cancelText = '취소', danger = false } = {}) {
  return new Promise(resolve => {
    const dialog = el('dialog', { class: 'confirm' },
      el('p', { text: message }),
      el('div', { class: 'row end' },
        el('button', { class: 'btn', value: 'cancel', text: cancelText, onclick: () => dialog.close('cancel') }),
        el('button', { class: danger ? 'btn danger' : 'btn primary', text: okText, onclick: () => dialog.close('ok') })));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'ok');
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

let toastTimer = null;
export function toast(message) {
  const box = document.getElementById('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 2800);
}

/** 상단 띠. content = {text, actionText, onAction} 또는 null(숨김). */
export function setBanner(key, content) {
  const area = document.getElementById('banners');
  const old = area.querySelector(`[data-banner="${key}"]`);
  if (old) old.remove();
  if (!content) return;
  area.append(el('div', { class: `banner banner-${key}`, dataset: { banner: key } },
    el('span', { text: content.text }),
    content.actionText ? el('button', { class: 'btn small', text: content.actionText, onclick: content.onAction }) : null));
}

export function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export const VERDICT_LABEL = { good: '좋음', bad: '나쁨', undecided: '미정' };

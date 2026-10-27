import { test, assert } from './harness.js';
import { renderList } from '../js/views/list.js';
import { newPrompt } from '../js/model.js';

function fakeApp() {
  return {
    prompts: [
      { ...newPrompt(1, 'a'), title: '지수 그래프', updatedAt: 2 },
      { ...newPrompt(1, 'b'), title: '수열 합', updatedAt: 1 },
    ],
    listState: { tab: 'all', query: '', subject: '', tag: '', detail: null, sort: 'updated' },
  };
}

const titles = box => [...box.querySelectorAll('.card strong')].map(s => s.textContent);

test('typing in search keeps the same input element (Korean IME composition is not interrupted)', () => {
  const box = document.createElement('div');
  document.body.append(box);
  try {
    renderList(box, fakeApp(), null);
    const input = box.querySelector('input[type=search]');
    input.value = '수열';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert.ok(box.querySelector('input[type=search]') === input, 'search input must not be replaced while typing');
    assert.deepEqual(titles(box), ['수열 합']);
  } finally {
    box.remove();
  }
});

test('search is not applied mid-composition, then applied on compositionend', () => {
  const box = document.createElement('div');
  document.body.append(box);
  try {
    renderList(box, fakeApp(), null);
    const input = box.querySelector('input[type=search]');
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = '숫';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    assert.deepEqual(titles(box), ['지수 그래프', '수열 합'], 'list untouched while composing');
    input.value = '수열';
    input.dispatchEvent(new CompositionEvent('compositionend'));
    assert.deepEqual(titles(box), ['수열 합']);
  } finally {
    box.remove();
  }
});

import { test, assert } from './harness.js';
import { katexReady, renderMath } from '../js/math.js';

test('renders inline fraction with KaTeX', async () => {
  await katexReady();
  const el = document.createElement('div');
  renderMath(el, '값은 $\\frac{64}{3}$이다');
  assert.ok(el.querySelector('.katex'), 'katex element');
  const frac = el.querySelector('.mfrac');
  assert.ok(frac, 'fraction element');
  assert.ok(el.textContent.startsWith('값은'), 'plain text kept');
});

test('renders display math and \\( \\) delimiters', async () => {
  await katexReady();
  const el = document.createElement('div');
  renderMath(el, '$$x^2$$ 그리고 \\(y\\) 와 \\[z\\]');
  assert.equal(el.querySelectorAll('.katex-display').length, 2);
  assert.equal(el.querySelectorAll('.katex').length, 3);
});

test('broken math does not throw and keeps source visible', async () => {
  await katexReady();
  const el = document.createElement('div');
  renderMath(el, '틀린 수식 $\\frac{1}{$ 끝');
  assert.ok(el.textContent.includes('끝'));
});

test('plain text with newlines stays as text', async () => {
  await katexReady();
  const el = document.createElement('div');
  renderMath(el, '첫 줄\n둘째 줄 <b>태그아님</b>');
  assert.equal(el.querySelector('b'), null, 'no HTML injection');
  assert.ok(el.textContent.includes('첫 줄\n둘째 줄'));
});

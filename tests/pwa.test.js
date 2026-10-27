import { test, assert } from './harness.js';
import { APP_VERSION } from '../js/version.js';

const swText = () => fetch('../sw.js').then(r => r.text());

function assetsOf(text) {
  const block = /const ASSETS = \[([\s\S]*?)\];/.exec(text);
  return block ? [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]) : [];
}

test('service worker VERSION matches APP_VERSION', async () => {
  const found = /const VERSION = '([^']+)'/.exec(await swText());
  assert.ok(found, 'VERSION in sw.js');
  assert.equal(found[1], APP_VERSION);
});

test('every cached asset exists', async () => {
  const assets = assetsOf(await swText());
  assert.ok(assets.length > 20, `asset list looks complete (${assets.length})`);
  for (const a of assets) {
    const res = await fetch(new URL(a, new URL('../', location.href)), { cache: 'no-store' });
    assert.equal(res.status, 200, a);
  }
});

test('all app modules and KaTeX fonts are cached', async () => {
  const assets = new Set(assetsOf(await swText()));
  for (const must of ['./', './index.html', './js/main.js', './js/version.js', './js/views/edit.js', './js/views/settings.js',
    './vendor/katex/katex.min.js', './vendor/katex/contrib/auto-render.min.js', './vendor/katex/fonts/KaTeX_Main-Regular.woff2',
    './manifest.webmanifest', './icons/icon-192.png']) {
    assert.ok(assets.has(must), must);
  }
});

test('manifest is installable', async () => {
  const m = await fetch('../manifest.webmanifest').then(r => r.json());
  assert.deepEqual([m.name, m.short_name, m.start_url, m.scope, m.display], ['문항 프롬프트 저장소', '프롬프트 저장소', './', './', 'standalone']);
  const sizes = m.icons.map(i => i.sizes + (i.purpose ? ' ' + i.purpose : ''));
  assert.deepEqual(sizes, ['192x192', '512x512', '512x512 maskable']);
});

test('no external URLs are loaded by app code', async () => {
  for (const f of ['../index.html', '../js/main.js', '../js/math.js', '../sw.js', '../manifest.webmanifest']) {
    const text = await fetch(f).then(r => r.text());
    assert.equal(/https?:\/\//.test(text), false, `${f} has no absolute URL`);
  }
});

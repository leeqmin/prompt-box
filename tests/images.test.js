import { test, assert } from './harness.js';
import {
  MAX_EDGE, JPEG_QUALITY, fitSize, toJpeg, imageFilesFromClipboard, imageFilesFromList, processFiles,
} from '../js/images.js';

function pngOfSize(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3366cc';
  ctx.fillRect(0, 0, width, height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

test('constants', () => {
  assert.equal(MAX_EDGE, 1600);
  assert.equal(JPEG_QUALITY, 0.85);
});

test('fitSize', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitSize(1000, 3000), { width: 533, height: 1600 });
});

test('toJpeg shrinks a 4000x3000 picture to 1600x1200 jpeg', async () => {
  const out = await toJpeg(await pngOfSize(4000, 3000));
  assert.deepEqual([out.width, out.height, out.blob.type], [1600, 1200, 'image/jpeg']);
});

test('toJpeg keeps small size', async () => {
  const out = await toJpeg(await pngOfSize(300, 200));
  assert.deepEqual([out.width, out.height, out.blob.type], [300, 200, 'image/jpeg']);
});

test('toJpeg rejects undecodable data', async () => {
  await assert.rejects(toJpeg(new Blob(['x'], { type: 'image/heic' })), /UNSUPPORTED_IMAGE/);
});

test('processFiles skips undecodable files and saves the rest', async () => {
  const good = new File([await pngOfSize(20, 10)], 'ok.png', { type: 'image/png' });
  const bad = new File(['x'], 'photo.heic', { type: 'image/heic' });
  const saved = [];
  const result = await processFiles([bad, good], async img => { saved.push(img); return 'id' + saved.length; });
  assert.deepEqual(result, { ids: ['id1'], skipped: ['photo.heic'] });
  assert.equal(saved[0].width, 20);
});

test('clipboard with text only yields no images (text paste untouched)', () => {
  const dt = new DataTransfer();
  dt.setData('text/plain', '그냥 글자');
  assert.deepEqual(imageFilesFromClipboard(new ClipboardEvent('paste', { clipboardData: dt })), []);
});

test('clipboard image is picked up', async () => {
  const dt = new DataTransfer();
  dt.items.add(new File([await pngOfSize(5, 5)], 'shot.png', { type: 'image/png' }));
  const files = imageFilesFromClipboard(new ClipboardEvent('paste', { clipboardData: dt }));
  assert.equal(files.length, 1);
});

test('imageFilesFromList keeps images, uses extension when type is empty', () => {
  const list = [new File(['a'], 'a.txt', { type: 'text/plain' }), new File(['b'], 'b.jpg', { type: '' }),
    new File(['c'], 'c.png', { type: 'image/png' })];
  assert.deepEqual(imageFilesFromList(list).map(f => f.name), ['b.jpg', 'c.png']);
});

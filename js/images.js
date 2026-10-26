// 사진 입력(붙여넣기·파일·끌어다 놓기)과 저장 전 축소·JPEG 변환.

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.85;

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i;

export function fitSize(w, h, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function decode(blob) {
  try {
    return await createImageBitmap(blob);
  } catch {
    // 일부 브라우저는 createImageBitmap이 지원하지 않는 형식도 <img>로는 연다
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error('UNSUPPORTED_IMAGE');
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function toJpeg(blob) {
  const source = await decode(blob);
  const { width, height } = fitSize(source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';   // 투명 배경 PNG가 JPEG에서 검게 나오지 않게
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();
  const out = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!out) throw new Error('UNSUPPORTED_IMAGE');
  return { blob: out, width, height };
}

const isImage = file => (file.type ? file.type.startsWith('image/') : IMAGE_EXT.test(file.name || ''));

export function imageFilesFromClipboard(event) {
  const items = event.clipboardData ? [...event.clipboardData.items] : [];
  return items.filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
}

export function imageFilesFromList(fileList) {
  return [...(fileList || [])].filter(isImage);
}

export async function processFiles(files, saveFn) {
  const ids = [];
  const skipped = [];
  for (const file of files) {
    try {
      ids.push(await saveFn(await toJpeg(file)));
    } catch (err) {
      if (err && err.message !== 'UNSUPPORTED_IMAGE') throw err;   // 저장 실패(용량 등)는 호출부가 처리
      skipped.push(file.name || '사진');
    }
  }
  return { ids, skipped };
}

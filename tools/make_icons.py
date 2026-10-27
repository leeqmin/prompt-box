"""앱 아이콘 생성(개발용, 한 번만 실행): python tools/make_icons.py → icons/*.png
외부 이미지 없이 캔버스로 그린다. 필요: Python playwright, 설치된 Chrome."""
import base64
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "icons"

DRAW = """([size, maskable]) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = '#2f5d8a';
  if (maskable) x.fillRect(0, 0, size, size);
  else { const r = size * 0.2; x.beginPath(); x.roundRect(0, 0, size, size, r); x.fill(); }
  x.fillStyle = '#ffffff';
  x.font = `bold ${Math.round(size * (maskable ? 0.42 : 0.56))}px "Segoe UI", Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('P', size / 2, size * 0.54);
  return c.toDataURL('image/png');
}"""


def main() -> None:
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page()
        for name, size, maskable in [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("maskable-512.png", 512, True)]:
            data = page.evaluate(DRAW, [size, maskable])
            (OUT / name).write_bytes(base64.b64decode(data.split(",", 1)[1]))
            print("wrote", name)
        browser.close()


if __name__ == "__main__":
    main()

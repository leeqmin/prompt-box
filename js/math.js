// KaTeX 수식 표시. KaTeX는 모듈이 아닌 스크립트라 처음 한 번 <script>로 불러온다(저장소 안 파일).
const base = new URL('../vendor/katex/', import.meta.url);
let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('수식 표시 도구를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
}

export function katexReady() {
  if (!loading) {
    if (!document.querySelector('link[data-katex]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('katex.min.css', base).href;
      link.dataset.katex = '';
      document.head.appendChild(link);
    }
    loading = (window.katex ? Promise.resolve() : loadScript(new URL('katex.min.js', base).href))
      .then(() => (window.renderMathInElement ? null : loadScript(new URL('contrib/auto-render.min.js', base).href)));
  }
  return loading;
}

const OPTIONS = {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '$', right: '$', display: false },
    { left: '\\(', right: '\\)', display: false },
  ],
  throwOnError: false,
  errorColor: '#cc0000',
};

/** 텍스트를 그대로 넣고(HTML 해석 없음) 수식 구간만 KaTeX로 바꾼다. KaTeX가 아직 없으면 글자만 보인다. */
export function renderMath(element, text) {
  element.textContent = text || '';
  element.classList.add('math-text');
  if (window.renderMathInElement) window.renderMathInElement(element, OPTIONS);
  else katexReady().then(() => window.renderMathInElement(element, OPTIONS)).catch(() => {});
}

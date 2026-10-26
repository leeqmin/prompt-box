// 프롬프트·결과 문항 데이터 다루기. DOM·저장소와 무관한 순수 함수만 둔다.

export const MAX_RESULTS = 3;

const uuid = () => crypto.randomUUID();

export function newPrompt(now = Date.now(), id = uuid()) {
  return {
    id, title: '', subject: '', unit: '', format: '', tags: [], detail: null, verdict: 'undecided',
    body: '', memo: '', results: [], sourceId: null, createdAt: now, updatedAt: now,
  };
}

export function newResult(today, id = uuid()) {
  return { id, text: '', imageIds: [], rating: null, reason: '', date: today, note: '' };
}

export function canAddResult(prompt) {
  return prompt.results.length < MAX_RESULTS;
}

export function nextVersionTitle(title) {
  const found = /^(.*) \(v(\d+)\)$/.exec(title);
  return found ? `${found[1]} (v${Number(found[2]) + 1})` : `${title} (v2)`;
}

export function duplicatePrompt(prompt, now = Date.now(), id = uuid()) {
  return {
    ...prompt, id, title: nextVersionTitle(prompt.title), tags: [...prompt.tags], results: [],
    verdict: 'undecided', sourceId: prompt.id, createdAt: now, updatedAt: now,
  };
}

export function validatePrompt(prompt) {
  const errors = [];
  if (!prompt.title.trim()) errors.push('제목을 입력해 주세요.');
  if (prompt.results.length > MAX_RESULTS) errors.push(`결과 문항은 최대 ${MAX_RESULTS}개입니다.`);
  if (prompt.detail !== null && !(Number.isInteger(prompt.detail) && prompt.detail >= 1 && prompt.detail <= 5)) {
    errors.push('자세함은 1~5 사이여야 합니다.');
  }
  return errors;
}

export function ratingCounts(prompt) {
  const counts = { good: 0, bad: 0 };
  for (const r of prompt.results) if (r.rating in counts) counts[r.rating]++;
  return counts;
}

const lower = s => (s || '').toLocaleLowerCase('ko');

function searchableText(prompt) {
  return [prompt.title, prompt.body, prompt.memo, ...prompt.tags,
    ...prompt.results.flatMap(r => [r.text, r.reason])].map(lower).join('\n');
}

export function filterPrompts(prompts, { tab = 'all', query = '', subject = '', tag = '', detail = null } = {}) {
  const q = lower(query.trim());
  return prompts.filter(p =>
    (tab === 'all' || p.verdict === tab)
    && (!subject || p.subject === subject)
    && (!tag || p.tags.includes(tag))
    && (detail === null || p.detail === detail)
    && (!q || searchableText(p).includes(q)));
}

const SORTS = {
  updated: (a, b) => b.updatedAt - a.updatedAt,
  detail: (a, b) => (b.detail ?? 0) - (a.detail ?? 0) || b.updatedAt - a.updatedAt,
  good: (a, b) => ratingCounts(b).good - ratingCounts(a).good || b.updatedAt - a.updatedAt,
};

export function sortPrompts(prompts, key = 'updated') {
  return [...prompts].sort(SORTS[key] || SORTS.updated);
}

export function distinctValues(prompts, field) {
  const values = new Set(prompts.flatMap(p => (field === 'tags' ? p.tags : [p[field]])).filter(v => v && v.trim()));
  return [...values].sort((a, b) => a.localeCompare(b, 'ko'));
}

export function imageIdsOf(prompt) {
  return prompt.results.flatMap(r => r.imageIds);
}

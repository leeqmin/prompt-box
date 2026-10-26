import { test, assert } from './harness.js';
import {
  newPrompt, newResult, MAX_RESULTS, canAddResult, nextVersionTitle, duplicatePrompt, validatePrompt,
  ratingCounts, filterPrompts, sortPrompts, distinctValues, imageIdsOf,
} from '../js/model.js';

const day = '2026-10-26';
const prompt = (over) => ({ ...newPrompt(1, over.id || 'x'), ...over });
const result = (over) => ({ ...newResult(day, over.id || 'r'), ...over });

test('newPrompt defaults', () => {
  const p = newPrompt(7, 'a');
  assert.deepEqual(
    [p.id, p.title, p.tags, p.detail, p.verdict, p.results, p.sourceId, p.createdAt, p.updatedAt],
    ['a', '', [], null, 'undecided', [], null, 7, 7]);
});

test('newResult defaults', () => {
  const r = newResult(day, 'r1');
  assert.deepEqual([r.id, r.text, r.imageIds, r.rating, r.reason, r.date, r.note], ['r1', '', [], null, '', day, '']);
});

test('nextVersionTitle', () => {
  assert.equal(nextVersionTitle('지수 그래프'), '지수 그래프 (v2)');
  assert.equal(nextVersionTitle('지수 그래프 (v2)'), '지수 그래프 (v3)');
  assert.equal(nextVersionTitle('지수 그래프 (v9)'), '지수 그래프 (v10)');
});

test('duplicatePrompt empties results and links source', () => {
  const p = prompt({ id: 'a', title: 'T', verdict: 'good', detail: 4, tags: ['x'], results: [result({})] });
  const d = duplicatePrompt(p, 2, 'b');
  assert.deepEqual([d.id, d.title, d.results.length, d.verdict, d.sourceId, d.detail, d.createdAt, d.updatedAt],
    ['b', 'T (v2)', 0, 'undecided', 'a', 4, 2, 2]);
  assert.notEqual(d.tags, p.tags, 'tags array copied');
  assert.deepEqual(d.tags, ['x']);
});

test('validatePrompt', () => {
  assert.deepEqual(validatePrompt(prompt({ title: '  ' })), ['제목을 입력해 주세요.']);
  const many = prompt({ title: 't', results: [1, 2, 3, 4].map(i => result({ id: String(i) })) });
  assert.deepEqual(validatePrompt(many), ['결과 문항은 최대 3개입니다.']);
  assert.deepEqual(validatePrompt(prompt({ title: 't', detail: 6 })), ['자세함은 1~5 사이여야 합니다.']);
  assert.deepEqual(validatePrompt(prompt({ title: 't', detail: 3 })), []);
});

test('canAddResult up to MAX_RESULTS', () => {
  assert.equal(MAX_RESULTS, 3);
  assert.equal(canAddResult(prompt({ results: [result({}), result({})] })), true);
  assert.equal(canAddResult(prompt({ results: [1, 2, 3].map(i => result({ id: String(i) })) })), false);
});

test('ratingCounts', () => {
  const p = prompt({ results: [result({ rating: 'good' }), result({ rating: 'bad' }), result({ rating: 'good' }), result({ rating: null })] });
  assert.deepEqual(ratingCounts(p), { good: 2, bad: 1 });
});

const sample = [
  prompt({ id: '1', title: 'Alpha 지수', verdict: 'good', subject: '수학Ⅰ', tags: ['그래프'], detail: 2, updatedAt: 10 }),
  prompt({ id: '2', title: '둘', body: '로그 방정식', verdict: 'bad', subject: '수학Ⅱ', tags: ['방정식'], detail: 5, updatedAt: 30 }),
  prompt({ id: '3', title: '셋', memo: '메모 키워드', subject: '수학Ⅰ', detail: null, updatedAt: 20,
    results: [result({ text: '결과 본문', reason: '이유 키워드', rating: 'good' }), result({ id: 'r2', rating: 'good' })] }),
];
const ids = xs => xs.map(p => p.id);
const none = { tab: 'all', query: '', subject: '', tag: '', detail: null };

test('filterPrompts by tab', () => {
  assert.deepEqual(ids(filterPrompts(sample, { ...none, tab: 'good' })), ['1']);
  assert.deepEqual(ids(filterPrompts(sample, { ...none, tab: 'bad' })), ['2']);
  assert.deepEqual(ids(filterPrompts(sample, none)), ['1', '2', '3']);
});

test('filterPrompts query searches title/body/memo/tags/result text/reason, case-insensitive', () => {
  const q = query => ids(filterPrompts(sample, { ...none, query }));
  assert.deepEqual(q('alpha'), ['1']);
  assert.deepEqual(q('로그'), ['2']);
  assert.deepEqual(q('메모 키워드'), ['3']);
  assert.deepEqual(q('방정식'), ['2']);
  assert.deepEqual(q('결과 본문'), ['3']);
  assert.deepEqual(q('이유 키워드'), ['3']);
});

test('filterPrompts by subject/tag/detail', () => {
  assert.deepEqual(ids(filterPrompts(sample, { ...none, subject: '수학Ⅰ' })), ['1', '3']);
  assert.deepEqual(ids(filterPrompts(sample, { ...none, tag: '그래프' })), ['1']);
  assert.deepEqual(ids(filterPrompts(sample, { ...none, detail: 5 })), ['2']);
});

test('sortPrompts does not mutate and orders', () => {
  const before = ids(sample);
  assert.deepEqual(ids(sortPrompts(sample, 'updated')), ['2', '3', '1']);
  assert.deepEqual(ids(sortPrompts(sample, 'detail')), ['2', '1', '3'], 'null detail last');
  assert.deepEqual(ids(sortPrompts(sample, 'good')), ['3', '2', '1'], 'ties broken by most recent update');
  assert.deepEqual(ids(sample), before);
});

test('distinctValues', () => {
  assert.deepEqual(distinctValues(sample, 'subject'), ['수학Ⅰ', '수학Ⅱ']);
  assert.deepEqual(distinctValues(sample, 'tags'), ['그래프', '방정식']);
  assert.deepEqual(distinctValues(sample, 'unit'), []);
});

test('imageIdsOf', () => {
  const p = prompt({ results: [result({ imageIds: ['a', 'b'] }), result({ id: 'r2', imageIds: ['c'] })] });
  assert.deepEqual(imageIdsOf(p), ['a', 'b', 'c']);
});

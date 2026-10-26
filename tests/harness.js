// 아주 작은 테스트 도구. 브라우저에서 실행하고 결과를 window.__results에 남긴다.
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

function fail(message) {
  throw new Error(message);
}

const show = v => JSON.stringify(v);

export const assert = {
  equal(actual, expected, msg) {
    if (actual !== expected) fail(`${msg ? msg + ': ' : ''}expected ${show(expected)}, got ${show(actual)}`);
  },
  notEqual(actual, expected, msg) {
    if (actual === expected) fail(`${msg ? msg + ': ' : ''}did not expect ${show(actual)}`);
  },
  deepEqual(actual, expected, msg) {
    if (show(actual) !== show(expected)) fail(`${msg ? msg + ': ' : ''}expected ${show(expected)}, got ${show(actual)}`);
  },
  ok(value, msg) {
    if (!value) fail(msg || `expected truthy, got ${show(value)}`);
  },
  match(actual, re, msg) {
    if (!re.test(String(actual))) fail(`${msg ? msg + ': ' : ''}${show(actual)} does not match ${re}`);
  },
  async rejects(promise, re) {
    try {
      await promise;
    } catch (err) {
      if (re && !re.test(String(err && err.message))) fail(`rejected with ${err && err.message}, expected ${re}`);
      return;
    }
    fail('expected rejection');
  },
};

export async function run() {
  const out = document.getElementById('out');
  let passed = 0;
  const failures = [];
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      out.insertAdjacentHTML('beforeend', `<div class="pass">PASS ${t.name}</div>`);
    } catch (err) {
      failures.push({ name: t.name, error: String(err && err.stack || err) });
      out.insertAdjacentText('beforeend', `FAIL ${t.name}: ${err && err.message}\n`);
    }
  }
  window.__results = { passed, failed: failures.length, failures };
  return window.__results;
}

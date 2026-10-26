# 문항 프롬프트 저장소 (prompt-box) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프롬프트와 결과 문항(최대 3개, 사진 포함)·평가를 각 기기 브라우저에만 저장하는 개인용 PWA를 만들어 GitHub Pages로 배포한다.

**Architecture:** 빌드 없는 정적 사이트(ES 모듈). 순수 로직(`model.js`, `backup.js`)은 DOM·IndexedDB와 분리해 Node 내장 테스트로 검증하고, 저장(`db.js`)·사진(`images.js`)·수식(`math.js`)은 브라우저 테스트 페이지로 검증한다. 화면은 해시 라우팅으로 목록/상세/수정/설정을 전환한다.

**Tech Stack:** HTML/CSS/JavaScript(ES2020 모듈), IndexedDB, KaTeX 0.16.x(vendor, MIT), Service Worker, Node 20+ `node:test`(개발용, 외부 패키지 없음).

**Spec:** `docs/superpowers/specs/2026-10-26-prompt-box-design.md` — 각 태스크의 세부 동작은 스펙의 해당 절을 따른다.

## Global Constraints

- 데이터는 각 기기 안에만 저장한다. `fetch`/`XMLHttpRequest`/분석 스크립트로 앱 데이터를 외부에 보내지 않는다. 외부 CDN 로드 금지(KaTeX 포함 모든 자원은 저장소 안).
- 코드·문서·화면 어디에도 회사 이름, 특정 사이트 이름이나 주소를 넣지 않는다. 처음 실행 시 데이터는 비어 있다(샘플 데이터 없음).
- 외부 서비스 자동 전송·연결 기능 없음. 사용자는 「복사」로만 가져다 쓴다.
- 화면 문구는 한국어. 앱 표시 이름: `문항 프롬프트 저장소`, 짧은 이름: `프롬프트 저장소`.
- GitHub Pages 경로가 `/prompt-box/`이므로 모든 자원 경로는 상대 경로(`./…`). 서비스 워커 scope는 `./`.
- 결과 문항 최대 3개. 사진은 긴 변 최대 1600px, JPEG 품질 0.85.
- 판정 값: `'good' | 'bad' | 'undecided'`(기본 `'undecided'`). 자세함: 1~5 정수 또는 `null`.
- 백업 파일 이름 `prompt-box-backup-YYYY-MM-DD.json`, 형식 `{ app: "prompt-box", schemaVersion: 1, exportedAt, prompts, images }`.
- 백업 안내 띠: 마지막 백업 후 14일 경과, 또는 백업 기록 없음 + 프롬프트 1개 이상.
- 터치 대상 최소 높이 44px, 넓은 화면 기준 768px, 시스템 다크 모드 지원.
- 대상: 최신 Chrome, Edge, Safari(iOS 포함). 외부 npm 패키지 설치 금지(`package.json`은 `"type": "module"`과 test 스크립트만).

## Review Focus

1. **텍스트 붙여넣기**: 결과 텍스트 칸에 글자를 Ctrl+V 하면 평소처럼 글자가 들어가야 한다(이미지가 없는 클립보드는 가로채지 않음). → Task 4 테스트로 고정.
2. **아이폰 사진(대용량·HEIC)**: 4000×3000 사진은 1600px로 줄어 저장되고, 브라우저가 디코딩 못 하는 형식(HEIC 등)은 그 파일만 건너뛰고 알린다. → Task 4 테스트.
3. **사진이 빠진 백업 파일**: 프롬프트의 `imageIds`가 백업의 `images`에 없으면 그 id만 빼고 가져오며 오류로 중단하지 않는다. → Task 2 테스트.
4. **수정 중 뒤로 가기**: 저장 안 한 내용이 있을 때 브라우저 뒤로 가기·다른 프롬프트 클릭·탭 닫기 모두 확인 창을 띄우고, 취소하면 입력 내용이 그대로 남는다. → Task 8 수동 확인 항목.
5. **결과 삭제 시 사진 정리**: 결과 문항이나 프롬프트를 지우면 연결된 사진도 지워지고, 복제본 저장·삭제가 원본의 사진에 영향을 주지 않는다. → Task 3 테스트.

---

### Task 1: 프로젝트 골격 + 모델(순수 함수)

**Files:**
- Create: `package.json`, `js/model.js`, `tests/model.test.js`, `.gitignore`(`node_modules/`)

**Interfaces:**
- Produces (`js/model.js`, 모두 순수 함수, `now`/`uuid`는 인자로 주입 가능):
  - `newPrompt(now = Date.now(), id = crypto.randomUUID()) -> Prompt` — 스펙 4.1 필드, `title:''`, `tags:[]`, `detail:null`, `verdict:'undecided'`, `results:[]`, `sourceId:null`
  - `newResult(today: 'YYYY-MM-DD', id = crypto.randomUUID()) -> Result` — 스펙 4.2 필드, `rating:null`, `imageIds:[]`
  - `MAX_RESULTS = 3`
  - `canAddResult(prompt) -> boolean`
  - `nextVersionTitle(title: string) -> string`
  - `duplicatePrompt(prompt, now, id) -> Prompt`
  - `validatePrompt(prompt) -> string[]` (오류 메시지 목록, 빈 배열이면 통과)
  - `ratingCounts(prompt) -> {good: number, bad: number}`
  - `filterPrompts(prompts, {tab: 'all'|'good'|'bad', query: string, subject: string, tag: string, detail: number|null}) -> Prompt[]`
  - `sortPrompts(prompts, key: 'updated'|'detail'|'good') -> Prompt[]` (원본 배열 변경 금지)
  - `distinctValues(prompts, field: 'subject'|'unit'|'format'|'tags') -> string[]` (자동완성용, 가나다순, 빈 값 제외)
  - `imageIdsOf(prompt) -> string[]`

- [ ] **Step 1: `package.json` 작성** — `{"name":"prompt-box","private":true,"type":"module","scripts":{"test":"node --test tests/"}}`

- [ ] **Step 2: 실패하는 테스트 작성** `tests/model.test.js`

```js
test('nextVersionTitle', () => {
  assert.equal(nextVersionTitle('지수 그래프'), '지수 그래프 (v2)');
  assert.equal(nextVersionTitle('지수 그래프 (v2)'), '지수 그래프 (v3)');
  assert.equal(nextVersionTitle('지수 그래프 (v9)'), '지수 그래프 (v10)');
});
test('duplicatePrompt empties results and links source', () => {
  const p = {...newPrompt(1, 'a'), title: 'T', verdict: 'good', detail: 4, tags: ['x'], results: [newResult('2026-10-26', 'r')]};
  const d = duplicatePrompt(p, 2, 'b');
  assert.deepEqual([d.id, d.title, d.results.length, d.verdict, d.sourceId, d.detail, d.createdAt], ['b', 'T (v2)', 0, 'undecided', 'a', 4, 2]);
  assert.notEqual(d.tags, p.tags);            // 배열 복사
});
test('validatePrompt', () => {
  assert.deepEqual(validatePrompt({...newPrompt(), title: '  '}), ['제목을 입력해 주세요.']);
  const many = {...newPrompt(), title: 't', results: [1, 2, 3, 4].map(i => newResult('2026-10-26', String(i)))};
  assert.deepEqual(validatePrompt(many), ['결과 문항은 최대 3개입니다.']);
  assert.deepEqual(validatePrompt({...newPrompt(), title: 't', detail: 6}), ['자세함은 1~5 사이여야 합니다.']);
});
test('filterPrompts by tab/query/subject/tag/detail', () => { /* good/bad 탭, 결과 이유 텍스트 검색, 대소문자 무시 */ });
test('sortPrompts does not mutate and orders', () => { /* updated desc, detail desc(null 마지막), good desc */ });
test('ratingCounts / canAddResult / distinctValues / imageIdsOf', () => { /* … */ });
```
filter·sort·기타 테스트는 각 조건에 대해 최소 1개 이상 assert를 포함한다(검색은 제목·본문·메모·태그·결과 text·reason 각각).

- [ ] **Step 3: 실행해 실패 확인** — Run: `npm test` / Expected: FAIL (모듈 없음)
- [ ] **Step 4: `js/model.js` 구현** — 검색은 `toLocaleLowerCase('ko')` 후 `includes`.
- [ ] **Step 5: 실행해 통과 확인** — Run: `npm test` / Expected: 모든 테스트 PASS
- [ ] **Step 6: 커밋** — `git commit -m "feat: prompt model functions"`

### Task 2: 백업 형식·합치기 계획(순수 함수)

**Files:**
- Create: `js/backup.js`(순수 부분), `tests/backup.test.js`

**Interfaces:**
- Consumes: `imageIdsOf` (Task 1)
- Produces (`js/backup.js`):
  - `BACKUP_APP = 'prompt-box'`, `SCHEMA_VERSION = 1`
  - `backupFileName(date: Date) -> string` → `prompt-box-backup-YYYY-MM-DD.json` (로컬 날짜)
  - `buildBackup(prompts, images: {id,type,data(base64),width,height,createdAt}[], exportedAt) -> object`
  - `validateBackup(obj) -> {ok: true} | {ok: false, error: string}` — `app`, `schemaVersion`(1 초과면 "새 버전 앱에서 만든 백업입니다"), `prompts` 배열, 각 프롬프트 `id`·`title`·`updatedAt`, `images` 배열 확인
  - `planMerge(localPrompts, incomingPrompts) -> {add: Prompt[], overwrite: Prompt[], same: Prompt[]}` — id 기준, `updatedAt`이 들어온 쪽이 **더 크면** overwrite, 같거나 작으면 same
  - `sanitizeIncoming(prompts, images) -> {prompts, images}` — 들어온 프롬프트의 `imageIds` 중 `images`에 없는 id 제거, 어떤 프롬프트도 쓰지 않는 이미지 제거

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('backupFileName', () => assert.equal(backupFileName(new Date(2026, 9, 6)), 'prompt-box-backup-2026-10-06.json'));
test('validateBackup rejects wrong app / future schema / missing fields', () => {
  assert.equal(validateBackup({app: 'x'}).ok, false);
  assert.match(validateBackup({app: 'prompt-box', schemaVersion: 2, prompts: [], images: []}).error, /새 버전/);
  assert.equal(validateBackup({app: 'prompt-box', schemaVersion: 1, prompts: [{id: 'a'}], images: []}).ok, false);
  assert.equal(validateBackup(buildBackup([], [], 0)).ok, true);
});
test('planMerge add/overwrite/same by updatedAt', () => {
  const local = [{id: 'a', updatedAt: 5}, {id: 'b', updatedAt: 5}];
  const plan = planMerge(local, [{id: 'a', updatedAt: 9}, {id: 'b', updatedAt: 5}, {id: 'c', updatedAt: 1}]);
  assert.deepEqual([plan.add, plan.overwrite, plan.same].map(xs => xs.map(p => p.id)), [['c'], ['a'], ['b']]);
});
test('sanitizeIncoming drops missing image ids and unused images', () => {
  const r = sanitizeIncoming([{id: 'p', results: [{imageIds: ['i1', 'gone']}]}], [{id: 'i1'}, {id: 'unused'}]);
  assert.deepEqual(r.prompts[0].results[0].imageIds, ['i1']);
  assert.deepEqual(r.images.map(i => i.id), ['i1']);
});
```

- [ ] **Step 2: 실패 확인** — `npm test` / FAIL
- [ ] **Step 3: 구현** (`js/backup.js`의 순수 함수만. 파일 저장·읽기는 Task 9)
- [ ] **Step 4: 통과 확인** — `npm test` / PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: backup format and merge planning"`

### Task 3: IndexedDB 저장소 + 브라우저 테스트 하네스

**Files:**
- Create: `js/db.js`, `tests/browser.html`, `tests/harness.js`, `tests/db.browser.js`

**Interfaces:**
- Consumes: `imageIdsOf` (Task 1)
- Produces (`js/db.js`, 모두 Promise 반환, DB 이름 기본 `'prompt-box'`, 버전 1, 저장소 `prompts`/`images`/`meta`):
  - `openDb(name = 'prompt-box') -> Promise<IDBDatabase>` (IndexedDB 불가 시 `Error('NO_INDEXEDDB')`)
  - `listPrompts(db) -> Prompt[]`, `getPrompt(db, id)`, `putPrompt(db, prompt)`
  - `deletePrompt(db, id)` — 프롬프트와 그 사진을 한 트랜잭션에서 삭제
  - `savePromptWithImages(db, prompt, previous: Prompt|null)` — `previous`에는 있고 `prompt`에는 없는 사진 id를 같은 트랜잭션에서 삭제(결과 삭제·사진 삭제 정리)
  - `putImage(db, {blob, width, height}) -> id`, `getImage(db, id) -> {id, blob, width, height, createdAt}|undefined`, `listImages(db)`
  - `cleanupOrphanImages(db) -> number` (삭제 개수)
  - `getMeta(db, key)`, `setMeta(db, key, value)`
  - `applyImport(db, {add, overwrite}, images: {id, blob, width, height, createdAt}[])` — 한 트랜잭션, overwrite 대상의 이전 사진 중 새 버전에 없는 것은 삭제
  - `deleteDatabase(name)` (테스트용)
- Produces (`tests/harness.js`): `test(name, fn)`, `assert.equal/deepEqual/ok`, `run()` → 결과를 페이지에 표시하고 `window.__results = {passed, failed}` 설정

- [ ] **Step 1: 하네스와 실패하는 브라우저 테스트 작성** — `tests/browser.html`이 `harness.js`와 `*.browser.js`를 로드. 각 테스트는 `prompt-box-test-<랜덤>` DB를 열고 끝에 삭제.
  - `put/list/get/delete round trip`
  - `deletePrompt removes its images`
  - `savePromptWithImages removes images dropped from results` (결과 1개 삭제 → 그 사진만 사라짐)
  - `duplicate saved separately keeps source images` (복제본 저장·삭제 후 원본 사진 그대로)
  - `cleanupOrphanImages removes unlinked only`
  - `applyImport is atomic` (잘못된 레코드 섞으면 아무것도 안 바뀜)
- [ ] **Step 2: 실패 확인** — Run: `python -m http.server 8000` 후 `http://localhost:8000/tests/browser.html` / Expected: db 테스트 FAIL. 자동 확인이 가능하면 Playwright 등 헤드리스 브라우저로 `window.__results.failed === 0`을 확인해도 된다(저장소에 의존성 추가 금지, 일회성 실행만).
- [ ] **Step 3: `js/db.js` 구현**
- [ ] **Step 4: 통과 확인** — 같은 페이지 / Expected: 모두 PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: IndexedDB storage with image cleanup"`

### Task 4: 사진 처리

**Files:**
- Create: `js/images.js`, `tests/images.browser.js`(browser.html에 추가)

**Interfaces:**
- Produces (`js/images.js`):
  - `MAX_EDGE = 1600`, `JPEG_QUALITY = 0.85`
  - `fitSize(w, h, max = MAX_EDGE) -> {width, height}` (순수, 정수 반올림, 작으면 그대로)
  - `toJpeg(blob) -> Promise<{blob, width, height}>` — `createImageBitmap` 실패 시 `<img>` 디코딩으로 재시도, 둘 다 실패하면 `Error('UNSUPPORTED_IMAGE')`
  - `imageFilesFromClipboard(event: ClipboardEvent) -> File[]` (이미지 항목만, 없으면 빈 배열 — 이 경우 호출부는 `preventDefault` 하지 않음)
  - `imageFilesFromList(fileList) -> File[]` (`type.startsWith('image/')`, 형식이 비어 있으면 확장자로 판단)
  - `processFiles(files, saveFn) -> Promise<{ids: string[], skipped: string[]}>` — 실패한 파일 이름을 `skipped`에 모으고 계속 진행

- [ ] **Step 1: 실패하는 테스트 작성**
  - `fitSize(4000, 3000)` → `{width: 1600, height: 1200}`, `fitSize(800, 600)` → 그대로, `fitSize(1000, 3000)` → `{width: 533, height: 1600}`
  - 캔버스로 만든 4000×3000 PNG → `toJpeg` 결과 1600×1200, `type === 'image/jpeg'`
  - 디코딩 불가 Blob(`new Blob(['x'], {type: 'image/heic'})`)은 `processFiles`에서 `skipped`에 들어가고 다른 파일은 저장됨
  - 텍스트만 있는 `DataTransfer`로 만든 붙여넣기 이벤트 → `imageFilesFromClipboard` 빈 배열 (Review Focus 1)
- [ ] **Step 2: 실패 확인** — browser.html / FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — browser.html / PASS, `npm test`도 PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: image resize and input helpers"`

### Task 5: KaTeX 수식 표시

**Files:**
- Create: `vendor/katex/`(katex.min.js, katex.min.css, contrib/auto-render.min.js, fonts/, LICENSE), `js/math.js`, `tests/math.browser.js`

**Interfaces:**
- Produces (`js/math.js`): `renderMath(element: HTMLElement, text: string) -> void` — `element.textContent = text` 후 auto-render. delimiters: `$$…$$`(display), `\[…\]`(display), `$…$`, `\(…\)`. `throwOnError: false`, `errorColor: '#cc0000'`. 줄바꿈 유지(CSS `white-space: pre-wrap`).

- [ ] **Step 1: KaTeX 0.16.x 배포 파일을 `vendor/katex/`에 넣기** — npm 레지스트리 tarball(`https://registry.npmjs.org/katex/-/katex-0.16.11.tgz`)에서 `dist/` 필요 파일과 LICENSE만 복사. 저장소에 `node_modules` 없음.
- [ ] **Step 2: 실패하는 테스트 작성** — `renderMath(el, '값은 $\\frac{64}{3}$이다')` 후 `el.querySelector('.katex')` 존재, 텍스트에 `64`와 `3`이 분리된 요소로 존재. `'$\\frac{1}{$'` 같은 오류 입력은 예외 없이 원문 유지.
- [ ] **Step 3: 실패 확인 → 구현 → 통과 확인** (browser.html)
- [ ] **Step 4: 커밋** — `git commit -m "feat: KaTeX rendering (vendored)"`

### Task 6: 앱 골격, 라우팅, 공통 UI, 목록 화면

**Files:**
- Create: `index.html`, `css/app.css`, `js/main.js`, `js/ui.js`, `js/views/list.js`

**Interfaces:**
- Consumes: Task 1 `filterPrompts/sortPrompts/ratingCounts/distinctValues`, Task 3 `openDb/listPrompts/getMeta`
- Produces:
  - `js/ui.js`: `confirmDialog(message, {okText='확인', cancelText='취소'}) -> Promise<boolean>`(`<dialog>` 사용, `window.confirm` 금지), `toast(message)`, `setBanner(key: 'backup'|'update'|'storage', html|null)`, `el(tag, attrs, ...children)` DOM 헬퍼
  - `js/main.js`: `route()` — `#/`(목록만), `#/p/<id>`(상세), `#/p/<id>/edit`, `#/new`, `#/settings`. `registerLeaveGuard(fn: () => Promise<boolean>)`/`clearLeaveGuard()`(Task 8이 사용) — 해시 변경 전에 guard가 false면 이전 해시로 되돌린다. 전역 `app = {db, prompts, refresh()}`.
  - `js/views/list.js`: `renderList(container, app, state)` — 탭(전체/좋은/나쁜), 검색, 과목·태그·자세함 필터, 정렬 선택, 카드(제목, 과목·단원, 태그, 판정, 자세함, 좋음/나쁨 개수, 고친 날짜). 목록 상태(탭·검색·필터·정렬)는 `sessionStorage`에 보관.
- 레이아웃: 768px 이상 2단(목록 360px + 상세), 미만은 한 화면. 다크 모드는 `prefers-color-scheme`. 버튼·입력 최소 높이 44px.
- 시작 시: `openDb` 실패면 "이 브라우저에서는 저장할 수 없습니다" 화면만 표시. 성공하면 `cleanupOrphanImages` 후 목록. 백업 띠 조건(Global Constraints) 확인.

- [ ] **Step 1: 화면 골격·목록 구현**
- [ ] **Step 2: 수동 확인** — 로컬 서버에서 1280px·375px로 열기. 프롬프트 0개일 때 "아직 프롬프트가 없습니다 · 새 프롬프트" 안내, 개발자 도구 콘솔에서 임시 데이터 `putPrompt` 후 탭·검색·필터·정렬이 동작, 뒤로 가기 동작. 콘솔 오류 0개.
- [ ] **Step 3: `npm test` 및 browser.html 모두 PASS 확인**
- [ ] **Step 4: 커밋** — `git commit -m "feat: app shell and prompt list"`

### Task 7: 상세 화면

**Files:**
- Create: `js/views/detail.js`

**Interfaces:**
- Consumes: Task 1 `duplicatePrompt/ratingCounts`, Task 3 `getPrompt/putPrompt/deletePrompt/getImage`, Task 5 `renderMath`, Task 6 `confirmDialog/toast/el`
- Produces: `renderDetail(container, app, id)`

- 스펙 5.2대로: 본문 「복사」(`navigator.clipboard.writeText`, 실패 시 본문 텍스트 선택 + "직접 복사해 주세요" 토스트), 결과 1~3 접기·펴기(`<details>`), 접힘 요약 "결과 n · 좋음/나쁨 · 날짜 · 이유 첫 줄", 사진 썸네일(누르면 `<dialog>`로 크게, `URL.createObjectURL` 후 닫을 때 revoke), 「수정」, 「복제해서 새 버전으로」(저장 후 새 항목 상세로 이동), 「삭제」(확인 창), 복제본이면 "○○에서 복제" 링크(원본이 없으면 "원본 삭제됨").

- [ ] **Step 1: 구현**
- [ ] **Step 2: 수동 확인** — 수식 포함 결과 표시, 접기·펴기, 복사, 복제 제목 `(v2)`, 삭제 후 목록 복귀, 사진 크게 보기. 콘솔 오류 0개.
- [ ] **Step 3: 커밋** — `git commit -m "feat: prompt detail view"`

### Task 8: 수정 화면

**Files:**
- Create: `js/views/edit.js`

**Interfaces:**
- Consumes: Task 1 `newPrompt/newResult/canAddResult/validatePrompt/distinctValues`, Task 3 `savePromptWithImages/putImage/getImage`, Task 4 `imageFilesFromClipboard/imageFilesFromList/processFiles/toJpeg`, Task 5 `renderMath`, Task 6 `registerLeaveGuard/clearLeaveGuard/confirmDialog/toast`
- Produces: `renderEdit(container, app, id|null)` (`null`이면 새 프롬프트)

- 스펙 5.3대로. 과목·단원·형식은 `<datalist>` 자동완성, 태그는 쉼표 구분 입력. 판정 3버튼, 자세함 1~5 + 없음.
- 결과 칸: 「결과 추가」(`canAddResult`가 false면 숨김), 「이 결과 삭제」(확인 창), 텍스트 아래 수식 미리보기(300ms 디바운스), 날짜 기본값 오늘.
- 사진: 결과 칸 안에서 `paste` 이벤트 — `imageFilesFromClipboard`가 빈 배열이면 기본 동작 그대로(텍스트 붙여넣기), 아니면 `preventDefault` 후 처리. 파일 선택(`accept="image/*"`, 폰 갤러리·카메라), 끌어다 놓기. 새로 넣은 사진은 즉시 `putImage`로 저장하고, 「취소」로 나가면 이번 편집에서 새로 넣은 사진 id를 삭제한다. `skipped`가 있으면 "○○은(는) 열 수 없는 사진이라 건너뛰었습니다" 토스트.
- 저장: `validatePrompt` 오류가 있으면 저장하지 않고 표시. `updatedAt = Date.now()`. `savePromptWithImages(db, prompt, previous)`. 저장 실패(QuotaExceededError 등) 시 입력 유지 + "저장 공간이 부족합니다. 백업 후 사진을 정리해 주세요" 띠. 첫 저장 성공 시 `navigator.storage.persist()` 1회 요청(`meta.persistRequested`).
- 이탈 경고: 변경이 있으면 `registerLeaveGuard`(해시 이동·목록 클릭·뒤로 가기)와 `beforeunload`(탭 닫기). 저장·취소 후 해제.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 수동 확인 (Review Focus 4 포함)** — 새로 만들기 → 저장 → 상세 표시. 결과 3개 추가 시 추가 버튼 사라짐. 캡처 이미지 Ctrl+V 붙여넣기, 글자 Ctrl+V는 글자로 들어감. 파일 선택·끌어다 놓기. 수정 중 뒤로 가기·다른 카드 클릭·탭 닫기 각각 확인 창, 취소하면 입력 유지. 결과 삭제 후 저장하면 그 사진이 `listImages`에서 사라짐. 375px에서 입력 가능. 콘솔 오류 0개.
- [ ] **Step 3: `npm test`·browser.html PASS 확인**
- [ ] **Step 4: 커밋** — `git commit -m "feat: prompt edit view with images and math preview"`

### Task 9: 설정 화면 — 백업 저장·불러오기, 저장 공간

**Files:**
- Modify: `js/backup.js` (브라우저 부분 추가)
- Create: `js/views/settings.js`, `tests/backup.browser.js`

**Interfaces:**
- Consumes: Task 2 전부, Task 3 `listPrompts/listImages/applyImport/getMeta/setMeta`
- Produces (`js/backup.js` 추가분):
  - `exportBackup(db) -> Promise<{fileName, blob}>` (이미지 Blob → base64), 호출 후 `meta.lastBackupAt = Date.now()`
  - `readBackupFile(file) -> Promise<object>` (JSON 파싱 실패 시 `Error('백업 파일을 읽을 수 없습니다.')`)
  - `prepareImport(db, obj) -> Promise<{ok:false, error} | {ok:true, plan, images, summary: {add, overwrite, same}}>` (`validateBackup` → `sanitizeIncoming` → `planMerge`, base64 → Blob)
  - `commitImport(db, prepared) -> Promise<void>` (`applyImport`)
  - `renderSettings(container, app)`: 「백업 파일로 저장」(`<a download>`), 「백업 파일 불러오기」(파일 선택 → 요약 "새로 n개, 덮어씀 n개, 그대로 n개" 확인 창 → 적용), 사용량(`navigator.storage.estimate()`, MB 소수 1자리), 마지막 백업 날짜, 앱 버전(`sw.js`의 `VERSION`을 `main.js`가 노출).
- 백업 띠: 저장 성공 시 즉시 숨김.

- [ ] **Step 1: 실패하는 브라우저 테스트 작성** — 프롬프트 2개 + 사진 1장 저장 → `exportBackup` → DB 삭제 → 새 DB에 `prepareImport`/`commitImport` → 프롬프트·사진 동일(사진 Blob 크기 동일). 잘못된 JSON·다른 앱 파일은 `ok:false`이고 DB 변화 없음.
- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인** (browser.html, `npm test`)
- [ ] **Step 3: 수동 확인** — 노트북에서 저장한 파일을 다른 브라우저 프로필에서 불러오기, 요약 숫자, 같은 파일을 다시 불러오면 "그대로 n개".
- [ ] **Step 4: 커밋** — `git commit -m "feat: backup export/import and settings"`

### Task 10: PWA, 아이콘, README, 배포 확인

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/icon-192.png`, `icons/icon-512.png`, `icons/maskable-512.png`, `README.md`
- Modify: `index.html`(manifest·아이콘 링크, `theme-color`), `js/main.js`(서비스 워커 등록·업데이트 띠)

**Interfaces:**
- Produces: `sw.js`의 `const VERSION = '1.0.0'`와 `CACHE = 'prompt-box-' + VERSION`, 앱 파일 전체 목록(`./`, `index.html`, css, js 전부, vendor/katex 전부 포함 폰트, manifest, icons) 사전 캐시. fetch는 같은 출처 GET만 cache-first. 새 워커는 `skipWaiting`하지 않고 대기 → `main.js`가 `registration.waiting` 감지 시 "새 버전이 있습니다 · 새로고침" 띠, 누르면 `postMessage('skipWaiting')` 후 `controllerchange`에서 새로고침.
- manifest: `name: "문항 프롬프트 저장소"`, `short_name: "프롬프트 저장소"`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, 아이콘 3종. 아이콘은 단색 배경 + 흰 글자 "P" 정도의 단순한 그림을 코드로 생성(외부 이미지 사용 금지).
- README(한국어): 앱 주소 `https://leeqmin.github.io/prompt-box/`, 데이터는 기기에만 저장된다는 안내, 백업 방법, 폰에서 홈 화면에 추가하는 법(iPhone Safari 공유 → 홈 화면에 추가 / Android Chrome 메뉴 → 앱 설치), 노트북 앱 설치, 개발용 테스트 실행법.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 로컬 확인** — 개발자 도구 Application 탭에서 manifest 오류 없음, 서비스 워커 활성, 오프라인 체크 후 새로고침해도 앱·수식 표시 정상.
- [ ] **Step 3: 전체 점검** — `npm test` PASS, browser.html 모두 PASS. 저장소 전체에서 Global Constraints 금지 항목 검색(외부 URL 로드, `fetch(` 사용처가 백업·SW 외에 없는지).
- [ ] **Step 4: 커밋·푸시** — `git commit -m "feat: PWA install and offline support"`, `git push origin main`
- [ ] **Step 5: 배포 확인** — GitHub Pages(main, 루트)는 이미 켜져 있다. `https://leeqmin.github.io/prompt-box/`가 열리고, 375px 화면에서 홈 화면 추가 가능 상태인지(manifest·SW 인식) 확인. 배포 실패 시 `gh api repos/leeqmin/prompt-box/pages`로 상태 확인.

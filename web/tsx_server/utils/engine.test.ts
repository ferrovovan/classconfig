// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createInitialState,
  runCommand,
  splitLogicalLines,
  pathsConflict,
  normalizePath,
  tokenizeCommand,
  diffLines,
  EngineOptions,
  EngineState,
} from './engine';

const opts: EngineOptions = {
  sha256: async (t: string) => createHash('sha256').update(t, 'utf8').digest('hex'),
  now: () => '2026-10-30T14:00:00+03:00',
};

const run = (state: EngineState, line: string) =>
  runCommand(state, tokenizeCommand(line), opts);

const snapshot = (state: EngineState) =>
  run(state, 'python3 -m classconfig snapshot --source demo/config --baseline demo/baseline');

test('01 snapshot: 5 файлов, код 0, манифест со SHA-256', async () => {
  const r = await snapshot(createInitialState());
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Эталон сохранён\./);
  assert.match(r.stdout, /Файлов: 5/);
  const b = r.state.baselines.get('demo/baseline')!;
  assert.equal(b.manifest.files.length, 5);
  assert.equal(b.manifest.files[0].sha256.length, 64);
});

test('02 snapshot в существующий эталон: BASELINE_EXISTS, код 2', async () => {
  const first = await snapshot(createInitialState());
  const r = await snapshot(first.state);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /BASELINE_EXISTS/);
});

test('03 check без изменений: код 0, unchanged 5', async () => {
  const s = await snapshot(createInitialState());
  const r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Без изменений: 5/);
  assert.ok(r.reportHtml!.includes('Отличий нет.'));
});

test('04 check после правки строки: код 1, diff в отчёте', async () => {
  const s = await snapshot(createInitialState());
  s.state.folders.get('demo/config')!.set('app.ini', { content: 'PORT=5433\nHOST=127.0.0.1\n' });
  const r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Изменён: 1/);
  assert.ok(r.reportHtml!.includes('PORT=5433'));
  assert.ok(r.reportHtml!.includes('PORT=5432'));
  assert.ok(r.reportHtml!.includes('Отличия найдены.'));
});

test('05 check после удаления файла: Удалён: 1', async () => {
  const s = await snapshot(createInitialState());
  s.state.folders.get('demo/config')!.delete('display.conf');
  const r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Удалён: 1/);
});

test('06 check после добавления файла: Добавлен: 1', async () => {
  const s = await snapshot(createInitialState());
  s.state.folders.get('demo/config')!.set('extra.conf', { content: 'NOTE=demo\n' });
  const r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Добавлен: 1/);
});

test('07 полный демонстрационный сценарий: snapshot → правки → check(1) → откат → check(0)', async () => {
  let s = await snapshot(createInitialState());
  const f = s.state.folders.get('demo/config')!;
  f.set('app.ini', { content: 'PORT=5433\nHOST=127.0.0.1\n' });
  f.delete('display.conf');
  f.set('extra.conf', { content: 'NOTE=demo\n' });
  let r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Изменён: 1[\s\S]*Добавлен: 1[\s\S]*Удалён: 1[\s\S]*Без изменений: 3/);
  f.set('app.ini', { content: 'PORT=5432\nHOST=127.0.0.1\n' });
  f.delete('extra.conf');
  f.set('display.conf', { content: 'THEME=light\n' });
  r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
  assert.equal(r.code, 0);
});

test('08 подкаталог в папке: UNSUPPORTED_DIRECTORY, код 2', async () => {
  const s = createInitialState();
  s.folders.get('demo/config')!.set('subdir', { content: '', isDirectory: true });
  const r = await run(s, 'snapshot --source demo/config --baseline demo/baseline');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /UNSUPPORTED_DIRECTORY/);
});

test('09 симлинк: UNSUPPORTED_SYMLINK, код 2', async () => {
  const s = createInitialState();
  s.folders.get('demo/config')!.set('link.conf', { content: '', isSymlink: true });
  const r = await run(s, 'snapshot --source demo/config --baseline demo/baseline');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /UNSUPPORTED_SYMLINK/);
});

test('10 файл > 1 МиБ: FILE_TOO_LARGE, код 2', async () => {
  const s = createInitialState();
  s.folders.get('demo/config')!.set('big.conf', { content: 'A', sizeBytes: 1048577 });
  const r = await run(s, 'snapshot --source demo/config --baseline demo/baseline');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /FILE_TOO_LARGE/);
});

test('11 бинарный файл: UNSUPPORTED_CONTENT, код 2', async () => {
  const s = createInitialState();
  s.folders.get('demo/config')!.set('bin.conf', { content: 'A\u0000B' });
  const r = await run(s, 'snapshot --source demo/config --baseline demo/baseline');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /UNSUPPORTED_CONTENT/);
});

test('12 HTML-экранирование опасных символов в отчёте', async () => {
  const s = await snapshot(createInitialState());
  s.state.folders.get('demo/config')!.set('app.ini', { content: 'SECRET=<script>"&"</script>\n' });
  const r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
  assert.ok(r.reportHtml!.includes('&lt;script&gt;'));
  assert.ok(!r.reportHtml!.includes('SECRET=<script>'));
});

test('13 эталон неизменяем после check', async () => {
  const s = await snapshot(createInitialState());
  const before = JSON.stringify(s.state.baselines.get('demo/baseline')!.manifest);
  await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
  assert.equal(JSON.stringify(s.state.baselines.get('demo/baseline')!.manifest), before);
});

test('14 пустая папка: код 0, "Файлов нет"', async () => {
  const s = createInitialState();
  s.folders.set('empty/config', new Map());
  const snap = await run(s, 'snapshot --source empty/config --baseline empty/baseline');
  assert.equal(snap.code, 0);
  const r = await run(snap.state, 'check --source empty/config --baseline empty/baseline --report empty/r.html');
  assert.equal(r.code, 0);
  assert.ok(r.reportHtml!.includes('Файлов нет.'));
});

test('15 PATH_CONFLICT: эталон внутри папки', async () => {
  const r = await run(createInitialState(), 'snapshot --source demo/config --baseline demo/config/baseline');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /PATH_CONFLICT/);
});

test('16 BASELINE_NOT_FOUND и SOURCE_NOT_FOUND: код 2', async () => {
  const s = await snapshot(createInitialState());
  let r = await run(s.state, 'check --source demo/config --baseline demo/missing --report demo/r.html');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /BASELINE_NOT_FOUND/);
  r = await run(createInitialState(), 'snapshot --source nope/config --baseline demo/baseline');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /SOURCE_NOT_FOUND/);
});

test('17 более 20 файлов: TOO_MANY_FILES, код 2', async () => {
  const s = createInitialState();
  const f = s.folders.get('demo/config')!;
  for (let i = 0; i < 16; i++) f.set(`f${i}.conf`, { content: 'X=1\n' });
  const r = await run(s, 'snapshot --source demo/config --baseline demo/baseline');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /TOO_MANY_FILES/);
});

test('18 переименование = удалён + добавлен', async () => {
  const s = await snapshot(createInitialState());
  const f = s.state.folders.get('demo/config')!;
  const old = f.get('cache.conf')!;
  f.delete('cache.conf');
  f.set('cache2.conf', old);
  const r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/r.html');
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Добавлен: 1/);
  assert.match(r.stdout, /Удалён: 1/);
});

test('19 CRLF против LF: без изменений', async () => {
  const s = await snapshot(createInitialState());
  s.state.folders.get('demo/config')!.set('logging.conf', { content: 'LEVEL=info\r\n' });
  const r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/r.html');
  assert.equal(r.code, 0);
});

test('20 ошибка валидации не меняет папку и не пишет отчёт', async () => {
  const s = await snapshot(createInitialState());
  s.state.folders.get('demo/config')!.set('sub', { content: '', isDirectory: true });
  const before = JSON.stringify([...s.state.folders.get('demo/config')!.keys()]);
  const r = await run(s.state, 'check --source demo/config --baseline demo/baseline --report demo/r.html');
  assert.equal(r.code, 2);
  assert.equal(JSON.stringify([...r.state.folders.get('demo/config')!.keys()]), before);
  assert.equal(r.state.reports.has('demo/r.html'), false);
});

test('21 коды возврата и парсер: нет аргументов=2, --help=0, неизвестный ключ=2', async () => {
  let r = await runCommand(createInitialState(), [], opts);
  assert.equal(r.code, 2);
  r = await runCommand(createInitialState(), ['--help'], opts);
  assert.equal(r.code, 0);
  r = await run(createInitialState(), 'snapshot --src demo/config --baseline demo/baseline');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /INVALID_ARGUMENTS/);
});

test('22 утилиты: normalizePath, pathsConflict, splitLogicalLines, diffLines', () => {
  assert.equal(normalizePath('./demo//config/'), 'demo/config');
  assert.equal(normalizePath('demo/config/../x'), 'demo/x');
  assert.ok(pathsConflict('demo', 'demo/config'));
  assert.ok(!pathsConflict('demo/a', 'demo/b'));
  assert.deepEqual(splitLogicalLines('a\r\nb\n'), ['a', 'b']);
  assert.deepEqual(splitLogicalLines(''), []);
  const ops = diffLines(['a', 'b', 'c'], ['a', 'x', 'c']);
  assert.deepEqual(ops.map((o) => o.tag), ['equal', 'delete', 'insert', 'equal']);
});

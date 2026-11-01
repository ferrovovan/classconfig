// SPDX-License-Identifier: GPL-3.0-or-later
/** Браузерный прогон 20 приёмочных сценариев (зеркало tests/test_acceptance.py). */
import { createInitialState, runCommand, EngineState, CliResult, EngineOptions, DEFAULT_OPTIONS } from './engine';

export interface TestOutcome {
  name: string;
  ok: boolean;
  detail: string;
}

const shaWeb: EngineOptions = {
  ...DEFAULT_OPTIONS,
  sha256: async (t: string) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  },
};

export const WEB_SHA256_OPTIONS = shaWeb;

const cmd = (state: EngineState, line: string) =>
  runCommand(
    state,
    line.replace(/^python3 -m classconfig\s*/, '').trim().split(/\s+/).filter(Boolean),
    shaWeb
  );

type Case = { name: string; run: () => Promise<string> };

const expect = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
  return 'OK';
};

const withEdited = async (edit: (s: EngineState) => void) => {
  const s = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/baseline');
  edit(s.state);
  return cmd(s.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
};

const CASES: Case[] = [
  { name: 'test_01_snapshot_five_files', run: async () => { const r = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/baseline'); return expect(r.code === 0 && r.stdout.includes('Файлов: 5'), `code=${r.code}`); } },
  { name: 'test_02_snapshot_baseline_exists', run: async () => { const a = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/baseline'); const b = await cmd(a.state, 'snapshot --source demo/config --baseline demo/baseline'); return expect(b.code === 2 && b.stderr.includes('BASELINE_EXISTS'), `code=${b.code}`); } },
  { name: 'test_03_check_without_changes', run: async () => { const a = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/baseline'); const r = await cmd(a.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html'); return expect(r.code === 0 && r.stdout.includes('Без изменений: 5'), `code=${r.code}`); } },
  { name: 'test_04_changed_one_line', run: async () => { const r = await withEdited((s) => s.folders.get('demo/config')!.set('app.ini', { content: 'PORT=5433\nHOST=127.0.0.1\n' })); return expect(r.code === 1 && r.stdout.includes('Изменён: 1'), `code=${r.code}`); } },
  { name: 'test_05_deleted_file', run: async () => { const r = await withEdited((s) => s.folders.get('demo/config')!.delete('display.conf')); return expect(r.code === 1 && r.stdout.includes('Удалён: 1'), `code=${r.code}`); } },
  { name: 'test_06_added_file', run: async () => { const r = await withEdited((s) => s.folders.get('demo/config')!.set('extra.conf', { content: 'NOTE=demo\n' })); return expect(r.code === 1 && r.stdout.includes('Добавлен: 1'), `code=${r.code}`); } },
  { name: 'test_07_full_demo_scenario', run: async () => {
      const a = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/baseline');
      const f = a.state.folders.get('demo/config')!;
      f.set('app.ini', { content: 'PORT=5433\nHOST=127.0.0.1\n' });
      f.delete('display.conf');
      f.set('extra.conf', { content: 'NOTE=demo\n' });
      const b = await cmd(a.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
      if (b.code !== 1) throw new Error(`step4 code=${b.code}`);
      f.set('app.ini', { content: 'PORT=5432\nHOST=127.0.0.1\n' });
      f.delete('extra.conf');
      f.set('display.conf', { content: 'THEME=light\n' });
      const c = await cmd(b.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html');
      return expect(c.code === 0, `step5 code=${c.code}`);
    } },
  { name: 'test_08_unsupported_directory', run: async () => { const s = createInitialState(); s.folders.get('demo/config')!.set('sub', { content: '', isDirectory: true }); const r = await cmd(s, 'snapshot --source demo/config --baseline demo/baseline'); return expect(r.code === 2 && r.stderr.includes('UNSUPPORTED_DIRECTORY'), `code=${r.code}`); } },
  { name: 'test_09_unsupported_symlink', run: async () => { const s = createInitialState(); s.folders.get('demo/config')!.set('link.conf', { content: '', isSymlink: true }); const r = await cmd(s, 'snapshot --source demo/config --baseline demo/baseline'); return expect(r.code === 2 && r.stderr.includes('UNSUPPORTED_SYMLINK'), `code=${r.code}`); } },
  { name: 'test_10_file_too_large', run: async () => { const s = createInitialState(); s.folders.get('demo/config')!.set('big.conf', { content: 'A', sizeBytes: 1048577 }); const r = await cmd(s, 'snapshot --source demo/config --baseline demo/baseline'); return expect(r.code === 2 && r.stderr.includes('FILE_TOO_LARGE'), `code=${r.code}`); } },
  { name: 'test_11_unsupported_content', run: async () => { const s = createInitialState(); s.folders.get('demo/config')!.set('bin.conf', { content: 'A\u0000B' }); const r = await cmd(s, 'snapshot --source demo/config --baseline demo/baseline'); return expect(r.code === 2 && r.stderr.includes('UNSUPPORTED_CONTENT'), `code=${r.code}`); } },
  { name: 'test_12_html_escaping', run: async () => { const r = await withEdited((s) => s.folders.get('demo/config')!.set('app.ini', { content: 'X=<script>"y"&z</script>\n' })); return expect(!!r.reportHtml && r.reportHtml.includes('&lt;script&gt;') && !r.reportHtml.includes('X=<script>'), 'no escaping'); } },
  { name: 'test_13_integrity_after_check', run: async () => { const a = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/baseline'); const before = JSON.stringify(a.state.baselines.get('demo/baseline')!.manifest); const b = await cmd(a.state, 'check --source demo/config --baseline demo/baseline --report demo/report.html'); const after = JSON.stringify(b.state.baselines.get('demo/baseline')!.manifest); return expect(before === after, 'baseline mutated'); } },
  { name: 'test_14_empty_folder', run: async () => { const s = createInitialState(); s.folders.set('empty/config', new Map()); const a = await cmd(s, 'snapshot --source empty/config --baseline empty/baseline'); const r = await cmd(a.state, 'check --source empty/config --baseline empty/baseline --report empty/r.html'); return expect(a.code === 0 && r.code === 0 && !!r.reportHtml?.includes('Файлов нет.'), `code=${r.code}`); } },
  { name: 'test_15_path_conflict', run: async () => { const r = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/config/base'); return expect(r.code === 2 && r.stderr.includes('PATH_CONFLICT'), `code=${r.code}`); } },
  { name: 'test_16_baseline_corrupt_byte_modified', run: async () => { const a = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/baseline'); a.state.baselines.get('demo/baseline')!.copies.set('app.ini', 'PORT=0000\nHOST=127.0.0.1\n'); const r = await cmd(a.state, 'check --source demo/config --baseline demo/baseline --report demo/r.html'); return expect(r.code === 1 && r.stdout.includes('Изменён: 1'), `code=${r.code}`); } },
  { name: 'test_17_too_many_files', run: async () => { const s = createInitialState(); const f = s.folders.get('demo/config')!; for (let i = 0; i < 16; i++) f.set(`f${i}.conf`, { content: 'X=1\n' }); const r = await cmd(s, 'snapshot --source demo/config --baseline demo/baseline'); return expect(r.code === 2 && r.stderr.includes('TOO_MANY_FILES'), `code=${r.code}`); } },
  { name: 'test_18_renamed_file_deleted_and_added', run: async () => { const r = await withEdited((s) => { const f = s.folders.get('demo/config')!; const e = f.get('cache.conf')!; f.delete('cache.conf'); f.set('cache2.conf', e); }); return expect(r.code === 1 && r.stdout.includes('Добавлен: 1') && r.stdout.includes('Удалён: 1'), `code=${r.code}`); } },
  { name: 'test_19_crlf_vs_lf_unchanged', run: async () => { const r = await withEdited((s) => s.folders.get('demo/config')!.set('logging.conf', { content: 'LEVEL=info\r\n' })); return expect(r.code === 0, `code=${r.code}`); } },
  { name: 'test_20_folder_validation_error_no_changes', run: async () => { const a = await cmd(createInitialState(), 'snapshot --source demo/config --baseline demo/baseline'); a.state.folders.get('demo/config')!.set('sub', { content: '', isDirectory: true }); const r = await cmd(a.state, 'check --source demo/config --baseline demo/baseline --report demo/r.html'); return expect(r.code === 2 && !r.state.reports.has('demo/r.html'), `code=${r.code}`); } },
];

export async function runAcceptanceSuite(): Promise<TestOutcome[]> {
  const out: TestOutcome[] = [];
  for (const c of CASES) {
    try {
      const detail = await c.run();
      out.push({ name: c.name, ok: true, detail });
    } catch (e) {
      out.push({ name: c.name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

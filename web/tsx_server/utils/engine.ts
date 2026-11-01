// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Клиентский движок ClassConfig — полная TypeScript-реализация
 * виртуальной папки, snapshot/check и автономного HTML-отчёта.
 * Работает 1:1 с Python CLI (classconfig/) без бэкенда: демо статично
 * на GitHub Pages.
 */

export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 1048576;
export const CONTEXT_LINES = 3;
export const MANIFEST_VERSION = 1;

export type DiffTag = 'equal' | 'insert' | 'delete';

export interface DiffOp {
  tag: DiffTag;
  baselineLines: string[];
  sourceLines: string[];
  baselineStart: number;
  sourceStart: number;
}

export type FileStatus = 'unchanged' | 'changed' | 'added' | 'deleted';

export interface FileComparison {
  name: string;
  status: FileStatus;
  baselineLines: string[];
  sourceLines: string[];
  diffOps: DiffOp[];
}

export interface ComparisonResult {
  checkedAt: string;
  sourcePath: string;
  baselinePath: string;
  reportPath: string;
  files: FileComparison[];
  countChanged: number;
  countAdded: number;
  countDeleted: number;
  countUnchanged: number;
  hasDifferences: boolean;
}

export interface ManifestFileEntry {
  name: string;
  size_bytes: number;
  sha256: string;
}

export interface Baseline {
  manifest: {
    version: number;
    created_at: string;
    source_path: string;
    encoding: string;
    limits: { max_files: number; max_file_bytes: number };
    files: ManifestFileEntry[];
  };
  copies: Map<string, string>;
}

export interface VfsEntry {
  content: string;
  isDirectory?: boolean;
  isSymlink?: boolean;
  isBinary?: boolean;
  sizeBytes?: number;
}

export type VfsFolder = Map<string, VfsEntry>;

export interface EngineState {
  folders: Map<string, VfsFolder>;
  baselines: Map<string, Baseline>;
  reports: Map<string, string>;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  state: EngineState;
  reportHtml?: string;
}

export interface EngineOptions {
  sha256: (text: string) => Promise<string>;
  now: () => string;
}

export const DEFAULT_OPTIONS: EngineOptions = {
  // Лёгкий некриптографический stand-in с интерфейсом SHA-256 (FNV-128, hex).
  // В браузере App подменяет его на Web Crypto, в Node-тестах — на node:crypto.
  sha256: async (text: string) => {
    const bytes = new TextEncoder().encode(text);
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (const b of bytes) {
      h1 = Math.imul(h1 ^ b, 16777619) >>> 0;
      h2 = Math.imul(h2 + b + 0x9e3779b9, 2654435761) >>> 0;
    }
    let out = '';
    for (let i = 0; i < 8; i++) {
      h1 = Math.imul(h1 ^ (h2 + i), 2246822519) >>> 0;
      out += h1.toString(16).padStart(8, '0');
    }
    return out;
  },
  now: () => new Date().toISOString().slice(0, 19) + '+00:00',
};

export const HELP_TEXT = `ClassConfig — снимок текстовых настроек и отчёт различий.

Команды:
  snapshot --source ПАПКА --baseline НОВЫЙ_КАТАЛОГ
  check --source ПАПКА --baseline КАТАЛОГ --report ФАЙЛ.html

Папка содержит только обычные файлы UTF-8: не больше 20 файлов
и не больше 1 МиБ каждый, без вложенных каталогов и ссылок.
Эталон и отчёт сохраняются вне этой папки.
Отчёт подтверждает только совпадение папки с эталоном.`;

const SNAPSHOT_HELP = `Использование: classconfig snapshot --source ПАПКА --baseline НОВЫЙ_КАТАЛОГ

Параметры:
  --source    Путь к проверяемой папке
  --baseline  Путь к создаваемому каталогу эталона`;

const CHECK_HELP = `Использование: classconfig check --source ПАПКА --baseline КАТАЛОГ --report ФАЙЛ.html

Параметры:
  --source    Путь к текущей папке
  --baseline  Путь к существующему каталогу эталона
  --report    Путь к создаваемому файлу HTML-отчёта`;

export function createInitialState(): EngineState {
  return {
    folders: new Map([
      [
        'demo/config',
        new Map<string, VfsEntry>([
          ['app.ini', { content: 'PORT=5432\nHOST=127.0.0.1\n' }],
          ['cache.conf', { content: 'ENABLED=true\n' }],
          ['display.conf', { content: 'THEME=light\n' }],
          ['logging.conf', { content: 'LEVEL=info\n' }],
          ['network.conf', { content: 'TIMEOUT=30\n' }],
        ]),
      ],
    ]),
    baselines: new Map(),
    reports: new Map(),
  };
}

export function normalizePath(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export function parentOf(p: string): string {
  const parts = normalizePath(p).split('/');
  parts.pop();
  return parts.join('/');
}

export function pathsConflict(a: string, b: string): boolean {
  const n1 = normalizePath(a);
  const n2 = normalizePath(b);
  if (n1 === n2) return true;
  return n2.startsWith(n1 + '/') || n1.startsWith(n2 + '/');
}

export function parentExists(state: EngineState, p: string): boolean {
  const parent = parentOf(p);
  if (parent === '') return true;
  for (const path of [...state.folders.keys(), ...state.baselines.keys()]) {
    if (path === parent || path.startsWith(parent + '/')) return true;
  }
  return false;
}

export const errLine = (code: string, text: string) => `classconfig: error: ${code}: ${text}`;

export function splitLogicalLines(text: string): string[] {
  const t = text.replace(/\r\n/g, '\n');
  if (t === '') return [];
  return (t.endsWith('\n') ? t.slice(0, -1) : t).split('\n');
}

interface ValidatedFile {
  name: string;
  sizeBytes: number;
  sha256: string;
  lines: string[];
}

export async function inspectFolder(
  state: EngineState,
  sourcePath: string,
  opts: EngineOptions
): Promise<{ files: ValidatedFile[] } | { errors: string[] }> {
  const folder = state.folders.get(normalizePath(sourcePath));
  if (!folder) {
    return { errors: [errLine('SOURCE_NOT_FOUND', `папка не найдена: ${sourcePath}`)] };
  }
  const names = [...folder.keys()].sort();
  if (names.length > MAX_FILES) {
    return { errors: [errLine('TOO_MANY_FILES', `в папке больше 20 объектов: ${names.length}`)] };
  }
  const errors: string[] = [];
  const files: ValidatedFile[] = [];
  for (const name of names) {
    const e = folder.get(name)!;
    if (e.isSymlink) {
      errors.push(errLine('UNSUPPORTED_SYMLINK', `символические ссылки не поддерживаются: ${name}`));
      continue;
    }
    if (e.isDirectory) {
      errors.push(errLine('UNSUPPORTED_DIRECTORY', `вложенные каталоги не поддерживаются: ${name}`));
      continue;
    }
    const size = e.sizeBytes ?? new TextEncoder().encode(e.content).length;
    if (size > MAX_FILE_BYTES) {
      errors.push(errLine('FILE_TOO_LARGE', `файл превышает 1 МиБ: ${name}`));
      continue;
    }
    if (e.isBinary || e.content.includes('\u0000')) {
      errors.push(errLine('UNSUPPORTED_CONTENT', `файл не является текстом UTF-8: ${name}`));
      continue;
    }
    files.push({
      name,
      sizeBytes: size,
      sha256: await opts.sha256(e.content),
      lines: splitLogicalLines(e.content),
    });
  }
  if (errors.length) return { errors };
  return { files };
}

export function diffLines(baseline: string[], source: string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  const walk = (bStart: number, bEnd: number, sStart: number, sEnd: number) => {
    const eqStartB = bStart;
    const eqStartS = sStart;
    while (bStart < bEnd && sStart < sEnd && baseline[bStart] === source[sStart]) {
      bStart++;
      sStart++;
    }
    if (bStart > eqStartB)
      ops.push({
        tag: 'equal',
        baselineLines: baseline.slice(eqStartB, bStart),
        sourceLines: source.slice(eqStartS, sStart),
        baselineStart: eqStartB,
        sourceStart: eqStartS,
      });
    const tailB = bEnd;
    const tailS = sEnd;
    while (bStart < bEnd && sStart < sEnd && baseline[bEnd - 1] === source[sEnd - 1]) {
      bEnd--;
      sEnd--;
    }
    if (bStart === bEnd && sStart === sEnd) {
      if (bEnd < tailB)
        ops.push({
          tag: 'equal',
          baselineLines: baseline.slice(bEnd, tailB),
          sourceLines: source.slice(sEnd, tailS),
          baselineStart: bEnd,
          sourceStart: sEnd,
        });
      return;
    }
    if (bStart === bEnd) {
      ops.push({
        tag: 'insert',
        baselineLines: [],
        sourceLines: source.slice(sStart, sEnd),
        baselineStart: bStart,
        sourceStart: sStart,
      });
      if (bEnd < tailB)
        ops.push({
          tag: 'equal',
          baselineLines: baseline.slice(bEnd, tailB),
          sourceLines: source.slice(sEnd, tailS),
          baselineStart: bEnd,
          sourceStart: sEnd,
        });
      return;
    }
    if (sStart === sEnd) {
      ops.push({
        tag: 'delete',
        baselineLines: baseline.slice(bStart, bEnd),
        sourceLines: [],
        baselineStart: bStart,
        sourceStart: sStart,
      });
      if (bEnd < tailB)
        ops.push({
          tag: 'equal',
          baselineLines: baseline.slice(bEnd, tailB),
          sourceLines: source.slice(sEnd, tailS),
          baselineStart: bEnd,
          sourceStart: sEnd,
        });
      return;
    }
    let bestLen = -1;
    let bestB = bStart;
    let bestS = sStart;
    for (let bi = bStart; bi < bEnd; bi++) {
      for (let si = sStart; si < sEnd; si++) {
        if (baseline[bi] !== source[si]) continue;
        let len = 0;
        while (bi + len < bEnd && si + len < sEnd && baseline[bi + len] === source[si + len]) len++;
        if (len > bestLen) {
          bestLen = len;
          bestB = bi;
          bestS = si;
        }
      }
    }
    if (bestLen <= 0) {
      ops.push({
        tag: 'delete',
        baselineLines: baseline.slice(bStart, bEnd),
        sourceLines: [],
        baselineStart: bStart,
        sourceStart: sStart,
      });
      ops.push({
        tag: 'insert',
        baselineLines: [],
        sourceLines: source.slice(sStart, sEnd),
        baselineStart: bEnd,
        sourceStart: sStart,
      });
      if (bEnd < tailB)
        ops.push({
          tag: 'equal',
          baselineLines: baseline.slice(bEnd, tailB),
          sourceLines: source.slice(sEnd, tailS),
          baselineStart: bEnd,
          sourceStart: sEnd,
        });
      return;
    }
    if (bestB > bStart || bestS > sStart) walk(bStart, bestB, sStart, bestS);
    ops.push({
      tag: 'equal',
      baselineLines: baseline.slice(bestB, bestB + bestLen),
      sourceLines: source.slice(bestS, bestS + bestLen),
      baselineStart: bestB,
      sourceStart: bestS,
    });
    if (bestB + bestLen < bEnd || bestS + bestLen < sEnd)
      walk(bestB + bestLen, bEnd, bestS + bestLen, sEnd);
    if (bEnd < tailB)
      ops.push({
        tag: 'equal',
        baselineLines: baseline.slice(bEnd, tailB),
        sourceLines: source.slice(sEnd, tailS),
        baselineStart: bEnd,
        sourceStart: sEnd,
      });
  };

  const merged: DiffOp[] = [];
  for (const op of (walk(0, baseline.length, 0, source.length), ops)) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.tag === op.tag &&
      prev.baselineStart + prev.baselineLines.length === op.baselineStart &&
      prev.sourceStart + prev.sourceLines.length === op.sourceStart
    ) {
      prev.baselineLines = prev.baselineLines.concat(op.baselineLines);
      prev.sourceLines = prev.sourceLines.concat(op.sourceLines);
    } else {
      merged.push({ ...op });
    }
  }
  return merged;
}

export function compareBaselines(
  sourcePath: string,
  baselinePath: string,
  reportPath: string,
  baseline: Baseline,
  sourceFiles: ValidatedFile[],
  checkedAt: string
): ComparisonResult {
  const names = [...new Set([...baseline.copies.keys(), ...sourceFiles.map((f) => f.name)])].sort();
  const files: FileComparison[] = [];
  let c = 0,
    a = 0,
    d = 0,
    u = 0;
  const baselineNames = new Set(baseline.manifest.files.map((f) => f.name));
  for (const name of names) {
    const inBase = baselineNames.has(name);
    const src = sourceFiles.find((f) => f.name === name);
    const baseEntry = baseline.manifest.files.find((f) => f.name === name);
    const baseLines = splitLogicalLines(baseline.copies.get(name) ?? '');
    if (inBase && src) {
      if (src.sha256 === baseEntry!.sha256 || sameLines(baseLines, src.lines)) {
        u++;
        files.push({ name, status: 'unchanged', baselineLines: baseLines, sourceLines: src.lines, diffOps: [] });
      } else {
        c++;
        files.push({
          name,
          status: 'changed',
          baselineLines: baseLines,
          sourceLines: src.lines,
          diffOps: diffLines(baseLines, src.lines),
        });
      }
    } else if (inBase) {
      d++;
      files.push({ name, status: 'deleted', baselineLines: baseLines, sourceLines: [], diffOps: [] });
    } else {
      a++;
      files.push({ name, status: 'added', baselineLines: [], sourceLines: src!.lines, diffOps: [] });
    }
  }
  return {
    checkedAt,
    sourcePath,
    baselinePath,
    reportPath,
    files,
    countChanged: c,
    countAdded: a,
    countDeleted: d,
    countUnchanged: u,
    hasDifferences: c + a + d > 0,
  };
}

function sameLines(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const STATUS_RU: Record<FileStatus, string> = {
  unchanged: 'Без изменений',
  changed: 'Изменён',
  added: 'Добавлен',
  deleted: 'Удалён',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function diffRows(f: FileComparison): string {
  const rows: string[] = [];
  const row = (
    cls: string,
    bn: string,
    bc: [string, string],
    sn: string,
    sc: [string, string]
  ) =>
    `<tr class="diff-row ${cls}"><td class="line-num">${bn}</td><td class="line-content ${bc[0]}">${bc[1] ?? ''}</td><td class="line-num">${sn}</td><td class="line-content ${sc[0]}">${sc[1] ?? ''}</td></tr>`;
  if (f.status === 'added') {
    f.sourceLines.forEach((l, i) => rows.push(row('diff-added', '', ['empty-side', ''], String(i + 1), ['insert-side', esc(l)])));
  } else if (f.status === 'deleted') {
    f.baselineLines.forEach((l, i) => rows.push(row('diff-deleted', String(i + 1), ['delete-side', esc(l)], '', ['empty-side', ''])));
  } else if (f.status === 'changed') {
    for (const op of f.diffOps) {
      if (op.tag === 'equal') {
        const total = op.baselineLines.length;
        const pushEq = (offset: number) =>
          rows.push(
            row(
              'diff-equal',
              String(op.baselineStart + offset),
              ['', esc(op.baselineLines[offset])],
              String(op.sourceStart + offset),
              ['', esc(op.sourceLines[offset])]
            )
          );
        if (total <= CONTEXT_LINES * 2) {
          for (let i = 0; i < total; i++) pushEq(i);
        } else {
          for (let i = 0; i < CONTEXT_LINES; i++) pushEq(i);
          rows.push(row('diff-collapse', '⋮', ['', ''], '⋮', ['', '']));
          for (let i = total - CONTEXT_LINES; i < total; i++) pushEq(i);
        }
      } else if (op.tag === 'delete') {
        op.baselineLines.forEach((l, i) =>
          rows.push(row('diff-deleted', String(op.baselineStart + i + 1), ['delete-side', esc(l)], '', ['empty-side', '']))
        );
      } else {
        op.sourceLines.forEach((l, i) =>
          rows.push(row('diff-added', '', ['empty-side', ''], String(op.sourceStart + i + 1), ['insert-side', esc(l)]))
        );
      }
    }
  }
  return rows.join('\n');
}

export function generateHtmlReport(r: ComparisonResult): string {
  const verdict = r.files.length === 0 ? 'Файлов нет. Папка совпадает с эталоном.' : r.hasDifferences ? 'Отличия найдены.' : 'Отличий нет.';
  const listRows = r.files
    .map(
      (f) =>
        `<tr><td class="file-name">${esc(f.name)}</td><td><span class="badge badge-${f.status}">${STATUS_RU[f.status]}</span></td></tr>`
    )
    .join('\n');
  const sections = r.files
    .filter((f) => f.status !== 'unchanged')
    .map(
      (f) => `<section class="file-block">
  <h3>${esc(f.name)} <span class="badge badge-${f.status}">${STATUS_RU[f.status]}</span></h3>
  <table class="diff-table">
    <thead><tr><th>№</th><th>Было (Эталон)</th><th>№</th><th>Стало (Папка)</th></tr></thead>
    <tbody>${diffRows(f)}</tbody>
  </table>
</section>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>ClassConfig — отчёт различий</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; padding: 24px; }
  .wrap { max-width: 1000px; margin: 0 auto; }
  .disclaimer { background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: 12px 16px; font-size: 14px; }
  .meta { font-size: 13px; color: #475569; margin: 14px 0; line-height: 1.7; }
  .meta code { background: #e2e8f0; padding: 1px 5px; border-radius: 4px; }
  .badges { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge-changed { background: #fef3c7; color: #92400e; }
  .badge-added { background: #dcfce7; color: #166534; }
  .badge-deleted { background: #fee2e2; color: #991b1b; }
  .badge-unchanged { background: #e2e8f0; color: #334155; }
  table { border-collapse: collapse; width: 100%; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th, td { text-align: left; padding: 6px 10px; font-size: 13px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; font-size: 12px; text-transform: uppercase; color: #475569; }
  .file-block { margin: 22px 0; }
  .file-block h3 { font-size: 15px; }
  .diff-table { font-family: ui-monospace, monospace; table-layout: fixed; }
  .diff-table th, .diff-table td { border: 1px solid #e2e8f0; }
  .line-num { width: 42px; color: #94a3b8; text-align: right; user-select: none; }
  .line-content { white-space: pre-wrap; word-break: break-all; }
  .delete-side { background: #fee2e2; }
  .insert-side { background: #dcfce7; }
  .empty-side { background: #f8fafc; }
  .diff-collapse td { background: #f1f5f9; text-align: center; color: #64748b; }
</style>
</head>
<body><div class="wrap">
  <div class="disclaimer">⚠️ Отчёт подтверждает только совпадение выбранной папки с сохранённым эталоном. Работоспособность программ не проверяется.</div>
  <div class="meta">
    Проверка выполнена: <code>${esc(r.checkedAt)}</code><br>
    Папка: <code>${esc(r.sourcePath)}</code><br>
    Эталон: <code>${esc(r.baselinePath)}</code><br>
    Итог: <strong>${verdict}</strong>
  </div>
  <div class="badges">
    <span class="badge badge-changed">Изменён: ${r.countChanged}</span>
    <span class="badge badge-added">Добавлен: ${r.countAdded}</span>
    <span class="badge badge-deleted">Удалён: ${r.countDeleted}</span>
    <span class="badge badge-unchanged">Без изменений: ${r.countUnchanged}</span>
  </div>
  <table>
    <thead><tr><th>Файл</th><th>Статус</th></tr></thead>
    <tbody>${listRows}</tbody>
  </table>
  ${sections}
</div></body>
</html>
`;
}

class CliError extends Error {
  lines: string[];
  constructor(lines: string[]) {
    super(lines[0]);
    this.lines = lines;
  }
}

function fail(code: string, text: string): never {
  throw new CliError([errLine(code, text)]);
}

function tokenize(line: string): string[] {
  const args: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) args.push(m[1] ?? m[2] ?? m[3]);
  return args;
}

export function tokenizeCommand(line: string): string[] {
  let t = tokenize(line.trim());
  if (t.length && /^python3?$/.test(t[0])) t = t.slice(1);
  while (t.length && t[0] === '-m') t = t.slice(2);
  if (t.length && t[0] === 'classconfig') t = t.slice(1);
  return t;
}

function parseNamedArgs(args: string[], allowed: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      if (arg.includes('=')) {
        const [key, ...rest] = arg.slice(2).split('=');
        const val = rest.join('=');
        if (!key) fail('INVALID_ARGUMENTS', `некорректный параметр: ${arg}`);
        if (!allowed.includes(key)) fail('INVALID_ARGUMENTS', `неизвестный параметр: --${key}`);
        if (key in result) fail('INVALID_ARGUMENTS', `повторяющийся параметр: --${key}`);
        result[key] = val;
        i += 1;
      } else {
        const key = arg.slice(2);
        if (!key) fail('INVALID_ARGUMENTS', `некорректный параметр: ${arg}`);
        if (!allowed.includes(key)) fail('INVALID_ARGUMENTS', `неизвестный параметр: --${key}`);
        if (key in result) fail('INVALID_ARGUMENTS', `повторяющийся параметр: --${key}`);
        if (i + 1 >= args.length || args[i + 1].startsWith('--'))
          fail('INVALID_ARGUMENTS', `пропущено значение параметра --${key}`);
        result[key] = args[i + 1];
        i += 2;
      }
    } else {
      fail('INVALID_ARGUMENTS', `неожиданный аргумент: ${arg}`);
    }
  }
  return result;
}

const cloneState = (s: EngineState): EngineState => ({
  folders: new Map([...s.folders].map(([k, v]) => [k, new Map(v)])),
  baselines: new Map(s.baselines),
  reports: new Map(s.reports),
});

export async function runCommand(
  state: EngineState,
  args: string[],
  opts: EngineOptions = DEFAULT_OPTIONS
): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const next = cloneState(state);
  const out = (s: string) => (stdout += s);
  const err = (lines: string[]) => (stderr += lines.join('\n') + '\n');

  try {
    if (args.length === 0) {
      out(HELP_TEXT + '\n');
      return { code: 2, stdout, stderr, state: next };
    }
    const cmd = args[0];
    if (cmd === '--help') {
      out(HELP_TEXT + '\n');
      return { code: 0, stdout, stderr, state: next };
    }
    if (cmd === 'snapshot') {
      const rest = args.slice(1);
      if (rest.includes('--help')) {
        out(SNAPSHOT_HELP + '\n');
        return { code: 0, stdout, stderr, state: next };
      }
      const p = parseNamedArgs(rest, ['source', 'baseline']);
      if (!p.source) fail('INVALID_ARGUMENTS', 'пропущен обязательный параметр --source');
      if (!p.baseline) fail('INVALID_ARGUMENTS', 'пропущен обязательный параметр --baseline');
      const source = normalizePath(p.source);
      const baseline = normalizePath(p.baseline);
      if (pathsConflict(source, baseline))
        fail('PATH_CONFLICT', 'пути папки, эталона и отчёта пересекаются');
      if (!next.folders.has(source)) fail('SOURCE_NOT_FOUND', `папка не найдена: ${p.source}`);
      if (!parentExists(next, baseline)) fail('PARENT_NOT_FOUND', `родительский каталог не существует: ${parentOf(p.baseline)}`);
      if (next.baselines.has(baseline))
        fail('BASELINE_EXISTS', `каталог эталона уже существует: ${p.baseline}. Укажите новый путь`);
      const inspected = await inspectFolder(next, source, opts);
      if ('errors' in inspected) throw new CliError(inspected.errors);
      const createdAt = opts.now();
      const copies = new Map<string, string>();
      for (const f of inspected.files) copies.set(f.name, next.folders.get(source)!.get(f.name)!.content);
      next.baselines.set(baseline, {
        manifest: {
          version: MANIFEST_VERSION,
          created_at: createdAt,
          source_path: source,
          encoding: 'utf-8',
          limits: { max_files: MAX_FILES, max_file_bytes: MAX_FILE_BYTES },
          files: inspected.files.map((f) => ({ name: f.name, size_bytes: f.sizeBytes, sha256: f.sha256 })),
        },
        copies,
      });
      out(`Эталон сохранён.\nПапка: ${p.source}\nЭталон: ${p.baseline}\nФайлов: ${inspected.files.length}\nСоздан: ${createdAt}\n`);
      return { code: 0, stdout, stderr, state: next };
    }
    if (cmd === 'check') {
      const rest = args.slice(1);
      if (rest.includes('--help')) {
        out(CHECK_HELP + '\n');
        return { code: 0, stdout, stderr, state: next };
      }
      const p = parseNamedArgs(rest, ['source', 'baseline', 'report']);
      if (!p.source) fail('INVALID_ARGUMENTS', 'пропущен обязательный параметр --source');
      if (!p.baseline) fail('INVALID_ARGUMENTS', 'пропущен обязательный параметр --baseline');
      if (!p.report) fail('INVALID_ARGUMENTS', 'пропущен обязательный параметр --report');
      const source = normalizePath(p.source);
      const baseline = normalizePath(p.baseline);
      const report = normalizePath(p.report);
      if (
        pathsConflict(source, baseline) ||
        pathsConflict(source, report) ||
        pathsConflict(baseline, report)
      )
        fail('PATH_CONFLICT', 'пути папки, эталона и отчёта пересекаются');
      if (!next.folders.has(source)) fail('SOURCE_NOT_FOUND', `папка не найдена: ${p.source}`);
      if (!next.baselines.has(baseline)) fail('BASELINE_NOT_FOUND', `эталон не найден: ${p.baseline}`);
      if (!parentExists(next, report)) fail('PARENT_NOT_FOUND', `родительский каталог не существует: ${parentOf(p.report)}`);
      const inspected = await inspectFolder(next, source, opts);
      if ('errors' in inspected) throw new CliError(inspected.errors);
      const result = compareBaselines(
        p.source,
        p.baseline,
        p.report,
        next.baselines.get(baseline)!,
        inspected.files,
        opts.now()
      );
      const html = generateHtmlReport(result);
      next.reports.set(report, html);
      out(
        `Проверка завершена.\nИзменён: ${result.countChanged}\nДобавлен: ${result.countAdded}\nУдалён: ${result.countDeleted}\nБез изменений: ${result.countUnchanged}\nОтчёт: ${p.report}\nОтчёт подтверждает только совпадение выбранной папки с эталоном.\n`
      );
      return {
        code: result.hasDifferences ? 1 : 0,
        stdout,
        stderr,
        state: next,
        reportHtml: html,
      };
    }
    fail('INVALID_ARGUMENTS', `неизвестная команда: ${cmd}`);
  } catch (e) {
    if (e instanceof CliError) {
      err(e.lines);
      return { code: 2, stdout, stderr, state: next };
    }
    throw e;
  }
}

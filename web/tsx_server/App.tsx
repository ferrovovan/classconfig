// SPDX-License-Identifier: GPL-3.0-or-later
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Layers, FolderTree, TerminalSquare, FileSpreadsheet, FlaskConical, Bot, FileText, ShieldCheck } from 'lucide-react';
import {
  createInitialState,
  runCommand,
  tokenizeCommand,
  EngineState,
  VfsEntry,
} from './utils/engine';
import { runAcceptanceSuite, WEB_SHA256_OPTIONS, TestOutcome } from './utils/clientTests';
import { Terminal, TermLine } from './components/Terminal';
import { VfsEditor } from './components/VfsEditor';
import { Scenario, SCENARIO_STEPS } from './components/Scenario';
import { ReportViewer } from './components/ReportViewer';
import { McpHub } from './components/McpHub';
import { GuideGenerator } from './components/GuideGenerator';

type TabId = 'scenario' | 'vfs' | 'terminal' | 'report' | 'tests' | 'mcp' | 'template';

const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'scenario', label: 'Демо сценарий', icon: Layers },
  { id: 'vfs', label: 'Виртуальная папка', icon: FolderTree },
  { id: 'terminal', label: 'Терминал CLI', icon: TerminalSquare },
  { id: 'report', label: 'Отчёт (HTML)', icon: FileSpreadsheet },
  { id: 'tests', label: 'Приёмочные тесты (20)', icon: FlaskConical },
  { id: 'mcp', label: 'AI & MCP', icon: Bot },
  { id: 'template', label: 'Генератор руководства', icon: FileText },
];

const INITIAL_LINES: TermLine[] = [
  { kind: 'out', text: 'ClassConfig Web Demo — виртуальная папка demo/config (5 файлов), эталон ещё не создан.' },
  { kind: 'out', text: 'Прогоните демонстрационный сценарий или введите команду, напр.: python3 -m classconfig --help' },
];

export default function App() {
  const [state, setState] = useState<EngineState>(createInitialState);
  const stateRef = useRef<EngineState>(state);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const commitState = useCallback((next: EngineState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const [lines, setLines] = useState<TermLine[]>(INITIAL_LINES);
  const [tab, setTab] = useState<TabId>('scenario');
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [testResults, setTestResults] = useState<TestOutcome[] | null>(null);
  const [testsRunning, setTestsRunning] = useState(false);

  const folderName = 'demo/config';

  const push = useCallback((ls: TermLine[]) => setLines((prev) => [...prev, ...ls]), []);

  const editFolder = useCallback((mutate: (f: Map<string, VfsEntry>) => void) => {
    const next = structuredClone(stateRef.current);
    const folder = next.folders.get('demo/config') ?? new Map<string, VfsEntry>();
    mutate(folder);
    next.folders.set('demo/config', folder);
    commitState(next);
  }, [commitState]);

  const applyVfs = useCallback(
    (args: string[]): TermLine[] => {
      const sub = args[1];
      const contentOf = (arg?: string) => (arg ?? '').replace(/\\n/g, '\n').replace(/\n$/, '') + '\n';
      if (sub === 'set' || sub === 'add') {
        const path = args[2];
        const name = path.split('/').pop()!;
        const had = stateRef.current.folders.get('demo/config')?.has(name) ?? false;
        editFolder((f) => f.set(name, { content: contentOf(args.slice(3).join(' ')) }));
        return [{ kind: 'out', text: `${had ? 'Изменён' : 'Добавлен'}: ${path}` }];
      }
      if (sub === 'rm') {
        const name = args[2].split('/').pop()!;
        editFolder((f) => f.delete(name));
        return [{ kind: 'out', text: `Удалён: ${args[2]}` }];
      }
      if (sub === 'restore') {
        const pristine = createInitialState().folders.get('demo/config')!;
        editFolder((f) => {
          f.clear();
          for (const [k, v] of pristine) f.set(k, v);
        });
        return [{ kind: 'out', text: 'demo/config восстановлена к исходному состоянию' }];
      }
      return [{ kind: 'err', text: 'classconfig: error: INVALID_ARGUMENTS: неизвестная vfs-команда (set|add|rm|restore)' }];
    },
    [editFolder]
  );

  const runLine = useCallback(
    (line: string) => {
      queueRef.current = queueRef.current.then(async () => {
        const out: TermLine[] = [{ kind: 'cmd', text: `$ ${line}` }];
        const trimmed = line.trim();
        if (trimmed.startsWith('vfs ')) {
          out.push(...applyVfs(tokenizeCommand(trimmed)));
          push(out);
          return;
        }
        const args = tokenizeCommand(trimmed);
        const r = await runCommand(stateRef.current, args, WEB_SHA256_OPTIONS);
        if (r.stdout) out.push({ kind: 'out', text: r.stdout.trimEnd() });
        if (r.stderr) out.push({ kind: 'err', text: r.stderr.trimEnd() });
        out.push({ kind: 'code', text: `exit code: ${r.code}` });
        commitState(r.state);
        setLastCode(r.code);
        if (r.reportHtml) setReportHtml(r.reportHtml);
        push(out);
      });
    },
    [applyVfs, commitState, push]
  );

  const runStep = useCallback(
    (index: number) => {
      if (index >= SCENARIO_STEPS.length) return;
      setActiveStep(index);
      runLine(SCENARIO_STEPS[index].command);
    },
    [runLine]
  );

  const runAll = useCallback(() => {
    let i = 0;
    const tick = () => {
      if (i >= SCENARIO_STEPS.length) {
        setTab('report');
        return;
      }
      runStep(i);
      i++;
      setTimeout(tick, 550);
    };
    tick();
  }, [runStep]);

  const resetSandbox = useCallback(() => {
    commitState(createInitialState());
    setLines([
      { kind: 'out', text: 'Песочница сброшена: demo/config = 5 эталонных файлов, эталоны и отчёты удалены.' },
    ]);
    setReportHtml(null);
    setLastCode(null);
    setActiveStep(0);
  }, [commitState]);

  const runTests = useCallback(async () => {
    setTestsRunning(true);
    setTestResults(await runAcceptanceSuite());
    setTestsRunning(false);
  }, []);

  const vfsFiles = useMemo(
    () => [...(state.folders.get(folderName) ?? new Map<string, VfsEntry>())].sort((a, b) => a[0].localeCompare(b[0])),
    [state]
  );
  const baselinesCount = state.baselines.size;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="max-w-6xl mx-auto px-4 py-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                ClassConfig <span className="text-emerald-400">Web Demo</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Снимок текстовых настроек, сравнение с эталоном и автономный HTML-отчёт • Python 3.10 StdLib •
                0 зависимостей
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <span className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                Python 3.10+ StdLib
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300">
                Работает без сервера
              </span>
              <span className="px-2.5 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-indigo-300">
                GitHub Pages Ready
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-[11px] font-mono text-slate-400">
            <span>
              <span className="text-slate-500">Папка:</span> {folderName}
              <span className="text-emerald-400"> ({vfsFiles.filter(([, e]) => !e.isDirectory && !e.isSymlink).length} файлов)</span>
            </span>
            <span>
              <span className="text-slate-500">Эталон:</span>{' '}
              {baselinesCount ? <span className="text-emerald-400">создан ({baselinesCount})</span> : <span className="text-amber-400">нет</span>}
            </span>
            <span>
              <span className="text-slate-500">Последний код:</span>{' '}
              {lastCode === null ? '—' : (
                <span className={lastCode === 0 ? 'text-emerald-400' : lastCode === 1 ? 'text-amber-400' : 'text-rose-400'}>
                  {lastCode} {lastCode === 1 ? '(отличия — штатный успех)' : lastCode === 2 ? '(ошибка)' : ''}
                </span>
              )}
            </span>
          </div>
        </div>
      </header>

      <nav className="max-w-6xl mx-auto px-4 pt-4">
        <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {tab === 'scenario' && (
          <>
            <Scenario activeStep={activeStep} onRunStep={runStep} onRunAll={runAll} onReset={resetSandbox} />
            <Terminal lines={lines} onCommand={runLine} />
          </>
        )}
        {tab === 'vfs' && (
          <VfsEditor
            folderName={folderName}
            files={vfsFiles}
            onSetFile={(name, entry) => editFolder((f) => f.set(name, entry))}
            onDeleteFile={(name) => editFolder((f) => f.delete(name))}
          />
        )}
        {tab === 'terminal' && <Terminal lines={lines} onCommand={runLine} />}
        {tab === 'report' && <ReportViewer html={reportHtml} />}
        {tab === 'tests' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">20 приёмочных тестов (браузерный прогон клиентского движка)</h3>
              </div>
              <button
                onClick={runTests}
                disabled={testsRunning}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg cursor-pointer"
              >
                {testsRunning ? 'Выполнение…' : 'Запустить все тесты'}
              </button>
            </div>
            {testResults ? (
              <>
                <div
                  className={`text-xs font-bold px-3 py-2 rounded-lg border ${
                    testResults.every((t) => t.ok)
                      ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {testResults.filter((t) => t.ok).length} из {testResults.length} OK
                  {testResults.every((t) => t.ok) ? ' — OK' : ''}
                </div>
                <pre className="font-mono text-[11px] max-h-[420px] overflow-auto bg-slate-950 border border-slate-800 rounded-lg p-3 leading-relaxed">
                  {testResults
                    .map((t) => `${t.name} ... ${t.ok ? 'ok' : `FAIL (${t.detail})`}`)
                    .join('\n')}
                </pre>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Тот же набор сценариев, что <code className="text-slate-300">tests/test_acceptance.py</code> для Python
                CLI, но прогоняемый против клиентского движка прямо в браузере.
              </p>
            )}
          </div>
        )}
        {tab === 'mcp' && <McpHub />}
        {tab === 'template' && <GuideGenerator />}
      </main>

      <footer className="max-w-6xl mx-auto px-4 pb-8">
        <div className="flex items-center gap-2 text-[11px] text-slate-500 border-t border-slate-800 pt-4">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          GNU GPLv3 • Отчёт подтверждает только совпадение папки с эталоном • Движок демо воспроизводит CLI 1:1 без бэкенда
        </div>
      </footer>
    </div>
  );
}

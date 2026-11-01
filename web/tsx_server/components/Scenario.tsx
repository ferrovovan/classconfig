// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { Play, RotateCcw, ChevronRight, ListChecks } from 'lucide-react';

export interface ScenarioStep {
  title: string;
  command: string;
  expect: string;
}

export const SCENARIO_STEPS: ScenarioStep[] = [
  {
    title: 'Шаг 1. Сохранение эталона',
    command: 'python3 -m classconfig snapshot --source demo/config --baseline demo/baseline',
    expect: 'код 0',
  },
  {
    title: 'Шаг 2. Проверка без правок',
    command: 'python3 -m classconfig check --source demo/config --baseline demo/baseline --report demo/report.html',
    expect: 'код 0',
  },
  {
    title: 'Шаг 3a. Правка PORT=5432 → 5433 в app.ini',
    command: 'vfs set demo/config/app.ini PORT=5433\\nHOST=127.0.0.1',
    expect: 'файл изменён',
  },
  {
    title: 'Шаг 3b. Удаление display.conf',
    command: 'vfs rm demo/config/display.conf',
    expect: 'файл удалён',
  },
  {
    title: 'Шаг 3c. Добавление extra.conf',
    command: 'vfs add demo/config/extra.conf NOTE=demo',
    expect: 'файл добавлен',
  },
  {
    title: 'Шаг 4. Проверка с изменениями',
    command: 'python3 -m classconfig check --source demo/config --baseline demo/baseline --report demo/report.html',
    expect: 'код 1 (штатный успех)',
  },
  {
    title: 'Шаг 5a. Ручной возврат PORT',
    command: 'vfs set demo/config/app.ini PORT=5432\\nHOST=127.0.0.1',
    expect: 'файл восстановлен',
  },
  {
    title: 'Шаг 5b. Возврат display.conf и удаление extra.conf',
    command: 'vfs restore',
    expect: 'папка = эталон',
  },
  {
    title: 'Шаг 5c. Финальная проверка',
    command: 'python3 -m classconfig check --source demo/config --baseline demo/baseline --report demo/report.html',
    expect: 'код 0',
  },
];

export const Scenario: React.FC<{
  activeStep: number;
  onRunStep: (index: number) => void;
  onRunAll: () => void;
  onReset: () => void;
}> = ({ activeStep, onRunStep, onRunAll, onReset }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-xl space-y-3">
    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
      <div className="flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-bold text-white">Пошаговый демонстрационный сценарий</h3>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onRunAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer"
        >
          <Play className="w-3 h-3 fill-white" /> Прогнать весь сценарий
        </button>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" /> Сброс песочницы
        </button>
      </div>
    </div>
    <ol className="space-y-1">
      {SCENARIO_STEPS.map((s, i) => (
        <li
          key={i}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
            i === activeStep
              ? 'bg-emerald-950/40 border-emerald-500/50'
              : i < activeStep
              ? 'bg-slate-950 border-slate-800 text-slate-500'
              : 'bg-slate-950 border-slate-800 hover:border-slate-600'
          }`}
          onClick={() => onRunStep(i)}
        >
          <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${i === activeStep ? 'text-emerald-400' : 'text-slate-600'}`} />
          <span className="font-semibold w-64 shrink-0">{s.title}</span>
          <code className="font-mono text-[10px] text-slate-400 truncate flex-1">{s.command}</code>
          <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700">
            {s.expect}
          </span>
        </li>
      ))}
    </ol>
  </div>
);

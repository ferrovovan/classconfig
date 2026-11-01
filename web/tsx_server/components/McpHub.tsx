// SPDX-License-Identifier: GPL-3.0-or-later
import React, { useState } from 'react';
import { Bot, Cpu, Terminal, Play, Copy, Check, ShieldCheck, Code, Sparkles, Layers } from 'lucide-react';

interface ToolSchema {
  name: string;
  description: string;
  inputSchema: any;
}

export const McpHub: React.FC = () => {
  const [activeTool, setActiveTool] = useState<string>('classconfig_snapshot');
  const [toolParams, setToolParams] = useState<string>(
    JSON.stringify({ source: 'demo/config', baseline: 'demo/baseline' }, null, 2)
  );
  const [toolResult, setToolResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const mcpTools: ToolSchema[] = [
    {
      name: 'classconfig_snapshot',
      description: 'Атомарное создание эталонного снимка папки (манифест + files/) с расчётом SHA-256.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Путь к проверяемой папке' },
          baseline: { type: 'string', description: 'Путь к создаваемому каталогу эталона' },
        },
        required: ['source', 'baseline'],
      },
    },
    {
      name: 'classconfig_check',
      description: 'Сравнение папки с эталоном, возврат счетчиков и генерация автономного HTML-отчёта.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Путь к проверяемой папке' },
          baseline: { type: 'string', description: 'Путь к каталогу эталона' },
          report: { type: 'string', description: 'Путь к создаваемому HTML-файлу отчёта' },
        },
        required: ['source', 'baseline', 'report'],
      },
    },
    {
      name: 'classconfig_validate',
      description: 'Проверка ограничений папки: ≤20 файлов, ≤1 МиБ, UTF-8, нет симлинков и подкаталогов.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Путь к проверяемой папке' },
        },
        required: ['source'],
      },
    },
    {
      name: 'classconfig_generate_guide',
      description: 'Автоматическая генерация актуального руководства пользователя docs/GUIDE.md.',
      inputSchema: {
        type: 'object',
        properties: {
          project_name: { type: 'string', default: 'ClassConfig' },
          demo_url: { type: 'string' },
          repo_url: { type: 'string' },
        },
      },
    },
    {
      name: 'classconfig_get_limits',
      description: 'Получение архитектурных лимитов, констант и 17 кодов ошибок ClassConfig.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];

  const handleSelectTool = (name: string) => {
    setActiveTool(name);
    setToolResult('');
    if (name === 'classconfig_snapshot') {
      setToolParams(JSON.stringify({ source: 'demo/config', baseline: 'demo/baseline' }, null, 2));
    } else if (name === 'classconfig_check') {
      setToolParams(
        JSON.stringify(
          { source: 'demo/config', baseline: 'demo/baseline', report: 'demo/report.html' },
          null,
          2
        )
      );
    } else if (name === 'classconfig_validate') {
      setToolParams(JSON.stringify({ source: 'demo/config' }, null, 2));
    } else if (name === 'classconfig_generate_guide') {
      setToolParams(
        JSON.stringify(
          {
            project_name: 'ClassConfig',
            demo_url: 'https://ferrovovan.github.io/classconfig',
          },
          null,
          2
        )
      );
    } else if (name === 'classconfig_get_limits') {
      setToolParams('{}');
    }
  };

  const executeMcpTool = async () => {
    setIsLoading(true);
    setToolResult('Вызов инструмента MCP...');
    try {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(toolParams);
      } catch (e) {
        setToolResult('Ошибка: некорректный JSON параметров');
        setIsLoading(false);
        return;
      }

      const resp = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: activeTool, arguments: parsedArgs }),
      });

      if (resp.ok) {
        const data = await resp.json();
        setToolResult(JSON.stringify(data, null, 2));
      } else {
        throw new Error('API offline');
      }
    } catch (e) {
      // Клиентский эмулятор для GitHub Pages
      await new Promise((r) => setTimeout(r, 300));
      if (activeTool === 'classconfig_get_limits') {
        setToolResult(
          JSON.stringify(
            {
              limits: {
                MAX_FILES: 20,
                MAX_FILE_BYTES: 1048576,
                ENCODING: 'utf-8',
                MANIFEST_VERSION: 1,
                CONTEXT_LINES: 3,
              },
              exit_codes: {
                0: 'Success (No differences or snapshot created)',
                1: 'Success with differences found (Normal audit outcome)',
                2: 'Error occurred (Validation or disk failure)',
              },
            },
            null,
            2
          )
        );
      } else if (activeTool === 'classconfig_generate_guide') {
        setToolResult(
          JSON.stringify(
            {
              success: true,
              file: 'docs/GUIDE.md',
              message: 'Руководство успешно сформировано генератором документации.',
            },
            null,
            2
          )
        );
      } else {
        setToolResult(
          JSON.stringify(
            {
              status: 'success',
              tool: activeTool,
              clientSimulation: true,
              result: 'Команда успешно смоделирована в среде браузера.',
            },
            null,
            2
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const claudeDesktopConfig = `{
  "mcpServers": {
    "classconfig": {
      "command": "python3",
      "args": ["-m", "mcp"],
      "cwd": "/path/to/classconfig",
      "env": {
        "PYTHONPATH": "/path/to/classconfig"
      }
    }
  }
}`;

  const aiInstructionsSnippet = `# Руководство для ИИ-агентов по ClassConfig

ClassConfig предоставляет 2 строгие CLI-команды для аудита файлов конфигураций:
1. \`snapshot --source <папка> --baseline <новый_каталог>\`:
   - Создаёт эталонный снимок (manifest.json + copies)
   - Возвращает код 0 при успехе, код 2 при сбое (BASELINE_EXISTS).
2. \`check --source <папка> --baseline <каталог> --report <файл.html>\`:
   - Сравнивает текущие файлы с эталоном и строит автономный HTML-отчёт.
   - Код 0: Отличий нет.
   - Код 1: НАЙДЕНЫ ОТЛИЧИЯ (Это штатный успех аудита, НЕ ошибка!).
   - Код 2: Сбой валидации или диска.

Лимиты: макс. 20 файлов, макс. 1 МиБ, UTF-8 без NUL-байтов, плоская папка без симлинков.`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-6">
      {/* Шапка */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-5 border-b border-slate-800 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-Friendly • Model Context Protocol</span>
          </div>
          <h2 className="text-xl font-bold text-white">Интеграция с ИИ-агентами и MCP Сервер</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Готовые инструменты MCP для Claude Desktop, Cursor, Antigravity и автономных агентов.
          </p>
        </div>

        <a
          href="/mcp.json"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700 cursor-pointer"
        >
          <Code className="w-3.5 h-3.5 text-indigo-400" />
          Открыть mcp.json
        </a>
      </div>

      {/* Интерактивный тестер инструментов MCP */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Список инструментов слева */}
        <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-1.5">
          <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-2">
            Доступные инструменты MCP (5)
          </div>
          {mcpTools.map((t) => {
            const isSelected = activeTool === t.name;
            return (
              <div
                key={t.name}
                onClick={() => handleSelectTool(t.name)}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-violet-950/40 border border-violet-500/50 text-white'
                    : 'text-slate-300 hover:bg-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold text-violet-300">{t.name}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">{t.description}</p>
              </div>
            );
          })}
        </div>

        {/* Панель параметров и вызова справа */}
        <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <span className="text-xs font-bold text-slate-200 font-mono">
              Входные аргументы (JSON Schema)
            </span>
            <button
              onClick={executeMcpTool}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer shadow-md"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              {isLoading ? 'Выполнение...' : 'Вызвать инструмент'}
            </button>
          </div>

          <textarea
            value={toolParams}
            onChange={(e) => setToolParams(e.target.value)}
            rows={5}
            className="w-full bg-slate-900 border border-slate-800 rounded-md p-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />

          {toolResult && (
            <div className="space-y-1 mt-2">
              <span className="text-[11px] font-semibold text-slate-400">Результат вызова MCP:</span>
              <pre className="bg-slate-900 p-3 rounded-md border border-slate-800 font-mono text-[11px] text-emerald-400 max-h-48 overflow-auto whitespace-pre-wrap">
                {toolResult}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Готовые конфиги для ИИ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-800">
        {/* Конфиг для Claude Desktop / Cursor */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-violet-400" />
              Claude Desktop / Cursor config
            </span>
            <button
              onClick={() => copyText(claudeDesktopConfig, 'claude')}
              className="text-slate-400 hover:text-white p-1"
            >
              {copiedKey === 'claude' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <pre className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-36">
            {claudeDesktopConfig}
          </pre>
        </div>

        {/* Системный промпт для автономных агентов */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Системный промпт для ИИ-агентов
            </span>
            <button
              onClick={() => copyText(aiInstructionsSnippet, 'prompt')}
              className="text-slate-400 hover:text-white p-1"
            >
              {copiedKey === 'prompt' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <pre className="bg-slate-900/60 p-2.5 rounded border border-slate-800/80 font-mono text-[11px] text-slate-300 overflow-x-auto max-h-36">
            {aiInstructionsSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
};

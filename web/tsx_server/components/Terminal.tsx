// SPDX-License-Identifier: GPL-3.0-or-later
import React, { useEffect, useRef, useState } from 'react';
import { TerminalSquare, CornerDownLeft } from 'lucide-react';

export interface TermLine {
  kind: 'cmd' | 'out' | 'err' | 'code';
  text: string;
}

export const Terminal: React.FC<{
  lines: TermLine[];
  onCommand: (line: string) => void;
}> = ({ lines, onCommand }) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const submit = () => {
    const line = input.trim();
    if (!line) return;
    setHistory((h) => [line, ...h]);
    setHistIdx(-1);
    setInput('');
    onCommand(line);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = Math.min(histIdx + 1, history.length - 1);
      if (history[i] !== undefined) {
        setHistIdx(i);
        setInput(history[i]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const i = histIdx - 1;
      setHistIdx(i);
      setInput(i >= 0 ? history[i] : '');
    }
  };

  return (
    <div
      className="bg-slate-950 border border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <TerminalSquare className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-bold text-slate-200">Терминал CLI (эмулятор движка ClassConfig в браузере)</span>
        <span className="ml-auto text-[10px] text-slate-500">python3 -m classconfig …</span>
      </div>
      <div className="p-4 font-mono text-xs leading-relaxed overflow-y-auto max-h-[420px] min-h-[320px]">
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              l.kind === 'cmd'
                ? 'text-sky-300 mt-2 first:mt-0'
                : l.kind === 'err'
                ? 'text-rose-400'
                : l.kind === 'code'
                ? 'text-amber-400'
                : 'text-slate-300'
            }
          >
            <pre className="whitespace-pre-wrap font-mono">{l.text}</pre>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900 border-t border-slate-800">
        <span className="text-emerald-400 font-mono text-xs select-none">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="snapshot --source demo/config --baseline demo/baseline"
          className="flex-1 bg-transparent outline-none font-mono text-xs text-slate-100 placeholder:text-slate-600"
        />
        <button
          onClick={submit}
          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
        >
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

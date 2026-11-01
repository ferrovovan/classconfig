// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Минималистичный рендерер Markdown -> React (без внешних зависимостей).
 * Поддерживает: заголовки #..######, **жирный**, *курсив*, `код`, ссылки
 * [текст](http...), fenced-блоки ```, списки - и 1., blockquote '>', ---.
 * Весь текст выводится как React-узлы (экранирование гарантировано JSX).
 */

import React from 'react';

type Inline = React.ReactNode;

function renderInline(text: string, keyBase: string): Inline[] {
  const nodes: Inline[] = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*]+)\*)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const key = `${keyBase}-i${i++}`;
    if (m[2] !== undefined) nodes.push(<strong key={key} className="font-bold text-white">{m[2]}</strong>);
    else if (m[4] !== undefined) nodes.push(<code key={key} className="px-1 py-0.5 rounded bg-slate-800 text-emerald-300 font-mono text-[0.92em]">{m[4]}</code>);
    else if (m[6] !== undefined) nodes.push(<em key={key}>{m[6]}</em>);
    else if (m[8] !== undefined)
      nodes.push(
        <a key={key} href={m[8]} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
          {m[8]}
        </a>
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export const MarkdownView: React.FC<{ source: string }> = ({ source }) => {
  const lines = source.split('\n');
  const blocks: React.ReactNode[] = [];
  let k = 0;
  let i = 0;

  const headingCls: Record<number, string> = {
    1: 'text-lg font-black text-white mt-5 mb-2 first:mt-0',
    2: 'text-base font-bold text-white mt-5 mb-2',
    3: 'text-sm font-bold text-indigo-300 mt-4 mb-1.5',
    4: 'text-xs font-bold text-slate-200 mt-3 mb-1',
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k++} className="bg-slate-950 border border-slate-800 rounded-lg p-3 my-2 overflow-x-auto font-mono text-[11px] leading-relaxed text-slate-200">
          {buf.join('\n')}
        </pre>
      );
      continue;
    }

    if (/^\s*---\s*$/.test(line)) {
      blocks.push(<hr key={k++} className="border-slate-800 my-4" />);
      i++;
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      blocks.push(
        React.createElement(`h${lvl}`, { key: k++, className: headingCls[lvl] }, renderInline(h[2], `h${k}`))
      );
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={k++} className="border-l-2 border-indigo-500/60 pl-3 my-2 text-slate-400 italic">
          {renderInline(buf.join(' '), `q${k}`)}
        </blockquote>
      );
      continue;
    }

    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const items: { indent: number; ordered: boolean; text: string }[] = [];
      while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)(?:([-*])|(\d+\.))\s+(.*)$/)!;
        items.push({ indent: Math.floor(m[1].length / 2), ordered: !!m[3], text: m[4] });
        i++;
      }
      const maxIndent = Math.max(...items.map((it) => it.indent));
      const ordered = items.some((it) => it.ordered);
      blocks.push(
        <ul key={k++} className={`my-2 space-y-1 ${ordered ? 'list-decimal' : 'list-disc'}`}>
          {items.map((it, idx) => (
            <li key={idx} className={it.indent >= maxIndent && maxIndent > 0 ? 'ml-6' : ''}>
              {renderInline(it.text, `l${k}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(```|>|#{1,4}\s|\s*(?:[-*]|\d+\.)\s|\s*---\s*$)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={k++} className="my-1.5 leading-relaxed">
        {renderInline(para.join(' '), `p${k}`)}
      </p>
    );
  }

  return <div className="text-xs text-slate-300 font-sans">{blocks}</div>;
};

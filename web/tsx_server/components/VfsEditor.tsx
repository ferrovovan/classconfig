// SPDX-License-Identifier: GPL-3.0-or-later
import React, { useState } from 'react';
import { FileCode2, Plus, Trash2, FolderTree, Save } from 'lucide-react';
import { VfsEntry } from '../utils/engine';

export const VfsEditor: React.FC<{
  folderName: string;
  files: [string, VfsEntry][];
  onSetFile: (name: string, entry: VfsEntry) => void;
  onDeleteFile: (name: string) => void;
}> = ({ folderName, files, onSetFile, onDeleteFile }) => {
  const [selected, setSelected] = useState<string>('app.ini');
  const [draft, setDraft] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const current = files.find(([n]) => n === selected);

  const content = draft !== null && selected === current?.[0] ? draft : current?.[1]?.content ?? '';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-xl space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
        <FolderTree className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-bold text-white">Виртуальная папка <code className="text-indigo-300">{folderName}</code></h3>
        <span className="text-[11px] text-slate-500 ml-2">правьте файлы и запускайте check в терминале</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4 bg-slate-950 border border-slate-800 rounded-lg p-2 space-y-0.5 self-start">
          {files.length === 0 && <p className="text-xs text-slate-500 p-2">Папка пуста</p>}
          {files.map(([name, e]) => (
            <button
              key={name}
              onClick={() => {
                setSelected(name);
                setDraft(null);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left text-xs font-mono cursor-pointer ${
                selected === name ? 'bg-indigo-950/60 text-white border border-indigo-500/40' : 'text-slate-300 hover:bg-slate-900 border border-transparent'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-500" />
              <span className="truncate">{name}</span>
              {e.isDirectory && <span className="ml-auto text-[9px] text-amber-400 shrink-0">DIR</span>}
              {e.isSymlink && <span className="ml-auto text-[9px] text-rose-400 shrink-0">SYMLINK</span>}
            </button>
          ))}
          <form
            className="flex gap-1 pt-2 mt-2 border-t border-slate-800"
            onSubmit={(ev) => {
              ev.preventDefault();
              const n = newName.trim();
              if (!n) return;
              onSetFile(n, { content: 'KEY=value\n' });
              setSelected(n);
              setNewName('');
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="новый.conf"
              className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 font-mono text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400 cursor-pointer" title="Создать файл">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        <div className="md:col-span-8 bg-slate-950 border border-slate-800 rounded-lg flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <span className="text-xs font-mono font-bold text-slate-200">{selected}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  onSetFile(selected, { content });
                  setDraft(null);
                }}
                disabled={draft === null}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white cursor-pointer"
              >
                <Save className="w-3 h-3" /> Сохранить
              </button>
              <button
                onClick={() => {
                  onDeleteFile(selected);
                  setDraft(null);
                }}
                disabled={!current}
                className="p-1.5 rounded bg-slate-800 hover:bg-rose-950 text-rose-400 disabled:text-slate-600 cursor-pointer"
                title="Удалить файл"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <textarea
            value={content}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="w-full flex-1 min-h-[240px] bg-slate-900 p-3 font-mono text-xs text-slate-200 focus:outline-none resize-y"
          />
        </div>
      </div>
    </div>
  );
};

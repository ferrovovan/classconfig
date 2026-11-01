// SPDX-License-Identifier: GPL-3.0-or-later
import React from 'react';
import { FileSpreadsheet, Download, ExternalLink, FileQuestion } from 'lucide-react';

export const ReportViewer: React.FC<{ html: string | null }> = ({ html }) => {
  if (!html) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500 shadow-xl">
        <FileQuestion className="w-10 h-10 mx-auto mb-3 text-slate-600" />
        <p className="text-sm font-semibold text-slate-300">Отчёт ещё не сформирован</p>
        <p className="text-xs mt-1">
          Выполните <code className="text-emerald-400">check</code> в терминале или прогоните демонстрационный сценарий —
          автономный HTML-отчёт появится здесь.
        </p>
      </div>
    );
  }

  const download = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'report.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openTab = () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-200 font-mono">demo/report.html — автономный HTML-отчёт</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={openTab}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 cursor-pointer"
          >
            <ExternalLink className="w-3 h-3" /> Открыть в новой вкладке
          </button>
          <button
            onClick={download}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer"
          >
            <Download className="w-3 h-3" /> Скачать report.html
          </button>
        </div>
      </div>
      <iframe title="HTML-отчёт ClassConfig" srcDoc={html} className="w-full h-[620px] bg-white border-0" sandbox="allow-same-origin" />
    </div>
  );
};

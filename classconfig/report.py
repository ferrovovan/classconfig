# SPDX-License-Identifier: GPL-3.0-or-later
"""Генерация автономного HTML-отчёта."""

from __future__ import annotations
import html
import os
from typing import List

from .errors import ErrorCode, ClassConfigError, make_error
from .limits import CONTEXT_LINES, ENCODING
from .models import ComparisonResult, FileComparison, DiffOp


def escape(s: str) -> str:
    """Экранирует строку для безопасной вставки в HTML (quote=True)."""
    return html.escape(str(s), quote=True)


def build_diff_rows(file_comp: FileComparison) -> str:
    """Генерирует HTML-строки таблицы сравнения 'Было — Стало' с учётом сжатия."""
    if file_comp.status == "unchanged":
        return ""

    rows: List[str] = []

    if file_comp.status == "added":
        for idx, line in enumerate(file_comp.source_lines, start=1):
            rows.append(
                f"<tr class=\"diff-row diff-added\">"
                f"<td class=\"line-num\"></td><td class=\"line-content empty-side\"></td>"
                f"<td class=\"line-num\">{idx}</td><td class=\"line-content insert-side\">{escape(line)}</td>"
                f"</tr>"
            )
        return "\n".join(rows)

    if file_comp.status == "deleted":
        for idx, line in enumerate(file_comp.baseline_lines, start=1):
            rows.append(
                f"<tr class=\"diff-row diff-deleted\">"
                f"<td class=\"line-num\">{idx}</td><td class=\"line-content delete-side\">{escape(line)}</td>"
                f"<td class=\"line-num\"></td><td class=\"line-content empty-side\"></td>"
                f"</tr>"
            )
        return "\n".join(rows)

    # status == "changed"
    for op in file_comp.diff_ops:
        if op.tag == "equal":
            total_lines = len(op.baseline_lines)
            if total_lines <= CONTEXT_LINES:
                for offset in range(total_lines):
                    b_num = op.baseline_start + offset
                    s_num = op.source_start + offset
                    line_val = op.baseline_lines[offset]
                    rows.append(
                        f"<tr class=\"diff-row diff-equal\">"
                        f"<td class=\"line-num\">{b_num}</td><td class=\"line-content\">{escape(line_val)}</td>"
                        f"<td class=\"line-num\">{s_num}</td><td class=\"line-content\">{escape(line_val)}</td>"
                        f"</tr>"
                    )
            else:
                # Длинный непрерывный участок равных строк длиннее трёх сжимается:
                # в таблицу попадают первая и последняя строки участка,
                # а между ними одна строка «строки <i>–<j> без изменений».
                # Первая строка участка:
                first_b_num = op.baseline_start
                first_s_num = op.source_start
                first_line = op.baseline_lines[0]
                rows.append(
                    f"<tr class=\"diff-row diff-equal\">"
                    f"<td class=\"line-num\">{first_b_num}</td><td class=\"line-content\">{escape(first_line)}</td>"
                    f"<td class=\"line-num\">{first_s_num}</td><td class=\"line-content\">{escape(first_line)}</td>"
                    f"</tr>"
                )

                # Пропущенные строки: со второй по предпоследнюю
                skip_start = op.baseline_start + 1
                skip_end = op.baseline_start + total_lines - 2
                rows.append(
                    f"<tr class=\"diff-row diff-collapsed\">"
                    f"<td colspan=\"4\" class=\"collapsed-cell\">"
                    f"&hellip; строки {skip_start}&ndash;{skip_end} без изменений &hellip;"
                    f"</td>"
                    f"</tr>"
                )

                # Последняя строка участка:
                last_b_num = op.baseline_start + total_lines - 1
                last_s_num = op.source_start + total_lines - 1
                last_line = op.baseline_lines[-1]
                rows.append(
                    f"<tr class=\"diff-row diff-equal\">"
                    f"<td class=\"line-num\">{last_b_num}</td><td class=\"line-content\">{escape(last_line)}</td>"
                    f"<td class=\"line-num\">{last_s_num}</td><td class=\"line-content\">{escape(last_line)}</td>"
                    f"</tr>"
                )

        elif op.tag == "replace":
            max_len = max(len(op.baseline_lines), len(op.source_lines))
            for i in range(max_len):
                has_b = i < len(op.baseline_lines)
                has_s = i < len(op.source_lines)
                b_num_str = str(op.baseline_start + i) if has_b else ""
                s_num_str = str(op.source_start + i) if has_s else ""
                b_text = escape(op.baseline_lines[i]) if has_b else ""
                s_text = escape(op.source_lines[i]) if has_s else ""
                b_class = "delete-side" if has_b else "empty-side"
                s_class = "insert-side" if has_s else "empty-side"
                rows.append(
                    f"<tr class=\"diff-row diff-replaced\">"
                    f"<td class=\"line-num\">{b_num_str}</td><td class=\"line-content {b_class}\">{b_text}</td>"
                    f"<td class=\"line-num\">{s_num_str}</td><td class=\"line-content {s_class}\">{s_text}</td>"
                    f"</tr>"
                )

        elif op.tag == "delete":
            for offset, line in enumerate(op.baseline_lines):
                b_num = op.baseline_start + offset
                rows.append(
                    f"<tr class=\"diff-row diff-deleted\">"
                    f"<td class=\"line-num\">{b_num}</td><td class=\"line-content delete-side\">{escape(line)}</td>"
                    f"<td class=\"line-num\"></td><td class=\"line-content empty-side\"></td>"
                    f"</tr>"
                )

        elif op.tag == "insert":
            for offset, line in enumerate(op.source_lines):
                s_num = op.source_start + offset
                rows.append(
                    f"<tr class=\"diff-row diff-added\">"
                    f"<td class=\"line-num\"></td><td class=\"line-content empty-side\"></td>"
                    f"<td class=\"line-num\">{s_num}</td><td class=\"line-content insert-side\">{escape(line)}</td>"
                    f"</tr>"
                )

    return "\n".join(rows)


def generate_html_report(result: ComparisonResult) -> str:
    """Формирует автономный документ HTML-отчёта."""
    total_files = len(result.files)

    # Определение итоговой фразы
    if total_files == 0:
        summary_verdict = "Файлов нет. Папка совпадает с эталоном."
        verdict_class = "verdict-neutral"
    elif not result.has_differences:
        summary_verdict = "Отличий нет."
        verdict_class = "verdict-unchanged"
    else:
        summary_verdict = "Отличия найдены."
        verdict_class = "verdict-changed"

    # Сводная таблица файлов
    file_rows: List[str] = []
    for f in result.files:
        status_class = f"badge-{f.status}"
        file_rows.append(
            f"<tr>"
            f"<td class=\"file-name\">{escape(f.name)}</td>"
            f"<td class=\"file-status\"><span class=\"badge {status_class}\">{escape(f.status_display_ru)}</span></td>"
            f"</tr>"
        )
    files_table_html = "\n".join(file_rows) if file_rows else "<tr><td colspan=\"2\" class=\"empty-cell\">Файлов нет</td></tr>"

    # Блоки строковых различий
    diff_blocks: List[str] = []
    changed_or_diff_files = [f for f in result.files if f.status in ("changed", "added", "deleted")]

    if not changed_or_diff_files:
        diffs_body = "<p class=\"no-diff-text\">Строковых различий нет.</p>"
    else:
        for f in changed_or_diff_files:
            diff_rows = build_diff_rows(f)
            status_badge_class = f"badge-{f.status}"
            diff_blocks.append(
                f"<div class=\"diff-card\">"
                f"  <div class=\"diff-card-header\">"
                f"    <span class=\"diff-file-title\">{escape(f.name)}</span>"
                f"    <span class=\"badge {status_badge_class}\">{escape(f.status_display_ru)}</span>"
                f"  </div>"
                f"  <div class=\"diff-table-container\">"
                f"    <table class=\"diff-table\">"
                f"      <thead>"
                f"        <tr>"
                f"          <th colspan=\"2\" class=\"th-before\">Было (Эталон)</th>"
                f"          <th colspan=\"2\" class=\"th-after\">Стало (Папка)</th>"
                f"        </tr>"
                f"      </thead>"
                f"      <tbody>"
                f"        {diff_rows}"
                f"      </tbody>"
                f"    </table>"
                f"  </div>"
                f"</div>"
            )
        diffs_body = "\n".join(diff_blocks)

    html_content = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClassConfig — отчёт сравнения</title>
  <style>
    :root {{
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --neutral-bg: #f1f5f9;
      --neutral-text: #475569;
      --amber-bg: #fef3c7;
      --amber-text: #92400e;
      --amber-border: #f59e0b;
      --green-bg: #dcfce7;
      --green-text: #166534;
      --green-border: #22c55e;
      --red-bg: #fee2e2;
      --red-text: #991b1b;
      --red-border: #ef4444;
      --blue-accent: #2563eb;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }}
    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      padding: 24px 16px;
    }}
    .container {{
      max-width: 980px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }}
    header {{
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 20px;
    }}
    h1 {{
      font-size: 24px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 12px;
    }}
    .disclaimer-box {{
      background-color: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      margin-bottom: 20px;
      font-size: 14px;
      color: #78350f;
    }}
    .disclaimer-title {{
      font-weight: 600;
      margin-bottom: 4px;
    }}
    .meta-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      background: var(--neutral-bg);
      padding: 16px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 24px;
    }}
    .meta-item {{
      display: flex;
      flex-direction: column;
    }}
    .meta-label {{
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      font-weight: 600;
      margin-bottom: 2px;
    }}
    .meta-value {{
      font-family: var(--font-mono);
      word-break: break-all;
      color: var(--text-main);
      font-weight: 500;
    }}
    section {{
      margin-top: 28px;
    }}
    h2 {{
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .summary-card {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }}
    .counters-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      margin-bottom: 12px;
    }}
    .counter-pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
    }}
    .counter-pill.changed {{ background: var(--amber-bg); color: var(--amber-text); }}
    .counter-pill.added {{ background: var(--green-bg); color: var(--green-text); }}
    .counter-pill.deleted {{ background: var(--red-bg); color: var(--red-text); }}
    .counter-pill.unchanged {{ background: var(--neutral-bg); color: var(--neutral-text); }}
    .verdict-line {{
      font-size: 15px;
      font-weight: 600;
      padding-top: 10px;
      border-top: 1px solid var(--border);
    }}
    .verdict-changed {{ color: #b45309; }}
    .verdict-unchanged {{ color: #15803d; }}
    .verdict-neutral {{ color: var(--text-muted); }}

    .badge {{
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: lowercase;
    }}
    .badge-unchanged {{ background: var(--neutral-bg); color: var(--neutral-text); }}
    .badge-changed {{ background: var(--amber-bg); color: var(--amber-text); }}
    .badge-added {{ background: var(--green-bg); color: var(--green-text); }}
    .badge-deleted {{ background: var(--red-bg); color: var(--red-text); }}

    .files-table {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }}
    .files-table td {{
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }}
    .files-table tr:last-child td {{
      border-bottom: none;
    }}
    .file-name {{
      font-family: var(--font-mono);
      font-weight: 500;
    }}
    .file-status {{
      text-align: right;
      width: 180px;
    }}

    .diff-card {{
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 20px;
      overflow: hidden;
    }}
    .diff-card-header {{
      background: var(--neutral-bg);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
    }}
    .diff-file-title {{
      font-family: var(--font-mono);
      font-weight: 600;
      font-size: 14px;
    }}
    .diff-table-container {{
      overflow-x: auto;
    }}
    .diff-table {{
      width: 100%;
      border-collapse: collapse;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.4;
    }}
    .diff-table th {{
      background: #f1f5f9;
      padding: 8px 12px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      text-align: left;
    }}
    .th-before {{ width: 50%; border-right: 1px solid var(--border); }}
    .th-after {{ width: 50%; }}
    .line-num {{
      width: 44px;
      min-width: 44px;
      text-align: right;
      padding: 4px 8px;
      color: #94a3b8;
      user-select: none;
      background: #f8fafc;
      border-right: 1px solid #f1f5f9;
    }}
    .line-content {{
      padding: 4px 10px;
      white-space: pre-wrap;
      word-break: break-all;
    }}
    .diff-row td:nth-child(2) {{
      border-right: 1px solid var(--border);
    }}
    .diff-row:hover {{
      background-color: #f8fafc;
    }}
    .delete-side {{
      background-color: #fee2e2;
      color: #991b1b;
    }}
    .insert-side {{
      background-color: #dcfce7;
      color: #166534;
    }}
    .empty-side {{
      background-color: #f8fafc;
    }}
    .collapsed-cell {{
      text-align: center;
      padding: 6px 12px;
      color: var(--text-muted);
      font-style: italic;
      background: #f8fafc;
      border-top: 1px dashed var(--border);
      border-bottom: 1px dashed var(--border);
    }}
    .no-diff-text {{
      color: var(--text-muted);
      font-style: italic;
      padding: 12px 0;
    }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>ClassConfig — отчёт сравнения</h1>
      <div class="disclaimer-box">
        <div class="disclaimer-title">Оговорка о смысле отчёта</div>
        <div>Отчёт подтверждает только совпадение выбранной папки с эталоном. Он не показывает исправность программ и не восстанавливает файлы.</div>
      </div>
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Проверка:</span>
          <span class="meta-value">{escape(result.checked_at)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Эталон создан:</span>
          <span class="meta-value">{escape(result.baseline_created_at)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Папка:</span>
          <span class="meta-value">{escape(result.source_path)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Эталон:</span>
          <span class="meta-value">{escape(result.baseline_path)}</span>
        </div>
      </div>
    </header>

    <section>
      <h2>Сводка</h2>
      <div class="summary-card">
        <div class="counters-row">
          <div class="counter-pill changed">
            <span>Изменён:</span> <strong>{result.count_changed}</strong>
          </div>
          <div class="counter-pill added">
            <span>Добавлен:</span> <strong>{result.count_added}</strong>
          </div>
          <div class="counter-pill deleted">
            <span>Удалён:</span> <strong>{result.count_deleted}</strong>
          </div>
          <div class="counter-pill unchanged">
            <span>Без изменений:</span> <strong>{result.count_unchanged}</strong>
          </div>
        </div>
        <div class="verdict-line {verdict_class}">{escape(summary_verdict)}</div>
      </div>
    </section>

    <section>
      <h2>Файлы</h2>
      <table class="files-table">
        <tbody>
          {files_table_html}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Различия</h2>
      {diffs_body}
    </section>
  </div>
</body>
</html>
"""
    return html_content


def write_html_report_atomically(report_path: str, html_content: str) -> None:
    """Атомарно записывает HTML-отчёт во временный файл и заменяет цель."""
    report_parent = os.path.dirname(report_path)
    report_name = os.path.basename(report_path)
    temp_path = os.path.join(report_parent, f".{report_name}.tmp.{os.getpid()}")

    try:
        with open(temp_path, "w", encoding=ENCODING) as f:
            f.write(html_content)

        os.replace(temp_path, report_path)
    except OSError as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise ClassConfigError(
            make_error(ErrorCode.WRITE_ERROR, f"не удалось записать: {report_path}")
        )

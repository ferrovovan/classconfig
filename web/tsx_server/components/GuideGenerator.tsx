// SPDX-License-Identifier: GPL-3.0-or-later
import React, { useState } from 'react';
import { FileText, Download, Copy, Check, RefreshCw, Sparkles, Eye, Code } from 'lucide-react';
import { MarkdownView } from './MarkdownView';

interface GeneratorParams {
  projectName: string;
  projectSubtitle: string;
  demoUrl: string;
  repoUrl: string;
  targetAudience: string;
  corePurpose: string;
  timeToValue: string;
}

const defaultParams: GeneratorParams = {
  projectName: 'ClassConfig',
  projectSubtitle: 'Локальная утилита снимка текстовых настроек, сравнения с эталоном и генерации автономного HTML-отчёта',
  demoUrl: 'https://ferrovovan.github.io/classconfig',
  repoUrl: 'https://github.com/ferrovovan/classconfig',
  targetAudience: 'Разработчики, системные администраторы, QA-инженеры и студенты, проводящие эксперименты с конфигурациями.',
  corePurpose: 'Одной командой создаёт эталон рабочей папки, а после экспериментов выявляет строковые отличия и генерирует автономный HTML-отчёт.',
  timeToValue: '3–5 минут до первого готового отчёта.',
};

export function buildGuideMarkdown(p: GeneratorParams): string {
  return `# Руководство пользователя ClassConfig
## Пошаговое руководство: от первого запуска до HTML-отчёта

**Цель документа**: любой человек, не знакомый с проектом, должен суметь пройти весь путь от первого входа до получения результата, используя только эту инструкцию.

---

## 0. ВВЕДЕНИЕ

* **Название проекта**: **${p.projectName}** (${p.projectSubtitle}).
* **Интерактивное веб-демо**: 
  * Онлайн (GitHub Pages): \`${p.demoUrl}\`
  * Исходный код: \`${p.repoUrl}\`
* **Для кого этот продукт**: ${p.targetAudience}
* **Что он делает**: ${p.corePurpose}
* **Сколько времени займёт знакомство**: **${p.timeToValue}**

---

## 1. ПЕРВЫЙ ВХОД В ПРОДУКТ

### Как попасть в продукт:
Вы можете использовать ClassConfig двумя удобными способами:
1. **Интерактивное веб-демо в браузере (быстрый старт без установки)**:
   * Откройте веб-демо в любом браузере: \`${p.demoUrl}\`
   * Никаких установок или авторизаций не требуется.
2. **Локальная консольная утилита (CLI)**:
   * Откройте терминал на машине с Ubuntu 22.04 LTS (или Linux/macOS/Windows с Python 3.10+).
   * Перейдите в каталог проекта:
     \`\`\`bash
     cd classconfig
     python3 -m classconfig --help
     \`\`\`

### Что нужно сделать на старте:
* Регистрация: **Не требуется**.
* Ввод учётных данных / API-ключей: **Не требуется**.
* Установка внешних библиотек: **Не требуется** (0 pip-пакетов, чистая стандартная библиотека Python 3.10+).

### Что пользователь увидит первым:
* **В веб-демо**: 
  * Верхняя панель со статусом папки \`demo/config\` (5 файлов), состоянием эталона и кодами возврата.
  * Интерактивный Timeline пошагового демонстрационного сценария.
  * Вкладки: **«Демо сценарий»**, **«Виртуальная папка»**, **«Терминал CLI»**, **«Отчёт (HTML)»**, **«Приёмочные тесты (20)»**, **«🤖 AI & MCP»** и **«Генератор руководства»**.
* **В консоли**:
  При вызове \`python3 -m classconfig --help\` выводится краткая справка по двум командам (\`snapshot\` и \`check\`).

---

## 2. ОСНОВНАЯ ФУНКЦИЯ №1 (Core-функция: Создание эталона — \`snapshot\`)

### Название функции:
**Атомарное сохранение эталона (\`snapshot\`)**

### Зачем она нужна пользователю:
Фиксирует исходное, заведомо рабочее состояние конфигурационных файлов до начала экспериментов. С этого момента у вас есть неизменяемая копия для сравнения с контрольными суммами SHA-256.

### Пошаговая инструкция:
1. Пользователь выбирает проверяемую папку (например, \`demo/config\` с 5 файлами: \`app.ini\`, \`display.conf\`, \`logging.conf\`, \`cache.conf\`, \`network.conf\`).
2. В терминале выполняет команду:
   \`\`\`bash
   python3 -m classconfig snapshot --source demo/config --baseline demo/baseline
   \`\`\`
   *(Или в веб-демо нажимает кнопку «Выполнить snapshot»).*
3. Система проверяет лимиты (≤ 20 файлов, ≤ 1 МиБ, UTF-8, нет симлинков и подпапок), атомарно создаёт скрытую временную папку, копирует файлы, считает SHA-256 и переименовывает её в \`demo/baseline\`. Время выполнения: **до 0.1 секунды**.
4. Пользователь получает в \`stdout\` ровно 5 строк и код возврата **0**:
   \`\`\`text
   Эталон сохранён.
   Папка: /абсолютный/путь/demo/config
   Эталон: /абсолютный/путь/demo/baseline
   Файлов: 5
   Создан: 2026-10-30T14:00:00+03:00
   \`\`\`

* **Пример входных данных**: Путь к папке \`--source demo/config\` и свободный путь для нового эталона \`--baseline demo/baseline\`.
* **Пример результата**: Созданный каталог \`demo/baseline/\` с \`manifest.json\` и подкаталогом \`files/\`.

---

## 3. ОСНОВНАЯ ФУНКЦИЯ №2 (Сравнение с эталоном — \`check\`)

### Название функции:
**Сравнение папки с эталоном и классификация статусов (\`check\`)**

### Зачем она нужна:
После того как пользователь отредактировал настройки, добавил новые файлы или удалил ненужные, функция точно выявляет статус каждого файла:
- \`unchanged\` (без изменений);
- \`changed\` (изменён);
- \`added\` (добавлен);
- \`deleted\` (удалён).

### Пошаговая инструкция:
1. Пользователь вносит изменения в конфигурацию (например, меняет \`PORT=5432\` на \`PORT=5433\` в \`app.ini\`, удаляет \`display.conf\`, создаёт \`extra.conf\`).
2. Выполняет команду проверки:
   \`\`\`bash
   python3 -m classconfig check --source demo/config --baseline demo/baseline --report demo/report.html
   \`\`\`
   *(Или в веб-демо нажимает кнопку «Выполнить check (отличия)»).*
3. Программа проверяет эталон на отсутствие повреждений, считывает текущую папку, сопоставляет логические строки через \`difflib.SequenceMatcher\` (игнорируя различия между LF и CRLF).
4. Пользователь получает в \`stdout\` сводку изменений и код возврата **1** (код 1 означает, что проверка завершена успешно и отличия найдены):
   \`\`\`text
   Проверка завершена.
   Изменён: 1
   Добавлен: 1
   Удалён: 1
   Без изменений: 3
   Отчёт: /абсолютный/путь/demo/report.html
   Отчёт подтверждает только совпадение выбранной папки с эталоном.
   \`\`\`

* **Пример входных данных**: \`--source demo/config\`, \`--baseline demo/baseline\`, \`--report demo/report.html\`.
* **Пример результата**: Код возврата \`1\`, консольная сводка и полностью записанный файл \`demo/report.html\`.

---

## 4. ОСНОВНАЯ ФУНКЦИЯ №3 (Автономный HTML-отчёт различий)

### Название функции:
**Генерация и просмотр самодостаточного HTML-отчёта**

### Зачем она нужна (Вау-эффект):
Вместо непонятных портянок консольного вывода пользователь получает презентабельный, готовый к аудиту HTML-документ:
- Полностью автономный: стили встроены внутрь \`<style>\`, нет внешних шрифтов, иконок или JS-библиотек;
- Открывается прямо с диска через \`file://\` в любом браузере;
- Все спецсимволы (\`<\`, \`>\`, \`&\`, кавычки) безопасно экранированы;
- Большие непрерывные блоки одинаковых строк автоматически сжимаются (collapse), оставляя фокус на различиях.

### Пошаговая инструкция:
1. Пользователь дважды кликает по созданному файлу \`demo/report.html\` (или в веб-демо переходит на вкладку **«Отчёт (HTML)»**).
2. Браузер открывает отчёт.
3. Пользователь видит:
   - Оговорку о смысле отчёта в верхней рамке;
   - Метаданные (время проверки, путь к папке и эталону);
   - Цветные бейджи сводки (Изменён: 1, Добавлен: 1, Удалён: 1, Без изменений: 3);
   - Интерактивную двухколоночную таблицу **«Было (Эталон)»** и **«Стало (Папка)»** с номерами строк.
4. Отчёт можно мгновенно распечатать, сохранить в PDF или переслать коллегам как единый файл.

---

## 5. ЧТО ДЕЛАТЬ, ЕСЛИ ЧТО-ТО ПОШЛО НЕ ТАК

Все ошибки завершаются с **кодом 2** и выводят в \`stderr\` строго стандартизированное сообщение вида \`classconfig: error: <CODE>: <текст>\`.

### Ошибка №1: \`BASELINE_EXISTS\`
* **Сообщение**: \`classconfig: error: BASELINE_EXISTS: каталог эталона уже существует: ... Укажите новый путь\`
* **Причина**: Попытка выполнить \`snapshot\` в уже существующий каталог. Эталон по замыслу неизменяем.
* **→ Что делать**: Укажите новый свободный путь каталога, например \`--baseline demo/baseline_v2\`.

### Ошибка №2: \`UNSUPPORTED_DIRECTORY\` или \`UNSUPPORTED_SYMLINK\`
* **Сообщение**: \`classconfig: error: UNSUPPORTED_DIRECTORY: вложенные каталоги не поддерживаются: <имя>\`
* **Причина**: В проверяемой папке обнаружен подкаталог или символическая ссылка.
* **→ Что делать**: Папка конфигураций должна быть плоской. Переместите подпапки или используйте только обычные файлы.

### Ошибка №3: \`PATH_CONFLICT\`
* **Сообщение**: \`classconfig: error: PATH_CONFLICT: пути папки, эталона и отчёта пересекаются\`
* **Причина**: Каталог эталона или файл отчёта указаны внутри проверяемой папки.
* **→ Что делать**: Разместите эталон и отчёт вне проверяемой папки (например, эталон в \`../baseline\`, а отчёт в \`../report.html\`).

### Ошибка №4: \`TOO_MANY_FILES\` или \`FILE_TOO_LARGE\`
* **Сообщение**: \`classconfig: error: TOO_MANY_FILES: в папке больше 20 объектов\` / \`FILE_TOO_LARGE: файл превышает 1 МиБ\`
* **Причина**: Превышены архитектурные лимиты (максимум 20 файлов, максимум 1 048 576 байт на файл).
* **→ Что делать**: Удалите лишние файлы из проверяемой папки или уменьшите их размер.

---

## 6. ЧАСТЫЕ ВОПРОСЫ (FAQ)

### 1. Почему при найденных отличиях возвращается код 1? Это ошибка?
**Нет, код 1 — это штатный успешный результат проверки.**  
- Код 0 означает: проверка прошла, отличий 0.
- Код 1 означает: проверка прошла, строковые отличия найдены. Это позволяет легко использовать утилиту в CI/CD скриптах.
- Код 2 означает: сбой выполнения (ошибка аргументов, диска или повреждение).

### 2. Считается ли различие между переводами строк LF (Linux) и CRLF (Windows) изменением?
**Нет.** Сравнение выполняется по логическим строкам методом \`splitlines()\`. Если текст строк совпадает, файл считается \`unchanged\` (без изменений), даже если в одном файле \`\\n\`, а в другом \`\\r\\n\`.

### 3. Можно ли автоматически откатить изменения к эталону?
**Нет.** Команда отката/восстановления сознательно исключена из продукта: программа только аудирует и сравнивает, не вмешиваясь в файлы пользователя.

### 4. Нужен ли сервер или интернет для открытия отчёта?
**Нет.** Отчёт — это единый файл \`.html\` со встроенным CSS. Он не делает никаких сетевых запросов и открывается локально в любом браузере.

---

*Сгенерировано автоматически генератором документации ClassConfig.*
`;
}

export const GuideGenerator: React.FC = () => {
  const [params, setParams] = useState<GeneratorParams>(defaultParams);
  const [generatedMarkdown, setGeneratedMarkdown] = useState<string>(
    buildGuideMarkdown(defaultParams)
  );
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [copied, setCopied] = useState<boolean>(false);
  const [isSavedOnDisk, setIsSavedOnDisk] = useState<boolean>(false);

  const handleGenerate = async () => {
    const md = buildGuideMarkdown(params);
    setGeneratedMarkdown(md);

    // Попробуем также сохранить на диск через сервер
    try {
      const resp = await fetch('/api/guide/generate', { method: 'POST' });
      if (resp.ok) {
        setIsSavedOnDisk(true);
        setTimeout(() => setIsSavedOnDisk(false), 3000);
      }
    } catch (e) {
      // Статичный режим (GitHub Pages)
    }
  };

  const handleDownload = () => {
    const blob = new Blob([generatedMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'GUIDE.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-xl space-y-6">
      {/* Шапка */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-5 border-b border-slate-800 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Документация</span>
            <span>•</span>
            <span>Автогенерация</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            Генератор руководства пользователя
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Автоматическое формирование Пошагового руководства пользователя на основе параметров проекта.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700 cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Скопировано!' : 'Копировать Markdown'}
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-md cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Скачать .md файл
          </button>
        </div>
      </div>

      {/* Параметры генератора */}
      <div className="bg-slate-950 p-5 rounded-lg border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center justify-between">
          <span>Настраиваемые параметры генерации</span>
          <button
            onClick={() => setParams(defaultParams)}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-normal cursor-pointer flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Сбросить к значениям по умолчанию
          </button>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Название проекта</label>
            <input
              type="text"
              value={params.projectName}
              onChange={(e) => setParams({ ...params, projectName: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Ссылка на веб-демо</label>
            <input
              type="text"
              value={params.demoUrl}
              onChange={(e) => setParams({ ...params, demoUrl: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Ссылка на репозиторий</label>
            <input
              type="text"
              value={params.repoUrl}
              onChange={(e) => setParams({ ...params, repoUrl: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-semibold">Время ознакомления</label>
            <input
              type="text"
              value={params.timeToValue}
              onChange={(e) => setParams({ ...params, timeToValue: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-400 mb-1 font-semibold">Для кого этот продукт</label>
            <input
              type="text"
              value={params.targetAudience}
              onChange={(e) => setParams({ ...params, targetAudience: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <span className="text-xs text-slate-500">
            Файл сохраняется в: <code className="text-emerald-400 font-mono">docs/GUIDE.md</code>
          </span>
          <button
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Обновить и сформировать документ
          </button>
        </div>

        {isSavedOnDisk && (
          <div className="p-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded text-xs text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Файл успешно записан на диск: docs/GUIDE.md</span>
          </div>
        )}
      </div>

      {/* Окно просмотра документа */}
      <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
        <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-200 font-mono">
              docs/GUIDE.md
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode('preview')}
              className={`px-2.5 py-1 rounded font-medium cursor-pointer ${
                viewMode === 'preview' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Предпросмотр
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-2.5 py-1 rounded font-medium cursor-pointer ${
                viewMode === 'raw' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              Сырой Markdown
            </button>
          </div>
        </div>

        <div className="p-5 max-h-[460px] overflow-y-auto">
          {viewMode === 'raw' ? (
            <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {generatedMarkdown}
            </pre>
          ) : (
            <MarkdownView source={generatedMarkdown} />
          )}
        </div>
      </div>
    </div>
  );
};

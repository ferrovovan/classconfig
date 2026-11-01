# Документация API и контрактов ClassConfig (DOCS_API.md)

В данном документе приведено детальное описание архитектуры, внутренних Python-модулей, форматов данных, CLI-контрактов и спецификации манифеста эталона.

---

## 1. Спецификация интерфейса командной строки (CLI)

### Протокол вызова:
```bash
python3 -m classconfig <COMMAND> [OPTIONS]
```

### Доступные команды:

#### `snapshot`
Создаёт эталон выбранной папки в новом каталоге.
- **Параметры**:
  - `--source <ПУТЬ>`: Абсолютный или относительный путь к проверяемой папке.
  - `--baseline <ПУТЬ>`: Путь к создаваемому каталогу эталона.
- **Код возврата**: `0` при успешном создании, `2` при любой ошибке.
- **Формат stdout** (строго 5 строк):
  ```text
  Эталон сохранён.
  Папка: <source>
  Эталон: <baseline>
  Файлов: <число>
  Создан: <created_at>
  ```

#### `check`
Сравнивает текущую папку с ранее созданным эталоном и формирует один автономный HTML-отчёт.
- **Параметры**:
  - `--source <ПУТЬ>`: Путь к проверяемой папке.
  - `--baseline <ПУТЬ>`: Путь к существующему каталогу эталона.
  - `--report <ПУТЬ>`: Путь к сохраняемому файлу `.html`.
- **Код возврата**:
  - `0`: Успех, строковых различий нет (0 изменённых, 0 добавленных, 0 удалённых).
  - `1`: Успех, различия найдены (хотя бы один файл изменён, добавлен или удалён).
  - `2`: Команда не выполнена (ошибка валидации или ввода-вывода).
- **Формат stdout** (строго 7 строк):
  ```text
  Проверка завершена.
  Изменён: <c>
  Добавлен: <a>
  Удалён: <d>
  Без изменений: <u>
  Отчёт: <report>
  Отчёт подтверждает только совпадение выбранной папки с эталоном.
  ```

---

## 2. Спецификация ошибок (stderr и код 2)

Каждая ошибка выводится отдельной строкой в `stderr`:
```text
classconfig: error: <CODE>: <текст>
```

| Код ошибки | Условие возникновения | Шаблон сообщения |
| :--- | :--- | :--- |
| `INVALID_ARGUMENTS` | Неверная команда, неизвестный или пропущенный параметр | `classconfig: error: INVALID_ARGUMENTS: <причина>` |
| `SOURCE_NOT_FOUND` | Папка `--source` не существует на диске | `classconfig: error: SOURCE_NOT_FOUND: папка не найдена: <путь>` |
| `NOT_A_DIRECTORY` | Путь существует, но не является директорией | `classconfig: error: NOT_A_DIRECTORY: путь не является папкой: <путь>` |
| `PATH_CONFLICT` | Папка, эталон и отчёт совпадают или вложены друг в друга | `classconfig: error: PATH_CONFLICT: пути папки, эталона и отчёта пересекаются` |
| `PARENT_NOT_FOUND` | Родительский каталог эталона или отчёта отсутствует | `classconfig: error: PARENT_NOT_FOUND: родительский каталог не существует: <путь>` |
| `BASELINE_EXISTS` | Каталог эталона уже существует при `snapshot` | `classconfig: error: BASELINE_EXISTS: каталог эталона уже существует: <путь>. Укажите новый путь` |
| `BASELINE_NOT_FOUND` | Каталог эталона не найден при `check` | `classconfig: error: BASELINE_NOT_FOUND: эталон не найден: <путь>` |
| `BASELINE_CORRUPT` | Повреждён `manifest.json`, не сходятся хеши или состав `files/` | `classconfig: error: BASELINE_CORRUPT: эталон повреждён или неполон: <что именно>` |
| `TOO_MANY_FILES` | В папке более 20 записей | `classconfig: error: TOO_MANY_FILES: в папке больше 20 объектов: <число>` |
| `UNSUPPORTED_DIRECTORY` | В папке обнаружен подкаталог | `classconfig: error: UNSUPPORTED_DIRECTORY: вложенные каталоги не поддерживаются: <имя>` |
| `UNSUPPORTED_SYMLINK` | В папке обнаружена символическая ссылка | `classconfig: error: UNSUPPORTED_SYMLINK: символические ссылки не поддерживаются: <имя>` |
| `UNSUPPORTED_TYPE` | Не обычный файл (сокет, fifo, блок-устройство) | `classconfig: error: UNSUPPORTED_TYPE: поддерживаются только обычные файлы: <имя>` |
| `FILE_TOO_LARGE` | Размер файла превышает 1 048 576 байт | `classconfig: error: FILE_TOO_LARGE: файл превышает 1 МиБ: <имя>` |
| `UNSUPPORTED_CONTENT` | Файл содержит байт `0x00` (NUL) или не UTF-8 | `classconfig: error: UNSUPPORTED_CONTENT: файл не является текстом UTF-8: <имя>` |
| `READ_ERROR` | Ошибка ОС при чтении файла или каталога | `classconfig: error: READ_ERROR: не удалось прочитать: <имя или путь>` |
| `WRITE_ERROR` | Не удалось записать эталон или отчёт | `classconfig: error: WRITE_ERROR: не удалось записать: <путь>` |
| `REPORT_IS_DIRECTORY` | Путь `--report` указывает на существующий каталог | `classconfig: error: REPORT_IS_DIRECTORY: путь отчёта является каталогом: <путь>` |

---

## 3. Спецификация манифеста эталона (`manifest.json`)

Файл располагается в `<эталон>/manifest.json`, форматируется как UTF-8 с `ensure_ascii=False, indent=2` и символом перевода строки `\n` в конце.

### Пример:
```json
{
  "version": 1,
  "created_at": "2026-10-29T14:00:00+00:00",
  "source_path": "/app/applet/demo/config",
  "encoding": "utf-8",
  "limits": {
    "max_files": 20,
    "max_file_bytes": 1048576
  },
  "files": [
    {
      "name": "app.ini",
      "size_bytes": 25,
      "sha256": "8f42a9b2c3d4e5f6..."
    },
    {
      "name": "display.conf",
      "size_bytes": 12,
      "sha256": "1a2b3c4d5e6f7a8b..."
    }
  ]
}
```

### Требования к полям:
1. `version`: строго целое число `1`.
2. `created_at`: непустая строка в формате ISO 8601 с часовым поясом и точностью до секунды.
3. `source_path`: абсолютный путь к папке на момент снимка.
4. `encoding`: строго строка `"utf-8"`.
5. `limits`: объект с полями `max_files: 20` и `max_file_bytes: 1048576`.
6. `files`: массив записей, отсортированный по имени файла по возрастанию Unicode-кодов. Повторы имён запрещены.
7. В каталоге `<эталон>/files/` содержатся файлы с побайтово идентичным содержимым, размером `size_bytes` и хешем `sha256`. Любые посторонние файлы или подкаталоги внутри `files/` считаются признаком `BASELINE_CORRUPT`.

---

## 4. Описание Python API модулей

### Модуль `classconfig.validate`
- `normalize_path(path: str) -> str`: Возвращает абсолютный нормализованный путь.
- `paths_conflict(p1: str, p2: str) -> bool`: Проверяет пересечение двух путей.
- `validate_snapshot_paths(source_arg: str, baseline_arg: str) -> Tuple[str, str]`: Проверяет корректность путей перед созданием снимка.
- `validate_check_paths(source_arg: str, baseline_arg: str, report_arg: str) -> Tuple[str, str, str]`: Проверяет пути для сравнения.
- `inspect_source_folder(source_path: str) -> List[ValidatedSourceFile]`: Полная валидация папки без рекурсии, проверка `lstat`, размеров и UTF-8 кодировки.

### Модуль `classconfig.snapshot`
- `create_snapshot(source_arg: str, baseline_arg: str) -> BaselineManifest`: Создаёт эталон атомарным переносом временного каталога. Выводит статус в `stdout` и возвращает объект манифеста.

### Модуль `classconfig.compare`
- `load_and_verify_baseline(baseline_path: str) -> Tuple[BaselineManifest, Dict[str, Tuple[bytes, List[str]]]]`: Читает и проверяет целостность эталона.
- `compare_source_with_baseline(source_path: str, baseline_path: str) -> ComparisonResult`: Выполняет сопоставление по логическим строкам и строит diff через `difflib.SequenceMatcher`.

### Модуль `classconfig.report`
- `generate_html_report(result: ComparisonResult) -> str`: Собирает автономный HTML-документ со встроенными стилями и экранированием.
- `write_html_report_atomically(report_path: str, html_content: str) -> None`: Атомарно сохраняет отчёт на диск через временный файл и `os.replace`.

### Модуль `classconfig.generator`
- `generate_user_guide(params: Optional[Dict[str, str]] = None) -> str`: Формирует актуальный Markdown-документ «Руководство пользователя» (docs/GUIDE.md).
- `save_guide_file(target_path: str = "docs/GUIDE.md", params: Optional[Dict[str, str]] = None) -> str`: Сохраняет сгенерированное руководство на диск.

### Модуль `classconfig.cli`
- `main(argv: Optional[List[str]] = None) -> int`: Точка входа в командную строку. Возвращает код `0`, `1` или `2`.

---

## 5. Model Context Protocol (MCP) API

Каталог `mcp/` реализует стандартный протокол MCP (JSON-RPC 2.0, protocolVersion
`2025-06-18` / `2024-11-05`): `python3 -m mcp` (stdio) или
`python3 -m mcp --transport http` (Streamable HTTP, эндпоинт `POST /mcp`,
манифест `GET /mcp.json`). Методы: `initialize`, `ping`, `tools/list`,
`tools/call`, `resources/list`, `prompts/list`, `notifications/initialized`.

Веб-сервер разработки (`web/server.ts`) дополнительно проксирует:
- `GET /mcp.json` — манифест сервера MCP (файл `mcp/mcp.json`).
- `GET /api/mcp/tools` — список инструментов и схемы JSON Schema.
- `POST /api/mcp/call` — вызов инструментов:
  - `classconfig_snapshot`: `{ source, baseline }`
  - `classconfig_check`: `{ source, baseline, report }`
  - `classconfig_validate`: `{ source }`
  - `classconfig_generate_guide`: `{ project_name, demo_url, repo_url }`
  - `classconfig_get_limits`: `{}`
- `POST /api/template/generate` — вызов скрипта генерации шаблона реализации.

---

## 6. Инструкции по локальной сборке и запуску

### Запуск тестов:
```bash
python3 -m unittest discover -s tests -v
```

### Запуск интерактивного интерфейса (HTML5 Demo):
```bash
cd web
npm install
npm run dev:vite
```

### Статическая сборка HTML5 приложения:
```bash
npm run build
```
Бандеринг выполняется в папку `web/dist/`. Результат полностью готов к размещению на любом веб-сервере, Nginx или GitHub Pages.

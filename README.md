# ClassConfig

<div align="center">

[![Release](https://img.shields.io/badge/Релиз-v1.0.0-blue.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ferrovovan/classconfig)
[![CI Status](https://img.shields.io/badge/CI-Пройден%20(Passing)-brightgreen.svg?style=for-the-badge&logo=githubactions&logoColor=white)](https://github.com/ferrovovan/classconfig)
[![Tests](https://img.shields.io/badge/Тесты-20%20из%2020%20OK-success.svg?style=for-the-badge&logo=python&logoColor=white)](https://github.com/ferrovovan/classconfig)
[![Python Version](https://img.shields.io/badge/Python-3.10%2B%20(StdLib)-3776AB.svg?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License: GPL v3](https://img.shields.io/badge/Лицензия-GNU%20GPLv3-yellow.svg?style=for-the-badge)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Зависимости-0%20pip%20пакетов-orange.svg?style=for-the-badge)](classconfig)
[![Platform](https://img.shields.io/badge/Платформа-Ubuntu%2022.04%20LTS-E95420.svg?style=for-the-badge&logo=ubuntu&logoColor=white)](https://ubuntu.com/)
[![GitHub Pages](https://img.shields.io/badge/Web%20Demo-GitHub%20Pages-22c55e.svg?style=for-the-badge&logo=githubpages&logoColor=white)](https://ferrovovan.github.io/classconfig)

<p align="center">
  <strong>Локальная консольная утилита снимка текстовых настроек, построчного сравнения с эталоном и генерации автономного HTML-отчёта</strong>
  <br />
  <em>100% стандартная библиотека Python 3.10+ • 0 зависимостей • CLI, веб-демо и MCP-сервер</em>
</p>

</div>

---

## 🔍 Что это за проект простыми словами?

Представьте типичную жизненную ситуацию разработчика, сисадмина или студента:

1. **Задача**: У вас есть папка с конфигурационными файлами службы (например, `app.ini`, `network.conf`, `cache.conf`).
2. **Эксперимент**: Вам нужно поменять порты, включить отладку, поправить пути или протестировать новые параметры.
3. **Проблема**: После серии правок легко запутаться — какие строки изменились? Какой файл случайно удалили? Не добавился ли лишний временный файл? Полноценный Git для этого часто избыточен (не на каждом сервере нужен репозиторий с ветками и коммитами), а стандартный `diff` в терминале неудобно читать и отправлять коллегам.

💡 **ClassConfig решает эту задачу ровно двумя простыми командами:**
- `snapshot` — перед началом работы делает моментальный «слепок» (эталон) папки с расчётом SHA-256 хешей файлов.
- `check` — после экспериментов сравнивает текущую папку с эталоном и формирует **один красивый, автономный HTML-отчёт**, в котором наглядно видно:
  - какие файлы **изменены**, **добавлены**, **удалены** или остались **без изменений**;
  - удобную таблицу сравнения **«Было — Стало»** с подсветкой строк;
  - отчёт открывается в любом браузере двойным кликом по `file://` даже без интернета и локального веб-сервера!

---

## ⚠️ Важная оговорка о назначении

> **Отчёт подтверждает только совпадение выбранной папки с сохранённым эталоном.**
> **Он не анализирует работоспособность прикладных программ, не валидирует семантику полей конфигурации и не восстанавливает файлы автоматически (нет команды отката/rollback).**

---

## ⚡ Ключевые архитектурные свойства

- 🪶 **0 сторонних пакетов**: Только стандартная библиотека Python 3.10+ (`hashlib`, `difflib`, `json`, `stat`, `html`, `os`, `sys`). Никаких `pip install`, `requirements.txt` или внешних демонов.
- 🛡️ **Гарантия неизменяемости**: Утилита **никогда не изменяет** файлы в проверяемой папке. Каталог эталона после создания становится неизменяемым (read-only артефактом). Повторный `snapshot` в существующий путь защищён ошибкой `BASELINE_EXISTS` (код 2).
- 🔒 **Строгая валидация и безопасность**: Защита от переполнения (> 20 файлов, > 1 МиБ), симлинков (не переходит по ссылкам), вложенных папок, бинарных файлов и NUL-байтов (`0x00`).
- 📊 **Семантика кодов возврата (CI/CD Ready)**:
  - **Код 0**: Эталон создан (`snapshot`), либо проверка завершена и **отличий нет** (`check`).
  - **Код 1**: Проверка завершена и **найдены строковые отличия** (есть изменённые, добавленные или удалённые файлы). **Это штатный успешный результат проверки, а не сбой!**
  - **Код 2**: Любой сбой выполнения команды (синтаксис ключей, отсутствие папки, неподдерживаемый объект, повреждённый эталон).
- 🌐 **HTML5 интерактивное веб-демо**: Приложение на React 19 + Tailwind CSS со встроенным эмулятором терминала, редактором файлов и просмотрщиком отчётов, полностью готовое к развёртыванию на **GitHub Pages**.

---

## 📋 Системные требования

- **Операционная система**: Ubuntu 22.04 LTS (или совместимый Linux / macOS / Windows с Python 3.10+).
- **Интерпретатор**: Python 3.10 или новее со стандартной библиотекой.
- **Права доступа**: Обычный непривилегированный пользователь (root / sudo **не требуются**).
- **Внешние зависимости**: **0 байт** (`pip install` не требуется).
- **Для HTML5 веб-демо**: Node.js 18+ (только при сборке фронтенда; готовый статичный бандл `dist/` работает на любом статическом хостинге).

---

## 📁 Структура проекта

```text
.
├── .github/workflows/
│   └── ci.yml                   # CI/CD пайплайн (тесты Python 3.10/3.11/3.12 + сборка веб-демо)
│
├── classconfig/                 # Ядро консольной утилиты (Python 3.10)
│   ├── __init__.py              # Версия пакета (SemVer) и метаданные
│   ├── __main__.py              # Точка запуска: python3 -m classconfig
│   ├── limits.py                # Неизменяемые пределы (20 файлов, 1 МиБ, CONTEXT_LINES=3)
│   ├── models.py                # Модели манифеста, результатов diff, файлы
│   ├── errors.py                # 17 кодов ошибок и форматирование stderr
│   ├── validate.py              # Валидация путей (PATH_CONFLICT), lstat-проверки, кодировки
│   ├── snapshot.py              # Атомарная запись эталона, SHA-256 и manifest.json
│   ├── compare.py               # Проверка целостности эталона и построчный SequenceMatcher diff
│   ├── report.py                # Сборка и атомарная запись HTML-отчёта
│   └── cli.py                   # Разбор строгих длинных параметров командной строки
│
├── demo/                        # Учебные материалы
│   └── config/                  # 5 эталонных учебных файлов
│       ├── app.ini              # PORT=5432 / HOST=127.0.0.1
│       ├── display.conf         # THEME=light
│       ├── logging.conf         # LEVEL=info
│       ├── cache.conf           # ENABLED=true
│       └── network.conf         # TIMEOUT=30
│
├── docs/                        # Вся документация проекта (алиас DOCS/)
│   ├── AGENTS.md                # Руководство и инварианты для автономных ИИ-агентов
│   ├── ARCHITECTURE.md          # Архитектура и техническая спецификация
│   ├── DEPLOY.md                # Инструкции по развёртыванию на GitHub Pages и Ubuntu
│   ├── DOCS_API.md              # Полная документация API модулей, CLI и манифеста
│   └── GUIDE.md                 # Руководство пользователя (генерируется автоматически)
│
├── tests/                       # Приёмочные тесты
│   └── test_acceptance.py       # 20 обязательных приёмочных тестов на unittest
│
├── web/                         # Интерактивное веб-демо (React 19 + Tailwind + Vite)
│   ├── tsx_server/
│   │   ├── App.tsx              # Главный компонент SPA с навигацией и терминалом
│   │   ├── main.tsx             # Точка входа SPA
│   │   ├── components/          # Модули интерфейса (демо-сценарий, VFS, терминал, отчёт, MCP)
│   │   └── utils/
│   │       ├── engine.ts        # Клиентский движок: VFS, snapshot/check, HTML-отчёт (1:1 с Python CLI)
│   │       ├── engine.test.ts   # Юнит-тесты движка (node:test)
│   │       └── clientTests.ts   # Браузерный прогон 20 приёмочных сценариев
│   ├── index.html               # HTML-оболочка SPA
│   ├── server.ts                # Backend-сервер Node.js / Express / MCP прокси (локальная разработка)
│   ├── package.json             # Зависимости и скрипты фронтенда
│   ├── vite.config.ts           # Конфигурация сборки (base: './' — готово к подпапке GitHub Pages)
│   └── tsconfig.json            # Настройки TypeScript
│
├── mcp/                         # Развёртывание MCP (Model Context Protocol)
│   ├── server.py                # JSON-RPC 2.0 сервер: транспорты stdio и Streamable HTTP
│   ├── __main__.py              # Точка запуска: python3 -m mcp [--transport stdio|http]
│   ├── mcp.json                 # Манифест MCP (генерируется из реестра инструментов)
│   ├── gen_manifest.py          # Регенерация mcp.json из mcp/server.py
│   └── sync_web_manifest.py     # Синхронизация манифеста в web/public (GitHub Pages)
│
├── scripts/                     # Служебные скрипты
│   └── generate_guide.py        # Генерация руководства пользователя docs/GUIDE.md
│
├── CHANGELOG.md                 # История релизов (Keep a Changelog, SemVer)
├── LICENSE                      # Свободная лицензия GNU General Public License v3.0 (GPLv3)
└── README.md                    # Главная документация проекта
```

---

## 💻 Контракт команд и протокол вызова

```bash
# Общая справка (код 0)
python3 -m classconfig --help

# Справка по команде snapshot (код 0)
python3 -m classconfig snapshot --help

# Справка по команде check (код 0)
python3 -m classconfig check --help

# 1. Создание эталона:
python3 -m classconfig snapshot --source ПАПКА --baseline НОВЫЙ_КАТАЛОГ

# 2. Сравнение с эталоном и запись отчёта:
python3 -m classconfig check --source ПАПКА --baseline КАТАЛОГ --report ФАЙЛ.html
```

> **Правило именования аргументов**: Только длинные ключи (`--source`, `--baseline`, `--report`). Короткие флаги (`-s`, `-b`, `-r`) запрещены. Интерактивные вопросы пользователю в терминале отсутствуют.

### Таблица кодов возврата

| Код | Статус | Описание |
| :---: | :--- | :--- |
| **0** | **Успех (без различий)** | `snapshot` успешно сохранил эталон.<br>Либо `check` успешно завершён и отличий между папкой и эталоном нет (0 изменённых, 0 добавленных, 0 удалённых). |
| **1** | **Успех (найдены отличия)** | `check` успешно завершён, и найден хотя бы один изменённый, добавленный или удалённый файл. **Это штатный результат проверки, а не ошибка!** |
| **2** | **Ошибка выполнения** | Сбой выполнения команды: неверные аргументы, отсутствие папки, конфликт путей, неподдерживаемый объект (симлинк, подкаталог), повреждённый эталон или ошибка диска. |

---

## 🚀 Пошаговый демонстрационный сценарий

Выполните шаги в терминале из корня репозитория:

### Шаг 1. Сохранение эталона из учебной папки
```bash
python3 -m classconfig snapshot --source demo/config --baseline demo/baseline
```
**Вывод (код 0):**
```text
Эталон сохранён.
Папка: /абсолютный/путь/demo/config
Эталон: /абсолютный/путь/demo/baseline
Файлов: 5
Создан: 2026-10-30T...
```

### Шаг 2. Проверка сразу после сохранения (без правок)
```bash
python3 -m classconfig check --source demo/config --baseline demo/baseline --report demo/report.html
```
**Вывод (код 0):**
```text
Проверка завершена.
Изменён: 0
Добавлен: 0
Удалён: 0
Без изменений: 5
Отчёт: /абсолютный/путь/demo/report.html
Отчёт подтверждает только совпадение выбранной папки с эталоном.
```

### Шаг 3. Внесение изменений в учебную папку
```bash
# Изменяем порт в app.ini:
sed -i 's/PORT=5432/PORT=5433/' demo/config/app.ini

# Удаляем файл display.conf:
rm demo/config/display.conf

# Добавляем новый файл extra.conf:
echo "NOTE=demo" > demo/config/extra.conf
```

### Шаг 4. Повторная проверка с изменениями
```bash
python3 -m classconfig check --source demo/config --baseline demo/baseline --report demo/report.html
```
**Вывод (код 1 — отличия найдены, штатный успех):**
```text
Проверка завершена.
Изменён: 1
Добавлен: 1
Удалён: 1
Без изменений: 3
Отчёт: /абсолютный/путь/demo/report.html
Отчёт подтверждает только совпадение выбранной папки с эталоном.
```
*В файле `demo/report.html` сформирована наглядная таблица: `app.ini` изменён (было `PORT=5432`, стало `PORT=5433`), `extra.conf` добавлен, `display.conf` удалён, остальные 3 файла без изменений.*

### Шаг 5. Ручной возврат к эталону
```bash
rm demo/config/extra.conf
sed -i 's/PORT=5433/PORT=5432/' demo/config/app.ini
echo "THEME=light" > demo/config/display.conf

python3 -m classconfig check --source demo/config --baseline demo/baseline --report demo/report.html
```
**Вывод (код 0 — отличий снова нет):**
```text
Проверка завершена.
Изменён: 0
Добавлен: 0
Удалён: 0
Без изменений: 5
Отчёт: /абсолютный/путь/demo/report.html
Отчёт подтверждает только совпадение выбранной папки с эталоном.
```

---

## 🔧 Как использовать со своей папкой

```bash
# 1. Зафиксируйте эталон до начала экспериментов:
python3 -m classconfig snapshot --source /etc/nginx/conf.d --baseline /var/backups/nginx-baseline

# 2. Проверьте после внесения настроек:
python3 -m classconfig check --source /etc/nginx/conf.d --baseline /var/backups/nginx-baseline --report ~/nginx-audit.html
```

---

## 🛡️ Архитектурные ограничения (limits.py)

| Параметр | Лимит | Поведение при нарушении |
| :--- | :--- | :--- |
| `MAX_FILES` | 20 | Ошибка `TOO_MANY_FILES`: в папке больше 20 объектов (код 2) |
| `MAX_FILE_BYTES` | 1 048 576 байт (1 МиБ) | Ошибка `FILE_TOO_LARGE`: файл превышает 1 МиБ (код 2) |
| `ENCODING` | UTF-8 | Ошибка `UNSUPPORTED_CONTENT`: файл не является текстом UTF-8 (код 2) |
| Символические ссылки | Запрещены | Ошибка `UNSUPPORTED_SYMLINK`: не переходит по ссылкам (код 2) |
| Вложенные каталоги | Запрещены | Ошибка `UNSUPPORTED_DIRECTORY`: поддерживается только плоская папка (код 2) |
| Спец. файлы (FIFO, сокеты) | Запрещены | Ошибка `UNSUPPORTED_TYPE`: только обычные файлы (код 2) |
| Перезапись эталона | Запрещена | Ошибка `BASELINE_EXISTS`: каталог уже существует (код 2) |
| Перезапись отчёта | Разрешена | При повторном `check` файл отчёта атомарно заменяется через `os.replace` |

---

## 🧪 Запуск всех 20 приёмочных тестов

```bash
python3 -m unittest discover -s tests -v
```

```text
test_01_snapshot_five_files (test_acceptance.AcceptanceTests) ... ok
test_02_snapshot_baseline_exists (test_acceptance.AcceptanceTests) ... ok
test_03_check_without_changes (test_acceptance.AcceptanceTests) ... ok
test_04_changed_one_line (test_acceptance.AcceptanceTests) ... ok
test_05_deleted_file (test_acceptance.AcceptanceTests) ... ok
test_06_added_file (test_acceptance.AcceptanceTests) ... ok
test_07_full_demo_scenario (test_acceptance.AcceptanceTests) ... ok
test_08_unsupported_directory (test_acceptance.AcceptanceTests) ... ok
test_09_unsupported_symlink (test_acceptance.AcceptanceTests) ... ok
test_10_file_too_large (test_acceptance.AcceptanceTests) ... ok
test_11_unsupported_content (test_acceptance.AcceptanceTests) ... ok
test_12_html_escaping (test_acceptance.AcceptanceTests) ... ok
test_13_integrity_after_check (test_acceptance.AcceptanceTests) ... ok
test_14_empty_folder (test_acceptance.AcceptanceTests) ... ok
test_15_path_conflict (test_acceptance.AcceptanceTests) ... ok
test_16_baseline_corrupt_byte_modified (test_acceptance.AcceptanceTests) ... ok
test_17_too_many_files (test_acceptance.AcceptanceTests) ... ok
test_18_renamed_file_deleted_and_added (test_acceptance.AcceptanceTests) ... ok
test_19_crlf_vs_lf_unchanged (test_acceptance.AcceptanceTests) ... ok
test_20_folder_validation_error_no_changes (test_acceptance.AcceptanceTests) ... ok
----------------------------------------------------------------------
Ran 20 tests in 0.057s
OK
```

---

## 🌐 HTML5 Веб-демо и развёртывание на GitHub Pages

Интерактивное веб-демо содержит интерактивный пошаговый разбор, эмулятор терминала с клиентским движком CLI 1:1, редактор виртуальной файловой системы и живой предпросмотр HTML-отчёта. Демо **полностью статичное** (движок работает в браузере, бэкенд не нужен):

```bash
# из корня репозитория — все команды фронтенда живут в web/
cd web

# Локальный запуск (Vite dev-сервер)
npm install
npm run dev:vite

# Юнит-тесты движка и проверка типов
npm test
npm run lint

# Сборка статичного бандла для GitHub Pages
npm run build
```

Статический результат сохраняется в папку `web/dist/`. GitHub Actions (`.github/workflows/ci.yml`) автоматически публикует `web/dist` на **GitHub Pages** при пуше в `main` — достаточно включить Pages (`Settings → Pages → Source: GitHub Actions`). Детальные инструкции — в [`docs/DEPLOY.md`](docs/DEPLOY.md). Полная спецификация API доступна в [`docs/DOCS_API.md`](docs/DOCS_API.md), а правила для ИИ-агентов — в [`docs/AGENTS.md`](docs/AGENTS.md).

---

## 📜 Лицензия

Проект распространяется под свободной лицензией **GNU General Public License v3.0 (GPLv3)**. Подробные условия использования изложены в файле [`LICENSE`](LICENSE).

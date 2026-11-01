# Инструкция по развёртыванию (DEPLOY.md)

В данном документе описаны способы развёртывания **ClassConfig** как консольной утилиты на Linux, в Docker, а также публикация интерактивного HTML5 демо на **GitHub Pages**.

---

## 1. Развёртывание консольной утилиты на Ubuntu 22.04 LTS

Целевая среда — одна машина с операционной системой **Ubuntu 22.04 LTS** (или виртуальная машина).

### Шаги установки:
1. Убедитесь, что установлен Python 3.10 или новее:
   ```bash
   python3 --version
   # Вывод: Python 3.10.x или новее
   ```
2. Склонируйте или распакуйте архив с исходным кодом:
   ```bash
   git clone https://github.com/ferrovovan/classconfig.git
   cd classconfig
   ```
3. Проверьте работоспособность утилиты без установки сторонних пакетов:
   ```bash
   python3 -m classconfig --help
   ```
4. (Опционально) Создайте символическую ссылку или алиас для удобного вызова:
   ```bash
   # Создание локального скрипта-обёртки в ~/.local/bin
   mkdir -p ~/.local/bin
   cat << 'EOF' > ~/.local/bin/classconfig
   #!/usr/bin/env bash
   exec python3 -m classconfig "$@"
   EOF
   chmod +x ~/.local/bin/classconfig
   ```

---

## 2. Развёртывание в Docker

Для изоляции утилиты и выполнения проверок в контейнере подготовлен компактный `Dockerfile`:

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY classconfig /app/classconfig
COPY demo /app/demo
COPY tests /app/tests

# Запуск тестов при сборке
RUN python3 -m unittest discover -s tests -v

ENTRYPOINT ["python3", "-m", "classconfig"]
CMD ["--help"]
```

### Сборка и запуск образа:
```bash
# Сборка контейнера
docker build -t classconfig:latest .

# Запуск справки
docker run --rm classconfig:latest --help

# Проверка конфигураций хоста через монтирование тома:
docker run --rm \
  -v /my/host/config:/data/config:ro \
  -v /my/host/baseline:/data/baseline \
  -v /my/host/reports:/data/reports \
  classconfig:latest check --source /data/config --baseline /data/baseline --report /data/reports/diff.html
```

---

## 3. Развёртывание HTML5 демо на GitHub Pages

Интерактивное веб-демо построено на React 19 + Vite + Tailwind CSS и компилируется в полностью статический HTML/JS/CSS бандл, не требующий бэкенд-сервера для работы в браузере.

### Ручная сборка и публикация:
1. Перейдите в каталог веб-демо `web/`, установите Node.js (18+) и зависимости:
   ```bash
   cd web
   npm install
   ```
2. Выполните сборку статического приложения:
   ```bash
   npm run build
   ```
3. Результат сборки находится в каталоге `web/dist/`.
4. Опубликуйте каталог `web/dist` в ветку `gh-pages`:
   ```bash
   # из каталога web/ с помощью npx gh-pages:
   npx gh-pages -d dist
   ```

### Автоматический деплой через GitHub Actions:
Полный пайплайн (тесты Python, тесты и сборка демо, публикация Pages) уже настроен в
`.github/workflows/ci.yml` — достаточно включить `Settings -> Pages -> Source: GitHub Actions`.
Минимальный отдельный workflow для деплоя:

```yaml
name: Test and Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  test-python:
    name: Run Python Acceptance Tests
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python 3.10
        uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      - name: Run 20 Acceptance Tests
        run: |
          python3 -m unittest discover -s tests -v

  build-and-deploy:
    name: Build & Deploy Web Demo
    needs: test-python
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: web/package.json
      - name: Install dependencies
        run: npm ci
        working-directory: web
      - name: Build static HTML5 app
        run: npm run build
        working-directory: web
      - name: Setup Pages
        uses: actions/configure-pages@v5
        with:
          enablement: true
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'web/dist'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

---

## 4. Локальный запуск веб-демо для разработки

```bash
cd web

# Установка зависимостей
npm install

# Статический интерфейс разработки (Vite, порт 5173)
npm run dev:vite

# Полный стек с Express/MCP API и реальным Python CLI (порт 3000)
npm run dev
```

Приложение доступно по адресу `http://localhost:3000`.
В приложении доступен интерактивный пошаговый демонстрационный сценарий, эмулятор терминала, редактор файлов виртуальной папки и живой просмотр сгенерированного HTML-отчёта.

---

## 5. Запуск MCP Сервера (Model Context Protocol)

Каталог `mcp/` содержит сервер, соответствующий стандарту MCP
(protocolVersion `2025-06-18`, обратная совместимость с `2024-11-05`,
только стандартная библиотека Python):

```bash
# Транспорт stdio (стандарт для Claude Desktop, Cursor, Claude Code)
python3 -m mcp

# Транспорт Streamable HTTP (сетевые и веб-клиенты)
python3 -m mcp --transport http --host 127.0.0.1 --port 8765
# JSON-RPC эндпоинт: POST http://127.0.0.1:8765/mcp
# Манифест:            GET  http://127.0.0.1:8765/mcp.json

# Напечатать манифест в stdout
python3 -m mcp --manifest
```

- **Манифест**: единственный источник истины — реестр `TOOLS` в `mcp/server.py`;
  файл `mcp/mcp.json` регенерируется командой `python3 mcp/gen_manifest.py`,
  копия для GitHub Pages синхронизируется `python3 mcp/sync_web_manifest.py`
  (проверка: `--check`, выполняется автоматически как `npm run prebuild` в `web/`).
- **Веб-сервер разработки** проксирует манифест на `http://localhost:3000/mcp.json`
  и предоставляет REST-совместимые эндпоинты `GET /api/mcp/tools`, `POST /api/mcp/call`.
- **Подключение к Claude Desktop / Cursor** (`claude_desktop_config.json`):
  ```json
  {
    "mcpServers": {
      "classconfig": {
        "command": "python3",
        "args": ["-m", "mcp"],
        "cwd": "/path/to/classconfig",
        "env": { "PYTHONPATH": "/path/to/classconfig" }
      }
    }
  }
  ```

---

## 6. Автоматическая генерация руководства пользователя

Сформировать и обновить `docs/GUIDE.md` можно тремя способами:
1. **Через веб-интерфейс**: вкладка **«Генератор руководства»** с предпросмотром, настройкой полей и кнопкой скачивания.
2. **Через скрипт Python**:
   ```bash
   python3 scripts/generate_guide.py
   ```
3. **Через инструмент MCP**:
   ```json
   { "name": "classconfig_generate_guide" }
   ```


# SPDX-License-Identifier: GPL-3.0-or-later
"""Разбор аргументов командной строки и точка входа ClassConfig."""

from __future__ import annotations
import sys
from typing import List, Optional

from .compare import compare_source_with_baseline
from .errors import ErrorCode, ClassConfigError, make_error
from .report import generate_html_report, write_html_report_atomically
from .snapshot import create_snapshot
from .validate import validate_check_paths

HELP_TEXT = """ClassConfig — снимок текстовых настроек и отчёт различий.

Команды:
  snapshot --source ПАПКА --baseline НОВЫЙ_КАТАЛОГ
  check --source ПАПКА --baseline КАТАЛОГ --report ФАЙЛ.html

Папка содержит только обычные файлы UTF-8: не больше 20 файлов
и не больше 1 МиБ каждый, без вложенных каталогов и ссылок.
Эталон и отчёт сохраняются вне этой папки.
Отчёт подтверждает только совпадение папки с эталоном."""

SNAPSHOT_HELP = """Использование: python3 -m classconfig snapshot --source ПАПКА --baseline НОВЫЙ_КАТАЛОГ

Параметры:
  --source    Путь к проверяемой папке
  --baseline  Путь к создаваемому каталогу эталона"""

CHECK_HELP = """Использование: python3 -m classconfig check --source ПАПКА --baseline КАТАЛОГ --report ФАЙЛ.html

Параметры:
  --source    Путь к текущей папке
  --baseline  Путь к существующему каталогу эталона
  --report    Путь к создаваемому файлу HTML-отчёта"""


def parse_named_args(args: List[str], allowed_keys: List[str]) -> dict[str, str]:
    """Разбирает строго длинные параметры вида --key value или --key=value.

    Короткие флаги запрещены. Любые неизвестные ключи или лишние позиционные
    аргументы вызывают ошибку INVALID_ARGUMENTS (код 2).
    """
    result: dict[str, str] = {}
    i = 0
    while i < len(args):
        arg = args[i]
        if arg.startswith("--"):
            if "=" in arg:
                key, val = arg[2:].split("=", 1)
                if not key:
                    raise ClassConfigError(
                        make_error(ErrorCode.INVALID_ARGUMENTS, f"некорректный параметр: {arg}")
                    )
                if key not in allowed_keys:
                    raise ClassConfigError(
                        make_error(ErrorCode.INVALID_ARGUMENTS, f"неизвестный параметр: --{key}")
                    )
                if key in result:
                    raise ClassConfigError(
                        make_error(ErrorCode.INVALID_ARGUMENTS, f"повторяющийся параметр: --{key}")
                    )
                result[key] = val
                i += 1
            else:
                key = arg[2:]
                if not key:
                    raise ClassConfigError(
                        make_error(ErrorCode.INVALID_ARGUMENTS, f"некорректный параметр: {arg}")
                    )
                if key not in allowed_keys:
                    raise ClassConfigError(
                        make_error(ErrorCode.INVALID_ARGUMENTS, f"неизвестный параметр: --{key}")
                    )
                if key in result:
                    raise ClassConfigError(
                        make_error(ErrorCode.INVALID_ARGUMENTS, f"повторяющийся параметр: --{key}")
                    )
                if i + 1 >= len(args):
                    raise ClassConfigError(
                        make_error(ErrorCode.INVALID_ARGUMENTS, f"пропущено значение параметра --{key}")
                    )
                val = args[i + 1]
                if val.startswith("--"):
                    raise ClassConfigError(
                        make_error(ErrorCode.INVALID_ARGUMENTS, f"пропущено значение параметра --{key}")
                    )
                result[key] = val
                i += 2
        else:
            raise ClassConfigError(
                make_error(ErrorCode.INVALID_ARGUMENTS, f"неожиданный аргумент: {arg}")
            )
    return result


def handle_snapshot(args: List[str]) -> int:
    """Обработка команды snapshot."""
    if "--help" in args:
        sys.stdout.write(SNAPSHOT_HELP + "\n")
        return 0

    parsed = parse_named_args(args, ["source", "baseline"])
    if "source" not in parsed:
        raise ClassConfigError(
            make_error(ErrorCode.INVALID_ARGUMENTS, "пропущен обязательный параметр --source")
        )
    if "baseline" not in parsed:
        raise ClassConfigError(
            make_error(ErrorCode.INVALID_ARGUMENTS, "пропущен обязательный параметр --baseline")
        )

    create_snapshot(parsed["source"], parsed["baseline"])
    return 0


def handle_check(args: List[str]) -> int:
    """Обработка команды check."""
    if "--help" in args:
        sys.stdout.write(CHECK_HELP + "\n")
        return 0

    parsed = parse_named_args(args, ["source", "baseline", "report"])
    if "source" not in parsed:
        raise ClassConfigError(
            make_error(ErrorCode.INVALID_ARGUMENTS, "пропущен обязательный параметр --source")
        )
    if "baseline" not in parsed:
        raise ClassConfigError(
            make_error(ErrorCode.INVALID_ARGUMENTS, "пропущен обязательный параметр --baseline")
        )
    if "report" not in parsed:
        raise ClassConfigError(
            make_error(ErrorCode.INVALID_ARGUMENTS, "пропущен обязательный параметр --report")
        )

    # Валидация путей
    source_path, baseline_path, report_path = validate_check_paths(
        parsed["source"], parsed["baseline"], parsed["report"]
    )

    # Сравнение
    result = compare_source_with_baseline(source_path, baseline_path)

    # Генерация и атомарная запись HTML-отчёта
    html_content = generate_html_report(result)
    write_html_report_atomically(report_path, html_content)

    # Вывод в stdout (формат success check):
    # Проверка завершена.
    # Изменён: <c>
    # Добавлен: <a>
    # Удалён: <d>
    # Без изменений: <u>
    # Отчёт: <report>
    # Отчёт подтверждает только совпадение выбранной папки с эталоном.
    sys.stdout.write(
        f"Проверка завершена.\n"
        f"Изменён: {result.count_changed}\n"
        f"Добавлен: {result.count_added}\n"
        f"Удалён: {result.count_deleted}\n"
        f"Без изменений: {result.count_unchanged}\n"
        f"Отчёт: {report_path}\n"
        f"Отчёт подтверждает только совпадение выбранной папки с эталоном.\n"
    )

    # Код 0 — отличий нет. Код 1 — отличия есть, и проверка при этом успешна.
    return 1 if result.has_differences else 0


def main(argv: Optional[List[str]] = None) -> int:
    """Главная точка входа CLI."""
    if argv is None:
        argv = sys.argv[1:]

    # Запуск без аргументов: код 2, вывод справки в stdout
    if not argv:
        sys.stdout.write(HELP_TEXT + "\n")
        return 2

    first_arg = argv[0]

    # Общий --help
    if first_arg == "--help":
        sys.stdout.write(HELP_TEXT + "\n")
        return 0

    try:
        if first_arg == "snapshot":
            return handle_snapshot(argv[1:])
        elif first_arg == "check":
            return handle_check(argv[1:])
        else:
            raise ClassConfigError(
                make_error(ErrorCode.INVALID_ARGUMENTS, f"неизвестная команда: {first_arg}")
            )
    except ClassConfigError as e:
        e.print_to_stderr()
        return 2


if __name__ == "__main__":
    sys.exit(main())

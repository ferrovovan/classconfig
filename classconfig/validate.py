# SPDX-License-Identifier: GPL-3.0-or-later
"""Проверка путей, ограничений и содержимого папки."""

from __future__ import annotations
import hashlib
import os
import stat
from typing import List, Tuple, Optional

from .errors import ErrorCode, ClassConfigItemError, ClassConfigError, make_error
from .limits import MAX_FILES, MAX_FILE_BYTES, ENCODING
from .models import ValidatedSourceFile


def normalize_path(path: str) -> str:
    """Приводит путь к абсолютному нормализованному виду."""
    return os.path.abspath(os.path.expanduser(path))


def paths_conflict(p1: str, p2: str) -> bool:
    """Проверяет, совпадают ли пути или один находится внутри другого."""
    norm1 = os.path.abspath(p1)
    norm2 = os.path.abspath(p2)
    if norm1 == norm2:
        return True
    prefix1 = norm1 if norm1.endswith(os.sep) else norm1 + os.sep
    prefix2 = norm2 if norm2.endswith(os.sep) else norm2 + os.sep
    if norm2.startswith(prefix1) or norm1.startswith(prefix2):
        return True
    return False


def validate_snapshot_paths(source_arg: str, baseline_arg: str) -> Tuple[str, str]:
    """Проверяет пути для команды snapshot."""
    source_path = normalize_path(source_arg)
    baseline_path = normalize_path(baseline_arg)

    if paths_conflict(source_path, baseline_path):
        raise ClassConfigError(
            make_error(ErrorCode.PATH_CONFLICT, "пути папки, эталона и отчёта пересекаются")
        )

    # Проверка существования источника
    if not os.path.exists(source_path):
        raise ClassConfigError(
            make_error(ErrorCode.SOURCE_NOT_FOUND, f"папка не найдена: {source_path}")
        )
    if not os.path.isdir(source_path):
        raise ClassConfigError(
            make_error(ErrorCode.NOT_A_DIRECTORY, f"путь не является папкой: {source_path}")
        )

    # Проверка родительского каталога эталона
    baseline_parent = os.path.dirname(baseline_path)
    if not baseline_parent or not os.path.exists(baseline_parent):
        raise ClassConfigError(
            make_error(ErrorCode.PARENT_NOT_FOUND, f"родительский каталог не существует: {baseline_parent}")
        )
    if not os.path.isdir(baseline_parent):
        raise ClassConfigError(
            make_error(ErrorCode.PARENT_NOT_FOUND, f"родительский каталог не существует: {baseline_parent}")
        )

    # Проверка, что конечный путь эталона ещё не занят
    if os.path.exists(baseline_path):
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_EXISTS, f"каталог эталона уже существует: {baseline_path}. Укажите новый путь")
        )

    return source_path, baseline_path


def validate_check_paths(source_arg: str, baseline_arg: str, report_arg: str) -> Tuple[str, str, str]:
    """Проверяет пути для команды check."""
    source_path = normalize_path(source_arg)
    baseline_path = normalize_path(baseline_arg)
    report_path = normalize_path(report_arg)

    # Проверка конфликтов путей
    if (paths_conflict(source_path, baseline_path) or
        paths_conflict(source_path, report_path) or
        paths_conflict(baseline_path, report_path)):
        raise ClassConfigError(
            make_error(ErrorCode.PATH_CONFLICT, "пути папки, эталона и отчёта пересекаются")
        )

    # Проверка источника
    if not os.path.exists(source_path):
        raise ClassConfigError(
            make_error(ErrorCode.SOURCE_NOT_FOUND, f"папка не найдена: {source_path}")
        )
    if not os.path.isdir(source_path):
        raise ClassConfigError(
            make_error(ErrorCode.NOT_A_DIRECTORY, f"путь не является папкой: {source_path}")
        )

    # Проверка эталона
    if not os.path.exists(baseline_path):
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_NOT_FOUND, f"эталон не найден: {baseline_path}")
        )
    if not os.path.isdir(baseline_path):
        raise ClassConfigError(
            make_error(ErrorCode.NOT_A_DIRECTORY, f"путь не является папкой: {baseline_path}")
        )

    # Проверка пути отчёта
    if os.path.isdir(report_path):
        raise ClassConfigError(
            make_error(ErrorCode.REPORT_IS_DIRECTORY, f"путь отчёта является каталогом: {report_path}")
        )

    report_parent = os.path.dirname(report_path)
    if not report_parent or not os.path.exists(report_parent):
        raise ClassConfigError(
            make_error(ErrorCode.PARENT_NOT_FOUND, f"родительский каталог не существует: {report_parent}")
        )
    if not os.path.isdir(report_parent):
        raise ClassConfigError(
            make_error(ErrorCode.PARENT_NOT_FOUND, f"родительский каталог не существует: {report_parent}")
        )

    return source_path, baseline_path, report_path


def inspect_source_folder(source_path: str) -> List[ValidatedSourceFile]:
    """Проверяет все записи папки согласно архитектурным правилам.

    Если есть хотя бы одна ошибка, возвращает исключение ClassConfigError с одной
    или несколькими ошибками, отсортированными по имени файла.
    """
    try:
        entries = os.listdir(source_path)
    except OSError as e:
        raise ClassConfigError(
            make_error(ErrorCode.READ_ERROR, f"не удалось прочитать: {source_path}")
        )

    if len(entries) > MAX_FILES:
        raise ClassConfigError(
            make_error(ErrorCode.TOO_MANY_FILES, f"в папке больше 20 объектов: {len(entries)}")
        )

    errors: List[ClassConfigItemError] = []
    valid_files: List[ValidatedSourceFile] = []

    # Сортируем имена для воспроизводимости и упорядоченного отчёта об ошибках
    sorted_names = sorted(entries)

    for name in sorted_names:
        entry_path = os.path.join(source_path, name)

        try:
            # lstat не переходит по ссылке
            st = os.lstat(entry_path)
        except OSError:
            errors.append(make_error(ErrorCode.READ_ERROR, f"не удалось прочитать: {name}", name))
            continue

        if stat.S_ISLNK(st.st_mode):
            errors.append(
                make_error(ErrorCode.UNSUPPORTED_SYMLINK, f"символические ссылки не поддерживаются: {name}", name)
            )
            continue

        if stat.S_ISDIR(st.st_mode):
            errors.append(
                make_error(ErrorCode.UNSUPPORTED_DIRECTORY, f"вложенные каталоги не поддерживаются: {name}", name)
            )
            continue

        if not stat.S_ISREG(st.st_mode):
            errors.append(
                make_error(ErrorCode.UNSUPPORTED_TYPE, f"поддерживаются только обычные файлы: {name}", name)
            )
            continue

        if st.st_size > MAX_FILE_BYTES:
            errors.append(
                make_error(ErrorCode.FILE_TOO_LARGE, f"файл превышает 1 МиБ: {name}", name)
            )
            continue

        # Читаем все байты
        try:
            with open(entry_path, "rb") as f:
                data = f.read()
        except OSError:
            errors.append(make_error(ErrorCode.READ_ERROR, f"не удалось прочитать: {name}", name))
            continue

        # Проверка на NUL байт
        if b"\x00" in data:
            errors.append(
                make_error(ErrorCode.UNSUPPORTED_CONTENT, f"файл не является текстом UTF-8: {name}", name)
            )
            continue

        # Строгое декодирование UTF-8
        try:
            text = data.decode(ENCODING)
        except UnicodeDecodeError:
            errors.append(
                make_error(ErrorCode.UNSUPPORTED_CONTENT, f"файл не является текстом UTF-8: {name}", name)
            )
            continue

        sha256 = hashlib.sha256(data).hexdigest()
        logical_lines = text.splitlines()

        valid_files.append(
            ValidatedSourceFile(
                name=name,
                path=entry_path,
                size_bytes=len(data),
                raw_bytes=data,
                sha256=sha256,
                text_content=text,
                logical_lines=logical_lines,
            )
        )

    if errors:
        # Сортируем ошибки по имени файла
        errors.sort(key=lambda err: err.item_name)
        raise ClassConfigError(errors)

    return valid_files

# SPDX-License-Identifier: GPL-3.0-or-later
"""Создание и сохранение эталона."""

from __future__ import annotations
import datetime
import json
import os
import shutil
import sys
from typing import List

from .errors import ErrorCode, ClassConfigError, make_error
from .limits import (
    MAX_FILES,
    MAX_FILE_BYTES,
    ENCODING,
    MANIFEST_VERSION,
    MANIFEST_NAME,
    FILES_DIR,
)
from .models import ManifestFileEntry, BaselineManifest
from .validate import validate_snapshot_paths, inspect_source_folder


def get_current_iso_timestamp() -> str:
    """Возвращает текущее время с часовым поясом и точностью до секунды (ISO 8601)."""
    now = datetime.datetime.now(datetime.timezone.utc).astimezone()
    return now.isoformat(timespec="seconds")


def create_snapshot(source_arg: str, baseline_arg: str) -> BaselineManifest:
    """Выполняет команду snapshot: проверяет папку, атомарно создаёт каталог эталона."""
    source_path, baseline_path = validate_snapshot_paths(source_arg, baseline_arg)

    # Шаг 1: Полностью проверить папку до создания каталогов
    valid_files = inspect_source_folder(source_path)

    baseline_parent = os.path.dirname(baseline_path)
    baseline_basename = os.path.basename(baseline_path)
    temp_dir = os.path.join(baseline_parent, f".{baseline_basename}.tmp.{os.getpid()}")

    # Если вдруг временный каталог существовал от прерванного ранее запуска с тем же PID
    if os.path.exists(temp_dir):
        try:
            shutil.rmtree(temp_dir)
        except OSError:
            pass

    try:
        os.makedirs(temp_dir, exist_ok=False)
        files_target_dir = os.path.join(temp_dir, FILES_DIR)
        os.makedirs(files_target_dir, exist_ok=False)

        manifest_entries: List[ManifestFileEntry] = []

        # Запись копий файлов в files/<имя>
        for vf in valid_files:
            file_dest = os.path.join(files_target_dir, vf.name)
            with open(file_dest, "wb") as f:
                f.write(vf.raw_bytes)

            manifest_entries.append(
                ManifestFileEntry(
                    name=vf.name,
                    size_bytes=vf.size_bytes,
                    sha256=vf.sha256,
                )
            )

        # Время создания фиксируется перед записью манифеста
        created_at = get_current_iso_timestamp()

        manifest = BaselineManifest(
            version=MANIFEST_VERSION,
            created_at=created_at,
            source_path=source_path,
            encoding=ENCODING,
            limits={"max_files": MAX_FILES, "max_file_bytes": MAX_FILE_BYTES},
            files=manifest_entries,
        )

        manifest_json_str = json.dumps(manifest.to_dict(), ensure_ascii=False, indent=2) + "\n"
        manifest_dest = os.path.join(temp_dir, MANIFEST_NAME)
        with open(manifest_dest, "w", encoding=ENCODING) as f:
            f.write(manifest_json_str)

        # Атомарное переименование временного каталога в конечный путь эталона
        # Проверяем ещё раз, не создал ли кто-то baseline_path за это время
        if os.path.exists(baseline_path):
            raise ClassConfigError(
                make_error(
                    ErrorCode.BASELINE_EXISTS,
                    f"каталог эталона уже существует: {baseline_path}. Укажите новый путь",
                )
            )

        os.rename(temp_dir, baseline_path)

    except ClassConfigError:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    except OSError as e:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise ClassConfigError(
            make_error(ErrorCode.WRITE_ERROR, f"не удалось записать: {baseline_path}")
        )

    # Вывод в stdout (формат success snapshot):
    # Эталон сохранён.
    # Папка: <source>
    # Эталон: <baseline>
    # Файлов: <число>
    # Создан: <created_at>
    sys.stdout.write(
        f"Эталон сохранён.\n"
        f"Папка: {source_path}\n"
        f"Эталон: {baseline_path}\n"
        f"Файлов: {len(valid_files)}\n"
        f"Создан: {created_at}\n"
    )

    return manifest

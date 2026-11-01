# SPDX-License-Identifier: GPL-3.0-or-later
"""Проверка эталона, сравнение файлов и построчный diff."""

from __future__ import annotations
import difflib
import hashlib
import json
import os
import stat
from typing import Dict, List, Tuple, Set

from .errors import ErrorCode, ClassConfigError, make_error
from .limits import (
    MAX_FILES,
    MAX_FILE_BYTES,
    ENCODING,
    MANIFEST_VERSION,
    MANIFEST_NAME,
    FILES_DIR,
)
from .models import (
    ManifestFileEntry,
    BaselineManifest,
    DiffOp,
    FileComparison,
    ComparisonResult,
    ValidatedSourceFile,
)
from .snapshot import get_current_iso_timestamp
from .validate import inspect_source_folder


def load_and_verify_baseline(baseline_path: str) -> Tuple[BaselineManifest, Dict[str, Tuple[bytes, List[str]]]]:
    """Загружает манифест и проверяет целостность эталона.

    Возвращает объект BaselineManifest и словарь {имя: (сырые_байты, логические_строки)}.
    Любое расхождение вызывает ошибку BASELINE_CORRUPT (код 2).
    """
    manifest_path = os.path.join(baseline_path, MANIFEST_NAME)
    if not os.path.isfile(manifest_path):
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_CORRUPT, f"отсутствует {MANIFEST_NAME}")
        )

    try:
        with open(manifest_path, "r", encoding=ENCODING) as f:
            raw_manifest = json.load(f)
    except Exception as e:
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_CORRUPT, f"не удалось прочитать {MANIFEST_NAME}: {e}")
        )

    if not isinstance(raw_manifest, dict):
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_CORRUPT, f"{MANIFEST_NAME} не является объектом")
        )

    # Проверка обязательных полей
    required_fields = ["version", "created_at", "source_path", "encoding", "limits", "files"]
    for field in required_fields:
        if field not in raw_manifest:
            raise ClassConfigError(
                make_error(ErrorCode.BASELINE_CORRUPT, f"в {MANIFEST_NAME} отсутствует обязательное поле '{field}'")
            )

    if raw_manifest["version"] != MANIFEST_VERSION:
        raise ClassConfigError(
            make_error(
                ErrorCode.BASELINE_CORRUPT,
                f"версия манифеста {raw_manifest['version']} не поддерживается (ожидалась {MANIFEST_VERSION})",
            )
        )

    if raw_manifest.get("encoding") != ENCODING:
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_CORRUPT, f"неверная кодировка эталона: {raw_manifest.get('encoding')}")
        )

    limits = raw_manifest.get("limits")
    if not isinstance(limits, dict) or limits.get("max_files") != MAX_FILES or limits.get("max_file_bytes") != MAX_FILE_BYTES:
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_CORRUPT, "недопустимые лимиты в манифесте")
        )

    raw_files = raw_manifest.get("files")
    if not isinstance(raw_files, list):
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_CORRUPT, "поле 'files' в манифесте должно быть массивом")
        )

    manifest_entries: List[ManifestFileEntry] = []
    seen_names: Set[str] = set()

    for item in raw_files:
        if not isinstance(item, dict) or "name" not in item or "size_bytes" not in item or "sha256" not in item:
            raise ClassConfigError(
                make_error(ErrorCode.BASELINE_CORRUPT, "некорректная запись файла в манифесте")
            )
        entry = ManifestFileEntry.from_dict(item)
        if entry.name in seen_names:
            raise ClassConfigError(
                make_error(ErrorCode.BASELINE_CORRUPT, f"повторяющееся имя файла в манифесте: {entry.name}")
            )
        seen_names.add(entry.name)
        manifest_entries.append(entry)

    # Проверка каталога files/
    files_dir = os.path.join(baseline_path, FILES_DIR)
    if not os.path.isdir(files_dir):
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_CORRUPT, f"каталог {FILES_DIR} отсутствует или не является каталогом")
        )

    try:
        actual_files_in_dir = os.listdir(files_dir)
    except OSError as e:
        raise ClassConfigError(
            make_error(ErrorCode.BASELINE_CORRUPT, f"не удалось прочитать каталог {FILES_DIR}")
        )

    # В files/ лежат только файлы, перечисленные в манифесте, и нет лишних записей
    if set(actual_files_in_dir) != seen_names:
        raise ClassConfigError(
            make_error(
                ErrorCode.BASELINE_CORRUPT,
                f"состав каталога {FILES_DIR} не совпадает с записями манифеста",
            )
        )

    copies_content: Dict[str, Tuple[bytes, List[str]]] = {}

    for entry in manifest_entries:
        file_path = os.path.join(files_dir, entry.name)

        try:
            st = os.lstat(file_path)
        except OSError:
            raise ClassConfigError(
                make_error(ErrorCode.BASELINE_CORRUPT, f"не удалось прочитать файл эталона: {entry.name}")
            )

        if stat.S_ISLNK(st.st_mode) or stat.S_ISDIR(st.st_mode) or not stat.S_ISREG(st.st_mode):
            raise ClassConfigError(
                make_error(ErrorCode.BASELINE_CORRUPT, f"запись {entry.name} в {FILES_DIR} не является обычным файлом")
            )

        if st.st_size != entry.size_bytes:
            raise ClassConfigError(
                make_error(
                    ErrorCode.BASELINE_CORRUPT,
                    f"размер файла {entry.name} ({st.st_size} байт) не совпадает с манифестом ({entry.size_bytes} байт)",
                )
            )

        try:
            with open(file_path, "rb") as f:
                content = f.read()
        except OSError:
            raise ClassConfigError(
                make_error(ErrorCode.BASELINE_CORRUPT, f"ошибка чтения файла эталона: {entry.name}")
            )

        actual_sha256 = hashlib.sha256(content).hexdigest().lower()
        if actual_sha256 != entry.sha256:
            raise ClassConfigError(
                make_error(
                    ErrorCode.BASELINE_CORRUPT,
                    f"контрольная сумма SHA-256 файла {entry.name} не совпадает с эталоном",
                )
            )

        try:
            text = content.decode(ENCODING)
        except UnicodeDecodeError:
            raise ClassConfigError(
                make_error(ErrorCode.BASELINE_CORRUPT, f"файл эталона {entry.name} не декодируется как UTF-8")
            )

        copies_content[entry.name] = (content, text.splitlines())

    manifest = BaselineManifest(
        version=raw_manifest["version"],
        created_at=str(raw_manifest["created_at"]),
        source_path=str(raw_manifest["source_path"]),
        encoding=raw_manifest["encoding"],
        limits=raw_manifest["limits"],
        files=manifest_entries,
    )

    return manifest, copies_content


def compare_source_with_baseline(
    source_path: str,
    baseline_path: str,
) -> ComparisonResult:
    """Выполняет построчное сопоставление папки с эталоном."""
    # 1. Проверяем эталон
    manifest, baseline_files = load_and_verify_baseline(baseline_path)

    # 2. Проверяем текущую папку теми же правилами
    source_valid_files = inspect_source_folder(source_path)
    source_files_dict = {f.name: f for f in source_valid_files}

    b_names = set(baseline_files.keys())
    s_names = set(source_files_dict.keys())

    all_names = sorted(b_names | s_names)

    changed_list: List[FileComparison] = []
    added_list: List[FileComparison] = []
    deleted_list: List[FileComparison] = []
    unchanged_list: List[FileComparison] = []

    for name in all_names:
        if name in b_names and name in s_names:
            _, b_lines = baseline_files[name]
            s_lines = source_files_dict[name].logical_lines

            if b_lines == s_lines:
                unchanged_list.append(
                    FileComparison(
                        name=name,
                        status="unchanged",
                        diff_ops=[],
                        baseline_lines=b_lines,
                        source_lines=s_lines,
                    )
                )
            else:
                # Изменён: построчный diff через SequenceMatcher
                matcher = difflib.SequenceMatcher(None, b_lines, s_lines)
                diff_ops: List[DiffOp] = []
                for tag, i1, i2, j1, j2 in matcher.get_opcodes():
                    diff_ops.append(
                        DiffOp(
                            tag=tag,
                            baseline_start=i1 + 1,
                            baseline_lines=b_lines[i1:i2],
                            source_start=j1 + 1,
                            source_lines=s_lines[j1:j2],
                        )
                    )
                changed_list.append(
                    FileComparison(
                        name=name,
                        status="changed",
                        diff_ops=diff_ops,
                        baseline_lines=b_lines,
                        source_lines=s_lines,
                    )
                )

        elif name in s_names and name not in b_names:
            # Добавлен
            s_lines = source_files_dict[name].logical_lines
            diff_ops = [
                DiffOp(
                    tag="insert",
                    baseline_start=1,
                    baseline_lines=[],
                    source_start=1,
                    source_lines=s_lines,
                )
            ]
            added_list.append(
                FileComparison(
                    name=name,
                    status="added",
                    diff_ops=diff_ops,
                    baseline_lines=[],
                    source_lines=s_lines,
                )
            )

        elif name in b_names and name not in s_names:
            # Удалён
            _, b_lines = baseline_files[name]
            diff_ops = [
                DiffOp(
                    tag="delete",
                    baseline_start=1,
                    baseline_lines=b_lines,
                    source_start=1,
                    source_lines=[],
                )
            ]
            deleted_list.append(
                FileComparison(
                    name=name,
                    status="deleted",
                    diff_ops=diff_ops,
                    baseline_lines=b_lines,
                    source_lines=[],
                )
            )

    # В сводной таблице отчёта порядок статусов такой:
    # изменён, добавлен, удалён, без изменений; внутри статуса имена отсортированы.
    ordered_files = changed_list + added_list + deleted_list + unchanged_list

    checked_at = get_current_iso_timestamp()

    return ComparisonResult(
        checked_at=checked_at,
        source_path=source_path,
        baseline_path=baseline_path,
        baseline_created_at=manifest.created_at,
        files=ordered_files,
    )

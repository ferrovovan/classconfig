# SPDX-License-Identifier: GPL-3.0-or-later
"""Модели данных для манифеста эталона и результатов сравнения."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional


@dataclass
class ManifestFileEntry:
    """Запись о файле в манифесте эталона."""
    name: str
    size_bytes: int
    sha256: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "size_bytes": self.size_bytes,
            "sha256": self.sha256,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ManifestFileEntry:
        return cls(
            name=str(data["name"]),
            size_bytes=int(data["size_bytes"]),
            sha256=str(data["sha256"]).lower(),
        )


@dataclass
class BaselineManifest:
    """Манифест эталона (manifest.json)."""
    version: int
    created_at: str
    source_path: str
    encoding: str
    limits: Dict[str, int]
    files: List[ManifestFileEntry] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        # files отсортированы по имени по возрастанию кодов Unicode
        sorted_files = sorted(self.files, key=lambda f: f.name)
        return {
            "version": self.version,
            "created_at": self.created_at,
            "source_path": self.source_path,
            "encoding": self.encoding,
            "limits": self.limits,
            "files": [f.to_dict() for f in sorted_files],
        }


@dataclass
class DiffOp:
    """Операция различия между версией в эталоне и текущей версией."""
    tag: str  # 'equal', 'delete', 'insert', 'replace'
    baseline_start: int  # 1-based start line in baseline
    baseline_lines: List[str]
    source_start: int  # 1-based start line in source
    source_lines: List[str]


@dataclass
class FileComparison:
    """Результат сравнения отдельного файла."""
    name: str
    status: str  # 'unchanged', 'changed', 'added', 'deleted'
    diff_ops: List[DiffOp] = field(default_factory=list)
    baseline_lines: List[str] = field(default_factory=list)
    source_lines: List[str] = field(default_factory=list)

    @property
    def status_display_ru(self) -> str:
        mapping = {
            "unchanged": "без изменений",
            "changed": "изменён",
            "added": "добавлен",
            "deleted": "удалён",
        }
        return mapping.get(self.status, self.status)


@dataclass
class ValidatedSourceFile:
    """Проверенный файл из исходной папки с его байтами и SHA-256."""
    name: str
    path: str
    size_bytes: int
    raw_bytes: bytes
    sha256: str
    text_content: str
    logical_lines: List[str]


@dataclass
class ComparisonResult:
    """Полный результат сравнения текущей папки и эталона."""
    checked_at: str
    source_path: str
    baseline_path: str
    baseline_created_at: str
    files: List[FileComparison] = field(default_factory=list)

    @property
    def count_changed(self) -> int:
        return sum(1 for f in self.files if f.status == "changed")

    @property
    def count_added(self) -> int:
        return sum(1 for f in self.files if f.status == "added")

    @property
    def count_deleted(self) -> int:
        return sum(1 for f in self.files if f.status == "deleted")

    @property
    def count_unchanged(self) -> int:
        return sum(1 for f in self.files if f.status == "unchanged")

    @property
    def has_differences(self) -> bool:
        return (self.count_changed > 0 or self.count_added > 0 or self.count_deleted > 0)

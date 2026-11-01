# SPDX-License-Identifier: GPL-3.0-or-later
"""Коды ошибок и форматирование сообщений ClassConfig.

Формат вывода в stderr:
classconfig: error: <CODE>: <текст>
Код возврата при любой ошибке: 2.
"""

from __future__ import annotations
import sys
from typing import List


class ErrorCode:
    INVALID_ARGUMENTS = "INVALID_ARGUMENTS"
    SOURCE_NOT_FOUND = "SOURCE_NOT_FOUND"
    NOT_A_DIRECTORY = "NOT_A_DIRECTORY"
    PATH_CONFLICT = "PATH_CONFLICT"
    PARENT_NOT_FOUND = "PARENT_NOT_FOUND"
    BASELINE_EXISTS = "BASELINE_EXISTS"
    BASELINE_NOT_FOUND = "BASELINE_NOT_FOUND"
    BASELINE_CORRUPT = "BASELINE_CORRUPT"
    TOO_MANY_FILES = "TOO_MANY_FILES"
    UNSUPPORTED_DIRECTORY = "UNSUPPORTED_DIRECTORY"
    UNSUPPORTED_SYMLINK = "UNSUPPORTED_SYMLINK"
    UNSUPPORTED_TYPE = "UNSUPPORTED_TYPE"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_CONTENT = "UNSUPPORTED_CONTENT"
    READ_ERROR = "READ_ERROR"
    WRITE_ERROR = "WRITE_ERROR"
    REPORT_IS_DIRECTORY = "REPORT_IS_DIRECTORY"


class ClassConfigItemError:
    """Отдельная ошибка проверки объекта или пути."""

    def __init__(self, code: str, message: str, item_name: str = "") -> None:
        self.code = code
        self.message = message
        self.item_name = item_name

    def format_line(self) -> str:
        return f"classconfig: error: {self.code}: {self.message}"

    def __repr__(self) -> str:
        return f"ClassConfigItemError({self.code!r}, {self.message!r}, {self.item_name!r})"


class ClassConfigError(Exception):
    """Исключение при выполнении команды ClassConfig (код завершения 2)."""

    def __init__(self, errors: ClassConfigItemError | List[ClassConfigItemError]) -> None:
        if isinstance(errors, ClassConfigItemError):
            self.errors = [errors]
        else:
            self.errors = errors
        super().__init__(self.errors[0].format_line() if self.errors else "classconfig: error")

    def print_to_stderr(self) -> None:
        for err in self.errors:
            sys.stderr.write(err.format_line() + "\n")


def make_error(code: str, message: str, item_name: str = "") -> ClassConfigItemError:
    return ClassConfigItemError(code, message, item_name)

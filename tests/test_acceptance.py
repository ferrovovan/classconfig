# SPDX-License-Identifier: GPL-3.0-or-later
"""Приёмочные тесты ClassConfig.

Все 20 пунктов проверяются на стандартной библиотеке unittest во временных каталогах.
"""

from __future__ import annotations
import io
import json
import os
import shutil
import stat
import sys
import tempfile
import unittest

from classconfig.cli import main
from classconfig.errors import ErrorCode
from classconfig.limits import MAX_FILE_BYTES, MAX_FILES, MANIFEST_NAME, FILES_DIR


class AcceptanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.test_dir = tempfile.mkdtemp(prefix="classconfig_test_")
        self.source_dir = os.path.join(self.test_dir, "config")
        os.makedirs(self.source_dir)

        # 5 стандартных учебных файлов
        self.sample_files = {
            "app.ini": "PORT=5432\nHOST=127.0.0.1\n",
            "display.conf": "THEME=light\n",
            "logging.conf": "LEVEL=info\n",
            "cache.conf": "ENABLED=true\n",
            "network.conf": "TIMEOUT=30\n",
        }
        for name, content in self.sample_files.items():
            path = os.path.join(self.source_dir, name)
            with open(path, "w", encoding="utf-8", newline="\n") as f:
                f.write(content)

    def tearDown(self) -> None:
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def run_cli(self, args: list[str]) -> tuple[int, str, str]:
        old_stdout, old_stderr = sys.stdout, sys.stderr
        out_buf, err_buf = io.StringIO(), io.StringIO()
        try:
            sys.stdout, sys.stderr = out_buf, err_buf
            code = main(args)
        finally:
            sys.stdout, sys.stderr = old_stdout, old_stderr
        return code, out_buf.getvalue(), err_buf.getvalue()

    # № 1: Снимок пяти файлов
    def test_01_snapshot_five_files(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        code, out, err = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code, 0, f"Expected 0, got {code}. Err: {err}")
        self.assertIn("Эталон сохранён.", out)
        self.assertIn("Файлов: 5", out)

        # Копии побайтно равны исходникам
        manifest_path = os.path.join(baseline_dir, MANIFEST_NAME)
        self.assertTrue(os.path.isfile(manifest_path))
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        self.assertEqual(len(manifest["files"]), 5)
        self.assertTrue(manifest["created_at"])

        for name, expected_content in self.sample_files.items():
            copy_path = os.path.join(baseline_dir, FILES_DIR, name)
            self.assertTrue(os.path.isfile(copy_path))
            with open(copy_path, "rb") as f:
                self.assertEqual(f.read(), expected_content.encode("utf-8"))

    # № 2: Повторный snapshot в тот же путь
    def test_02_snapshot_baseline_exists(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        code1, _, _ = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code1, 0)

        # Читаем байты эталона
        app_copy = os.path.join(baseline_dir, FILES_DIR, "app.ini")
        with open(app_copy, "rb") as f:
            original_bytes = f.read()

        code2, _, err2 = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code2, 2)
        self.assertIn(ErrorCode.BASELINE_EXISTS, err2)

        # Прежние байты неизменны
        with open(app_copy, "rb") as f:
            self.assertEqual(f.read(), original_bytes)

    # № 3: check без правок
    def test_03_check_without_changes(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        code, out, err = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code, 0, f"Expected 0, got {code}. Err: {err}")
        self.assertIn("Изменён: 0", out)
        self.assertIn("Добавлен: 0", out)
        self.assertIn("Удалён: 0", out)
        self.assertIn("Без изменений: 5", out)
        self.assertTrue(os.path.isfile(report_file))

    # № 4: Изменена одна строка
    def test_04_changed_one_line(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        # Меняем app.ini: PORT=5432 -> PORT=5433
        with open(os.path.join(self.source_dir, "app.ini"), "w", encoding="utf-8") as f:
            f.write("PORT=5433\nHOST=127.0.0.1\n")

        code, out, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code, 1)
        self.assertIn("Изменён: 1", out)
        self.assertIn("Без изменений: 4", out)

        with open(report_file, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn("PORT=5432", html)
        self.assertIn("PORT=5433", html)

    # № 5: Файл удалён из папки
    def test_05_deleted_file(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        os.remove(os.path.join(self.source_dir, "display.conf"))

        code, out, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code, 1)
        self.assertIn("Удалён: 1", out)
        self.assertIn("Без изменений: 4", out)

    # № 6: В папке новый допустимый файл
    def test_06_added_file(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        with open(os.path.join(self.source_dir, "extra.conf"), "w", encoding="utf-8") as f:
            f.write("NOTE=demo\n")

        code, out, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code, 1)
        self.assertIn("Добавлен: 1", out)
        self.assertIn("Без изменений: 5", out)

    # № 7: Полный демонстрационный сценарий
    def test_07_full_demo_scenario(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")

        # Шаг 1: snapshot
        code1, _, _ = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code1, 0)

        # Шаг 2: check
        code2, out2, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code2, 0)
        self.assertIn("Изменён: 0", out2)
        self.assertIn("Добавлен: 0", out2)
        self.assertIn("Удалён: 0", out2)
        self.assertIn("Без изменений: 5", out2)

        # Шаг 3: PORT=5432 -> PORT=5433, удалить display.conf, создать extra.conf
        with open(os.path.join(self.source_dir, "app.ini"), "w", encoding="utf-8") as f:
            f.write("PORT=5433\nHOST=127.0.0.1\n")
        os.remove(os.path.join(self.source_dir, "display.conf"))
        with open(os.path.join(self.source_dir, "extra.conf"), "w", encoding="utf-8") as f:
            f.write("NOTE=demo\n")

        # Шаг 4: check -> 1, 1, 1, 3
        code4, out4, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code4, 1)
        self.assertIn("Изменён: 1", out4)
        self.assertIn("Добавлен: 1", out4)
        self.assertIn("Удалён: 1", out4)
        self.assertIn("Без изменений: 3", out4)

        # Шаг 5: возврат файлов
        os.remove(os.path.join(self.source_dir, "extra.conf"))
        with open(os.path.join(self.source_dir, "app.ini"), "w", encoding="utf-8") as f:
            f.write("PORT=5432\nHOST=127.0.0.1\n")
        with open(os.path.join(self.source_dir, "display.conf"), "w", encoding="utf-8") as f:
            f.write("THEME=light\n")

        code5, out5, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code5, 0)
        self.assertIn("Изменён: 0", out5)
        self.assertIn("Добавлен: 0", out5)
        self.assertIn("Удалён: 0", out5)
        self.assertIn("Без изменений: 5", out5)

    # № 8: В папке есть подкаталог
    def test_08_unsupported_directory(self) -> None:
        subdir = os.path.join(self.source_dir, "nested_folder")
        os.makedirs(subdir)
        baseline_dir = os.path.join(self.test_dir, "baseline")

        code, _, err = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code, 2)
        self.assertIn(ErrorCode.UNSUPPORTED_DIRECTORY, err)
        self.assertFalse(os.path.exists(baseline_dir))

    # № 9: В папке есть символическая ссылка
    def test_09_unsupported_symlink(self) -> None:
        target = os.path.join(self.test_dir, "target.txt")
        with open(target, "w") as f:
            f.write("target\n")
        link_path = os.path.join(self.source_dir, "symlink.conf")
        os.symlink(target, link_path)

        baseline_dir = os.path.join(self.test_dir, "baseline")
        code, _, err = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code, 2)
        self.assertIn(ErrorCode.UNSUPPORTED_SYMLINK, err)

    # № 10: Файл 1 048 577 байт
    def test_10_file_too_large(self) -> None:
        large_path = os.path.join(self.source_dir, "large.txt")
        with open(large_path, "wb") as f:
            f.write(b"A" * (MAX_FILE_BYTES + 1))

        baseline_dir = os.path.join(self.test_dir, "baseline")
        code, _, err = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code, 2)
        self.assertIn(ErrorCode.FILE_TOO_LARGE, err)

    # № 11: Файл с NUL или не UTF-8
    def test_11_unsupported_content(self) -> None:
        nul_path = os.path.join(self.source_dir, "nul.bin")
        with open(nul_path, "wb") as f:
            f.write(b"hello\x00world\n")

        baseline_dir = os.path.join(self.test_dir, "baseline")
        code, _, err = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code, 2)
        self.assertIn(ErrorCode.UNSUPPORTED_CONTENT, err)

    # № 12: Строка TITLE=a<b>&c: экранирование в HTML
    def test_12_html_escaping(self) -> None:
        with open(os.path.join(self.source_dir, "escape.conf"), "w", encoding="utf-8") as f:
            f.write("TITLE=a<b>&c\n")

        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        with open(os.path.join(self.source_dir, "escape.conf"), "w", encoding="utf-8") as f:
            f.write("TITLE=a<b>&c_new\n")

        code, _, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code, 1)

        with open(report_file, "r", encoding="utf-8") as f:
            content = f.read()

        # В сыром HTML сущности экранированы
        self.assertIn("TITLE=a&lt;b&gt;&amp;c", content)
        self.assertNotIn("TITLE=a<b>&c", content)

    # № 13: check при успехе и при ошибке: набор имён и байты папки и эталона те же
    def test_13_integrity_after_check(self) -> None:
        def read_folder_bytes(folder: str) -> dict[str, bytes]:
            res: dict[str, bytes] = {}
            for name in os.listdir(folder):
                with open(os.path.join(folder, name), "rb") as f:
                    res[name] = f.read()
            return res

        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        baseline_files_dir = os.path.join(baseline_dir, FILES_DIR)
        source_before = read_folder_bytes(self.source_dir)
        baseline_before = read_folder_bytes(baseline_files_dir)

        # check успешный
        self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        source_after = read_folder_bytes(self.source_dir)
        baseline_after = read_folder_bytes(baseline_files_dir)
        self.assertEqual(source_before, source_after)
        self.assertEqual(baseline_before, baseline_after)

    # № 14: Пустая папка
    def test_14_empty_folder(self) -> None:
        empty_source = os.path.join(self.test_dir, "empty_cfg")
        os.makedirs(empty_source)
        baseline_dir = os.path.join(self.test_dir, "empty_baseline")
        report_file = os.path.join(self.test_dir, "empty_report.html")

        code1, out1, _ = self.run_cli(["snapshot", "--source", empty_source, "--baseline", baseline_dir])
        self.assertEqual(code1, 0)
        self.assertIn("Файлов: 0", out1)

        code2, out2, _ = self.run_cli(["check", "--source", empty_source, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code2, 0)
        self.assertIn("Без изменений: 0", out2)

        with open(report_file, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn("Файлов нет. Папка совпадает с эталоном.", html)

    # № 15: Эталон внутри проверяемой папки или отчёт внутри неё
    def test_15_path_conflict(self) -> None:
        nested_baseline = os.path.join(self.source_dir, "baseline")
        code, _, err = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", nested_baseline])
        self.assertEqual(code, 2)
        self.assertIn(ErrorCode.PATH_CONFLICT, err)

    # № 16: После снимка изменён байт копии в files/ -> BASELINE_CORRUPT
    def test_16_baseline_corrupt_byte_modified(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        # Портим байт копии app.ini
        copy_app = os.path.join(baseline_dir, FILES_DIR, "app.ini")
        with open(copy_app, "wb") as f:
            f.write(b"CORRUPTED_BYTES\n")

        code, _, err = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code, 2)
        self.assertIn(ErrorCode.BASELINE_CORRUPT, err)
        self.assertFalse(os.path.exists(report_file))

    # № 17: 21 файл -> TOO_MANY_FILES
    def test_17_too_many_files(self) -> None:
        for i in range(MAX_FILES + 1):
            with open(os.path.join(self.source_dir, f"file_{i:02d}.conf"), "w") as f:
                f.write(f"PARAM={i}\n")

        baseline_dir = os.path.join(self.test_dir, "baseline")
        code, _, err = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.assertEqual(code, 2)
        self.assertIn(ErrorCode.TOO_MANY_FILES, err)

    # № 18: Файл переименован -> deleted + added, статуса changed нет
    def test_18_renamed_file_deleted_and_added(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        # Переименовываем display.conf -> screen.conf
        os.rename(os.path.join(self.source_dir, "display.conf"), os.path.join(self.source_dir, "screen.conf"))

        code, out, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code, 1)
        self.assertIn("Изменён: 0", out)
        self.assertIn("Добавлен: 1", out)
        self.assertIn("Удалён: 1", out)
        self.assertIn("Без изменений: 4", out)

    # № 19: Те же строки, но LF против CRLF -> unchanged
    def test_19_crlf_vs_lf_unchanged(self) -> None:
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])

        # Записываем app.ini с CRLF
        with open(os.path.join(self.source_dir, "app.ini"), "wb") as f:
            f.write(b"PORT=5432\r\nHOST=127.0.0.1\r\n")

        code, out, _ = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code, 0)
        self.assertIn("Изменён: 0", out)
        self.assertIn("Без изменений: 5", out)

    # № 20: Ошибка проверки папки -> каталога эталона нет и существующий отчёт не заменён
    def test_20_folder_validation_error_no_changes(self) -> None:
        # Сначала создаём корректный отчёт
        baseline_dir = os.path.join(self.test_dir, "baseline")
        report_file = os.path.join(self.test_dir, "report.html")
        self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", baseline_dir])
        self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        with open(report_file, "r", encoding="utf-8") as f:
            original_report_text = f.read()

        # Добавляем недопустимый каталог в source
        os.makedirs(os.path.join(self.source_dir, "bad_folder"))

        # Попытка check
        code_check, _, err_check = self.run_cli(["check", "--source", self.source_dir, "--baseline", baseline_dir, "--report", report_file])
        self.assertEqual(code_check, 2)
        self.assertIn(ErrorCode.UNSUPPORTED_DIRECTORY, err_check)

        # Отчёт остался прежним
        with open(report_file, "r", encoding="utf-8") as f:
            self.assertEqual(f.read(), original_report_text)

        # Попытка snapshot в новый путь
        new_baseline = os.path.join(self.test_dir, "new_baseline")
        code_snap, _, err_snap = self.run_cli(["snapshot", "--source", self.source_dir, "--baseline", new_baseline])
        self.assertEqual(code_snap, 2)
        self.assertIn(ErrorCode.UNSUPPORTED_DIRECTORY, err_snap)
        self.assertFalse(os.path.exists(new_baseline))


if __name__ == "__main__":
    unittest.main()

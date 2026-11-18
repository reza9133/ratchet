#!/usr/bin/env python3
"""Fetch the pinned GenVM v0.2.16 artifacts and prepare a GENVMROOT for genvm-lint.

Direct Mode tests and the linter both need the exact py-genlayer runner and the
py-lib-genlayer-std library that GenVM v0.2.16 ships.  This script downloads them
through gltest's own loader (cached under ~/.cache/gltest-direct) and mirrors the
std library to <repo>/.genvmroot/runners/py-lib-genlayer-std/src, which is where
genvm-lint looks for it.  The GENVMROOT path is printed on the last stdout line.
"""
import pathlib
import shutil
import sys

GENVM_VERSION = "v0.2.16"
ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "Ratchet.py"


def main() -> int:
    from gltest.direct.sdk_loader import setup_sdk_paths

    paths = setup_sdk_paths(CONTRACT, GENVM_VERSION)
    std = next((p for p in paths if "py-lib-genlayer-std" in str(p)), None)
    if std is None:
        cache = pathlib.Path.home() / ".cache" / "gltest-direct" / "extracted" / GENVM_VERSION
        candidates = sorted((cache / "py-lib-genlayer-std").glob("*"))
        if not candidates:
            print("could not locate py-lib-genlayer-std", file=sys.stderr)
            return 1
        std = candidates[-1]
    target = ROOT / ".genvmroot" / "runners" / "py-lib-genlayer-std" / "src"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(std, target, dirs_exist_ok=True)
    print(f"GenVM {GENVM_VERSION}: {std} -> {target}", file=sys.stderr)
    print(ROOT / ".genvmroot")
    return 0


if __name__ == "__main__":
    sys.exit(main())

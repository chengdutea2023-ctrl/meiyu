#!/usr/bin/env python3
"""Portable structural validator for a Zhike courseware folder or ZIP."""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath
from typing import Iterable


MAX_PACKAGE_BYTES = 80 * 1024 * 1024
VALID_RUNTIME_TYPES = {"STATIC", "NODE", "BOTH"}
FORBIDDEN_SEGMENTS = {
    "node_modules",
    ".runtime",
    ".codex-backups",
    ".git",
    ".svn",
    "__MACOSX",
}
FORBIDDEN_NAMES = {".env", "deploy.log", "node.pid", "env.json", ".DS_Store"}
TEXT_SUFFIXES = {".html", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".md"}
REMOTE_ASSET_PATTERNS = {
    "jsDelivr CDN": re.compile(r"https?://cdn\.jsdelivr\.net", re.I),
    "unpkg CDN": re.compile(r"https?://unpkg\.com", re.I),
    "Google Fonts": re.compile(r"https?://fonts\.(?:googleapis|gstatic)\.com", re.I),
}
SECRET_PATTERNS = {
    "private key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "AWS access key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
}


def normalized_name(name: str) -> str:
    normalized = name.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def path_problem(name: str) -> str | None:
    raw = name.replace("\\", "/")
    path = PurePosixPath(raw)
    if raw.startswith("/") or ".." in path.parts:
        return "contains an unsafe absolute or parent path"
    parts = tuple(part for part in path.parts if part not in {"", "."})
    if any(part in FORBIDDEN_SEGMENTS for part in parts):
        return "contains a forbidden directory"
    if len(parts) >= 2 and parts[0] == "server" and parts[1] == "data":
        return "contains server/data"
    file_name = parts[-1] if parts else ""
    if (
        file_name in FORBIDDEN_NAMES
        or file_name.startswith(".env.")
        or file_name.endswith(".log")
        or file_name.endswith(".pid")
    ):
        return "contains a forbidden file"
    return None


class Source:
    def names(self) -> list[str]:
        raise NotImplementedError

    def read_bytes(self, name: str) -> bytes:
        raise NotImplementedError

    def is_symlink(self, name: str) -> bool:
        raise NotImplementedError

    def close(self) -> None:
        return None


class DirectorySource(Source):
    def __init__(self, root: Path) -> None:
        self.root = root
        self._names: list[str] = []
        for current, directories, files in os.walk(root, followlinks=False):
            current_path = Path(current)
            for directory in directories:
                path = current_path / directory
                if path.is_symlink():
                    self._names.append(path.relative_to(root).as_posix())
            for file_name in files:
                self._names.append((current_path / file_name).relative_to(root).as_posix())

    def names(self) -> list[str]:
        return sorted(set(self._names))

    def read_bytes(self, name: str) -> bytes:
        return (self.root / name).read_bytes()

    def is_symlink(self, name: str) -> bool:
        return (self.root / name).is_symlink()


class ZipSource(Source):
    def __init__(self, path: Path) -> None:
        self.archive = zipfile.ZipFile(path)
        self.entries = {normalized_name(info.filename): info for info in self.archive.infolist() if not info.is_dir()}

    def names(self) -> list[str]:
        return sorted(self.entries)

    def read_bytes(self, name: str) -> bytes:
        return self.archive.read(self.entries[name])

    def is_symlink(self, name: str) -> bool:
        mode = self.entries[name].external_attr >> 16
        return stat.S_ISLNK(mode)

    def close(self) -> None:
        self.archive.close()


def decode_text(content: bytes) -> str | None:
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return None


def validate_manifest(manifest: object, args: argparse.Namespace, errors: list[str]) -> dict:
    if not isinstance(manifest, dict):
        errors.append("manifest.json must contain a JSON object")
        return {}

    slug = manifest.get("slug")
    title = manifest.get("title")
    runtime = manifest.get("runtimeType")
    entry = manifest.get("entry")
    node_port = manifest.get("nodePort")

    if not isinstance(slug, str) or not slug.strip():
        errors.append("manifest.slug must be a non-empty string")
    if not isinstance(title, str) or not title.strip():
        errors.append("manifest.title must be a non-empty string")
    if runtime not in VALID_RUNTIME_TYPES:
        errors.append("manifest.runtimeType must be STATIC, NODE, or BOTH")
    if not isinstance(entry, str) or not entry.startswith("/"):
        errors.append("manifest.entry must start with /")
    if node_port is not None and (not isinstance(node_port, int) or isinstance(node_port, bool) or not 1024 <= node_port <= 65535):
        errors.append("manifest.nodePort must be null or an integer from 1024 to 65535")

    expected = {
        "slug": args.expected_slug,
        "title": args.expected_title,
        "runtimeType": args.expected_runtime,
    }
    for field, value in expected.items():
        if value is not None and manifest.get(field) != value:
            errors.append(f"manifest.{field} must equal the assigned value: {value}")

    return manifest


def scan_text_files(source: Source, names: Iterable[str], errors: list[str], warnings: list[str]) -> None:
    for name in names:
        if PurePosixPath(name).suffix.lower() not in TEXT_SUFFIXES:
            continue
        try:
            content = source.read_bytes(name)
        except OSError as error:
            errors.append(f"cannot read {name}: {error}")
            continue
        if len(content) > 2 * 1024 * 1024:
            continue
        text = decode_text(content)
        if text is None:
            continue
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                errors.append(f"{name}: possible {label}")
        for label, pattern in REMOTE_ASSET_PATTERNS.items():
            if pattern.search(text):
                warnings.append(f"{name}: references {label}; bundle runtime assets locally")


def run(args: argparse.Namespace) -> int:
    target = Path(args.target).expanduser().resolve()
    errors: list[str] = []
    warnings: list[str] = []

    if not target.exists():
        print(f"ERROR: target does not exist: {target}", file=sys.stderr)
        return 2

    source: Source
    if target.is_dir():
        source = DirectorySource(target)
    elif target.is_file() and zipfile.is_zipfile(target):
        if target.stat().st_size > MAX_PACKAGE_BYTES:
            errors.append(f"ZIP exceeds 80 MB: {target.stat().st_size} bytes")
        source = ZipSource(target)
    else:
        print("ERROR: target must be a courseware directory or ZIP", file=sys.stderr)
        return 2

    try:
        names = source.names()
        if not names:
            errors.append("courseware package is empty")

        for name in names:
            problem = path_problem(name)
            if problem:
                errors.append(f"{name}: {problem}")
            if source.is_symlink(name):
                errors.append(f"{name}: symbolic links are not allowed")

        if "manifest.json" not in names:
            errors.append("manifest.json must exist at the package root")
            manifest: dict = {}
        else:
            try:
                manifest = validate_manifest(json.loads(source.read_bytes("manifest.json")), args, errors)
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                errors.append(f"manifest.json is invalid: {error}")
                manifest = {}

        runtime = manifest.get("runtimeType")
        has_static = "static/index.html" in names or "index.html" in names
        has_node = "server/package.json" in names or "package.json" in names
        if runtime in {"STATIC", "BOTH"} and not has_static:
            errors.append("STATIC/BOTH courseware requires static/index.html or root index.html")
        if runtime in {"NODE", "BOTH"} and not has_node:
            errors.append("NODE/BOTH courseware requires server/package.json or root package.json")

        scan_text_files(source, names, errors, warnings)
    finally:
        source.close()

    result = {
        "target": str(target),
        "valid": not errors,
        "errors": errors,
        "warnings": sorted(set(warnings)),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", help="courseware source directory or ZIP")
    parser.add_argument("--expected-slug")
    parser.add_argument("--expected-title")
    parser.add_argument("--expected-runtime", choices=sorted(VALID_RUNTIME_TYPES))
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))

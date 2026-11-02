"""Port java-quant-backtest/docs Markdown into this Mintlify site.

Usage:
    python scripts/import_from_backtest.py D:/project/gn_quant/java-quant-backtest/docs
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SPECIAL = {
    "SIGNAL_LOGIC.md": "backtest/signals.mdx",
    "BACKTEST_FLOW.md": "backtest/flow.mdx",
    "universe-bench.md": "backtest/universe-bench.mdx",
    "TECH_DESIGN.md": "guide/tech-design.mdx",
    "TECH_STACK.md": "guide/tech-stack.mdx",
    "DEPLOY.md": "guide/deploy.mdx",
    "cache-sizing.md": "guide/cache-sizing.mdx",
    "cache-inventory.md": "guide/cache-inventory.mdx",
    "TABLES.md": "data/tables.mdx",
    "market-mirror.md": "data/mirror.mdx",
    "duckdb/README.md": "data/duckdb.mdx",
    "gngltdb/README.md": "data/gngltdb/index.mdx",
    "ths-db/README.md": "data/ths/index.mdx",
    "api/README.md": "api/overview.mdx",
    "api/page-api-map.md": "api/page-map.mdx",
    "api/portfolio-meta.md": "api/portfolio-meta.mdx",
    "api/portfolio-output.md": "api/portfolio-output.mdx",
    "api/factor-service.md": "api/factor-service.mdx",
    "product/factors/README.md": "factor/formulas.mdx",
    "product/factors/01-上升通道.md": "factor/rising-channel.mdx",
    "product/factors/02-回踩辅助线.md": "factor/pullback.mdx",
    "product/factors/03-火箭信号区域.md": "factor/rocket.mdx",
    "product/factors/04-辅助金叉区域.md": "factor/assist-cross.mdx",
    "product/factors/05-短波金叉区域.md": "factor/short-wave.mdx",
    "product/factors/06-主力进场.md": "factor/main-force.mdx",
}

CODE_RE = re.compile(r"```[\s\S]*?```|`[^`\n]*`")
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def yaml_quote(value: str) -> str:
    cleaned = " ".join(value.replace("\r", " ").split())
    return '"' + cleaned.replace("\\", "\\\\").replace('"', '\\"') + '"'


def escape_prose(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace("{", "&#123;")
        .replace("}", "&#125;")
    )


def escape_mdx(text: str) -> str:
    parts: list[str] = []
    cursor = 0
    for match in CODE_RE.finditer(text):
        parts.append(escape_prose(text[cursor : match.start()]))
        parts.append(match.group(0))
        cursor = match.end()
    parts.append(escape_prose(text[cursor:]))
    return "".join(parts)


def build_dest_map(src_root: Path) -> dict[str, str]:
    mapping = dict(SPECIAL)
    for folder, dest_dir in (("gngltdb/tables", "data/gngltdb"), ("ths-db/tables", "data/ths")):
        directory = src_root / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.md")):
            rel = path.relative_to(src_root).as_posix()
            mapping[rel] = f"{dest_dir}/{path.stem}.mdx"
    return mapping


def rewrite_links(text: str, src_file: Path, src_root: Path, dest_map: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        label, href = match.group(1), match.group(2).strip()
        if href.startswith(("http://", "https://", "mailto:")):
            return match.group(0)
        path_part, _, anchor = href.partition("#")
        if not path_part:
            return match.group(0)
        if not path_part.split("?")[0].endswith(".md"):
            return f"{label}（`{path_part}`）"
        target = (src_file.parent / path_part).resolve()
        try:
            rel = target.relative_to(src_root.resolve()).as_posix()
        except ValueError:
            return f"{label}（`{path_part}`）"
        dest = dest_map.get(rel)
        if dest is None:
            return f"{label}（`{rel}`）"
        url = "/" + dest[: -len(".mdx")]
        if anchor:
            url += "#" + anchor
        return f"[{label}]({url})"

    return LINK_RE.sub(replace, text)


def split_title(text: str, fallback: str) -> tuple[str, str]:
    lines = text.splitlines()
    title = fallback
    start = 0
    for index, line in enumerate(lines):
        if line.startswith("# "):
            title = line[2:].strip().strip("`")
            start = index + 1
            break
    body = "\n".join(lines[start:]).strip() + "\n"
    return title, body


def description_from(body: str, title: str) -> str:
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "|", "-", ">", "```")):
            continue
        plain = re.sub(r"[`*\[\]]", "", stripped)
        if len(plain) > 140:
            plain = plain[:137] + "..."
        return plain
    return title


def write_ported(src_root: Path, dest_map: dict[str, str]) -> None:
    for rel, dest_rel in dest_map.items():
        source = src_root / rel
        if not source.is_file():
            print(f"skip missing {rel}")
            continue
        raw = source.read_text(encoding="utf-8")
        title, body = split_title(raw, Path(rel).stem)
        body = rewrite_links(body, source, src_root, dest_map)
        body = escape_mdx(body)
        description = description_from(body, title)
        page = (
            "---\n"
            f"title: {yaml_quote(title)}\n"
            f"description: {yaml_quote(description)}\n"
            "---\n\n"
            f"{{/* 同步自 java-quant-backtest/docs/{rel} */}}\n\n"
            f"{body}"
        )
        target = ROOT / dest_rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding="utf-8")
        print(f"wrote {dest_rel}")


def page_list(prefix: str, dest_map: dict[str, str]) -> list[str]:
    return sorted(
        dest[: -len(".mdx")]
        for dest in dest_map.values()
        if dest.startswith(prefix) and not dest.endswith("/index.mdx")
    )


def write_docs_json(dest_map: dict[str, str]) -> None:
    gng_tables = page_list("data/gngltdb/", dest_map)
    ths_tables = page_list("data/ths/", dest_map)
    document = {
        "$schema": "https://mintlify.com/docs.json",
        "theme": "mint",
        "name": "GN Quant",
        "description": "高能量化回测、因子研究与数据字典。",
        "colors": {"primary": "#1B4D89", "light": "#3B82F6", "dark": "#1E3A5F"},
        "navigation": {
            "tabs": [
                {
                    "tab": "指南",
                    "icon": "book-open",
                    "groups": [
                        {
                            "group": "开始",
                            "pages": ["index", "quickstart", "guide/tech-stack", "guide/tech-design", "guide/deploy"],
                        },
                        {
                            "group": "运行",
                            "pages": ["guide/cache-sizing", "guide/cache-inventory"],
                        },
                    ],
                },
                {
                    "tab": "因子研究",
                    "icon": "sigma",
                    "groups": [
                        {
                            "group": "因子研究",
                            "root": "factor/overview",
                            "pages": [
                                "factor/guide",
                                "factor/operators",
                                "factor/catalog",
                                {
                                    "group": "选股公式",
                                    "pages": [
                                        "factor/formulas",
                                        "factor/rising-channel",
                                        "factor/pullback",
                                        "factor/rocket",
                                        "factor/assist-cross",
                                        "factor/short-wave",
                                        "factor/main-force",
                                    ],
                                },
                                "factor/authoring",
                                "factor/publish",
                                "factor/library",
                                "factor/precompute",
                                "factor/tracking",
                                "factor/lifecycle",
                                "factor/advanced",
                            ],
                        }
                    ],
                },
                {
                    "tab": "回测",
                    "icon": "chart-line",
                    "groups": [
                        {
                            "group": "回测",
                            "pages": [
                                "backtest/flow",
                                "backtest/signals",
                                "backtest/universe-bench",
                                "api/portfolio-meta",
                                "api/portfolio-output",
                            ],
                        }
                    ],
                },
                {
                    "tab": "数据",
                    "icon": "database",
                    "groups": [
                        {
                            "group": "行情",
                            "pages": ["data/tables", "data/duckdb", "data/mirror"],
                        },
                        {
                            "group": "业务库 gngltdb",
                            "root": "data/gngltdb/index",
                            "expanded": False,
                            "pages": gng_tables,
                        },
                        {
                            "group": "同花顺源库",
                            "root": "data/ths/index",
                            "expanded": False,
                            "pages": ths_tables,
                        },
                    ],
                },
                {
                    "tab": "API",
                    "icon": "braces",
                    "pages": ["api/overview", "api/page-map", "api/factor-service"],
                },
            ]
        },
    }
    (ROOT / "docs.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote docs.json")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/import_from_backtest.py <docs-dir>")
    src_root = Path(sys.argv[1]).resolve()
    dest_map = build_dest_map(src_root)
    write_ported(src_root, dest_map)
    write_docs_json(dest_map)


if __name__ == "__main__":
    main()

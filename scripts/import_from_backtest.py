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
    "api/portfolio-meta.md": "api/portfolio-meta.mdx",
    "product/factors/README.md": "factor/formulas.mdx",
    "product/factors/01-上升通道.md": "factor/rising-channel.mdx",
    "product/factors/02-回踩辅助线.md": "factor/pullback.mdx",
    "product/factors/03-火箭信号区域.md": "factor/rocket.mdx",
    "product/factors/04-辅助金叉区域.md": "factor/assist-cross.mdx",
    "product/factors/05-短波金叉区域.md": "factor/short-wave.mdx",
    "product/factors/06-主力进场.md": "factor/main-force.mdx",
}

SIDEBAR = {
    "backtest/flow.mdx": "流程",
    "backtest/signals.mdx": "买卖点",
    "guide/tech-design.mdx": "方案",
    "guide/deploy.mdx": "部署",
    "guide/cache-sizing.mdx": "缓存容量",
    "guide/cache-inventory.mdx": "缓存清单",
    "data/tables.mdx": "总览",
    "data/duckdb.mdx": "本地库",
    "data/mirror.mdx": "镜像",
    "data/gngltdb/index.mdx": "概览",
    "data/ths/index.mdx": "概览",
    "api/portfolio-meta.mdx": "枚举",
    "factor/formulas.mdx": "总览",
    "factor/rising-channel.mdx": "上升通道",
    "factor/pullback.mdx": "回踩",
    "factor/rocket.mdx": "火箭",
    "factor/assist-cross.mdx": "辅助金叉",
    "factor/short-wave.mdx": "短波",
    "factor/main-force.mdx": "主力",
}

CODE_RE = re.compile(r"```[\s\S]*?```|`[^`\n]*`")
LINK_RE = re.compile(r"(!?)\[([^\]]+)\]\(([^)]+)\)")


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
        bang, label, href = match.group(1), match.group(2), match.group(3).strip()
        if href.startswith(("http://", "https://", "mailto:", "/")):
            return match.group(0)
        path_part, _, anchor = href.partition("#")
        if not path_part:
            return match.group(0)
        image_name = path_part.split("?")[0]
        if image_name.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")):
            return f"![{label}](/images/tech/{Path(image_name).name})"
        if not image_name.endswith(".md"):
            return f"{bang}{label}（`{path_part}`）"
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


def readable(text: str) -> str:
    text = LINK_RE.sub(r"\2", text)
    text = re.sub(r"[`*]", "", text)
    return " ".join(text.split())


def plain_prose(text: str) -> str:
    return re.sub(r"\s+", "", readable(text))


def description_from(body: str, title: str) -> str:
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("- 说明:"):
            note = readable(stripped[len("- 说明:") :])
            if note and note != "-":
                if len(note) > 140:
                    note = note[:137] + "..."
                return note
        if not stripped or stripped.startswith(("#", "|", "-", ">", "```")):
            continue
        plain = readable(stripped)
        if len(plain) > 140:
            plain = plain[:137] + "..."
        return plain
    return title


def strip_repeated_description(body: str, description: str) -> tuple[str, str]:
    """Drop a body paragraph that Mintlify already shows as the page description."""
    target = plain_prose(description)
    if not target:
        return body, description
    prefix = plain_prose(description[:-3]) if description.endswith("...") else ""
    lines = body.splitlines(keepends=True)
    blocks: list[list[str]] = []
    current: list[str] = []
    in_fence = False
    for line in lines:
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            current.append(line)
            continue
        if not in_fence and not line.strip():
            if current:
                blocks.append(current)
                current = []
            blocks.append([line])
            continue
        current.append(line)
    if current:
        blocks.append(current)

    updated = description
    kept: list[str] = []
    for block in blocks:
        text = "".join(block)
        stripped = text.strip()
        if not stripped or stripped.startswith(("```", "#", "|", "-", ">", "<", "!")):
            kept.append(text)
            continue
        folded = plain_prose(text)
        truncated = bool(prefix) and folded.startswith(prefix) and len(folded) > len(prefix)
        if folded == target or truncated:
            if truncated:
                updated = readable(text)
            continue
        first, sep, rest = text.partition("\n")
        if sep and plain_prose(first) == target:
            kept.append(rest)
            continue
        kept.append(text)
    new_body = re.sub(r"\n{3,}", "\n\n", "".join(kept))
    if body.endswith("\n") and not new_body.endswith("\n"):
        new_body += "\n"
    return new_body, updated


def write_ported(src_root: Path, dest_map: dict[str, str]) -> None:
    for rel, dest_rel in dest_map.items():
        source = src_root / rel
        if dest_rel == "guide/tech-design.mdx":
            print("skip hand-authored guide/tech-design.mdx")
            continue
        if not source.is_file():
            print(f"skip missing {rel}")
            continue
        raw = source.read_text(encoding="utf-8")
        title, body = split_title(raw, Path(rel).stem)
        body = rewrite_links(body, source, src_root, dest_map)
        body = escape_mdx(body)
        if dest_rel in {"api/portfolio-meta.mdx", "guide/tech-stack.mdx", "guide/deploy.mdx", "guide/tech-design.mdx"}:
            description = ""
        else:
            description = description_from(body, title)
            body, description = strip_repeated_description(body, description)
        sidebar = SIDEBAR.get(dest_rel)
        sidebar_line = f"sidebarTitle: {yaml_quote(sidebar)}\n" if sidebar else ""
        description_line = f"description: {yaml_quote(description)}\n" if description else ""
        page = (
            "---\n"
            f"title: {yaml_quote(title)}\n"
            f"{sidebar_line}"
            f"{description_line}"
            "---\n\n"
            f"{body}"
        )
        target = ROOT / dest_rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page, encoding="utf-8")
        print(f"wrote {dest_rel}")


TAG_LABELS = {
    "System": "系统",
    "Universe Files": "股票池",
    "Portfolio Backtest": "组合回测",
    "Factor Combo": "因子组合",
}


def _rename_wildcard_content(node: object) -> None:
    if isinstance(node, dict):
        content = node.get("content")
        if isinstance(content, dict) and "*/*" in content and "application/json" not in content:
            content["application/json"] = content.pop("*/*")
        for value in node.values():
            _rename_wildcard_content(value)
    elif isinstance(node, list):
        for item in node:
            _rename_wildcard_content(item)


def drop_product_ui(spec: dict) -> None:
    """产品工作台接口不属于回测引擎，快照里若仍带该标签则丢掉。"""
    spec["tags"] = [tag for tag in spec.get("tags") or [] if tag.get("name") != "Product Quant UI"]
    paths = spec.get("paths") or {}
    for path in list(paths):
        item = paths[path]
        if not isinstance(item, dict):
            continue
        for method in list(item):
            if method.startswith(("x-", "$")):
                continue
            operation = item.get(method)
            if isinstance(operation, dict) and "Product Quant UI" in (operation.get("tags") or []):
                item.pop(method, None)
        if not any(not method.startswith(("x-", "$")) for method in item):
            paths.pop(path, None)


def prepare_openapi(spec: dict) -> dict:
    """Docs-only adjustments. The exported snapshot stays the source of truth."""
    drop_product_ui(spec)
    for tag in spec.get("tags", []):
        label = TAG_LABELS.get(tag.get("name"))
        if label:
            tag["x-group"] = label
    schemes = spec.setdefault("components", {}).setdefault("securitySchemes", {})
    user = schemes.setdefault(
        "UserId",
        {
            "type": "apiKey",
            "name": "X-User-Id",
            "in": "header",
            "description": "演示登录用户，默认 demo_user",
        },
    )
    user["x-default"] = "demo_user"
    spec["security"] = [{"UserId": []}]
    spec.get("paths", {}).pop("/api/v1/universe/market-backtest", None)
    for tag in spec.get("tags") or []:
        if isinstance(tag, dict) and tag.get("name") == "Universe Files":
            tag["description"] = "文件股票池 / 因子成分股"
    _rename_wildcard_content(spec)
    # Windows cannot create the generated page file when a summary contains *, ?, or :.
    # Pin each page to its operationId so the filename stays safe.
    for path, item in spec.get("paths", {}).items():
        if not isinstance(item, dict):
            continue
        for method, operation in item.items():
            if method.startswith("x-") or not isinstance(operation, dict):
                continue
            operation_id = operation.get("operationId")
            if not operation_id:
                continue
            tag = (operation.get("tags") or ["endpoint"])[0]
            folder = tag.lower().replace(" ", "-")
            summary = operation.get("summary") or operation_id
            operation["x-mint"] = {
                "href": f"/api-reference/{folder}/{operation_id}",
                "metadata": {
                    "title": summary,
                    "sidebarTitle": summary,
                },
            }
    return spec


def write_openapi(src_root: Path) -> None:
    source = src_root / "api" / "openapi.json"
    if not source.is_file():
        raise SystemExit(f"missing OpenAPI snapshot: {source}")
    spec = json.loads(source.read_text(encoding="utf-8"))
    dest = ROOT / "api" / "openapi.json"
    dest.write_text(
        json.dumps(prepare_openapi(spec), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote api/openapi.json")


def page_list(prefix: str, dest_map: dict[str, str]) -> list[str]:
    return sorted(
        dest[: -len(".mdx")]
        for dest in dest_map.values()
        if dest.startswith(prefix) and not dest.endswith("/index.mdx")
    )


def write_docs_json(dest_map: dict[str, str]) -> None:
    gng_tables = page_list("data/gngltdb/", dest_map)
    ths_tables = page_list("data/ths/", dest_map)
    # Mintlify only draws a collapse chevron on a group nested inside another group.
    # A blank parent supplies that nesting without a visible heading.
    nest = " "
    document = {
        "$schema": "https://mintlify.com/docs.json",
        "theme": "mint",
        "name": "GN Quant",
        "description": "高能量化回测、因子研究与数据字典。",
        "colors": {"primary": "#1B4D89", "light": "#3B82F6", "dark": "#1E3A5F"},
        "interaction": {"drilldown": False},
        "api": {
            "playground": {"display": "interactive"},
            "examples": {"languages": ["curl", "python", "java"], "prefill": True},
            "url": "full",
        },
        "navigation": {
            "tabs": [
                {
                    "tab": "指南",
                    "icon": "book-open",
                    "groups": [
                        {
                            "group": nest,
                            "pages": [
                                "index",
                                "quickstart",
                                "guide/tech-stack",
                                "guide/tech-design",
                                "guide/deploy",
                                {
                                    "group": "运行",
                                    "expanded": False,
                                    "pages": ["guide/cache-sizing", "guide/cache-inventory"],
                                },
                            ],
                        }
                    ],
                },
                {
                    "tab": "回测",
                    "icon": "chart-line",
                    "pages": [
                        "backtest/flow",
                        "backtest/signals",
                    ],
                },
                {
                    "tab": "数据",
                    "icon": "database",
                    "groups": [
                        {
                            "group": nest,
                            "pages": [
                                "data/tables",
                                "data/duckdb",
                                "data/mirror",
                                {
                                    "group": "业务库",
                                    "expanded": False,
                                    "pages": ["data/gngltdb/index", *gng_tables],
                                },
                                {
                                    "group": "同花顺",
                                    "expanded": False,
                                    "pages": ["data/ths/index", *ths_tables],
                                },
                            ],
                        }
                    ],
                },
                {
                    "tab": "API",
                    "icon": "code",
                    "groups": [
                        {
                            "group": nest,
                            "pages": [
                                "api/portfolio-meta",
                            ],
                        },
                        {
                            "group": "回测服务",
                            "openapi": "api/openapi.json",
                        },
                        {
                            "group": "选股服务",
                            "openapi": "api/factor-service.openapi.json",
                        },
                    ],
                },
                {
                    "tab": "因子研究",
                    "icon": "sigma",
                    "groups": [
                        {
                            "group": nest,
                            "pages": [
                                "factor/overview",
                                "factor/guide",
                                "factor/operators",
                                "factor/catalog",
                                {
                                    "group": "选股公式",
                                    "expanded": False,
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
                                "factor/precompute",
                                "factor/tracking",
                                "factor/lifecycle",
                                "factor/advanced",
                            ],
                        }
                    ],
                },
                {
                    "tab": "调研",
                    "icon": "telescope",
                    "pages": [
                        "research/factor-decomposition",
                        "research/nl-factor",
                        "research/ai-qa",
                    ],
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
    write_openapi(src_root)
    write_docs_json(dest_map)


if __name__ == "__main__":
    main()

from __future__ import annotations

from pathlib import Path

RULES_DIR = Path(__file__).resolve().parent / "knowledge" / "rules"


def people_rule_files() -> list[Path]:
    if not RULES_DIR.is_dir():
        return []
    return sorted(path for path in RULES_DIR.glob("*.md") if path.is_file())


def parse_front_matter(content: str) -> tuple[dict[str, str], str]:
    if not content.startswith("---"):
        return {}, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content
    meta: dict[str, str] = {}
    for line in parts[1].splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip().strip('"')
    return meta, parts[2].lstrip("\n")


def load_people_rules() -> list[dict]:
    rules: list[dict[str, str]] = []
    for path in people_rule_files():
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
        title = meta.get("title") or path.stem
        if body.strip():
            rules.append(
                {
                    "title": title,
                    "description": meta.get("description", ""),
                    "body": body.strip(),
                    "path": path.name,
                    "raw": path.read_text(encoding="utf-8"),
                    "meta": meta,
                }
            )
    return rules


def install() -> None:
    """Patch Data Formulator so People rules are always injected and seeded."""
    from data_formulator.knowledge.store import KnowledgeStore

    people_rules = load_people_rules()
    original_load = KnowledgeStore.load_always_apply_rules
    original_init = KnowledgeStore.__init__

    def load_always_apply_rules(self):  # type: ignore[no-untyped-def]
        rules = original_load(self)
        seen = {item.get("title") for item in rules}
        for rule in people_rules:
            if rule["title"] not in seen:
                rules.append({"title": rule["title"], "body": rule["body"]})
                seen.add(rule["title"])
        return rules

    def __init__(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        original_init(self, *args, **kwargs)
        for rule in people_rules:
            try:
                existing = self.list_all("rules")
                names = {item.get("path") for item in existing}
                if rule["path"] in names:
                    continue
                self.write("rules", rule["path"], rule["raw"])
            except Exception:
                continue

    KnowledgeStore.load_always_apply_rules = load_always_apply_rules  # type: ignore[method-assign]
    KnowledgeStore.__init__ = __init__  # type: ignore[method-assign]

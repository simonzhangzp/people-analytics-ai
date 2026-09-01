from __future__ import annotations

import re

DOWNRANK = re.compile(
    r"minecraft|makecode|k-?12|for kids|student|minigame|mini-game|education edition|hour of code",
    re.I,
)
ENTERPRISE = re.compile(
    r"azure|machine learning|data engineer|analytics|software engineer|cloud|fabric|spark|kubernetes|python for data|applied skill|certif|copilot studio|openai",
    re.I,
)
SKILL = re.compile(r"python|sql|pandas|jupyter", re.I)


def people_learning_relevance_score(title: str, content_type: str | None, level: str | None) -> int:
    text = title or ""
    score = 0
    if DOWNRANK.search(text):
        return -100
    kind = (content_type or "").lower()
    if kind in {"learning_path", "certification", "applied_skills", "course"}:
        score += 8
    elif kind == "module":
        score += 3
    else:
        score += 1
    if ENTERPRISE.search(text):
        score += 14
    elif SKILL.search(text):
        score += 6
    lvl = (level or "").lower()
    if "intermediate" in lvl or "advanced" in lvl:
        score += 4
    elif "beginner" in lvl:
        score += 0
    else:
        score += 2
    return score

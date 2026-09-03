from __future__ import annotations

"""People serving project refs. Scripts must fail-closed on QuantReview refs."""

PEOPLE_REF = "zapmigfrtnwnkmezjefx"
PEOPLE_PROJECT_NAME = "PeopleAnalyticsAI.net"
PROD_REF = "fyvivwgyisrtmehzjqlv"
QUANTREVIEW_STAGING_REF = "kgxbomcmgkwlmzyevqjw"
BLOCKED_REFS = frozenset({PROD_REF, QUANTREVIEW_STAGING_REF})


def refuse_blocked(*parts: str | None) -> None:
    text = " ".join(p for p in parts if p)
    for blocked in BLOCKED_REFS:
        if blocked in text:
            raise SystemExit(f"refused: blocked supabase ref {blocked}")


def assert_people_ref(ref: str | None, *haystacks: str | None) -> str:
    refuse_blocked(ref, *haystacks)
    chosen = (ref or PEOPLE_REF).strip()
    if chosen != PEOPLE_REF:
        raise SystemExit(f"refused: unexpected people ref {chosen}")
    return PEOPLE_REF

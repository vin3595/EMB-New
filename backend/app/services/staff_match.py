import difflib


def fuzzy_match_staff(name: str, staff_docs: list[dict]) -> dict | None:
    """Match a handwritten/OCR'd name against staff names + known spelling aliases.

    Returns the best-matching staff doc, or None if nothing is close enough.
    """
    if not name:
        return None
    needle = name.strip().lower()
    if not needle:
        return None

    candidates: dict[str, dict] = {}
    for staff in staff_docs:
        candidates[staff["name"].strip().lower()] = staff
        for alias in staff.get("aliases", []):
            candidates[alias.strip().lower()] = staff

    if needle in candidates:
        return candidates[needle]

    matches = difflib.get_close_matches(needle, candidates.keys(), n=1, cutoff=0.72)
    return candidates[matches[0]] if matches else None

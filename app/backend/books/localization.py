import re


UKRAINIAN_LOCALE = "uk-UA"
_UKRAINIAN_LETTERS = re.compile(r"[іїєґІЇЄҐ]")


def is_ukrainian_text(value: str | None) -> bool:
    """Detect Ukrainian confidently using letters not used in Russian."""
    return bool(value and _UKRAINIAN_LETTERS.search(value))


def is_ukrainian_language(language: str | None) -> bool:
    return bool(language and language.lower().replace("_", "-").split("-")[0] == "uk")

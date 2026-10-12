import secrets
import time

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column


_ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def generate_ulid() -> str:
    """Generate a 26-character ULID string."""
    timestamp_ms = time.time_ns() // 1_000_000
    randomness = secrets.randbits(80)
    value = (timestamp_ms << 80) | randomness
    encoded = []
    for _ in range(26):
        value, remainder = divmod(value, 32)
        encoded.append(_ULID_ALPHABET[remainder])
    return "".join(reversed(encoded))


class UlidMixin:
    id: Mapped[str] = mapped_column(String(26), primary_key=True, default=generate_ulid)


class OwnedModelMixin:
    created_by: Mapped[str] = mapped_column(
        String(26), ForeignKey("profiles.id"), nullable=False
    )

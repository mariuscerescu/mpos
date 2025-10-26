import json
from typing import Any


def serialize_payload(payload: dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"))


def deserialize_payload(raw: str) -> dict[str, Any]:
    return json.loads(raw)

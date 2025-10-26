import logging
from typing import Optional


def configure_logging(level: Optional[int] = None) -> None:
    logging.basicConfig(
        level=level or logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

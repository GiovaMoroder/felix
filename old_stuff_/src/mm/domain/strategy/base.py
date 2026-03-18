from typing import Protocol

from mm.domain.execution_model import Quotes


class Strategy(Protocol):
    def compute_quotes(self, price: float) -> Quotes:
        ...

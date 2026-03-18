from dataclasses import dataclass

from mm.domain.execution_model import Quotes


@dataclass
class SymmetricStrategyParams:
    delta: float


class SymmetricStrategy:
    """
    Quotes a fixed spread around the current price, ignoring inventory.
    """

    def __init__(self, params: SymmetricStrategyParams):
        self.delta = params.delta

    def compute_quotes(self, price: float) -> Quotes:
        return Quotes(bid=price - self.delta, ask=price + self.delta)

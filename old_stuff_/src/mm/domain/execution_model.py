from dataclasses import dataclass

import numpy as np


@dataclass
class PoissonExecutionModelParams:
    A: float
    k: float
    dt: float


@dataclass
class FilledOrders:
    bid: bool
    ask: bool


@dataclass
class Quotes:
    bid: float
    ask: float


class PoissonExecutionModel:
    """Poisson execution model."""

    def __init__(self, params: PoissonExecutionModelParams):
        self.A = params.A
        self.k = params.k
        self.dt = params.dt

    def simulate(self, price: float, quotes: Quotes) -> FilledOrders:
        delta_bid = max(price - quotes.bid, 0.0)
        delta_ask = max(quotes.ask - price, 0.0)

        p_bid = self.A * np.exp(-self.k * delta_bid) * self.dt
        p_ask = self.A * np.exp(-self.k * delta_ask) * self.dt
        p_bid = min(max(p_bid, 0.0), 1.0)
        p_ask = min(max(p_ask, 0.0), 1.0)

        bid_fill = np.random.rand() < p_bid
        ask_fill = np.random.rand() < p_ask

        return FilledOrders(bid=bid_fill, ask=ask_fill)

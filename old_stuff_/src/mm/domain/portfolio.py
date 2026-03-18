from mm.domain.execution_model import FilledOrders, Quotes


class Portfolio:
    """
    Tracks inventory and cash. Updates on fills and can compute mark-to-market PnL.
    """

    def __init__(self):
        self.q = 0
        self.cash = 0.0

    def update(self, fills: FilledOrders, quotes: Quotes) -> None:
        if fills.bid:
            self.q += 1
            self.cash -= quotes.bid
        if fills.ask:
            self.q -= 1
            self.cash += quotes.ask

    def mark_to_market(self, price: float) -> float:
        return self.cash + self.q * price

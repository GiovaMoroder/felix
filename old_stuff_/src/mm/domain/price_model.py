from dataclasses import dataclass

import numpy as np


@dataclass
class BrownianPriceModelParams:
    s0: float
    mu: float
    sigma: float
    dt: float


class BrownianPriceModel:
    """
    Simple Brownian motion price process.
    S_{t+dt} = S_t + mu * dt + sigma * sqrt(dt) * eps
    """

    def __init__(self, params: BrownianPriceModelParams):
        self.s = params.s0
        self.mu = params.mu
        self.sigma = params.sigma
        self.dt = params.dt

    def step(self) -> float:
        eps = np.random.randn()
        self.s = self.s + self.mu * self.dt + self.sigma * np.sqrt(self.dt) * eps
        return self.s

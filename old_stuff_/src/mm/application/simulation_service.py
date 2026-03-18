from dataclasses import dataclass

import numpy as np

from mm.domain.execution_model import PoissonExecutionModel, PoissonExecutionModelParams
from mm.domain.portfolio import Portfolio
from mm.domain.price_model import BrownianPriceModel, BrownianPriceModelParams
from mm.domain.strategy import Strategy, SymmetricStrategy, SymmetricStrategyParams


@dataclass
class SimulationResult:
    prices: np.ndarray
    inventories: np.ndarray
    pnls: np.ndarray


@dataclass
class SimulationParams:
    s0: float
    mu: float
    sigma: float
    dt: float
    A: float
    k: float
    delta: float
    n_steps: int


def init_simulation(
    params: SimulationParams,
) -> tuple[BrownianPriceModel, PoissonExecutionModel, Strategy, Portfolio]:
    price_model_params = BrownianPriceModelParams(
        s0=params.s0,
        mu=params.mu,
        sigma=params.sigma,
        dt=params.dt,
    )
    execution_model_params = PoissonExecutionModelParams(
        A=params.A,
        k=params.k,
        dt=params.dt,
    )
    strategy_params = SymmetricStrategyParams(delta=params.delta)

    price_model = BrownianPriceModel(price_model_params)
    execution_model = PoissonExecutionModel(execution_model_params)
    strategy = SymmetricStrategy(strategy_params)
    portfolio = Portfolio()
    return price_model, execution_model, strategy, portfolio


def run_simulation(
    price_model: BrownianPriceModel,
    execution_model: PoissonExecutionModel,
    strategy: Strategy,
    portfolio: Portfolio,
    n_steps: int,
) -> SimulationResult:
    prices: list[float] = []
    inventories: list[int] = []
    pnls: list[float] = []

    for _ in range(n_steps):
        price = price_model.step()
        quotes = strategy.compute_quotes(price)
        fills = execution_model.simulate(price, quotes)
        portfolio.update(fills, quotes)

        prices.append(price)
        inventories.append(portfolio.q)
        pnls.append(portfolio.mark_to_market(price))

    return SimulationResult(
        prices=np.asarray(prices, dtype=float),
        inventories=np.asarray(inventories, dtype=int),
        pnls=np.asarray(pnls, dtype=float),
    )


def run_n_simulations(
    params: SimulationParams,
    n_sims: int,
    seed: int | None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Runs n independent simulations with fresh components each time.

    Returns arrays shaped (n_sims, n_steps): prices, inventories, pnls.
    """
    prices = np.empty((n_sims, params.n_steps), dtype=float)
    inventories = np.empty((n_sims, params.n_steps), dtype=int)
    pnls = np.empty((n_sims, params.n_steps), dtype=float)

    for i in range(n_sims):
        if seed is not None:
            np.random.seed(seed + i)

        price_model, execution_model, strategy, portfolio = init_simulation(params)
        result = run_simulation(
            price_model=price_model,
            execution_model=execution_model,
            strategy=strategy,
            portfolio=portfolio,
            n_steps=params.n_steps,
        )
        prices[i] = result.prices
        inventories[i] = result.inventories
        pnls[i] = result.pnls

    return prices, inventories, pnls

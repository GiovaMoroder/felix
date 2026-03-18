import matplotlib.pyplot as plt
import numpy as np

from mm.application.simulation_service import SimulationParams, run_n_simulations


def main() -> None:
    params = SimulationParams(
        s0=100.0,
        mu=0.0,
        sigma=1.0,
        dt=0.01,
        A=100.0,
        k=1.5,
        delta=0.5,
        n_steps=1_000,
    )

    n_sims = 1
    seed = 0
    prices, inventories, pnls = run_n_simulations(params=params, n_sims=n_sims, seed=seed)

    t = np.arange(params.n_steps) * params.dt

    price_mean = prices.mean(axis=0)
    price_std = prices.std(axis=0)
    pnl_mean = pnls.mean(axis=0)
    pnl_std = pnls.std(axis=0)
    inv_mean = inventories.mean(axis=0)
    inv_std = inventories.std(axis=0)

    fig, (ax0, ax1, ax2) = plt.subplots(3, 1, figsize=(10, 9), sharex=True)

    ax0.plot(t, prices.T, color="C2", alpha=0.12, linewidth=1.0)
    ax0.plot(t, price_mean, color="C2", linewidth=2.5, label="mean price")
    ax0.fill_between(
        t, price_mean - price_std, price_mean + price_std, color="C2", alpha=0.12, label="±1σ"
    )
    ax0.set_ylabel("price")
    ax0.grid(True, alpha=0.3)
    ax0.legend()

    ax1.plot(t, pnls.T, color="C0", alpha=0.15, linewidth=1.0)
    ax1.plot(t, pnl_mean, color="C0", linewidth=2.5, label="mean PnL")
    ax1.fill_between(t, pnl_mean - pnl_std, pnl_mean + pnl_std, color="C0", alpha=0.15, label="±1σ")
    ax1.set_ylabel("PnL (mark-to-market)")
    ax1.grid(True, alpha=0.3)
    ax1.legend()

    ax2.plot(t, inventories.T, color="C1", alpha=0.15, linewidth=1.0)
    ax2.plot(t, inv_mean, color="C1", linewidth=2.5, label="mean inventory")
    ax2.fill_between(t, inv_mean - inv_std, inv_mean + inv_std, color="C1", alpha=0.15, label="±1σ")
    ax2.set_xlabel("time")
    ax2.set_ylabel("inventory")
    ax2.grid(True, alpha=0.3)
    ax2.legend()

    fig.suptitle(f"{n_sims} simulations (seed base={seed})")
    fig.tight_layout()
    plt.show()

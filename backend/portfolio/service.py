import numpy as np
import pandas as pd
from pypfopt import efficient_frontier, risk_models, expected_returns


def generate_mock_prices() -> pd.DataFrame:
    dates = pd.date_range(start="2023-01-01", end="2025-12-31")
    rng = np.random.default_rng(42)
    tickers = {
        "SPY": (0.0004, 0.012, 450),
        "QQQ": (0.0005, 0.015, 380),
        "BND": (0.0001, 0.004, 72),
        "GLD": (0.0002, 0.008, 180),
        "VNQ": (0.0003, 0.011, 90),
    }
    data = {}
    for ticker, (drift, vol, start) in tickers.items():
        returns = rng.normal(drift, vol, len(dates))
        data[ticker] = start * np.exp(np.cumsum(returns))
    return pd.DataFrame(data, index=dates)


def calculate_efficient_frontier(prices: pd.DataFrame) -> dict:
    mu = expected_returns.mean_historical_return(prices)
    S = risk_models.sample_cov(prices)

    n_samples = 800
    rng = np.random.default_rng(42)
    w = rng.dirichlet(np.ones(len(mu)), n_samples)
    rets = w.dot(mu)
    stds = np.sqrt(np.diag(w @ S @ w.T))
    cloud = [{"return": float(r), "volatility": float(s)} for r, s in zip(rets, stds)]

    ef = efficient_frontier.EfficientFrontier(mu, S)
    weights = ef.max_sharpe()
    perf = ef.portfolio_performance()

    return {
        "cloud": cloud,
        "max_sharpe": {
            "weights": {k: round(v, 4) for k, v in weights.items()},
            "performance": {
                "return": round(perf[0], 4),
                "volatility": round(perf[1], 4),
                "sharpe": round(perf[2], 4),
            },
        },
    }

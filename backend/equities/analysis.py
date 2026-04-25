"""
Stock technical analysis — Markov regime switching + z-score event detection.

Architecture (from Inflection Detection Framework):
  1. Daily log-returns for all detection
  2. k=2 Markov Switching (bull/bear) — most stable for individual stocks
     - Multiple EM initializations, keep best log-likelihood
  3. Regime smoothing (two-stage):
     a. Probability threshold: P(new regime) > 0.60 for 2+ consecutive days
     b. Minimum regime length: 7 days with distance-based merging
  4. Z-score extremes: 30-day rolling, |z| >= 2.0, clustered within 5 days
  5. Robust inflection points: adaptive windows + composite scoring
  6. Hybrid event classification: overlap / z_only / regime_only
"""
from __future__ import annotations

import logging
import warnings
from typing import Optional

import numpy as np
import pandas as pd

from equities.db import get_db

logger = logging.getLogger(__name__)

# ─── Configuration ─────────────────────────────────────────────────────────
K_REGIMES = 2                     # bull / bear (k=2 recommended for stability)
MIN_REGIME_DAYS = 7               # minimum trading days per regime segment
ZSCORE_WINDOW = 30                # rolling window for z-score
ZSCORE_THRESHOLD = 2.0            # |z| >= this marks an extreme event
ZSCORE_MIN_PERIODS = 18           # 60% of window
CLUSTER_DAYS = 5                  # group z-events within this many calendar days
PROB_THRESHOLD = 0.60             # smoothed prob required for regime change
PROB_CONSEC_DAYS = 2              # consecutive days above threshold required
OVERLAP_WINDOW = 3                # ±days for regime+zscore overlap classification
N_MODEL_INITS = 5                 # number of Markov EM initializations

# Robust inflection composite-score weights
W_Z = 0.4
W_MEAN = 0.3
W_VOL = 0.3
INFLECTION_ALPHA = 0.3            # adaptive window = max(7, len_regime * alpha)
INFLECTION_W_MIN = 7


# ─── Data loading ──────────────────────────────────────────────────────────

def _load_prices(ticker: str, years: int = 5) -> Optional[pd.Series]:
    """Load split-adjusted daily closing prices from DB as a DatetimeIndex-ed Series."""
    db = get_db()
    try:
        rows = db.execute("""
            SELECT date, COALESCE(adj_close, close) AS price FROM price_history
            WHERE ticker = %s AND date >= CURRENT_DATE - make_interval(years => %s)
            ORDER BY date ASC
        """, (ticker.upper(), years)).fetchall()
    finally:
        db.close()

    if not rows or len(rows) < 60:
        return None

    dates = pd.to_datetime([r["date"] for r in rows])
    values = [r["price"] for r in rows]
    return pd.Series(values, index=dates, name=ticker)


# ─── Z-score computation ──────────────────────────────────────────────────

def _compute_zscore_series(prices: pd.Series) -> pd.Series:
    """Rolling z-score of daily log-returns over trailing ZSCORE_WINDOW days."""
    prices = prices.astype("float64")
    returns = np.log(prices / prices.shift(1)).dropna()
    mu = returns.rolling(ZSCORE_WINDOW, min_periods=ZSCORE_MIN_PERIODS).mean()
    sigma = returns.rolling(ZSCORE_WINDOW, min_periods=ZSCORE_MIN_PERIODS).std()
    sigma = sigma.replace(0, np.nan)
    return (returns - mu) / sigma


# ─── Markov regime switching ──────────────────────────────────────────────

def _fit_markov_regime(prices: pd.Series) -> dict:
    """
    Fit k=2 Markov Switching on daily log-returns.
    Multiple initializations → probability threshold → min-length smoothing.
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            from statsmodels.tsa.regime_switching.markov_regression import (
                MarkovRegression,
            )

        returns = np.log(prices / prices.shift(1)).dropna() * 100
        if len(returns) < 60:
            return {"regimes": [], "regime_means": {}}

        # Multiple initializations — keep best log-likelihood
        best_res, best_ll = None, -np.inf
        for seed in range(N_MODEL_INITS):
            try:
                np.random.seed(seed * 42 + 7)
                model = MarkovRegression(
                    returns,
                    k_regimes=K_REGIMES,
                    trend="c",
                    switching_variance=True,
                )
                res = model.fit(maxiter=300, disp=False)
                ll = (
                    float(res.llf)
                    if hasattr(res, "llf") and np.isfinite(res.llf)
                    else -np.inf
                )
                if ll > best_ll:
                    best_ll, best_res = ll, res
            except Exception:
                continue

        if best_res is None:
            return {"regimes": [], "regime_means": {}}

        res = best_res

        # Regime means → label mapping (lower mean = bear, higher mean = bull)
        means = []
        for i in range(K_REGIMES):
            m = float(res.params[f"const[{i}]"])
            means.append(0.0 if not np.isfinite(m) else m)
        sorted_idx = list(np.argsort(means))
        label_map = {sorted_idx[0]: "bear", sorted_idx[1]: "bull"}

        # Raw regime from smoothed probabilities
        probs = res.smoothed_marginal_probabilities.values  # shape (T, K)
        raw = probs.argmax(axis=1)

        # Stage 1: probability threshold smoothing
        smoothed = _apply_prob_threshold(raw, probs)

        # Map integer regimes to labels
        labels = [label_map[s] for s in smoothed]

        # Stage 2: min regime length with distance-based merging
        labels = _merge_short_regimes(labels, returns.values)

        # Expand to full price index (returns is 1 shorter than prices)
        daily = pd.Series(labels, index=returns.index)
        daily = daily.reindex(prices.index, method="ffill")
        # First price day has no return — back-fill from next available
        daily = daily.bfill().fillna("bear")

        regimes_out = [
            {"date": d.strftime("%Y-%m-%d"), "regime": v} for d, v in daily.items()
        ]
        named_means = {label_map[i]: round(means[i], 4) for i in range(K_REGIMES)}
        return {"regimes": regimes_out, "regime_means": named_means}

    except Exception as e:
        logger.error(f"Markov regime fitting failed: {e}", exc_info=True)
        return {"regimes": [], "regime_means": {}}


def _apply_prob_threshold(raw: np.ndarray, probs: np.ndarray) -> np.ndarray:
    """
    Only accept a regime change if P(new regime) > PROB_THRESHOLD
    for PROB_CONSEC_DAYS consecutive days.
    Accepted transitions are back-filled to the start of the streak.
    """
    out = raw.copy()
    current = out[0]
    pending = None
    streak = 0

    for i in range(1, len(out)):
        candidate = raw[i]
        if candidate != current:
            if probs[i, candidate] >= PROB_THRESHOLD:
                if pending == candidate:
                    streak += 1
                else:
                    pending = candidate
                    streak = 1
                if streak >= PROB_CONSEC_DAYS:
                    # Accept — back-fill from streak start
                    for j in range(i - streak + 1, i + 1):
                        out[j] = candidate
                    current = candidate
                    pending = None
                    streak = 0
                else:
                    out[i] = current
            else:
                out[i] = current
                pending = None
                streak = 0
        else:
            current = candidate
            pending = None
            streak = 0

    return out


def _merge_short_regimes(labels: list[str], returns: np.ndarray) -> list[str]:
    """
    Merge segments shorter than MIN_REGIME_DAYS using distance metric:
        distance = |mean_left - mean_seg| + |std_left - std_seg|
    Merge with the closer neighbour.
    """
    result = list(labels)
    for _ in range(len(result)):
        segs = _run_length_segments(result)
        merged = False
        for start, end, label in segs:
            length = end - start + 1
            if length >= MIN_REGIME_DAYS:
                continue

            seg_ret = returns[start : end + 1]
            seg_mean = np.mean(seg_ret) if len(seg_ret) else 0
            seg_std = np.std(seg_ret) if len(seg_ret) else 0

            # Left neighbour
            left_dist, left_lbl = np.inf, None
            if start > 0:
                for s, e, lbl in segs:
                    if e == start - 1:
                        lr = returns[s : e + 1]
                        left_dist = abs(np.mean(lr) - seg_mean) + abs(
                            np.std(lr) - seg_std
                        )
                        left_lbl = lbl
                        break

            # Right neighbour
            right_dist, right_lbl = np.inf, None
            if end < len(result) - 1:
                for s, e, lbl in segs:
                    if s == end + 1:
                        rr = returns[s : min(e + 1, len(returns))]
                        right_dist = abs(np.mean(rr) - seg_mean) + abs(
                            np.std(rr) - seg_std
                        )
                        right_lbl = lbl
                        break

            merge_to = None
            if left_dist <= right_dist and left_lbl is not None:
                merge_to = left_lbl
            elif right_lbl is not None:
                merge_to = right_lbl
            elif left_lbl is not None:
                merge_to = left_lbl

            if merge_to:
                for j in range(start, end + 1):
                    result[j] = merge_to
                merged = True
                break  # restart from scratch after each merge

        if not merged:
            break
    return result


def _run_length_segments(arr: list) -> list[tuple[int, int, str]]:
    """Return (start_idx, end_idx, label) for contiguous runs."""
    if not arr:
        return []
    segments: list[tuple[int, int, str]] = []
    s = 0
    for i in range(1, len(arr)):
        if arr[i] != arr[s]:
            segments.append((s, i - 1, arr[s]))
            s = i
    segments.append((s, len(arr) - 1, arr[s]))
    return segments


# ─── Z-score event detection ──────────────────────────────────────────────

def _detect_zscore_events(prices: pd.Series) -> list[dict]:
    """
    Find days with |z| >= ZSCORE_THRESHOLD.
    Cluster within CLUSTER_DAYS calendar days, pick peak |z| per cluster.
    """
    z = _compute_zscore_series(prices).dropna()

    exceedances = [
        (d, float(v))
        for d, v in z.items()
        if np.isfinite(v) and abs(v) >= ZSCORE_THRESHOLD
    ]
    if not exceedances:
        return []

    # Cluster nearby exceedances
    clusters: list[list] = [[exceedances[0]]]
    for i in range(1, len(exceedances)):
        if (exceedances[i][0] - clusters[-1][-1][0]).days <= CLUSTER_DAYS:
            clusters[-1].append(exceedances[i])
        else:
            clusters.append([exceedances[i]])

    events = []
    for cluster in clusters:
        peak = max(cluster, key=lambda x: abs(x[1]))
        d, z_val = peak
        p = float(prices.asof(d))
        events.append(
            {
                "date": d.strftime("%Y-%m-%d"),
                "z_score": round(z_val, 2),
                "price": round(p, 2),
                "direction": "up" if z_val > 0 else "down",
                "magnitude": "extreme" if abs(z_val) >= 3.0 else "significant",
            }
        )
    return events


# ─── Robust inflection-point detection ────────────────────────────────────

def _detect_inflection_points(prices: pd.Series, regime_data: dict) -> list[dict]:
    """
    Robust Method — for each regime transition, search within an adaptive
    window for the date that maximises a composite score:
        S = W_Z·norm(|z|) + W_MEAN·norm(|Δmean|) + W_VOL·norm(vol_ratio)
    Falls back to the raw transition date if no strong signal found.
    """
    regimes = regime_data.get("regimes", [])
    if len(regimes) < 2:
        return []

    z = _compute_zscore_series(prices)
    returns = np.log(prices / prices.shift(1)).dropna()

    # Collect raw transition dates
    transitions: list[dict] = []
    for i in range(1, len(regimes)):
        if regimes[i]["regime"] != regimes[i - 1]["regime"]:
            transitions.append(
                {
                    "idx": i,
                    "date": regimes[i]["date"],
                    "from": regimes[i - 1]["regime"],
                    "to": regimes[i]["regime"],
                }
            )

    if not transitions:
        return []

    # Build regime-segment lengths for adaptive window sizing
    seg_lengths: dict[int, int] = {}  # transition_idx → length of ending regime
    seg_start = 0
    for i in range(1, len(regimes)):
        if regimes[i]["regime"] != regimes[seg_start]["regime"]:
            seg_lengths[i] = i - seg_start
            seg_start = i

    inflections = []
    for t in transitions:
        transition_date = pd.Timestamp(t["date"])
        prev_seg_len = seg_lengths.get(t["idx"], MIN_REGIME_DAYS)

        # Adaptive window
        w = max(INFLECTION_W_MIN, int(prev_seg_len * INFLECTION_ALPHA))
        win_start = transition_date - pd.Timedelta(days=w)
        win_end = transition_date + pd.Timedelta(days=w)

        # Gather candidates within the window
        candidates = []
        for d in returns.index:
            if d < win_start:
                continue
            if d > win_end:
                break

            z_val = float(z.get(d, 0)) if d in z.index else 0.0
            if not np.isfinite(z_val):
                z_val = 0.0

            before = returns.loc[returns.index < d].tail(ZSCORE_WINDOW)
            after = returns.loc[returns.index >= d].head(ZSCORE_WINDOW)

            delta_mean = 0.0
            vol_ratio_dev = 0.0
            if len(before) > 5 and len(after) > 5:
                dm = abs(float(after.mean()) - float(before.mean()))
                delta_mean = dm if np.isfinite(dm) else 0.0

                vb = float(before.std())
                va = float(after.std())
                if vb > 0 and np.isfinite(va) and np.isfinite(vb):
                    vol_ratio_dev = abs(va / vb - 1.0)

            candidates.append(
                {
                    "date": d,
                    "abs_z": abs(z_val),
                    "delta_mean": delta_mean,
                    "vol_ratio": vol_ratio_dev,
                    "z_val": z_val,
                }
            )

        # Fallback if no candidates
        if not candidates:
            price_at = float(prices.asof(transition_date))
            inflections.append(
                {
                    "date": t["date"],
                    "price": round(price_at, 2),
                    "from_regime": t["from"],
                    "to_regime": t["to"],
                    "z_score": 0.0,
                    "significance": "moderate",
                }
            )
            continue

        # Normalise each metric to [0, 1] across candidates
        max_z = max(c["abs_z"] for c in candidates) or 1
        max_dm = max(c["delta_mean"] for c in candidates) or 1
        max_vr = max(c["vol_ratio"] for c in candidates) or 1

        best_score, best_cand = -1.0, candidates[0]
        for c in candidates:
            s = (
                W_Z * (c["abs_z"] / max_z)
                + W_MEAN * (c["delta_mean"] / max_dm)
                + W_VOL * (c["vol_ratio"] / max_vr)
            )
            if s > best_score:
                best_score = s
                best_cand = c

        price_at = float(prices.asof(best_cand["date"]))
        zv = best_cand["z_val"]
        inflections.append(
            {
                "date": best_cand["date"].strftime("%Y-%m-%d"),
                "price": round(price_at, 2),
                "from_regime": t["from"],
                "to_regime": t["to"],
                "z_score": round(zv, 2) if np.isfinite(zv) else 0.0,
                "significance": "high" if abs(zv) >= 1.5 else "moderate",
            }
        )

    return inflections


# ─── Hybrid event classification ──────────────────────────────────────────

def _classify_hybrid_events(
    market_movers: list[dict],
    inflection_points: list[dict],
) -> tuple[list[dict], list[dict]]:
    """
    Label each event as overlap / z_only / regime_only.
    Overlap = z-score event within ±OVERLAP_WINDOW days of a regime transition.
    """
    # Build ±OVERLAP_WINDOW windows around inflection dates
    inflection_window: set[str] = set()
    for ip in inflection_points:
        d = pd.Timestamp(ip["date"])
        for off in range(-OVERLAP_WINDOW, OVERLAP_WINDOW + 1):
            inflection_window.add(
                (d + pd.Timedelta(days=off)).strftime("%Y-%m-%d")
            )

    mover_window: set[str] = set()
    for mm in market_movers:
        d = pd.Timestamp(mm["date"])
        for off in range(-OVERLAP_WINDOW, OVERLAP_WINDOW + 1):
            mover_window.add((d + pd.Timedelta(days=off)).strftime("%Y-%m-%d"))

    for mm in market_movers:
        mm["event_type"] = "overlap" if mm["date"] in inflection_window else "z_only"

    for ip in inflection_points:
        ip["event_type"] = "overlap" if ip["date"] in mover_window else "regime_only"

    return market_movers, inflection_points


# ─── Sanitize helper ──────────────────────────────────────────────────────

def _sanitize(obj):
    """Recursively replace NaN/Inf with 0 in nested dicts/lists."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, float):
        if not np.isfinite(obj):
            return 0.0
    return obj


# ─── Cache helpers ─────────────────────────────────────────────────────────

def _get_cached_analysis(ticker: str, years: int, current_price_count: int, last_price_date: str) -> dict | None:
    """Return cached analysis if it exists and was built on the same price data."""
    import json as _json
    db = get_db()
    try:
        row = db.execute(
            "SELECT result_json, price_count, last_price_date FROM analysis_cache WHERE ticker = %s AND years = %s",
            (ticker.upper(), years),
        ).fetchone()
    finally:
        db.close()

    if not row:
        return None

    # Invalidate if underlying price data has changed
    if row["price_count"] != current_price_count or row["last_price_date"] != last_price_date:
        return None

    try:
        return _json.loads(row["result_json"])
    except Exception:
        return None


def _store_cached_analysis(ticker: str, years: int, result: dict, price_count: int, last_price_date: str):
    """Write analysis result to cache."""
    import json as _json
    db = get_db()
    try:
        db.execute(
            """INSERT INTO analysis_cache (ticker, years, result_json, price_count, last_price_date)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (ticker, years) DO UPDATE SET
                   result_json = EXCLUDED.result_json,
                   price_count = EXCLUDED.price_count,
                   last_price_date = EXCLUDED.last_price_date""",
            (ticker.upper(), years, _json.dumps(result), price_count, last_price_date),
        )
        db.commit()
    finally:
        db.close()


# ─── Public entry point ───────────────────────────────────────────────────

def get_stock_analysis(ticker: str, years: int = 5) -> dict:
    """
    Full technical analysis for an individual stock.
    Returns price series with regime labels, z-score series,
    inflection points, and market mover events.

    Results are cached in SQLite. Cache is invalidated only when the
    underlying price data changes (new prices fetched).
    """
    prices = _load_prices(ticker, years)
    if prices is None:
        return {"error": f"No price data for {ticker}. Fetch prices first."}

    price_count = len(prices)
    last_price_date = prices.index[-1].strftime("%Y-%m-%d")

    # Check cache — return immediately if analysis was already computed on this data
    cached = _get_cached_analysis(ticker, years, price_count, last_price_date)
    if cached is not None:
        return cached

    # Z-score series (for chart display)
    z = _compute_zscore_series(prices)
    z_data = [
        {"date": d.strftime("%Y-%m-%d"), "z_score": round(float(v), 3)}
        for d, v in z.dropna().items()
        if np.isfinite(v)
    ]

    # Markov regime switching (k=2, daily returns, smoothed)
    regime_data = _fit_markov_regime(prices)

    # Robust inflection points (regime transitions)
    inflections = _detect_inflection_points(prices, regime_data)

    # Z-score extreme events (market movers)
    market_movers = _detect_zscore_events(prices)

    # Hybrid classification
    market_movers, inflections = _classify_hybrid_events(market_movers, inflections)

    # Price series with regime colouring
    regime_map = {r["date"]: r["regime"] for r in regime_data.get("regimes", [])}
    price_series = [
        {
            "date": d.strftime("%Y-%m-%d"),
            "price": round(float(v), 2),
            "regime": regime_map.get(d.strftime("%Y-%m-%d"), "bear"),
        }
        for d, v in prices.items()
    ]

    result = _sanitize(
        {
            "ticker": ticker.upper(),
            "prices": price_series,
            "z_scores": z_data,
            "regime_means": regime_data.get("regime_means", {}),
            "inflection_points": inflections,
            "market_movers": market_movers,
        }
    )

    # Persist to cache
    _store_cached_analysis(ticker, years, result, price_count, last_price_date)

    return result

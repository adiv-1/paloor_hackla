# SESSION 024 — Inflection Detection Framework Rewrite

## Objective

Complete rewrite of `backend/equities/analysis.py` based on the user's detailed Inflection Detection Framework specification. The previous implementation produced **too few regimes and events** (AAPL 1Y = 1 band + 2 movers) due to over-aggressive smoothing (bi-weekly returns, k=3, MIN_REGIME_DAYS=30, z-threshold=2.5).

## Root Cause

The detection system oscillated across prior sessions:
- **Round 1**: k=3 daily → "all neutral" (3rd regime absorbed everything)
- **Round 2**: k=3 bi-weekly + MIN_REGIME_DAYS=30 + z-threshold=2.5 → too few events
- **Round 3 (this session)**: k=2 daily with proper smoothing → balanced detection

Core insight: **k=2 regimes is inherently more stable** for individual stocks than k=3. With only two states (bull/bear), the model doesn't suffer from the "neutral absorbs everything" problem. The user's specification document confirmed this: *"final choice recommended k=2 for stability."*

## Changes Made

### `backend/equities/analysis.py` — Complete Rewrite

#### Parameters (spec-inspired)
| Parameter | Old Value | New Value | Rationale |
|-----------|-----------|-----------|-----------|
| K_REGIMES | 3 | **2** | Bull/bear only — most stable per spec |
| Returns frequency | Bi-weekly (2W-FRI) | **Daily** | Full granularity with k=2 stability |
| MIN_REGIME_DAYS | 30 | **7** | Spec recommends L=7 |
| ZSCORE_THRESHOLD | 2.5 | **2.0** | Spec default |
| ZSCORE_MIN_PERIODS | 30 (100%) | **18 (60%)** | Spec: 60% of window for early z-scores |
| CLUSTER_DAYS | 20 | **5** | Tighter event clustering |
| N_MODEL_INITS | 1 | **5** | Multiple EM initializations for robustness |

#### New Algorithms

1. **Multiple EM Initializations** — Fit MarkovRegression 5 times with different seeds, keep the model with the best log-likelihood. Eliminates convergence to local optima.

2. **Probability Threshold Smoothing** — Only accept a regime change if `P(new regime) > 0.60` for at least 2 consecutive days. Transitions are back-filled to the streak start date. Prevents noisy single-day flips.

3. **Distance-Based Regime Merging** — Short segments (< 7 days) are merged with the neighbour whose return statistics are most similar:
   ```
   distance = |mean_left - mean_seg| + |std_left - std_seg|
   ```
   Iteratively merges until all segments meet the minimum length.

4. **Robust Inflection Detection** — For each regime transition, searches within an adaptive window for the date that maximises a composite score:
   ```
   W = max(7, floor(regime_length × 0.3))
   S = 0.4·norm(|z|) + 0.3·norm(|Δmean|) + 0.3·norm(vol_ratio)
   ```
   Each metric normalised to [0,1] across candidate dates. Falls back to raw transition date if no candidates.

5. **Hybrid Event Classification** — Classifies all events as:
   - `overlap`: z-score event within ±3 days of a regime transition
   - `z_only`: standalone z-score extreme
   - `regime_only`: standalone regime transition

### `frontend/app/dashboard/equities/stocks/[ticker]/page.tsx`

- Removed "Neutral" from the chart legend (k=2 never produces neutral regimes)
- All other chart logic works unchanged — the `priceNeutral` Area renders nothing with k=2

## Test Results

| Ticker | Bands | Z-Score Movers | Inflection Pts | Time |
|--------|-------|----------------|----------------|------|
| AAPL 1Y | 3 | 8 | 2 | 4.9s |
| MSFT 1Y | 4 | 8 | 3 | 1.6s |
| NVDA 1Y | 3 | 9 | 2 | 2.0s |
| AAPL 5Y | 15 | 50 | 14 | 3.3s |
| NVDA 5Y | 11 | 41 | 10 | 4.3s |

**vs. Previous** (Round 2): AAPL 1Y was 1 band + 2 movers → now 3 bands + 8 movers.

## Files Modified
- `backend/equities/analysis.py` — Full rewrite
- `frontend/app/dashboard/equities/stocks/[ticker]/page.tsx` — Legend update
- `docs/SESSION_024.md` — This document

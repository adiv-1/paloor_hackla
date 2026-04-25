-- Migration 004: Alpha Vantage fundamentals table
-- Replaces EDGAR XBRL-based financials with cached AV API responses

CREATE TABLE IF NOT EXISTS av_fundamentals (
    ticker TEXT NOT NULL,
    function_name TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (ticker, function_name)
);

CREATE INDEX IF NOT EXISTS idx_av_fundamentals_ticker ON av_fundamentals(ticker);
CREATE INDEX IF NOT EXISTS idx_av_fundamentals_fetched ON av_fundamentals(fetched_at);

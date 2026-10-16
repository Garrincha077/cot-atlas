# COT Atlas — Futures Positioning Intelligence

COT Atlas is a public-data research dashboard powered by the **CFTC Public Reporting Environment**. No fabricated market positions are used.

## Live applications

- **GitHub-connected edition:** https://cot-atlas-git.vercel.app
- **Research Lab v0.4:** https://cot-atlas-git.vercel.app/research.html
- **Original standalone edition:** https://cot-atlas-live.vercel.app (preserved independently)

## What works

- Seven CFTC datasets: Disaggregated (futures, combined), Traders in Financial Futures (futures, combined), Legacy (futures, combined), and Supplemental CIT.
- Market Explorer with historical COT index, net/long/short positions, search, Heatmap, and Reversal Radar.
- **Flagship / Other / All contracts**, with 34 curated key CFTC contract-market codes across equity indices, rates, FX, metals, energy, agriculture and crypto. Flagship is the default. Other markets remain searchable. Optional sector selector; **not a ranking by volume or global liquidity**.
- **Five- and ten-year drilldowns for individual contracts** from the official CFTC API; these long histories are fetched on demand rather than inflating the shared SQLite archive. Historical values may have been revised.
- Archived COT mode (default): the Vercel API downloads a versioned SQLite snapshot from GitHub, validates it, and serves records directly from SQLite with a bounded server cache. Switch to CFTC Live mode for newly released reports not yet archived.
- Price API: 27 explicitly mapped continuous futures symbols from Yahoo Finance, with visible provider/ticker attribution and 2Y/5Y/10Y daily price ranges. Other CFTC contracts require a user-provided price CSV. Yahoo active-contract futures rolls are not back-adjusted or vintage-audited.
- Daily price CSV import into the *browser session* for price comparison, or mapped Yahoo history, for a limited release-calendar-aware event study. Backtest permits user-set **total round-trip commission and slippage in basis points**, default 20 bps, and tracks trade count/drawdown.
- Read-only CFTC API proxy at `/api/cot?report=disagg_fut&category=managed_money&weeks=104`.
- Versioned SQLite archive from **GitHub Actions** at `data/cot.sqlite3.gz`. Status at `data/manifest.json`.
- First-observed weekly CFTC vintages are preserved under `data/vintages/YYYY-MM-DD/<report>.json.gz` with accompanying metadata, never overwritten on later runs.

## Automated weekly archive

Workflow: [COT Atlas weekly CFTC archive](.github/workflows/cot-refresh.yml)

- Scheduled Friday 23:17 UTC; Saturday 10:37 UTC is the backup.
- Workflow can also be started manually from **Actions → COT Atlas weekly CFTC archive → Run workflow**.
- Initial import spans approximately 735 days; subsequent imports refresh a rolling 90-day window.
- Exponential-retry fetcher, all-seven-dataset completeness checks, freshness checks, SQLite integrity check, and deterministic gzip snapshot.
- After updating SQLite, the workflow snapshots the latest observed COT records once per reporting date, runs three offline tests (coverage, data integrity, vintage labeling), then commits.
- Git history preserves successive archives; if CFTC revises historical data, the current data may differ from an originally published vintage.
- Workflow requires GitHub Actions to be enabled and `GITHUB_TOKEN` with repository write access; normal workflow permissions request `contents: write`.

## Research limitations

- **COT observations are typically taken Tuesday and published later**. A Tuesday observation is not an executable Tuesday trading signal.
- The pre-existing GitHub history and directly queried CFTC historical data are **not vintage-audited**. New first-observed vintages preserve what our crawler saw, but are not conclusive proof of the original 15:30 ET content. A full point-in-time backtest requires primary as-published release vintages and verified market prices.
- The 2025 government shutdown produced exceptional release delays, which the event-study calendar models for published dates. Past data revisions may still cause look-ahead bias.
- Price data must be sourced separately; naive backtests on continuous futures can contain contract-roll artifacts.
- The dashboard defaults to querying the persistent GitHub SQLite archive through Vercel. The manual CFTC Live toggle can fetch newer direct-source history.
- Yahoo Finance continuous futures bars are free provider quotes, not audited settlement records, and can have roll gaps that materially distort percentage-return simulations.
- No confidential credentials are required for reading public CFTC data.

## Source files

- `index.html`: deployed HTML/CSS/JavaScript dashboard.
- `api/cot.js`: primary SQLite archive reader with optional CFTC direct live proxy.
- `api/historical.js`: selective 2Y/5Y/10Y CFTC per-contract data query; no massive all-market download.
- `core-markets.js`: explicit flagship futures selection, codes, sector names and display order.
- `api/prices.js`: explicitly mapped futures price provider.
- `scripts/update_snapshot.py`: SQLite archiver.
- `scripts/capture_vintage.py`: first-observed, immutable COT records for future point-in-time research.
- `tests/test_archives.py`: offline archive and vintage consistency tests.
- `tests/test_market_focus.mjs`: core contracts and UI syntax integrity tests.
- `.github/workflows/cot-refresh.yml`: automation.
- `vercel.json`: serverless config.

CFTC: https://publicreporting.cftc.gov/ .

## Methodology notice: historical research

CFTC observation dates are typically Tuesdays, and release typically occurs Friday at 15:30 Eastern; the UI models exceptional 2025 delayed releases and curated 2026 publication dates. The **source archive remains approximately two years of all markets** while the **selected-contract explorer can load up to ten years**. The CFTC API exposes the current historical view, not independently verified original publication vintages. Yahoo continuous futures prices are not proven to use a consistent contract-roll rule, and return calculations from them are only rough research scenarios. **Do not treat 10-year price-based return results as audited trading performance**. To develop proper PIT results, capture original CFTC publications, futures contracts/roll calendar, and settled daily prices with expenses, and verify per-trade entry times.

## COT Research Lab v0.4 — exploratory study, not PIT-certified

Use **Research Lab** from the web sidebar. Supported instruments are the 27 CFTC codes with an explicit Yahoo continuous-contract price mapping; the other CFTC contracts remain accessible in the Market Explorer but cannot yet be backtested with automatic prices.

The lab runs **five prespecified signal hypotheses × 1, 2, 4, 8, 12 week holding periods** and displays results after a user-defined total round-trip cost (default 20 basis points):

1. **Extreme Reversal:** speculative net-position COT index returns from <=10 to >=15 for long, >=90 to <=85 for short.
2. **Positioning Divergence:** a 104-week standardized score of the counterpart-minus-primary net/open-interest positioning gap crosses +/-1.5. Disaggregated counterpart is Producer/Merchant for Managed Money, while TFF uses Asset Managers vs Leveraged Funds; **TFF is NOT a commercial/hedger classification**.
3. **Position Acceleration:** four-week net/open-interest change z-score crosses +/-1.5 on a trailing 104-week basis.
4. **Crowded Trade:** fade first entrance of a 95/5 COT extreme.
5. **COT + Price Trend:** COT index >=65 or <=35 aligns with 20-day vs 100-day moving-average direction; signal on newly established agreement.

**Information timing:** signal feature values use observations up to each COT report Tuesday and historical prices no later than the modeled Friday release. The entry is the **first available daily close strictly after modeled publication**. The federal 2025 delayed-publication period (2025-09-30 through 2026-01-20) is excluded. For other periods Friday is a proxy, not a verified individual release timestamp.

**Market-price caveat:** Yahoo active-contract prices are continuous proxies and not a historical position in a specified contract with an auditable roll calendar, margin, tick-value, settlement timing, or slippage record. Backtest returns are unit-notional directional changes, not actual futures account or leveraged P&L.

**Evaluation:** split chronological COT observations into earliest 70% / last 30%; measure trades, mean/median net event return, win rate, trade-based compounded hypothetical equity, drawdown, and time-matched buy-only average return. Non-overlapping trades are enforced within each strategy/horizon. The displayed naïve bootstrap mean confidence intervals and Wilson win-rate intervals do not correct for autocorrelation or the search across 25 configurations. Results with fewer than eight holdout trades are **insufficient**, not a buy signal.

**Long history:** CFTC historical API returns its *current* version of historical position records, which may include later corrections. Historical original as-published vintages and independent roll-adjusted futures prices are required before calling this research strict point-in-time or trade-executable.

The core signal engine is dependency-free in `lib/research-engine.js`; its deterministic offline tests are at `tests/test_research_lab.mjs`, and `.github/workflows/research-ci.yml` runs those tests on PRs and relevant pushes.

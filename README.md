# COT Atlas — Futures Positioning Intelligence

COT Atlas is a public-data research dashboard powered by the **CFTC Public Reporting Environment**. No fabricated market positions are used.

## Live applications

- **GitHub-connected edition:** https://cot-atlas-git.vercel.app
- **Original standalone edition:** https://cot-atlas-live.vercel.app (preserved independently)

## What works

- Seven CFTC datasets: Disaggregated (futures, combined), Traders in Financial Futures (futures, combined), Legacy (futures, combined), and Supplemental CIT.
- Market Explorer with historical COT index, net/long/short positions, search, Heatmap, and Reversal Radar.
- Archived COT mode (default): the Vercel API downloads a versioned SQLite snapshot from GitHub, validates it, and serves records directly from SQLite with a bounded server cache. Switch to CFTC Live mode for newly released reports not yet archived.
- Price API: nine explicitly mapped continuous futures symbols from Yahoo Finance, with visible provider/ticker attribution. All other CFTC contracts continue to require a user-provided price CSV. Futures rolls are not adjusted.
- Daily price CSV import into the *browser session* for price comparison, or browser-session mapped Yahoo price history, for a limited release-calendar-aware event study.
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
- `api/prices.js`: explicitly mapped futures price provider.
- `scripts/update_snapshot.py`: SQLite archiver.
- `scripts/capture_vintage.py`: first-observed, immutable COT records for future point-in-time research.
- `tests/test_archives.py`: offline archive and vintage consistency tests.
- `.github/workflows/cot-refresh.yml`: automation.
- `vercel.json`: serverless config.

CFTC: https://publicreporting.cftc.gov/ .

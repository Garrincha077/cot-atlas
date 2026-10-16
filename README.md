# COT Atlas — Futures Positioning Intelligence

COT Atlas is a public-data research dashboard powered by the **CFTC Public Reporting Environment**. No fabricated market positions are used.

## Live applications

- **GitHub-connected edition:** https://cot-atlas-git.vercel.app
- **Original standalone edition:** https://cot-atlas-live.vercel.app (preserved independently)

## What works

- Seven CFTC datasets: Disaggregated (futures, combined), Traders in Financial Futures (futures, combined), Legacy (futures, combined), and Supplemental CIT.
- Market Explorer with historical COT index, net/long/short positions, search, Heatmap, and Reversal Radar.
- Daily price CSV import into the *browser session* for price comparison and a limited release-calendar-aware event study.
- Read-only CFTC API proxy at `/api/cot?report=disagg_fut&category=managed_money&weeks=104`.
- Versioned SQLite archive from **GitHub Actions** at `data/cot.sqlite3.gz`. Status at `data/manifest.json`.

## Automated weekly archive

Workflow: [COT Atlas weekly CFTC archive](.github/workflows/cot-refresh.yml)

- Scheduled Friday 23:17 UTC; Saturday 10:37 UTC is the backup.
- Workflow can also be started manually from **Actions → COT Atlas weekly CFTC archive → Run workflow**.
- Initial import spans approximately 735 days; subsequent imports refresh a rolling 90-day window.
- Exponential-retry fetcher, all-seven-dataset completeness checks, freshness checks, SQLite integrity check, and deterministic gzip snapshot.
- Git history preserves successive archives; if CFTC revises historical data, the current data may differ from an originally published vintage.
- Workflow requires GitHub Actions to be enabled and `GITHUB_TOKEN` with repository write access; normal workflow permissions request `contents: write`.

## Research limitations

- **COT observations are typically taken Tuesday and published later**. A Tuesday observation is not an executable Tuesday trading signal.
- The GitHub snapshot archive and directly queried CFTC historical data are **not revision-vintage-audited**, so a complete point-in-time backtest must use archived as-published vintages and verified publication timestamps.
- Price data must be sourced separately; naive backtests on continuous futures can contain contract-roll artifacts.
- The dashboard currently queries the official CFTC API through Vercel, while the GitHub SQLite database is an independently archived history; it is not yet the online API's primary query source.
- No confidential credentials are required for reading public CFTC data.

## Source files

- `index.html`: deployed HTML/CSS/JavaScript dashboard.
- `api/cot.js`: serverless CFTC API proxy.
- `scripts/update_snapshot.py`: SQLite archiver.
- `.github/workflows/cot-refresh.yml`: automation.
- `vercel.json`: serverless config.

CFTC: https://publicreporting.cftc.gov/ .

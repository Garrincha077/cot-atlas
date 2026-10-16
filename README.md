# COT Atlas — Futures Positioning Intelligence

Official CFTC Commitments of Traders research terminal.

Production dashboard: https://cot-atlas-live.vercel.app

This GitHub repository is the source for the cloud application and a versioned, weekly CFTC data archive. Data is published by CFTC, not real-time market quotes. Backtests require independent daily prices and actual release timing; downloaded historical reports are not necessarily original vintages.

## Architecture

- `index.html` — responsive COT research interface
- `api/cot.js` — CFTC Public Reporting API proxy with transparent error handling
- `scripts/update_snapshot.py` — incremental weekly archive in SQLite
- `.github/workflows/cot-refresh.yml` — scheduled ingestion and verification
- `data/cot.sqlite3.gz` — committed compressed database snapshot (created by GitHub Actions)

Source of CFTC reports: https://publicreporting.cftc.gov/ .

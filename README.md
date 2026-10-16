# COT Atlas — Futures Positioning Intelligence

COT Atlas is a public-data research dashboard powered by the **CFTC Public Reporting Environment**. No fabricated market positions are used.

## Live applications

- **GitHub-connected edition:** https://cot-atlas-git.vercel.app
- **Research Lab v0.4:** https://cot-atlas-git.vercel.app/research.html
- **Contract Roll Lab v0.5:** https://cot-atlas-git.vercel.app/roll-lab.html
- **Multi-decade CFTC Historical Archive v0.6:** https://cot-atlas-git.vercel.app/history.html
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

## Contract Roll Lab v0.5

For contract-specific settlement/roll P&L with private browser-only CSV imports see [the Croatian detailed guide](docs/CONTRACT_ROLL_LAB_HR.md). This is not yet an integrated point-in-time COT strategy backtest. Do not compare percentage returns from Yahoo's proxy to contract-level USD P&L.

## Multi-decade official CFTC history (v0.6)

A new GitHub Action (`.github/workflows/core-history.yml`) automatically creates/updates a compressed SQLite archive of **34 curated flagship CFTC contract-market codes across seven official PRE report datasets**. The initial backfill queries Legacy futures from 1986, Legacy combined from 1995, and other CFTC report families from 2006; each report/contract has its own actual historical start date. Subsequent refreshes update overlapping 90-day windows weekly.

The archive is `data/core-history.sqlite3.gz`; its machine-checkable provenance and family-level coverage are in `data/core-history-manifest.json`. The download script is `scripts/build_core_history.py`. Access historical positions from `/history.html` (including CSV export) or `/api/core-history?report=legacy_fut&category=noncommercial&code=088691&years=45`. The two-year **ALL-contract** weekly archive remains independent at `data/cot.sqlite3.gz`, and the CFTC's direct API remains available for all reported contract codes. All historical observations are real published CFTC data, potentially amended in the provider's current historical view; they are **NOT original as-published point-in-time vintages**.

### Historical futures prices — crucial limitation

The official CFTC dataset does not publish daily settlement-by-expiry futures prices. CME publishes settlement data under exchange data access/licensing conditions, and full historical per-expiry market data may require a paid provider. The existing Yahoo price endpoints expose **27 continuous/active-contract proxy tickers** and do not establish an audited price series for every expiry. The IBKR connector returned errors on attempted historical per-expiry price requests; IBKR's official historical availability is limited for expired futures. We **do not fabricate, store or publicly redistribute paid futures settlements**. The v0.5 contract roll calculator can apply properly to licensed, individually verified contract settlement history once that data source is available.

Sources: [CFTC Historical Compressed](https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm), [CFTC PRE](https://publicreporting.cftc.gov/), [CME Settlement Access FAQ](https://www.cmegroup.com/articles/faqs/access-to-cme-group-settlement-data-faq.html), [IBKR unavailable historical data](https://ibkrcampus.com/docs/web-api/v1/endpoints/market-data/unavailable-historical-data).

## v0.7 — free individual-expiry futures CLOSE pilot (no paid data)

The **Contract Roll Lab** now provides **Load Free Futures Prices** for GC (COMEX Gold), ES (CME E-mini S&P 500), and CL (NYMEX WTI). This is experimental, user-triggered and non-archiving: `GET /api/free-contracts?root=GC|ES|CL` retrieves a short whitelist of exact expiry symbols, checks positive trading volume, **drops prices after independently obtained IBKR last-trading dates**, and combines available data into local browser memory. Other contracts may be unavailable, and the list is deliberately sparse; calculations stop on missing held-contract prices or a missing next contract instead of inventing values.

**Do not confuse Yahoo Finance daily CLOSE with official futures settlement prices.** Their two-year lookback covers live historical contract symbols, but not all expired contracts. A provider may return a ticker response even when the corresponding expiry has ceased trading; this application checks/clips last-trading dates. Where prices exist they may be thin or stale and may have substantial zero-volume periods, which are excluded. This is a research approximation, **not a certified tradable backtest**, a proof of price vendor rights, or a substitute for properly licensed exchange data. The app does not commit external futures price observations to GitHub. Yahoo's terms restrict redistribution of its data; any further use is subject to the provider's terms.

- Verified IBKR futures ladder last-trading dates: as of 2026-10-16. Standard multipliers and tick sizes match official exchange product specifications (GC 100 × 0.10; ES 50 × 0.25; CL 1000 × 0.01).
- Research only: existing COT positions remain sourced separately from official CFTC datasets; prices and COT publication vintages have **not** been combined into a certified PIT futures strategy simulator.
- Additional research resource: [Farag, Snudden & Upton public commodity term-structure archive](https://github.com/SSEconomics/commodity-spot-and-futures-data) has 17 commodities' contract-level futures data aligned by delivery horizon, monthly through December 2022. This has a different cadence and cannot replace daily expiry-specific settlements in the roll engine; reference only, no raw archive rehosting.

See also [Yahoo Finance provider limitations](https://help.yahoo.com/kb/SLN2352.html).

## v0.8 Private futures data access and extended markets

**Deployment privacy:** Vercel project `cot-atlas-git` has team-authenticated `ssoProtection.deploymentType=all`; users must authenticate to access the app or futures-price routes. The GitHub source/CFTC repository is separate and remains public, but raw Yahoo close quotes are neither committed nor persisted there.

The optional `/api/free-contracts?root=...` fetches **private, on-demand** daily close-price proxies by explicit expiry from 13 market roots:

| Market | Code | Multiplier per *displayed quote unit* | Tick size |
|---|---|---:|---:|
| Gold | GC | 100 | 0.1 |
| Silver | SI | 5000 | 0.005 |
| Copper | HG | 25000 | 0.0005 |
| Platinum | PL | 50 | 0.1 |
| WTI | CL | 1000 | 0.01 |
| Natural Gas | NG | 10000 | 0.001 |
| E-mini S&P 500 | ES | 50 | 0.25 |
| E-mini Nasdaq-100 | NQ | 20 | 0.25 |
| 10-Year Treasury Note | ZN | 1000 | 1/64 |
| US Treasury Bond | ZB | 1000 | 1/32 |
| Corn | ZC | **50** | 0.25 cents/bushel |
| Soybeans | ZS | **50** | 0.25 cents/bushel |
| Chicago Wheat | ZW | **50** | 0.25 cents/bushel |

**Why grain multipliers are 50 rather than 5000:** Yahoo quotes prices in **US cents per bushel**, while the underlying contract is 5,000 bushels. One quoted cent of change equals $50 on one standard futures contract. The code explicitly uses `0.25 cent × $50/cent = $12.50` per price tick. On CME's product page this same 0.25 cent is shown as $0.0025/bushel and a $12.50 tick. Conflating quote units would exaggerate simulated dollar P&L 100-fold.

Dates for each listed contract were checked against connected IBKR contract metadata on 2026-10-16. Yahoo availability varies, often has missing/zero-volume bars, and the contract chain is **not complete**. All quotes are fetched on demand, filtered to positive-volume days on or before the corresponding last-trading date, and displayed with accurate source attribution. A front-month roll cannot be simulated through absent next contracts.

**This is not licensed exchange settlement, tradable execution or vintage-audited PIT research.** Private Vercel authentication helps prevent public access but does *not* override any provider's terms for collection, storage, automated access, or redistribution; make any continued usage comply with the source's permitted scope. The full CFTC historical archive remains separate, freely queryable by report, and is not affected by these price settings.

## v0.9 — COT × Individual Futures Roll Research (PRIVATE)

[Open the COT × Roll Backtest](https://cot-atlas-git.vercel.app/roll-research.html) (requires Vercel SSO).

The private browser combines **official CFTC historical positioning** for the selected futures contract, both primary and counterpart participants, with on-demand individual-expiry **Yahoo daily CLOSE** (NOT official settlement) data and existing contract roll engine. Market data are not committed to GitHub. The new calculation runs five predefined hypotheses (Extreme Reversal, Positioning Divergence, Position Acceleration, Crowded Trade, COT + same-expiry Price Trend) across 1/2/4/8/12-week holds.

**Temporal constraints:** COT report observations dated Tuesday cannot be traded Tuesday. The current model assumes Friday release and enters on the next **later** contract quote date. Reports dated 2025-09-30 through 2026-01-20 are excluded because actual delayed publication dates are uncertain. Same-expiry 20/100-day trend indicators use prices **before** presumed release. Volume crossover roll uses only the two previously completed sessions — never end-of-trading volume from the execution date.

**Honest sample accounting:** Each simulated event records the real contract(s) and same-expiry close-to-close USD P&L, slippage/commissions, a matched-calendar long benchmark, rejected data due to missing entries/exits/rolls, and overlap. Last 30% of *available market price dates* is the holdout; earlier CFTC observations are signal warmup only. With fewer than 8 holdout trades, the result is flagged as insufficient. No benchmark or USD total is invented when no trade can be computed.

**Audit:** SHA-256 of the exact primary COT, counterpart COT and downloaded quote rows, plus the CFTC archive snapshot ID, are included in browser export. There is no durable raw Yahoo snapshot; these hashes reveal provider revisions but cannot reproduce bars if the provider deletes them.

**Limits:** Current revised COT historical archive is not as-published PIT, the assumed release dates are not individually validated, Yahoo individual-expiry daily closes are not exchange settlements, futures margins, financing, taxes and fill availability are not modeled, and 25 comparisons invite selection bias. USD hypothetical P&L is **not** percent return on capital. Only 13 underlying roots currently have a sparse direct-expiry quote chain; most ten-year COT history has **no matching prices**. This tool is research only, not a certified profitable trading strategy.

Source files: cot-roll-study.js, roll-research.html; tests/test_roll_study.mjs. CI checks those plus contract-roll-engine.js.

## v1.0 — CFTC official release-date schedule + long-expiry volume-gated quotes

- New `cot-release-calendar.js` uses the [official December 2025 CFTC accelerated catch-up schedule](https://www.cftc.gov/PressRoom/PressReleases/9147-25), including 2025-11-10 Monday report observation and 2025-09-30 -> 2025-11-19 release, rather than incorrectly assuming the missing reports became available three days after Tuesday. The 2026 [CFTC tentative publication calendar](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm) correctly treats non-Friday publications (e.g. June 22 holiday). Older normal Tuesday observations still use a clearly flagged Friday date proxy. Neither calendar proves an as-published COT *value vintage*.
- Individual-expiry Yahoo close quotes can now be requested for **2, 5 or 10 years** and filtered by minimum reported daily volume **1, 10 or 100 contracts**. Private browser default is 10Y with volume ≥10, with options to prioritize fuller coverage or better liquidity. Far-expiry close quotes can be stale or poorly executable even when volume is positive. No raw futures quotes are committed to this public repository.
- Benchmark replay remains contract-by-contract, with no cross-expiry price-gap profit, missing settlement forward-fill or same-day volume lookahead. The research screen shows which report-date timings relied on historical official catch-up, 2026 scheduled CFTC releases or an unverified older Friday proxy.
- Practical real-source tests with five strategies and four-week forward holding (overlapping trades can occur across strategies) showed:
  - GC: **12** eligible at 2Y/volume≥1 -> **19** at 10Y/volume≥10.
  - ZC: **19** -> **29**.
  - CL: **13** -> **59**.
  - ES: **7** -> **5**; liquidity screening reduced coverage because the available direct-expiry price set is sparse.
- **Do not present counts above as statistically independent trades, holdout evidence or established performance.** The last 30% of market-price observations is a small holdout for many futures instruments. Report selection is across 25 configurations, and Yahoo close is not an exchange-reproducible fill.


## v1.1 — Private Futures Coverage Audit

[Open the Coverage Audit](https://cot-atlas-git.vercel.app/coverage.html) (Vercel SSO required).

- On-demand comparison for ES/NQ, any single futures root, or all 13 roots, with bounded requests; no raw price bars persisted in public GitHub.
- For each individual expiry: count of contract-day bars, first/last day, median reported volume, largest calendar gap, and approximate Monday-Friday quote coverage. Exchange holidays are not identified in this approximation.
- A 1/2/4/8/12-week sampled roll-readiness audit reuses the exact held-contract engine. These are potential pricing windows, NOT COT signals, independent trades, or evidence of executable fills.
- Fail-closed price-gap rule: a position spanning more than eight calendar days with no quoted market sessions is rejected; no forward fill or fake roll-gap gain.
- June 2027 E-mini S&P 500 (ESM27.CME) added after confirming the 2027-06-17 last trading date through IBKR. Earlier ES/NQ expiries from 2025 and early 2026 returned HTTP 404 on sampled Yahoo lookups; no synthetic replacements added.
- In a source sample at 10Y/volume≥10, ESZ26 had 163 price observations covering only 19.3% of Monday-Friday dates between its first and last quote, including a 399-day gap. NQZ26 had 112 observations and 84.2% observed weekday coverage. This is why the audit distinguishes price records from connected histories.
- Summary JSON exports deliberately exclude all underlying Yahoo price bars and include quote quality, expiry gaps and sampled roll success/failure counts. The app remains Vercel-login-protected; source access terms still apply.

Tests: node --test tests/test_coverage_audit.mjs. GitHub CI runs this alongside all earlier tests.

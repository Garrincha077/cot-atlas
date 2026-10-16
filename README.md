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


## v1.2 — Research evidence gates and honest ES/NQ alternative-source audit

[Open private COT × Futures Research](https://cot-atlas-git.vercel.app/roll-research.html).

This release adds `cot-quality-gates.js` and enforces a **purged chronological 70/30 price-session split**: trades must close strictly before the split to enter the training subset, and must open on/after the split to enter the holdout subset. Trades straddling the split are excluded from both evaluations, counted separately, but remain in the full historical hypothetical-trade ledger.

Each of the 25 signal × holding-horizon tests now reports `INSUFFICIENT` or `EXPLORATORY_ONLY` together with transparent reasons. The minimum *exploratory* requirements are at least 8 closed training trades, 8 holdout trades, four distinct holdout entry months, a holdout span of >=120 calendar days, and an observed contract-price date span >=365 days. Neither label certifies point-in-time COT vintages or futures executable trade P&L; `EXPLORATORY_ONLY` is NOT proof of a profitable trading edge. The gate is an evidence screen, not a p-value or out-of-sample statistical significance test.

Verified real CFTC + current per-expiry Yahoo sources for GC, CL, ES and NQ: none of 25 configurations on any one of these four roots passes the sufficiency gate. Data gaps and low event counts dominate. This finding does not assert negative expected returns; it says available evidence is insufficient to evaluate an edge.

### Alternate-source evaluation (2026-10-16)

- Stooq expired ES/NQ contract CSV endpoints returned HTTP 403 in our production-like environment; unavailable as an automated fill source.
- Barchart supports specific expired futures in its historical download interface, but the tested public request returned HTTP 202 without usable downloadable contract-by-day price rows; do not claim acquired expiry history.
- [Databento contract history](https://github.com/azizuysal/dbn-cache) supports explicit ESZ24/NQH25 contracts *with the required provider API access*. The open-source downloader itself is not a free historical market database.
- [Community NQ sample](https://github.com/getdata-finance/nq-1m-ohlcv-stocks-historical-data) contains intraday OHLCV but no trustworthy **individual expiry identifier** in each bar, and covers a limited 2026 window. It cannot be merged into an audited expiry roll ledger.
- [Community TopstepX-derived futures data](https://github.com/axb0306/cme-futures-ohlc) has OHLCV root symbols but no verified contract month attached to the example daily rows. Those root-based bars are not equivalent to ESZ24 or NQH25.
- [CME settlement access FAQ](https://www.cmegroup.com/articles/faqs/access-to-cme-group-settlement-data-faq.html) describes settlement access; this task has not acquired its historical per-expiry files.

No absent ES/NQ contracts were filled using a continuous contract, guessed expiry or simulated quote. Quoted data are requested on demand and never committed to the public repo. Vercel SSO remains enabled.

Regression tests: `tests/test_roll_study.mjs` covers the strict chronological split, sample sufficiency, classification and impossibility of upgrading these results to validated PIT/settlement trades.


## v1.3 — ES contract-labelled 2026 minute history (on-demand private source)

NEW: user-selectable exact-expiry community ES minute observations alongside the existing Yahoo per-expiry daily close series in roll-research.html, roll-lab.html and coverage.html.

- Upstream: https://github.com/kfccolonel1/BARS — community IBKR-labelled raw ES 1-minute CSV files in raw/ES/1min/ib/. These are NOT independently authenticated IBKR data or official exchange settlements.
- Four explicitly labelled ES contracts: ESH6→ESH26 (expires 2026-03-20), ESM6→ESM26 (2026-06-18), ESU6→ESU26 (2026-09-18), ESZ6→ESZ26 (2026-12-18); last-trading days confirmed using connected IBKR contract metadata.
- API /api/community-expiries?root=ES&years=10&minVolume=10 fetches four fixed source files privately on demand. It rejects wrong contract IDs, duplicate/invalid minutes, post-expiry observations, session volume shortages, and incomplete daily sessions. Daily close is the last observed 16:55–16:59 ET minute with at least 300 minute bars in that exchange session. CME session dates roll at 18:00 ET. No gap-fill.
- Individual source-file SHA-256, original minute-row count, rejected entries, and per-expiry available date ranges are reported for provenance. Raw and aggregated price histories are not committed to the public repo; responses use private/no-store headers.
- Real source verification on 2026-10-16: 4 files totalling 305,248 minute rows resulted in 213 contract-day close proxies (54 ESH26, 69 ESM26, 68 ESU26, 22 ESZ26), spanning 2025-12-26 to 2026-10-02. All 36/36 sampled four-week quote windows passed the contract-specific roll-readiness continuity test, but those are NOT 36 COT trades.
- With 10Y historical COT and the new ES exact-expiry close data, 44 hypothetical strategy × holding-horizon events completed across all 25 setups. ALL setups remain insufficient according to the strict purged holdout and evidence-quality gate.
- This is a research close proxy; data origin, execution, settlement and original historical COT vintages are not independently audited. Private Vercel SSO does not override provider usage terms. NQ is NOT upgraded with inferred contract identifiers.

Tests: node --test tests/test_community_expiries.mjs, plus existing coverage, roll, COT and UI CI.

## v1.4 — NQ four-expiry explicitly-labelled EVALUATION sample (on-demand only)

Private research now offers a second price source for NQ, alongside existing Yahoo per-expiry daily close. The same new NQ provider can be selected in COT × Contract Research, Contract Roll Lab and Coverage Audit.

- Source: https://huggingface.co/datasets/lynx1231/historical-equity-index-futures-data-sample , daily Parquet evaluation sample. Original file at data/daily/part-00000.parquet is SHA-256 pinned to 9d663cf2425e5f11c19a4d5292c75e6bfec96880e28d7446897f165d6f1bffb6, verified 2026-10-16. It is a FREE RESEARCH/EVALUATION SAMPLE, not a proven authenticated CME historical settlement feed. Source data are fetched on demand, memory only; raw quotes are never added to GitHub.
- Explicit contract codes are NQH26, NQM26, NQU26 and NQZ26, independently checked last trading dates via IBKR: Mar 20, Jun 18, Sep 18 and Dec 18 of 2026, respectively. All other contract codes in the Parquet are excluded, never inferred.
- Parser uses pinned hyparquet 1.31.4 with ZSTD codec decoder pinned in package-lock.json. Validates SHA-256 before parsing, expected schema, contract code, volume, expiry, OHLC range and minimum NQ 0.25-point futures tick. Rows outside the grid (including final cash settlement prices not tradable as tick-conforming futures quotes) are discarded, not rounded.
- Source audit at volume >= 10 contracts and all available dates: NQH26 153 prices; NQM26 160; NQU26 102; NQZ26 44; 459 CONTRACT-DAY observations in total from 2025-06-18 to 2026-07-10. 2 off-grid expiry-day prices were excluded. Early years with volume=0 are excluded. The data sample does not span 10 trading years even if user requests a 10-year history.
- Exactly held-contract roll audit with this source: 48/48 sampled 4-week windows had sufficient observed data. CFTC 10Y history joined via existing TFF leveraged funds vs asset managers yields 39 hypothetical signal × hold-period completions across all 25 configurations. ZERO configurations satisfy evidence-quality gates. Sample gaps, as-published COT vintages, executable fills and multiple testing remain risks.
- Source restrictions apply even for private research. The user-facing UI states these are third-party DAILY CLOSE evaluation data, NOT CME settlements. API: /api/nq-evaluation?root=NQ&years=10&minVolume=10 ; other roots are rejected, source/validation failures return HTTP 503 with no fabricated fallback.
- Checks: node --test tests/test_nq_evaluation.mjs plus existing suite. GitHub research CI first installs package-lock pinned dependencies using npm ci --ignore-scripts.


## v1.5 — Free source-integrity watchdog (no extra Vercel deployments)

Four community ES 2026 minute-CSV source bytes are now **SHA-256 pinned** in `api/community-expiries.js`. If an upstream file is revised, that specific contract is **quarantined and omitted from the simulated roll-price series** instead of being silently accepted. The original publisher's IBKR claim is still unaudited, and pinning does NOT establish that the prices are authenticated exchange settlements.

All four pinned ES files plus the SHA-pinned Hugging Face NQ 2026 daily Parquet research sample are checked by `scripts/check_source_integrity.mjs`. The watchdog also inspects the repository's local CFTC manifest: it requires seven datasets, a manifest generated no more than 12 days ago, and all report dates within 21 days; source reports are explicitly current revised COT records and are NOT point-in-time vintages.

`.github/workflows/source-watch.yml` runs Mon/Wed/Sat at 11:47 UTC (after the Saturday backup CFTC archive job), and can be manually dispatched. It downloads inputs in the GitHub Actions runner **only to calculate SHA-256**, without persisting or uploading any third-party price bars. On a mismatch, timeout, missing dataset or stale archive, the workflow fails and opens a single GitHub issue `[source-watch] COT Atlas data integrity alert`. While the issue is open, repeated failures do not create duplicates; successful recovery closes it. The user can optionally integrate GitHub Issue notifications with Telegram separately.

CI includes offline regression tests for checksum pinning, tampered ES fixtures, source availability and CFTC freshness. The monitor is **not** a proof of trading data origin, completeness, licensing or executable P&L. Third-party source access remains subject to applicable terms. It is deliberately independent of Vercel's free deployment daily limits.

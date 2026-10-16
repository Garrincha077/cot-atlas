# ES 2023–2024 — reproducible historical contract acquisition

Checked: 2026-10-16. This is an acquisition and validation record, NOT a market-price dataset.

## Target: eight independently sourced ES expiries

CME E-mini S&P 500 futures use quarterly H/M/U/Z cycles, with normal last trading day on the third Friday of expiry month. Futures tick = 0.25 points ($12.50); contract multiplier = $50/index point. Verify any unusual contract holiday exceptions with the exchange.

| Contract | Normal expiry | State |
|---|---|---|
| ESH23 | 2023-03-17 | Not acquired |
| ESM23 | 2023-06-16 | Not acquired |
| ESU23 | 2023-09-15 | Not acquired |
| ESZ23 | 2023-12-15 | Not acquired |
| ESH24 | 2024-03-15 | Not acquired |
| ESM24 | 2024-06-21 | Not acquired |
| ESU24 | 2024-09-20 | Not acquired |
| ESZ24 | 2024-12-20 | Not acquired |

Optional bridge: four 2025 contracts (ESH25, ESM25, ESU25, ESZ25), because our first real per-contract ES community price source starts 2025-12-26 for ESH26.

Instrument: https://www.cmegroup.com/education/lessons/product-e-mini-s-and-p

## First-pass access verification

| Provider | Experiment | Result / implications |
|---|---|---|
| Yahoo Finance | ESZ24.CME historical v8 chart | HTTP 404: expired symbol not available |
| Stooq | ESZ24 history CSV | HTTP 403 from test environment |
| Nasdaq Data Link | public CHRIS/CME_ESZ2024 and CME_ESZ2023 endpoints | HTTP 403 from test environment |
| CME DataMine | unauthenticated 2024 file download | HTTP 401. CME advertises *current next-day* settlement files as free; this is NOT evidence of free access to historical 2023/24 licensed backfiles |
| Interactive Brokers | search_futures for ES with include_expired enabled | available ladder returned 2025–2031, not 2023/24 IDs in this test; no historical bars acquired |
| Portara/CQG | explicit-contract historical daily futures | available as a **paid dataset**, with own terms; not purchased |
| Databento | GLBX.MDP3 historical ESZ24, ESH23, ohlcv-1d | explicitly supports contract retrieval, but requires authorized credentials and a price quote; nothing billed or downloaded |

CME settlement policy: https://www.cmegroup.com/articles/faqs/access-to-cme-group-settlement-data-faq.html
CME authenticated DataMine API: https://www.cmegroup.com/datamine/datamine-api.html
DataMine catalog: https://datamine.new.cmegroup.com/
Portara data page: https://portaracqg.com/futures/day/ep/
Databento contract downloader information: https://github.com/azizuysal/dbn-cache

Public pages or anonymous GitHub price archives are not automatic evidence of redistribution rights. No vendor paywall, CAPTCHA, or entitlement restriction was bypassed.

## Required local source representation

CSV columns: date,root,contract,expiry,settle,multiplier,tick_size,volume

Each row must be an observed **individual-contract date**, with actual reported source volume, not a continuous index. The column named settle is a source-recorded daily contract price and is NOT proof of official exchange settlement. No back-adjusting, made-up dates, rounded cash settlement fills or artificial roll-gap profits.

ES Backfill Lab: https://cot-atlas-git.vercel.app/es-backfill.html

It accepts up to 24 user-selected CSV files (up to 30MB aggregate), checks exact expiry against the CME-style third Friday calendar, no duplicate contract/day, actual daily volume threshold and actual 0.25 price-grid tick and $50 point value. **Files remain in the authenticated browser only**, and only summary/checksum reports can be exported. Upstream provenance and permission still require independent verification.

## Verifiable acceptance gates

1. Obtain real dated observations for eight quarterly expiries 2023–2024. The workbench flags contracts with fewer than 40 quote sessions in their active quarter, gaps over 8 calendar days, or truncated start/end dates; this is triage, NOT exchange completeness certification.
2. Record provider identity and proof of authorized usage, settlement/close cutoff and timezone, unit/tick mapping, and SHA-256 of each original input; spot-check against an independent authorized reference.
3. Combine authorized old expiry data and already available 2025/26 labelled ES bars **without filling missing 2025**, and recompute 25 historical strategy×horizon configurations.
4. For a meaningful before/after comparison, keep chronological holdout date at **2026-07-01** in BOTH backtests, purge spanning positions and compare **distinct COT report dates** rather than repeated trade outcomes.
5. Do not infer strategy profitability, valid 10-year holdout, or a point-in-time COT vintage from a price-date count.

## Verified pre-acquisition baseline

At 2026-10-16 the primary ES input included 521 TFF weekly reports, 213 individual-expiry close proxies spanning 2025/26, and 44 hypothetical scenario outcomes across 25 configurations but only **12 distinct priced COT observation dates**. This is NOT a count of independent trades. None of 25 cells meets the study sufficiency gate. The old reference value used a varying 70/30 split; always recalculate both reference and new datasets with the fixed holdout date rather than compare incompatible subsets.

**Current 2023/24 ES data acquired: zero verified individual contract-day observations.**

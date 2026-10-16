#!/usr/bin/env python3
"""Capture first-observed CFTC report vintages for future release-aware research.

This is NOT proof of the exact original 15:30 ET publication. Each vintage
is an immutable local snapshot of what our first successful archive retrieval
saw (may lag and may already contain CFTC corrections).
"""
from __future__ import annotations
import datetime as dt
import gzip
import json
import os
from pathlib import Path
import shutil
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DB = DATA / "cot.sqlite3"
ARCHIVE = DATA / "cot.sqlite3.gz"
DEST = DATA / "vintages"
REPORTS = (
    "disagg_fut", "disagg_comb", "tff_fut", "tff_comb",
    "legacy_fut", "legacy_comb", "supplemental",
)

def get_db():
    if DB.exists():
        return sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    if not ARCHIVE.exists():
        raise RuntimeError("No committed archive to capture")
    DB.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(ARCHIVE, "rb") as source, DB.open("wb") as target:
        shutil.copyfileobj(source, target)
    return sqlite3.connect(f"file:{DB}?mode=ro", uri=True)

def main():
    conn = get_db()
    stamp = dt.datetime.now(dt.timezone.utc).isoformat()
    created = []
    try:
        for report in REPORTS:
            row = conn.execute(
                "SELECT max(report_date) FROM reports WHERE report=?", (report,)
            ).fetchone()
            date = row[0] if row else None
            if not date:
                raise RuntimeError(f"Missing CFTC report {report}")
            folder = DEST / date
            out = folder / f"{report}.json.gz"
            meta_path = folder / f"{report}.meta.json"
            if out.exists() or meta_path.exists():
                if not (out.exists() and meta_path.exists()):
                    raise RuntimeError(f"Incomplete vintage for {report} {date}")
                print("EXISTS", report, date)
                continue
            records = conn.execute("""
                SELECT r.code,r.market,r.sector,r.open_interest,
                       p.category,p.long_qty,p.short_qty
                FROM reports r
                JOIN positions p ON p.report=r.report AND p.code=r.code
                 AND p.report_date=r.report_date
                WHERE r.report=? AND r.report_date=?
                ORDER BY r.code,p.category
                """, (report, date)).fetchall()
            if len(records) < 10:
                raise RuntimeError(f"Unexpectedly sparse vintage: {report} {date}")
            folder.mkdir(parents=True, exist_ok=True)
            payload = {
                "report": report, "report_date": date,
                "first_observed_at_utc": stamp,
                "source": "CFTC Public Reporting Environment, fetched via GitHub Actions",
                "original_publication_verified": False,
                "point_in_time_limitation": (
                    "Snapshot is first observed by the pipeline, not proven to be "
                    "the publication-original version."
                ),
                "columns": ["code","market","sector","open_interest","category","long","short"],
                "rows": records,
            }
            import io
            buffer = io.BytesIO()
            with gzip.GzipFile(fileobj=buffer, mode="wb", filename="", mtime=0, compresslevel=9) as zipped:
                zipped.write(json.dumps(payload,separators=(",",":"),ensure_ascii=False).encode("utf-8"))
            temp = out.with_suffix(".tmp")
            try:
                with temp.open("xb") as f:
                    f.write(buffer.getvalue())
                os.replace(temp, out)
            finally:
                if temp.exists():
                    temp.unlink()
            metadata = {k:v for k,v in payload.items() if k not in ("rows", "columns")}
            metadata["position_rows"] = len(records)
            metadata["archive_bytes"] = out.stat().st_size
            meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
            created.append((report, date, len(records)))
            print("CREATED", report, date, len(records), out.stat().st_size)
        print("Captured vintages:",len(created))
    finally:
        conn.close()

if __name__ == "__main__":
    main()

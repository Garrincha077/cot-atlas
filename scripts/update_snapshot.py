#!/usr/bin/env python3
"""COT Atlas weekly archival ETL — stdlib-only, durable Git-versioned SQLite.

Position snapshots are keyed by report/contract/date/category. CFTC historical
rows can be revised: this archive is an ingestion history, not guaranteed
as-published point-in-time evidence.
"""
from __future__ import annotations
import datetime as dt
import gzip
import json
import os
from pathlib import Path
import random
import shutil
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
DB=DATA/"cot.sqlite3"
ARCHIVE=DATA/"cot.sqlite3.gz"
DATASETS={
 "disagg_fut":"72hh-3qpy","disagg_comb":"kh3c-gbw2",
 "tff_fut":"gpe5-46if","tff_comb":"yw9f-hn96",
 "legacy_fut":"6dca-aqww","legacy_comb":"jun7-fc8e",
 "supplemental":"4zgm-a668"
}
COLUMNS={
 "disagg":{
  "managed_money":["m_money_positions_long_all","m_money_positions_short_all"],
  "producer_merchant":["prod_merc_positions_long","prod_merc_positions_short"],
  "swap_dealer":["swap_positions_long_all","swap__positions_short_all"],
  "other_reportable":["other_rept_positions_long","other_rept_positions_short"],
  "nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]},
 "tff":{
  "leveraged_funds":["lev_money_positions_long","lev_money_positions_short"],
  "asset_managers":["asset_mgr_positions_long","asset_mgr_positions_short"],
  "dealers":["dealer_positions_long_all","dealer_positions_short_all"],
  "other_reportable":["other_rept_positions_long","other_rept_positions_short"],
  "nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]},
 "legacy":{
  "noncommercial":["noncomm_positions_long_all","noncomm_positions_short_all"],
  "commercial":["comm_positions_long_all","comm_positions_short_all"],
  "nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]},
 "supplemental":{
  "index_traders":["cit_positions_long_all","cit_positions_short_all"],
  "commercial":["comm_positions_long_all_nocit","Comm_Positions_Short_All_NoCIT"],
  "nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]}}
FIELDS=["report_date_as_yyyy_mm_dd","cftc_contract_market_code",
        "market_and_exchange_names","commodity_group_name","open_interest_all"]

def get(url):
 for attempt in range(6):
  try:
   req=urllib.request.Request(url,headers={
    "User-Agent":"COT-Atlas-GitHub-Archive/0.3","Accept":"application/json"})
   with urllib.request.urlopen(req,timeout=100) as r:
    data=json.load(r)
   if not isinstance(data,list): raise RuntimeError("Unexpected CFTC response shape")
   return data
  except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError,ValueError) as exc:
   if attempt==5: raise RuntimeError(f"CFTC fetch failed: {str(exc)[:220]}") from exc
   time.sleep(min(2**attempt*2,45)+random.random())
 raise AssertionError("Unreachable")

def restore():
 DATA.mkdir(parents=True,exist_ok=True)
 if ARCHIVE.exists():
  with gzip.open(ARCHIVE,"rb") as src,DB.open("wb") as dst: shutil.copyfileobj(src,dst)

def db_connect():
 c=sqlite3.connect(DB,timeout=60)
 c.execute("PRAGMA journal_mode=WAL")
 c.executescript("""
 CREATE TABLE IF NOT EXISTS reports(
  report TEXT NOT NULL,code TEXT NOT NULL,report_date TEXT NOT NULL,
  market TEXT,sector TEXT,open_interest REAL NOT NULL,
  PRIMARY KEY(report,code,report_date));
 CREATE TABLE IF NOT EXISTS positions(
  report TEXT NOT NULL,code TEXT NOT NULL,report_date TEXT NOT NULL,
  category TEXT NOT NULL,long_qty REAL NOT NULL,short_qty REAL NOT NULL,
  PRIMARY KEY(report,code,report_date,category));
 CREATE INDEX IF NOT EXISTS idx_positions_date ON positions(report,report_date);
 """)
 return c

def sync_report(c,report,dataset,since):
 family=report.split("_")[0]
 pairs=COLUMNS[family]
 fields=FIELDS+sorted(set(col for pair in pairs.values() for col in pair))
 total=0;written=0;offset=0;last=None
 for page in range(80):
  qs=urllib.parse.urlencode({
   "$select":",".join(fields),
   "$where":f"report_date_as_yyyy_mm_dd >= '{since}T00:00:00'",
   "$order":"report_date_as_yyyy_mm_dd ASC,cftc_contract_market_code ASC",
   "$limit":10000,"$offset":offset})
  rows=get("https://publicreporting.cftc.gov/resource/"+dataset+".json?"+qs)
  for row in rows:
   code=row.get("cftc_contract_market_code")
   day=(row.get("report_date_as_yyyy_mm_dd") or "")[:10]
   try: oi=float(row.get("open_interest_all") or 0)
   except ValueError: continue
   if not code or not day or oi<=0:continue
   c.execute("""INSERT OR REPLACE INTO reports
    (report,code,report_date,market,sector,open_interest) VALUES(?,?,?,?,?,?)""",
    (report,code,day,row.get("market_and_exchange_names",""),row.get("commodity_group_name",""),oi))
   for cat,(long_field,short_field) in pairs.items():
    raw_long=row.get(long_field);raw_short=row.get(short_field)
    if raw_long in (None,"") or raw_short in (None,""):continue
    try: lng=float(raw_long);sht=float(raw_short)
    except ValueError:continue
    c.execute("""INSERT OR REPLACE INTO positions
     (report,code,report_date,category,long_qty,short_qty) VALUES(?,?,?,?,?,?)""",
     (report,code,day,cat,lng,sht))
    written+=1
   if last is None or day>last:last=day
  total+=len(rows);offset+=len(rows)
  print(report,"page",page+1,"raw_rows",total,"positions",written,flush=True)
  c.commit()
  if len(rows)<10000:break
 else:raise RuntimeError("Page safety limit exceeded in "+report)
 if not total or not written:raise RuntimeError("Empty or incompatible CFTC report: "+report)
 latest=c.execute("SELECT max(report_date) FROM reports WHERE report=?",(report,)).fetchone()[0]
 if (dt.date.today()-dt.date.fromisoformat(latest)).days>30:
  raise RuntimeError("CFTC dataset stale: "+report+" "+str(latest))
 return {"report":report,"source_rows":total,"positions_processed":written,"latest_report":latest}

def archive(c):
 if c.execute("PRAGMA integrity_check").fetchone()[0]!="ok":raise RuntimeError("SQLite integrity check failed")
 c.commit()
 c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
 c.execute("VACUUM")
 c.close()
 target=ARCHIVE.with_name(ARCHIVE.name+".tmp")
 with DB.open("rb") as src,target.open("wb") as dest:
  with gzip.GzipFile(filename="",mode="wb",fileobj=dest,mtime=0,compresslevel=9) as gz:
   shutil.copyfileobj(src,gz)
 if target.stat().st_size>=95*1024*1024: raise RuntimeError("Archive >=95MiB: split datasets before git commit")
 os.replace(target,ARCHIVE)
 with gzip.open(ARCHIVE,"rb") as src:
  header=src.read(16)
 if header!=b"SQLite format 3\x00":raise RuntimeError("Snapshot verification failed")

def main():
 restore()
 c=db_connect()
 existing=c.execute("SELECT count(*) FROM reports").fetchone()[0]
 days=int(os.getenv("COT_BACKFILL_DAYS","735")) if existing<10 else 90
 since=(dt.date.today()-dt.timedelta(days=days)).isoformat()
 summary=[]
 try:
  for report,dataset in DATASETS.items(): summary.append(sync_report(c,report,dataset,since))
  count=c.execute("SELECT count(*) FROM positions").fetchone()[0]
  if count<500:raise RuntimeError("Too few stored positions")
  archive(c)
 except Exception:
  c.close()
  raise
 manifest={"source":"CFTC Public Reporting","generated_at":dt.datetime.now(dt.timezone.utc).isoformat(),
           "since":since,"position_rows":count,"datasets":summary,
           "point_in_time_verified":False}
 (DATA/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf-8")
 print(json.dumps(manifest,indent=2))
if __name__=="__main__":main()

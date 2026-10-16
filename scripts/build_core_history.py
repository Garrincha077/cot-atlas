#!/usr/bin/env python3
"""Build a SOURCE-TRACEABLE multi-decade CFTC archive for 34 flagship contract codes.
Public Socrata API; source is the current historical dataset, not a PIT vintage.

Incremental refresh: re-query >=90 days each week; on first run backfill to 2006.
SQLite gzip output deliberately separate from broad all-markets two-year archive.
No simulated positions, and no Yahoo price bars are stored or redistributed.
"""
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
DB=DATA/"core-history.sqlite3"
ARCHIVE=DATA/"core-history.sqlite3.gz"
MANIFEST=DATA/"core-history-manifest.json"

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
  "nonreportable":["nonrept_positions_long_all","nonrept_positions_short_all"]}
}
FIELDS=["report_date_as_yyyy_mm_dd","cftc_contract_market_code",
        "market_and_exchange_names","commodity_group_name","open_interest_all"]
BASE="https://publicreporting.cftc.gov/resource/"

def get_json(url):
 for i in range(6):
  try:
   req=urllib.request.Request(url,headers={"User-Agent":"COT-Atlas-Research/0.6","Accept":"application/json"})
   with urllib.request.urlopen(req,timeout=100) as r: data=json.load(r)
   if not isinstance(data,list):raise RuntimeError("CFTC returned unexpected JSON")
   return data
  except (urllib.error.HTTPError,urllib.error.URLError,TimeoutError,ValueError) as e:
   if i==5:raise RuntimeError("CFTC API unavailable: "+str(e)[:160]) from e
   time.sleep(min(45,2**(i+1))+random.random())
 raise RuntimeError("Unreachable")

def load_codes():
 src=(ROOT/"core-markets.js").read_text(encoding="utf-8")
 prefix="window.COT_MAJOR_MARKETS="
 if prefix not in src:raise RuntimeError("Core market catalog missing")
 arr=json.loads(src.split(prefix,1)[1].split(";",1)[0])
 codes=[x["code"] for x in arr]
 if len(codes)<20 or len(set(codes))!=len(codes):raise RuntimeError("Invalid code catalog")
 if not all(c.isalnum() or (c.endswith("+") and c[:-1].isalnum()) for c in codes):
  raise RuntimeError("Unsafe contract identifier")
 return codes

def restore():
 DATA.mkdir(parents=True,exist_ok=True)
 if ARCHIVE.exists():
  with gzip.open(ARCHIVE,"rb") as f, DB.open("wb") as g:shutil.copyfileobj(f,g)

def setup():
 c=sqlite3.connect(DB,timeout=90)
 c.execute("PRAGMA journal_mode=WAL")
 c.executescript("""
 CREATE TABLE IF NOT EXISTS observations(
  report TEXT NOT NULL,code TEXT NOT NULL,report_date TEXT NOT NULL,
  market TEXT,sector TEXT,open_interest REAL NOT NULL,
  PRIMARY KEY(report,code,report_date));
 CREATE TABLE IF NOT EXISTS positions(
  report TEXT NOT NULL,code TEXT NOT NULL,report_date TEXT NOT NULL,
  category TEXT NOT NULL,long_qty REAL NOT NULL,short_qty REAL NOT NULL,
  PRIMARY KEY(report,code,report_date,category));
 CREATE INDEX IF NOT EXISTS idx_core_read ON positions(report,category,code,report_date);
 """)
 return c

def sync(c,report,source_id,codes,since):
 family=report.split("_")[0]
 pairs=COLUMNS[family]
 fields=FIELDS+list(dict.fromkeys(f for a in pairs.values() for f in a))
 quoted=",".join("'"+x+"'" for x in codes)
 # Batch codes in one predicate; no request per contract.
 where=f"cftc_contract_market_code in ({quoted}) AND report_date_as_yyyy_mm_dd >= '{since}T00:00:00'"
 fetched=0;positions_written=0;offset=0;latest=None;first=None
 for page in range(300):
  args=urllib.parse.urlencode({"$select":",".join(fields),"$where":where,
   "$order":"report_date_as_yyyy_mm_dd ASC,cftc_contract_market_code ASC","$limit":8000,"$offset":offset})
  rows=get_json(BASE+source_id+".json?"+args)
  if not rows and page==0 and since<"2025-01-01":
   # Supplemental or family-specific subsets may be absent for all target contracts;
   # do not fabricate observations. Record explicitly in the manifest.
   return {"report":report,"dataset":source_id,"rows":0,"positions":0,"first":None,"last":None}
  for x in rows:
   code=x.get("cftc_contract_market_code")
   date=str(x.get("report_date_as_yyyy_mm_dd") or "")[:10]
   if not code or code not in codes or len(date)!=10:continue
   try:oi=float(x.get("open_interest_all") or 0)
   except (ValueError,TypeError):continue
   if oi<=0:continue
   c.execute("""INSERT OR REPLACE INTO observations(report,code,report_date,market,sector,open_interest)
    VALUES(?,?,?,?,?,?)""",(report,code,date,x.get("market_and_exchange_names",""),x.get("commodity_group_name",""),oi))
   first=min(first,date) if first else date
   latest=max(latest,date) if latest else date
   for cat,(a,b) in pairs.items():
    try:
     raw_a=x.get(a);raw_b=x.get(b)
     if raw_a is None or raw_b is None:continue
     long_qty=float(raw_a);short_qty=float(raw_b)
    except (ValueError,TypeError):continue
    c.execute("""INSERT OR REPLACE INTO positions(report,code,report_date,category,long_qty,short_qty)
      VALUES(?,?,?,?,?,?)""",(report,code,date,cat,long_qty,short_qty))
    positions_written+=1
  fetched+=len(rows);offset+=len(rows)
  c.commit()
  print(report,"page",page+1,"fetched",fetched,"positions",positions_written,flush=True)
  if len(rows)<8000:break
 else:raise RuntimeError("CFTC page safety cap exceeded for "+report)
 if fetched and not positions_written:raise RuntimeError("No compatible position categories for "+report)
 return {"report":report,"dataset":source_id,"rows":fetched,"positions":positions_written,"first":first,"last":latest}

def snapshot(c):
 if c.execute("PRAGMA integrity_check").fetchone()[0]!="ok":raise RuntimeError("Invalid SQLite database")
 c.commit();c.execute("PRAGMA wal_checkpoint(TRUNCATE)");c.execute("VACUUM");c.close()
 dest=ARCHIVE.with_suffix(".gz.tmp")
 with DB.open("rb") as a,dest.open("wb") as fd:
  with gzip.GzipFile(fileobj=fd,mode="wb",filename="",mtime=0,compresslevel=9) as z:shutil.copyfileobj(a,z)
 if dest.stat().st_size>92*1024*1024:raise RuntimeError("Archive exceeds GitHub file size cap; partition before commit")
 with gzip.open(dest,"rb") as f:
  if f.read(16)!=b"SQLite format 3\x00":raise RuntimeError("Corrupt compressed snapshot")
 os.replace(dest,ARCHIVE)
 return hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()

def main():
 codes=load_codes();restore();c=setup()
 current_count=c.execute("SELECT count(*) FROM observations").fetchone()[0]
 # Backfill earliest supported date for Disagg/TFF/CIT (2006), without inventing earlier records.
 since=os.getenv("COT_CORE_START_DATE") or ("2006-01-01" if current_count<10 else (dt.date.today()-dt.timedelta(days=90)).isoformat())
 results=[]
 try:
  for report,source_id in DATASETS.items():
   results.append(sync(c,report,source_id,codes,since))
  n=c.execute("SELECT count(*) FROM positions").fetchone()[0]
  minimum=10000 if current_count<10 else 10000
  if n<minimum:raise RuntimeError(f"Missing CFTC history, only {n} records")
  coverage=c.execute("SELECT report,MIN(report_date),MAX(report_date),count(DISTINCT code),count(*) FROM observations GROUP BY report").fetchall()
  sha=snapshot(c)
 except Exception:
  c.close();raise
 manifest={"source":"CFTC Public Reporting Environment (current, potentially revised historical series)",
  "vintage_verified":False,"price_data_available":False,"generated_at_utc":dt.datetime.now(dt.timezone.utc).isoformat(),
  "requested_since":since,"core_contracts_requested":len(codes),"core_contract_codes":codes,
  "sqlite_sha256_gzip":sha,"compressed_bytes":ARCHIVE.stat().st_size,
  "total_position_rows":n,"total_observation_rows":sum(x[-1] for x in coverage),
  "coverage":[{"report":x[0],"first":x[1],"last":x[2],"contracts":x[3],"observations":x[4]} for x in coverage],
  "queries":results}
 MANIFEST.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
 print(json.dumps({"records":n,"compressed_bytes":ARCHIVE.stat().st_size,"coverage":manifest["coverage"]},indent=2))

if __name__=="__main__":main()

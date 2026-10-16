// COT Atlas v0.6 — validated multi-decade CFTC archive (current historical revisions, not release vintages).
import {DatabaseSync} from "node:sqlite";
import {gunzipSync} from "node:zlib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {IDS,COLUMNS} from "./cot.js";
const BASE="https://raw.githubusercontent.com/Garrincha077/cot-atlas/main/data/";
let state=null,pending=null,nextCheck=0;
async function archive(){
 const now=Date.now();
 if(state&&now<nextCheck)return state;
 if(pending)return pending;
 pending=(async()=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
   const rsp=await fetch(BASE+"core-history-manifest.json?ts="+Math.floor(now/600000),{signal:controller.signal});
   if(!rsp.ok)throw Error("Manifest HTTP "+rsp.status);
   const manifest=await rsp.json();
   if(manifest.vintage_verified!==false||manifest.total_position_rows<10000||!Array.isArray(manifest.coverage)||manifest.coverage.length!==7)throw Error("Archive manifest invalid or incomplete");
   if(state&&state.manifest.sqlite_sha256_gzip===manifest.sqlite_sha256_gzip){nextCheck=Date.now()+30*60*1000;return state}
   const res=await fetch(BASE+"core-history.sqlite3.gz?rev="+encodeURIComponent(manifest.sqlite_sha256_gzip),{signal:controller.signal});
   if(!res.ok)throw Error("Archive HTTP "+res.status);
   const compressed=Buffer.from(await res.arrayBuffer());
   if(compressed.length>95*1024*1024)throw Error("Archive too large");
   const sqlite=gunzipSync(compressed,{maxOutputLength:300*1024*1024});
   if(sqlite.subarray(0,16).toString()!=="SQLite format 3\u0000")throw Error("SQLite header invalid");
   const tmp=path.join(os.tmpdir(),"cot-multidecade-"+process.pid+"-"+now+".sqlite3");
   fs.writeFileSync(tmp,sqlite,{mode:0o600});
   let db;
   try{
    db=new DatabaseSync(tmp,{readOnly:true});
    if(db.prepare("PRAGMA quick_check").get().quick_check!=="ok")throw Error("SQLite validation failed");
    const count=db.prepare("SELECT count(*) n FROM positions").get().n;
    if(count!==manifest.total_position_rows)throw Error("Manifest position count mismatch");
   }catch(e){db?.close();fs.unlinkSync(tmp);throw e}
   const previous=state;state={db,tmp,manifest};nextCheck=Date.now()+30*60*1000;
   if(previous){try{previous.db.close();fs.unlinkSync(previous.tmp)}catch(e){console.warn("Archive cleanup",e.message)}}
   return state;
  }finally{clearTimeout(timer)}
 })();
 try{return await pending}finally{pending=null}
}
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const report=String(req.query.report||"legacy_fut"),category=String(req.query.category||"noncommercial");
 const code=String(req.query.code||"088691"),years=Number(req.query.years||20);
 if(!IDS[report]||!COLUMNS[report.split("_")[0]]?.[category]||!/^[A-Za-z0-9+]{3,10}$/.test(code)||!Number.isInteger(years)||years<1||years>45)
  return res.status(400).json({error:"Invalid report/category/code or history horizon"});
 try{
  const {db,manifest}=await archive();
  if(!manifest.core_contract_codes.includes(code))return res.status(404).json({error:"Outside flagship history archive; try official live historical API",code});
  const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-years);
  const from=cutoff.toISOString().slice(0,10);
  const query="SELECT o.report_date,o.code,o.market,o.sector,o.open_interest,p.long_qty,p.short_qty "+
   "FROM positions p JOIN observations o ON o.report=p.report AND o.code=p.code AND o.report_date=p.report_date "+
   "WHERE p.report=? AND p.category=? AND p.code=? AND p.report_date>=? ORDER BY p.report_date ASC";
  const rows=db.prepare(query).all(report,category,code,from);
  if(!rows.length)return res.status(404).json({error:"No historical records for this particular combination"});
  const coverage=manifest.coverage.find(x=>x.report===report);
  res.setHeader("Cache-Control","public,s-maxage=3600,stale-while-revalidate=7200");
  return res.status(200).json({report,category,code,years,rows:rows.map(x=>[x.report_date,x.code,x.market,x.sector,x.open_interest,x.long_qty,x.short_qty]),
   source:"CFTC PRE historical series, versioned GitHub SQLite archive",sourceType:"official_historical_current_revision",
   dataset:IDS[report],from,coverage,archiveGeneratedAt:manifest.generated_at_utc,
   snapshotSHA256:manifest.sqlite_sha256_gzip,rawRows:rows.length,asPublishedVintageVerified:false,pricesIncluded:false});
 }catch(e){
  console.error("CFTC multidecade archive unavailable",e);
  return res.status(503).json({error:"Multi-decade CFTC cache not available: "+String(e.message).slice(0,160),backup:"/api/historical",pointInTimeVintageVerified:false});
 }
}

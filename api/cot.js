// COT Atlas v0.2: versioned GitHub SQLite archive is the primary source.
// Data vintage limitations: archives capture retrieval dates, not necessarily original CFTC releases.
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const BASE = "https://raw.githubusercontent.com/Garrincha077/cot-atlas/main/data/";
export const IDS={disagg_fut:"72hh-3qpy",disagg_comb:"kh3c-gbw2",tff_fut:"gpe5-46if",tff_comb:"yw9f-hn96",legacy_fut:"6dca-aqww",legacy_comb:"jun7-fc8e",supplemental:"4zgm-a668"};
export const COLUMNS={disagg:{managed_money:["m_money_positions_long_all","m_money_positions_short_all"],producer_merchant:["prod_merc_positions_long","prod_merc_positions_short"],swap_dealer:["swap_positions_long_all","swap__positions_short_all"],other_reportable:["other_rept_positions_long","other_rept_positions_short"],nonreportable:["nonrept_positions_long_all","nonrept_positions_short_all"]},tff:{leveraged_funds:["lev_money_positions_long","lev_money_positions_short"],asset_managers:["asset_mgr_positions_long","asset_mgr_positions_short"],dealers:["dealer_positions_long_all","dealer_positions_short_all"],other_reportable:["other_rept_positions_long","other_rept_positions_short"],nonreportable:["nonrept_positions_long_all","nonrept_positions_short_all"]},legacy:{noncommercial:["noncomm_positions_long_all","noncomm_positions_short_all"],commercial:["comm_positions_long_all","comm_positions_short_all"],nonreportable:["nonrept_positions_long_all","nonrept_positions_short_all"]},supplemental:{index_traders:["cit_positions_long_all","cit_positions_short_all"],commercial:["comm_positions_long_all_nocit","Comm_Positions_Short_All_NoCIT"],nonreportable:["nonrept_positions_long_all","nonrept_positions_short_all"]}};
let cache=null, inFlight=null, checkedAt=0;
async function get(url,timeout=18000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const r=await fetch(url,{signal:controller.signal,headers:{"Accept":"application/json,application/octet-stream","User-Agent":"COT-Atlas/0.2 (public CFTC archive)"}});
 if(!r.ok)throw Error("Data source HTTP "+r.status);return r}finally{clearTimeout(timer)}
}
async function openArchive(){
 const now=Date.now();if(cache&&now-checkedAt<20*60*1000)return cache;
 if(inFlight)return inFlight;
 inFlight=(async()=>{
   let manifest;
   try{manifest=await (await get(BASE+"manifest.json?checked="+Math.floor(now/900000))).json()}
   catch(e){if(cache)return cache;throw e}
   if(!manifest.datasets?.length||manifest.datasets.length!==7)throw Error("Archive manifest is incomplete");
   if(cache&&cache.manifest.generated_at===manifest.generated_at){checkedAt=Date.now();return cache}
   const raw=Buffer.from(await (await get(BASE+"cot.sqlite3.gz?version="+encodeURIComponent(manifest.generated_at),45000)).arrayBuffer());
   if(raw.length>35e6||raw.length<1000)throw Error("Compressed archive size out of bounds");
   const contents=gunzipSync(raw,{maxOutputLength:160e6});
   if(contents.subarray(0,16).toString()!=="SQLite format 3\u0000")throw Error("Archive has invalid SQLite header");
   const tmp=path.join(os.tmpdir(),"cot-atlas-"+Date.now()+"-"+Math.random().toString(36).slice(2)+".sqlite3");
   fs.writeFileSync(tmp,contents,{mode:0o600});
   let db;
   try{
    db=new DatabaseSync(tmp,{readOnly:true});
    if(db.prepare("PRAGMA quick_check").get().quick_check!=="ok")throw Error("Archive failed SQLite check");
    const n=db.prepare("SELECT count(*) AS n FROM positions").get().n;
    if(n<1000)throw Error("Archive has too few positions");
   }catch(e){db?.close();fs.unlinkSync(tmp);throw e}
   const previous=cache;
   cache={db,tmp,manifest};
   checkedAt=Date.now();
   if(previous){try{previous.db.close();fs.unlinkSync(previous.tmp)}catch(e){console.warn("Archive cleanup:",e.message)}}
   return cache;
 })();
 try{return await inFlight}catch(e){if(cache)return cache;throw e}finally{inFlight=null}
}
async function fromArchive(report,category,weeks){
 const {db,manifest}=await openArchive();
 const cutoff=new Date(Date.now()-(weeks+10)*7*86400000).toISOString().slice(0,10);
 const rows=db.prepare("SELECT r.report_date,r.code,r.market,r.sector,r.open_interest,p.long_qty,p.short_qty FROM positions AS p JOIN reports AS r ON r.report=p.report AND r.code=p.code AND r.report_date=p.report_date WHERE p.report=? AND p.category=? AND p.report_date>=? ORDER BY p.report_date ASC,p.code ASC").all(report,category,cutoff);
 const found=manifest.datasets.find(x=>x.report===report);
 return {source:"GitHub CFTC SQLite archive",sourceType:"archive",dataset:IDS[report],report,category,since:cutoff,rows:rows.map(x=>[x.report_date,x.code,x.market,x.sector,x.open_interest,x.long_qty,x.short_qty]),rawRows:rows.length,fetchedAt:manifest.generated_at,archiveGeneratedAt:manifest.generated_at,archiveAsOf:found?.latest_report??null,pointInTimeVintageVerified:false,complete:true}
}
async function fromLive(report,category,weeks){
 const family=report.split("_")[0], cols=COLUMNS[family][category],since=new Date(Date.now()-(weeks+10)*7*86400000).toISOString().slice(0,10);
 const fields=["report_date_as_yyyy_mm_dd","cftc_contract_market_code","market_and_exchange_names","commodity_group_name","open_interest_all",...cols],rows=[];let count=0;
 for(let page=0;page<12;page++){
  const q=new URLSearchParams({"$select":fields.join(","),"$where":"report_date_as_yyyy_mm_dd >= '"+since+"T00:00:00'","$order":"report_date_as_yyyy_mm_dd ASC","$limit":"12000","$offset":String(count)});
  const batch=await(await get("https://publicreporting.cftc.gov/resource/"+IDS[report]+".json?"+q,35000)).json();
  if(!Array.isArray(batch))throw Error("Invalid CFTC response");
  for(const x of batch){const oi=Number(x.open_interest_all),lng=Number(x[cols[0]]),sht=Number(x[cols[1]]);
   if(x.cftc_contract_market_code&&x.report_date_as_yyyy_mm_dd&&oi>0&&Number.isFinite(lng)&&Number.isFinite(sht))
    rows.push([x.report_date_as_yyyy_mm_dd.slice(0,10),x.cftc_contract_market_code,x.market_and_exchange_names||x.cftc_contract_market_code,x.commodity_group_name||"Other",oi,lng,sht])}
  count+=batch.length;if(batch.length<12000)return {source:"CFTC Public Reporting API",sourceType:"live",dataset:IDS[report],report,category,since,rows,rawRows:count,fetchedAt:new Date().toISOString(),archiveGeneratedAt:null,archiveAsOf:null,pointInTimeVintageVerified:false,complete:true}
 }
 throw Error("Dataset exceeds safe pagination limit");
}
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const report=String(req.query.report||"disagg_fut"),category=String(req.query.category||"managed_money"),weeks=Math.max(52,Math.min(180,Number(req.query.weeks)||104));
 const family=report.split("_")[0],source=String(req.query.source||"archive");
 if(!IDS[report]||!COLUMNS[family]?.[category]||!["archive","live"].includes(source)||!Number.isFinite(weeks))return res.status(400).json({error:"Invalid report, category or source"});
 try{
  const data=source==="live"?await fromLive(report,category,weeks):await fromArchive(report,category,weeks);
  res.setHeader("Cache-Control","public,s-maxage=1800,stale-while-revalidate=3600");
  return res.status(200).json(data);
 }catch(e){console.error("COT API",source,e);return res.status(502).json({error:String(e.message).slice(0,180),source})}
}

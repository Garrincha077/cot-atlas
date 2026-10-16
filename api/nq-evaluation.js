// COT Atlas v1.4 — private on-demand exact-expiry Nasdaq futures daily EVALUATION SAMPLE.
// Historical daily OHLCV is a third-party research sample: NOT licensed CME settlement or an audited execution feed.
// No downloaded prices stored in the public repo or on persistent server storage.
import {createHash} from "node:crypto";
import {parquetReadObjects} from "hyparquet";
const SOURCE="https://huggingface.co/datasets/lynx1231/historical-equity-index-futures-data-sample/resolve/main/data/daily/part-00000.parquet";
const DATASET="lynx1231/historical-equity-index-futures-data-sample";
const EXPECTED_SHA256="9d663cf2425e5f11c19a4d5292c75e6bfec96880e28d7446897f165d6f1bffb6";
const LIMIT_BYTES=250000, LIMIT_ROWS=9000;
const CONTRACTS=[
 {tag:"NQH26",expiry:"2026-03-20"},
 {tag:"NQM26",expiry:"2026-06-18"},
 {tag:"NQU26",expiry:"2026-09-18"},
 {tag:"NQZ26",expiry:"2026-12-18"}
];
const SPEC={multiplier:20,tick_size:0.25};
const tags=new Map(CONTRACTS.map(x=>[x.tag,x]));
const validDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const tickOk=v=>Number.isFinite(v)&&Math.abs(v*4-Math.round(v*4))<0.000001;
export function normalizeNQDaily(input,{earliest="2020-01-01",minVolume=10}={}){
 if(!Array.isArray(input)||input.length>LIMIT_ROWS||!validDate(earliest)||![1,10,100].includes(minVolume))throw Error("Invalid sample input or settings");
 const grouped=new Map(CONTRACTS.map(x=>[x.tag,[]])),stats=new Map(CONTRACTS.map(x=>[x.tag,{invalid:0,noVolume:0,outsideDate:0,nonTradableTick:0,duplicate:0}]));
 const seen=new Set(),badContract={count:0};
 for(const x of input){
  const tag=String(x.contract_code||""),meta=tags.get(tag);
  if(!meta){continue}
  const tally=stats.get(tag);
  const ms=Number(x.timestamp);
  if(!Number.isInteger(ms)||ms<0){tally.invalid++;continue}
  const date=new Date(ms).toISOString().slice(0,10);
  if(date<earliest||date>meta.expiry){tally.outsideDate++;continue}
  const key=tag+"|"+date;
  if(seen.has(key)){tally.duplicate++;continue}seen.add(key);
  const volume=Number(x.volume),open=Number(x.open),high=Number(x.high),low=Number(x.low),close=Number(x.close);
  if(!Number.isFinite(volume)||volume<minVolume){tally.noVolume++;continue}
  if(![open,high,low,close].every(Number.isFinite)||Math.min(open,high,low,close)<=0||low>high||close<low||close>high||open<low||open>high){tally.invalid++;continue}
  // Final cash-settlement values can be off the 0.25 futures price grid: not a tradeable close.
  if(![open,high,low,close].every(tickOk)){tally.nonTradableTick++;continue}
  grouped.get(tag).push({date,root:"NQ",contract:tag,expiry:meta.expiry,price:close,
   multiplier:SPEC.multiplier,tick_size:SPEC.tick_size,volume});
 }
 const contracts=CONTRACTS.map(({tag,expiry})=>{
  const bars=grouped.get(tag).sort((a,b)=>a.date.localeCompare(b.date));
  const n=stats.get(tag);
  return {contract:tag,symbol:tag,expiry,available:bars.length>0,
   rows:bars.length,first:bars[0]?.date||null,last:bars.at(-1)?.date||null,
   earliest:bars[0]?.date||null,latest:bars.at(-1)?.date||null,excluded:n};
 });
 const rows=[...grouped.values()].flat().sort((a,b)=>a.date.localeCompare(b.date)||a.expiry.localeCompare(b.expiry));
 return {rows,contracts};
}
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const root=String(req.query.root||"NQ").toUpperCase();
 const years=Number(req.query.years??10),minVolume=Number(req.query.minVolume??10);
 if(root!=="NQ")return res.status(400).json({error:"Historical evaluation sample supports individual NQH26/NQM26/NQU26/NQZ26 only"});
 if(![2,5,10].includes(years)||![1,10,100].includes(minVolume))return res.status(400).json({error:"years 2/5/10 and minVolume 1/10/100 required"});
 const now=new Date(),cutoff=new Date(now);cutoff.setUTCFullYear(cutoff.getUTCFullYear()-years);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const response=await fetch(SOURCE,{signal:controller.signal,headers:{"User-Agent":"COT-Atlas-Private-Evaluation/1.4",Accept:"application/octet-stream"}});
  if(!response.ok)throw Error("Hugging Face sample HTTP "+response.status);
  const advertised=Number(response.headers.get("content-length")||0);
  if(advertised>LIMIT_BYTES)throw Error("Source sample too large");
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>LIMIT_BYTES||bytes.length<3000)throw Error("Unexpected Parquet sample size");
  const sha=createHash("sha256").update(bytes).digest("hex");
  if(sha!==EXPECTED_SHA256)throw Error("Sample SHA-256 has changed; data quarantined until reviewed");
  const data=await parquetReadObjects({file:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  const normalized=normalizeNQDaily(data,{earliest:cutoff.toISOString().slice(0,10),minVolume});
  if(normalized.rows.length<15)throw Error("Too few genuine traded days in NQ sample");
  res.setHeader("Cache-Control","private,no-store,max-age=0");
  return res.status(200).json({root:"NQ",label:"Hugging Face free evaluation sample: individual NQ 2026 expiries",
   exchange:"CME Globex",years,minVolume,rows:normalized.rows,contracts:normalized.contracts,
   priceBasis:"HF_COMMUNITY_EXPLICIT_NQ_CONTRACT_DAILY_CLOSE_EVALUATION__NOT_CME_SETTLEMENT",
   publisher:DATASET,sourceSHA256:sha,sourceRows:data.length,sourceFile:"data/daily/part-00000.parquet",
   sourceReleased:"2026-09-18",expirySource:"IBKR independently checked NQH26/NQM26/NQU26/NQZ26 last-trading dates (2026-10-16)",
   sourceProviderAuthenticated:false,exchangeSettlementVerified:false,licenseScope:"Free evaluation sample for research prototyping; further usage governed by source terms",
   limitations:[
     "Individual-contract daily records from a third-party evaluation sample, not an audited CME trade/settlement feed.",
     "Some terminal cash-settlement prices are off the tradable 0.25-point futures grid and are excluded, never rounded or filled.",
     "Source ends in July 2026; future data cannot be inferred and no missing expiry periods are interpolated.",
     "Volume-gated early forward-expiry quotes may still be stale, illiquid or ineligible for execution.",
     "No verified COT as-published vintages or guaranteed fills; results remain exploratory."
   ]});
 }catch(e){return res.status(503).json({error:"NQ evaluation source unavailable or quarantined: "+String(e.message||e).slice(0,170)})}
 finally{clearTimeout(timer)}
}

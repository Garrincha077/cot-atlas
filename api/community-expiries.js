// Private research adapter for EXPLICIT contract-labelled community ES minute bars.
// Publisher labels these as IBKR; authenticity and exchange settlement are NOT independently audited.
// Fetch on user request only. Neither raw bars nor aggregates are committed to the public repo.
import {createHash} from "node:crypto";

const BASE="https://raw.githubusercontent.com/kfccolonel1/BARS/main/raw/ES/1min/ib/";
const SOURCES=[
 {contract:"ESH26",tag:"ESH6",expiry:"2026-03-20",file:"ES_1min_2025-12-23_2026-03-17_ibkr-ESH6.csv"},
 {contract:"ESM26",tag:"ESM6",expiry:"2026-06-18",file:"ES_1min_2026-03-08_2026-06-16_ibkr-ESM6.csv"},
 {contract:"ESU26",tag:"ESU6",expiry:"2026-09-18",file:"ES_1min_2026-06-07_2026-09-15_ibkr-ESU6.csv"},
 {contract:"ESZ26",tag:"ESZ6",expiry:"2026-12-18",file:"ES_1min_2026-09-01_2026-10-02_ibkr-ESZ6.csv"}
];
const MAX_BYTES=9500000, MAX_ROWS=130000;
const shiftDay=x=>new Date(Date.parse(x+"T00:00:00Z")+86400000).toISOString().slice(0,10);
function parseMinuteCSV(text,source,{minVolume=10,earliest="2024-01-01"}={}){
 const lines=text.trimEnd().split(/\r?\n/);
 if(lines.length>MAX_ROWS||lines[0]?.trim()!=="contract,datetime,open,high,low,close,volume")
  throw Error("Upstream ES minute CSV has unexpected schema or row count");
 const sessions=new Map();
 let invalid=0,wrongContract=0,ignoredOutsideExpiry=0,duplicateMinute=0;
 const prior=new Set();
 for(let i=1;i<lines.length;i++){
  const cols=lines[i].split(",");
  if(cols.length!==7){invalid++;continue}
  const tag=cols[0],timestamp=cols[1],closeStr=cols[5],volumeStr=cols[6];
  if(tag!==source.tag){wrongContract++;continue}
  const match=/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):\d{2}[+-]\d{4}$/.exec(timestamp);
  const close=Number(closeStr),vol=Number(volumeStr);
  if(!match||!Number.isFinite(close)||close<=0||!Number.isFinite(vol)||vol<0){invalid++;continue}
  const unique=timestamp;if(prior.has(unique)){duplicateMinute++;continue}prior.add(unique);
  const hour=Number(match[2]),minute=Number(match[3]);
  const day=hour>=18?shiftDay(match[1]):match[1];
  if(day>source.expiry||day<earliest){ignoredOutsideExpiry++;continue}
  if(hour===17)continue; // daily maintenance break, not trading session
  let session=sessions.get(day);
  if(!session){session={date:day,minutes:0,volume:0,close:null,lastCloseTime:"",lastPrice:null};sessions.set(day,session)}
  session.minutes++;session.volume+=vol;
  // Use the last observed 16:55–16:59 ET minute, not a pre-close/mid-session quote.
  if(hour===16&&minute>=55){session.close=close;session.lastCloseTime=timestamp;session.lastPrice=close}
 }
 const ordered=[...sessions.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const completed=ordered.filter(x=>x.minutes>=300&&x.volume>=minVolume&&x.close!==null);
 const all=completed.map(x=>({date:x.date,root:"ES",contract:source.contract,expiry:source.expiry,
  price:x.close,multiplier:50,tick_size:0.25,volume:x.volume}));
 return {data:all,metadata:{contract:source.contract,symbol:source.tag+" (community IBKR-labelled)",expiry:source.expiry,
  rows:all.length,minuteRows:lines.length-1,distinctSessions:ordered.length,
  partialOrIlliquidSessions:ordered.length-completed.length,wrongContract,invalid,duplicateMinute,ignoredOutsideExpiry,
  first:all[0]?.date||null,last:all.at(-1)?.date||null,available:all.length>0}};
}
async function retrieve(source,opts){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
 try{
  const response=await fetch(BASE+source.file,{signal:controller.signal,headers:{Accept:"text/csv","User-Agent":"COTAtlas-Private-Research/1.3"}});
  if(!response.ok)throw Error("source HTTP "+response.status);
  const size=Number(response.headers.get("content-length")||0);
  if(size>MAX_BYTES)throw Error("source file exceeds safety cap");
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>MAX_BYTES)throw Error("source file too large");
  const parsed=parseMinuteCSV(bytes.toString("utf8"),source,opts);
  parsed.metadata.sourceFileSha256=createHash("sha256").update(bytes).digest("hex");
  parsed.metadata.sourceFile=source.file;parsed.metadata.available=true;
  return parsed;
 }catch(e){return {data:[],metadata:{contract:source.contract,expiry:source.expiry,
   sourceFile:source.file,available:false,reason:String(e.message||e).slice(0,170)}}}
 finally{clearTimeout(timer)}
}
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const root=String(req.query.root||"ES").toUpperCase(),years=Number(req.query.years??10),minVolume=Number(req.query.minVolume??10);
 if(root!=="ES")return res.status(400).json({error:"Community exact-expiry source currently covers ES only; NQ files lack validated contract labels."});
 if(![2,5,10].includes(years)||![1,10,100].includes(minVolume))return res.status(400).json({error:"years 2/5/10, minVolume 1/10/100 required"});
 const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-years);
 const earliest=cutoff.toISOString().slice(0,10);
 const fetched=await Promise.all(SOURCES.map(s=>retrieve(s,{minVolume,earliest})));
 const data=fetched.flatMap(x=>x.data).sort((a,b)=>a.date.localeCompare(b.date)||a.expiry.localeCompare(b.expiry));
 const contracts=fetched.map(x=>({...x.metadata,earliest:x.metadata.first||null,latest:x.metadata.last||null}));
 if(data.length<10)return res.status(503).json({error:"Verified-by-label community ES source currently unavailable or too sparse",contracts});
 res.setHeader("Cache-Control","private,no-store,max-age=0");
 return res.status(200).json({root:"ES",label:"Community-labelled IBKR E-mini S&P 500 per-expiry minute bars",exchange:"CME",
  years,minVolume,rows:data,contracts,
  priceBasis:"COMMUNITY_IBKR_LABELLED_1MIN_DAILY_LAST_CLOSE_PROXY_NOT_EXCHANGE_SETTLEMENT",
  originalProviderAuthenticated:false,publisher:"kfccolonel1/BARS",originalBarTagVerified:true,
  expirySource:"IBKR independently checked for ESH26, ESM26, ESU26, ESZ26 (2026-10-16)",
  redistributionRightsVerified:false,licensedExchangeSettlements:false,
  aggregationRule:"CME session date via New York local 18:00 rollover; last minute close 16:55-16:59 ET; ≥300 source minute bars/session; sum source minute volume; no interpolation; require explicit ESH6/ESM6/ESU6/ESZ6 label",
  limitations:["Source is a community upload labelled IBKR, independently unconfirmed original exchange/bar provenance.",
  "Daily values are last-minute close proxies, not official exchange daily settlements.",
  "Available per-expiry archive is partial (from December 2025), not a ten-year future expiry dataset.",
  "No COT vintage verification and no confirmation of executable fills. Raw data not persisted on this service."]
 });
}

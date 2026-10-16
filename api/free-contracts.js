// COT Atlas free-data pilot: on-demand per-expiry Yahoo daily CLOSE, not official settlement.
// No bulk archive or public rehosting of price series. Explicit symbols + verified last-trading dates.
const CONTRACTS={
 GC:{label:"COMEX Gold",exchange:"COMEX",multiplier:100,tickSize:0.1,contracts:[
  {symbol:"GCZ25.CMX",contract:"GCZ25",expiry:"2025-12-29"},
  {symbol:"GCZ26.CMX",contract:"GCZ26",expiry:"2026-12-29"},
  {symbol:"GCG27.CMX",contract:"GCG27",expiry:"2027-02-24"}]},
 ES:{label:"CME E-mini S&P 500",exchange:"CME",multiplier:50,tickSize:0.25,contracts:[
  {symbol:"ESZ26.CME",contract:"ESZ26",expiry:"2026-12-18"},
  {symbol:"ESH27.CME",contract:"ESH27",expiry:"2027-03-19"}]},
 CL:{label:"NYMEX WTI Crude",exchange:"NYMEX",multiplier:1000,tickSize:0.01,contracts:[
  {symbol:"CLZ26.NYM",contract:"CLZ26",expiry:"2026-11-20"},
  {symbol:"CLF27.NYM",contract:"CLF27",expiry:"2026-12-21"}]}
};
async function fetchChart(symbol){
 const endpoint="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?range=2y&interval=1d";
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
 try{
  const res=await fetch(endpoint,{signal:controller.signal,headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 (COT Atlas private free-data research)"}});
  if(!res.ok)return {symbol,available:false,reason:"Data provider returned HTTP "+res.status};
  const json=await res.json(),item=json.chart?.result?.[0],close=item?.indicators?.quote?.[0]?.close,volume=item?.indicators?.quote?.[0]?.volume;
  if(!Array.isArray(close)||!Array.isArray(item?.timestamp))return {symbol,available:false,reason:"Provider returned no usable history"};
  const data=item.timestamp.map((x,i)=>({date:new Date(x*1000).toISOString().slice(0,10),close:Number(close[i]),volume:volume?.[i]==null?null:Number(volume[i])}))
   .filter(x=>Number.isFinite(x.close)&&Number.isFinite(x.volume)&&x.volume>0);
  return {symbol,available:true,shortName:item.meta?.shortName||null,data};
 }catch(e){return {symbol,available:false,reason:String(e.message).slice(0,90)}}
 finally{clearTimeout(timer)}
}
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const root=String(req.query.root||"").toUpperCase(),conf=CONTRACTS[root];
 if(!conf)return res.status(400).json({error:"Pilot supports GC, ES, CL only. Contracts/expiry details are explicitly verified."});
 try{
  const result=await Promise.all(conf.contracts.map(x=>fetchChart(x.symbol)));
  const report=[],all=[];
  for(let i=0;i<result.length;i++){
   const c=conf.contracts[i],r=result[i];
   if(!r.available){report.push({...c,available:false,reason:r.reason});continue}
   // Never credit a daily close later than the independently verified last trading day.
   const clipped=r.data.filter(x=>x.date<=c.expiry);
   for(const p of clipped)all.push({date:p.date,root,contract:c.contract,expiry:c.expiry,price:p.close,multiplier:conf.multiplier,tick_size:conf.tickSize,volume:p.volume});
   report.push({...c,available:true,earliest:clipped[0]?.date||null,latest:clipped.at(-1)?.date||null,rows:clipped.length,
     excludedAfterExpiry:r.data.length-clipped.length,pricing:"Yahoo daily close, not official settlement"});
  }
  if(all.length<20)return res.status(503).json({error:"Too few positive-volume, in-expiry bars for supported contracts",report});
  all.sort((a,b)=>a.date.localeCompare(b.date)||a.expiry.localeCompare(b.expiry));
  res.setHeader("Cache-Control","private,no-store,max-age=0");
  return res.status(200).json({
   root,label:conf.label,exchange:conf.exchange,rows:all,contracts:report,
   priceBasis:"YAHOO_DAILY_CLOSE_PROXY__NOT_EXCHANGE_SETTLEMENT",
   expirySource:"IBKR contract metadata, verified 2026-10-16; may require refresh",
   currentAsOf:new Date().toISOString(),
   redistributionRightsVerified:false,licensedExchangeSettlements:false,
   limitations:[
    "Open Yahoo chart quotes are not official daily exchange settlements and can be missing, stale or illiquid.",
    "All prices after independently verified last-trading dates have been excluded.",
    "Only positive-volume close bars have been included; missing days have not been interpolated.",
    "This pilot is a sparse contract chain (not every trading month); a missing eligible contract must stop the roll simulation.",
    "Use for exploratory personal research; do not treat as tradeable historical execution or reproduce a provider's data feed."
   ]
  });
 }catch(e){return res.status(502).json({error:"Free contract source unavailable: "+String(e.message).slice(0,150)})}
}

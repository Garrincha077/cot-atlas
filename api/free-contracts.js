// COT Atlas free-data pilot: on-demand per-expiry Yahoo daily CLOSE, not official settlement.
// No bulk archive or public rehosting of price series. Explicit symbols + verified last-trading dates.
const CONTRACTS={
 GC:{label:"COMEX Gold",exchange:"COMEX",multiplier:100,tickSize:0.1,contracts:[
  {symbol:"GCZ25.CMX",contract:"GCZ25",expiry:"2025-12-29"},
  {symbol:"GCZ26.CMX",contract:"GCZ26",expiry:"2026-12-29"},
  {symbol:"GCG27.CMX",contract:"GCG27",expiry:"2027-02-24"}]},
 ES:{label:"CME E-mini S&P 500",exchange:"CME",multiplier:50,tickSize:0.25,contracts:[
  {symbol:"ESZ26.CME",contract:"ESZ26",expiry:"2026-12-18"},
  {symbol:"ESH27.CME",contract:"ESH27",expiry:"2027-03-19"},
  {symbol:"ESM27.CME",contract:"ESM27",expiry:"2027-06-17"}]},
 CL:{label:"NYMEX WTI Crude",exchange:"NYMEX",multiplier:1000,tickSize:0.01,contracts:[
  {symbol:"CLZ26.NYM",contract:"CLZ26",expiry:"2026-11-20"},
  {symbol:"CLF27.NYM",contract:"CLF27",expiry:"2026-12-21"}]},
 SI:{label:"COMEX Silver",exchange:"COMEX",multiplier:5000,tickSize:0.005,contracts:[
  {symbol:"SIV26.CMX",contract:"SIV26",expiry:"2026-10-28"},
  {symbol:"SIZ26.CMX",contract:"SIZ26",expiry:"2026-12-29"},
  {symbol:"SIH27.CMX",contract:"SIH27",expiry:"2027-03-29"}]},
 NQ:{label:"CME E-mini Nasdaq 100",exchange:"CME",multiplier:20,tickSize:0.25,contracts:[
  {symbol:"NQZ26.CME",contract:"NQZ26",expiry:"2026-12-18"},
  {symbol:"NQH27.CME",contract:"NQH27",expiry:"2027-03-19"},
  {symbol:"NQM27.CME",contract:"NQM27",expiry:"2027-06-17"}]},
 NG:{label:"NYMEX Henry Hub Natural Gas",exchange:"NYMEX",multiplier:10000,tickSize:0.001,contracts:[
  {symbol:"NGZ26.NYM",contract:"NGZ26",expiry:"2026-11-25"},
  {symbol:"NGF27.NYM",contract:"NGF27",expiry:"2026-12-29"},
  {symbol:"NGG27.NYM",contract:"NGG27",expiry:"2027-01-27"}]},
 HG:{label:"COMEX Copper",exchange:"COMEX",multiplier:25000,tickSize:0.0005,contracts:[
  {symbol:"HGZ26.CMX",contract:"HGZ26",expiry:"2026-12-29"},
  {symbol:"HGF27.CMX",contract:"HGF27",expiry:"2027-01-27"},
  {symbol:"HGH27.CMX",contract:"HGH27",expiry:"2027-03-29"}]},
 ZC:{label:"CBOT Corn",exchange:"CBOT",multiplier:50,tickSize:0.25,contracts:[
  {symbol:"ZCZ26.CBT",contract:"ZCZ26",expiry:"2026-12-14"},
  {symbol:"ZCH27.CBT",contract:"ZCH27",expiry:"2027-03-12"},
  {symbol:"ZCK27.CBT",contract:"ZCK27",expiry:"2027-05-14"}]},
 ZS:{label:"CBOT Soybeans",exchange:"CBOT",multiplier:50,tickSize:0.25,contracts:[
  {symbol:"ZSX26.CBT",contract:"ZSX26",expiry:"2026-11-13"},
  {symbol:"ZSF27.CBT",contract:"ZSF27",expiry:"2027-01-14"},
  {symbol:"ZSH27.CBT",contract:"ZSH27",expiry:"2027-03-12"}]},
 ZW:{label:"CBOT Chicago SRW Wheat",exchange:"CBOT",multiplier:50,tickSize:0.25,contracts:[
  {symbol:"ZWZ26.CBT",contract:"ZWZ26",expiry:"2026-12-14"},
  {symbol:"ZWH27.CBT",contract:"ZWH27",expiry:"2027-03-12"},
  {symbol:"ZWK27.CBT",contract:"ZWK27",expiry:"2027-05-14"}]},
 ZN:{label:"CBOT 10-Year US Treasury Note",exchange:"CBOT",multiplier:1000,tickSize:0.015625,contracts:[
  {symbol:"ZNZ26.CBT",contract:"ZNZ26",expiry:"2026-12-21"},
  {symbol:"ZNH27.CBT",contract:"ZNH27",expiry:"2027-03-19"}]},
 ZB:{label:"CBOT US Treasury Bond",exchange:"CBOT",multiplier:1000,tickSize:0.03125,contracts:[
  {symbol:"ZBZ26.CBT",contract:"ZBZ26",expiry:"2026-12-21"},
  {symbol:"ZBH27.CBT",contract:"ZBH27",expiry:"2027-03-19"}]},
 PL:{label:"NYMEX Platinum",exchange:"NYMEX",multiplier:50,tickSize:0.1,contracts:[
  {symbol:"PLZ26.NYM",contract:"PLZ26",expiry:"2026-12-29"},
  {symbol:"PLF27.NYM",contract:"PLF27",expiry:"2027-01-27"},
  {symbol:"PLJ27.NYM",contract:"PLJ27",expiry:"2027-04-28"}]}
};
async function fetchChart(symbol,years,minVolume){
 const endpoint="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?range="+years+"y&interval=1d";
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
 try{
  const res=await fetch(endpoint,{signal:controller.signal,headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 (COT Atlas private free-data research)"}});
  if(!res.ok)return {symbol,available:false,reason:"Data provider returned HTTP "+res.status};
  const json=await res.json(),item=json.chart?.result?.[0],close=item?.indicators?.quote?.[0]?.close,volume=item?.indicators?.quote?.[0]?.volume;
  if(!Array.isArray(close)||!Array.isArray(item?.timestamp))return {symbol,available:false,reason:"Provider returned no usable history"};
  const data=item.timestamp.map((x,i)=>({date:new Date(x*1000).toISOString().slice(0,10),close:Number(close[i]),volume:volume?.[i]==null?null:Number(volume[i])}))
   .filter(x=>Number.isFinite(x.close)&&Number.isFinite(x.volume)&&x.volume>=minVolume);
  return {symbol,available:true,shortName:item.meta?.shortName||null,data};
 }catch(e){return {symbol,available:false,reason:String(e.message).slice(0,90)}}
 finally{clearTimeout(timer)}
}
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const root=String(req.query.root||"").toUpperCase(),conf=CONTRACTS[root];
 const years=Number(req.query.years??10),minVolume=Number(req.query.minVolume??10);
 if(![2,5,10].includes(years)||![1,10,100].includes(minVolume))return res.status(400).json({error:"years must be 2/5/10, minVolume must be 1/10/100"});
 if(root==="LIST")return res.status(200).json({source:"IBKR verified contract catalogs; Yahoo private close proxies on individual request",roots:Object.entries(CONTRACTS).map(([root,v])=>({root,label:v.label,contractCount:v.contracts.length}))});
 if(!conf)return res.status(400).json({error:"Unsupported market: choose one of "+Object.keys(CONTRACTS).join(", "),supported:Object.keys(CONTRACTS)});
 try{
  const result=await Promise.all(conf.contracts.map(x=>fetchChart(x.symbol,years,minVolume)));
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
   root,label:conf.label,exchange:conf.exchange,rows:all,contracts:report,years,minVolume,
   priceBasis:"YAHOO_DAILY_CLOSE_PROXY__NOT_EXCHANGE_SETTLEMENT",
   ageLiquidityWarning:"Far-dated contracts can have sporadic/stale closes. Increasing the quote horizon does not prove the early dates were liquid or executable.",
   expirySource:"IBKR contract metadata, checked 2026-10-16; validate against latest exchange calendar before any trading",
   currentAsOf:new Date().toISOString(),
   redistributionRightsVerified:false,licensedExchangeSettlements:false,
   limitations:[
    "Open Yahoo chart quotes are not official daily exchange settlements and can be missing, stale or illiquid.",
    "All prices after independently verified last-trading dates have been excluded.",
    "Only rows meeting user-specified minimum volume have been included; missing days have not been interpolated.",
    "Sparse contract chains: not every trading month is represented; the roll engine must stop if the next eligible contract is missing.",
    "Use for exploratory personal research; do not treat as tradeable historical execution or reproduce a provider's data feed."
   ]
  });
 }catch(e){return res.status(502).json({error:"Free contract source unavailable: "+String(e.message).slice(0,150)})}
}

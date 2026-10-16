// COT Atlas verified, explicitly mapped futures price proxies.
// Yahoo Finance continuous active-contract series are not official settlements, and roll adjustments are not guaranteed.
const SYMBOLS={
 "088691":{symbol:"GC=F",label:"Gold Futures (COMEX continuous)",contract:"Gold — COMEX"},
 "084691":{symbol:"SI=F",label:"Silver Futures (COMEX continuous)",contract:"Silver — COMEX"},
 "067651":{symbol:"CL=F",label:"WTI Crude Oil Futures (NYMEX continuous)",contract:"WTI Physical — NYMEX"},
 "023651":{symbol:"NG=F",label:"Natural Gas Futures (NYMEX continuous)",contract:"Nat Gas NYME — NYMEX"},
 "002602":{symbol:"ZC=F",label:"Corn Futures (CBOT continuous)",contract:"Corn — CBOT"},
 "005602":{symbol:"ZS=F",label:"Soybean Futures (CBOT continuous)",contract:"Soybeans — CBOT"},
 "001602":{symbol:"ZW=F",label:"Wheat Futures (CBOT continuous)",contract:"Wheat SRW — CBOT"},
 "13874A":{symbol:"ES=F",label:"E-mini S&P 500 Futures (CME continuous)",contract:"E-mini S&P 500 — CME"},
 "099741":{symbol:"6E=F",label:"Euro FX Futures (CME continuous)",contract:"Euro FX — CME"}
};
export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({error:"GET only"});
 const code=String(req.query.code||"");const item=SYMBOLS[code];
 if(!item)return res.status(404).json({error:"No verified automatic price mapping for this CFTC contract",code,supportedCodes:Object.keys(SYMBOLS)});
 try{
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(item.symbol)+"?range=2y&interval=1d";
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),13000);let response;
  try{response=await fetch(url,{signal:controller.signal,headers:{"User-Agent":"Mozilla/5.0 (COT Atlas research)","Accept":"application/json"}})}finally{clearTimeout(timer)}
  if(!response.ok)throw Error("Price provider HTTP "+response.status);
  const json=await response.json();
  const result=json.chart?.result?.[0],timestamps=result?.timestamp,quotes=result?.indicators?.quote?.[0]?.close;
  if(!Array.isArray(timestamps)||!Array.isArray(quotes)||timestamps.length!==quotes.length)throw Error("Price provider returned an invalid series");
  const rows=timestamps.map((ts,i)=>({date:new Date(ts*1000).toISOString().slice(0,10),close:Number(quotes[i])})).filter(x=>Number.isFinite(x.close)&&x.close>0);
  if(rows.length<20)throw Error("Price history insufficient");
  res.setHeader("Cache-Control","public,s-maxage=10800,stale-while-revalidate=21600");
  return res.status(200).json({provider:"Yahoo Finance",priceSeries:"front-month continuous futures (non-roll-adjusted)",symbol:item.symbol,label:item.label,cftcCode:code,currency:result.meta?.currency||null,exchange:result.meta?.exchangeName||null,rows,fetchedAt:new Date().toISOString(),pointInTimeAdjusted:false,tradeableSeries:false});
 }catch(e){console.error("Prices",code,e);return res.status(502).json({error:String(e.message).slice(0,150),provider:"Yahoo Finance",code})}
}

// COT Research Lab v0.4: deterministic, exploratory backtests, NOT verified PIT trades.
// Per-signal features are based only on historical rows dated <= signal observation.
// CFTC dataset may be revised, and continuous front-month futures price bars are unadjusted.
export const HORIZONS=[1,2,4,8,12];
export const STRATEGIES=[
 {id:"extreme_reversal",label:"Extreme Reversal",description:"Speculator COT index crosses back inside the 10/90 extreme after reaching it."},
 {id:"positioning_divergence",label:"Positioning Divergence",description:"The 104-week standardized difference between counterpart and primary net/OI crosses ±1.5."},
 {id:"position_acceleration",label:"Position Acceleration",description:"Four-week net/OI change z-score crosses ±1.5 relative to trailing 104 observations."},
 {id:"crowded_trade",label:"Crowded Trade",description:"Fade newly entered COT index extreme >95 or <5 (once per threshold crossing)."},
 {id:"cot_price_trend",label:"COT + Price Trend",description:"COT index agrees with the established 20/100-day moving-average direction; signal on first agreement."}
];
const D=(x)=>new Date(x+"T00:00:00Z");
const shift=(date,days)=>new Date(D(date).getTime()+days*86400000).toISOString().slice(0,10);
const valid=(x)=>x!==null && Number.isFinite(x);
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
const stdev=x=>{if(x.length<3)return 0;let m=mean(x);return Math.sqrt(x.reduce((s,v)=>s+(v-m)*(v-m),0)/(x.length-1))};
const sum=x=>x.reduce((a,b)=>a+b,0);
const zscore=(values,i,min=30,window=104)=>{
 if(i<min-1||!valid(values[i]))return null;
 const tail=values.slice(Math.max(0,i-window+1),i+1).filter(valid);
 if(tail.length<min)return null;
 const sd=stdev(tail);return sd>1e-8?(values[i]-mean(tail))/sd:0;
};
function cotIndex(vals,i,window){
 if(i<Math.min(window,52)-1||!valid(vals[i]))return null;
 const cut=vals.slice(Math.max(0,i-window+1),i+1).filter(valid);
 if(cut.length<Math.min(window,52))return null;
 const lo=Math.min(...cut),hi=Math.max(...cut);return hi===lo?50:100*(vals[i]-lo)/(hi-lo);
}
function normalizePositions(raw){
 return raw.map(x=>({date:String(x[0]),code:String(x[1]),oi:Number(x[4]),long:Number(x[5]),short:Number(x[6])}))
 .filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.oi>0&&Number.isFinite(x.long)&&Number.isFinite(x.short))
 .sort((a,b)=>a.date.localeCompare(b.date));
}
function normalizePrices(raw){const dates=new Map();for(const p of raw){
 const date=String(p.date),close=Number(p.close);
 if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&close>0&&Number.isFinite(close))dates.set(date,{date,close})
 }return [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date))}
function releaseProxy(tuesday){
 // Exceptional CFTC 2025 federal-shutdown backlog is excluded rather than claiming to know every vintage release timestamp.
 if(tuesday>="2025-09-30"&&tuesday<="2026-01-20")return null;
 return shift(tuesday,3); // Friday approximation, NOT a verified publication timestamp
}
function windows(vals,priceIndex,endDate,n){
 if(priceIndex<0)return null;
 let slice=vals.slice(Math.max(0,priceIndex-n+1),priceIndex+1);
 return slice.length===n?mean(slice.map(x=>x.close)):null;
}
function priceAtOrBefore(prices,date){
 let low=0,high=prices.length;
 while(low<high){let mid=(low+high)>>1;if(prices[mid].date<=date)low=mid+1;else high=mid}
 return low-1;
}
function priceAfter(prices,date){
 let low=0,high=prices.length;
 while(low<high){let mid=(low+high)>>1;if(prices[mid].date<=date)low=mid+1;else high=mid}
 return low;
}
function priceAtOrAfter(prices,date){
 let low=0,high=prices.length;
 while(low<high){let mid=(low+high)>>1;if(prices[mid].date<date)low=mid+1;else high=mid}
 return low;
}
export function buildSignals(primaryRaw,counterRaw,priceRaw,{window=156}={}){
 const positions=normalizePositions(primaryRaw),counters=normalizePositions(counterRaw),prices=normalizePrices(priceRaw);
 if(positions.length<160||prices.length<350)throw Error("Need at least 160 weekly COT observations and 350 daily prices.");
 const counterMap=new Map(counters.map(x=>[x.date,(x.long-x.short)/x.oi]));
 const net=positions.map(x=>(x.long-x.short)/x.oi);
 const counterpart=positions.map(x=>counterMap.get(x.date)??null);
 const index=net.map((_,i)=>cotIndex(net,i,window));
 const delta4=net.map((x,i)=>i>=4?x-net[i-4]:null);
 const spread=net.map((x,i)=>valid(counterpart[i])?counterpart[i]-x:null);
 const acceleration=net.map((_,i)=>zscore(delta4,i,40));
 const divergence=net.map((_,i)=>zscore(spread,i,40));
 const out=Object.fromEntries(STRATEGIES.map(x=>[x.id,[]]));
 const priorTrend={bull:false,bear:false};
 for(let i=1;i<positions.length;i++){
  const obs=positions[i],p=index[i],q=index[i-1],pub=releaseProxy(obs.date);
  if(pub===null||!valid(p)||!valid(q))continue;
  const append=(strategy,side)=>out[strategy].push({date:obs.date,availableAfter:pub,side,positionIndex:+p.toFixed(1)});
  if(q<=10&&p>=15)append("extreme_reversal",1);
  if(q>=90&&p<=85)append("extreme_reversal",-1);
  if(valid(divergence[i])&&valid(divergence[i-1])){
   if(divergence[i]>=1.5&&divergence[i-1]<1.5)append("positioning_divergence",1);
   if(divergence[i]<=-1.5&&divergence[i-1]>-1.5)append("positioning_divergence",-1);
  }
  if(valid(acceleration[i])&&valid(acceleration[i-1])){
   if(acceleration[i]>=1.5&&acceleration[i-1]<1.5)append("position_acceleration",1);
   if(acceleration[i]<=-1.5&&acceleration[i-1]>-1.5)append("position_acceleration",-1);
  }
  if(p>=95&&q<95)append("crowded_trade",-1);
  if(p<=5&&q>5)append("crowded_trade",1);
  // Conservative timing: publication may occur after a futures settlement; use prior session only.
  const last=priceAtOrBefore(prices,shift(pub,-1)),m20=windows(prices,last,pub,20),m100=windows(prices,last,pub,100);
  const bull=m20!==null&&m100!==null&&p>=65&&m20>m100;
  const bear=m20!==null&&m100!==null&&p<=35&&m20<m100;
  if(bull&&!priorTrend.bull)append("cot_price_trend",1);
  if(bear&&!priorTrend.bear)append("cot_price_trend",-1);
  priorTrend.bull=bull;priorTrend.bear=bear;
 }
 return {positions,prices,signals:out,firstObservation:positions[0]?.date,lastObservation:positions.at(-1)?.date,excludedDelayPeriod:"2025-09-30 through 2026-01-20",rollGapDays:prices.reduce((n,p,i)=>n+(i>0&&Math.abs(p.close/prices[i-1].close-1)>=.2?1:0),0)};
}
function prng(seed){let state=seed>>>0;return()=>((state=Math.imul(1664525,state)+1013904223|0)>>>0)/4294967296}
function bootstrapCI(values,seed){if(values.length<8)return null;const rand=prng(seed);let means=[];for(let k=0;k<400;k++){let x=0;for(let i=0;i<values.length;i++)x+=values[Math.floor(rand()*values.length)];means.push(x/values.length)}means.sort((a,b)=>a-b);return [means[10]*100,means[389]*100].map(x=>+x.toFixed(2))}
function wilson(w,n){if(!n)return null;let z=1.96,p=w/n,denom=1+z*z/n,center=(p+z*z/(2*n))/denom,half=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/denom;return [center-half,center+half].map(x=>+(x*100).toFixed(1))}
function toTrades(signals,prices,horizon,costBps){
 const trades=[];let lastExit="",missing=0;
 for(const s of signals){
  if(lastExit && s.availableAfter<=lastExit)continue;
  const first=priceAfter(prices,s.availableAfter),entry=prices[first];
  if(!entry||D(entry.date)-D(s.availableAfter)>8*86400000){missing++;continue}
  const exitTarget=shift(entry.date,horizon*7);
  const k=priceAtOrAfter(prices,exitTarget),exit=prices[k];
  if(!exit||D(exit.date)-D(exitTarget)>7*86400000){missing++;continue}
  const benchmark=exit.close/entry.close-1;
  const pnl=s.side*benchmark-costBps/1e4;
  // Naive short sale without margin accounting: avoid pathological returns below -100%.
  if(!Number.isFinite(pnl)||pnl<=-1){missing++;continue}
  trades.push({...s,entry:entry.date,exit:exit.date,entryPrice:entry.close,exitPrice:exit.close,benchmark,return:pnl});
  lastExit=exit.date;
 }
 return {trades,missing}
}
function stats(trades,seed){
 const n=trades.length;
 if(!n)return {trades:0,winRate:null,avgReturnPct:null,medianReturnPct:null,profitFactor:null,maxDrawdownPct:null,totalCompoundedPct:null,benchmarkAvgPct:null,winRateCI:null,meanReturnCI:null,finalEquity:1,equity:[]};
 const vals=trades.map(t=>t.return),wins=vals.filter(x=>x>0).length,sorted=[...vals].sort((a,b)=>a-b),benchmark=trades.map(t=>t.benchmark);
 let eq=1,peak=1,dd=0;const equity=[];
 for(const t of trades){eq*=1+t.return;peak=Math.max(peak,eq);dd=Math.min(dd,eq/peak-1);equity.push({date:t.exit,value:+((eq-1)*100).toFixed(2)})}
 const positives=sum(vals.filter(x=>x>0)),losses=-sum(vals.filter(x=>x<0));
 return {trades:n,winRate:+(wins/n*100).toFixed(1),avgReturnPct:+(mean(vals)*100).toFixed(2),
 medianReturnPct:+(sorted[Math.floor((n-1)/2)]*100).toFixed(2),profitFactor:losses>0?+(positives/losses).toFixed(2):null,
 maxDrawdownPct:+(dd*100).toFixed(2),totalCompoundedPct:+((eq-1)*100).toFixed(2),
 benchmarkAvgPct:+(mean(benchmark)*100).toFixed(2),
 winRateCI:wilson(wins,n),meanReturnCI:bootstrapCI(vals,seed),finalEquity:eq,equity}
}
export function research(primaryRaw,counterRaw,priceRaw,{window=156,costBps=20,horizons=HORIZONS}={}){
 if(![52,104,156].includes(window))throw Error("Invalid COT lookback window");
 if(!Number.isFinite(costBps)||costBps<0||costBps>500)throw Error("Trading cost out of range");
 const {positions,prices,signals,firstObservation,lastObservation,rollGapDays,excludedDelayPeriod}=buildSignals(primaryRaw,counterRaw,priceRaw,{window});
 const cutoff=positions[Math.floor(positions.length*.7)].date;
 const rows=[];
 for(let i=0;i<STRATEGIES.length;i++){const strategy=STRATEGIES[i];
  for(const h of horizons){
   if(!HORIZONS.includes(h))throw Error("Unsupported forward horizon");
   const all=toTrades(signals[strategy.id],prices,h,costBps);
   const train=all.trades.filter(t=>t.date<cutoff),holdout=all.trades.filter(t=>t.date>=cutoff);
   rows.push({strategy:strategy.id,label:strategy.label,horizonWeeks:h,signals:signals[strategy.id].length,missingTrades:all.missing,
    inSample:stats(train,(i+1)*100+h),outOfSample:stats(holdout,(i+1)*1000+h),combined:stats(all.trades,(i+1)*10000+h),
    sampleTrades:all.trades.slice(-12).map(t=>({signalDate:t.date,entry:t.entry,exit:t.exit,direction:t.side>0?"LONG":"SHORT",returnPct:+(t.return*100).toFixed(2)}))});
  }
 }
 const actionable=rows.filter(r=>r.outOfSample.trades>=8);
 const best=actionable.sort((a,b)=>b.outOfSample.avgReturnPct-a.outOfSample.avgReturnPct)[0];
 return {
  methodology:"EXPLORATORY_ONLY__NOT_POINT_IN_TIME_OR_ROLL_CORRECTED",
  sourceNotes:[
   "CFTC time series use current possibly-revised history, not reconstructed as-published vintages.",
   "COT Tuesday observations are NOT traded Tuesday. Signals assume Friday publication and next subsequent daily close entry. Delayed 2025 reports excluded.",
   "Yahoo futures data are unadjusted continuous/active-contract proxies, NOT a reproducible rolled futures position or audited settlement series.",
   "The selected holdout is the last 30% of report observations; fixed rules are not tuned within this application, yet selection across 25 configurations causes multiple-testing bias.",
   "Reported 95% intervals are naïve Wilson win-rate and IID bootstrap mean-return intervals. Dependence between trades, rolling futures and multiple testing can invalidate nominal coverage."
  ],
  splitDate:cutoff,firstObservation,lastObservation,priceStart:prices[0].date,priceEnd:prices.at(-1).date,
  observations:positions.length,priceObservations:prices.length,rollGapDays,excludedDelayPeriod,
  lookbackWeeks:window,costBps,strategies:STRATEGIES,rows,bestExploratoryOos:best?{strategy:best.strategy,horizonWeeks:best.horizonWeeks,trades:best.outOfSample.trades,avgReturnPct:best.outOfSample.avgReturnPct}:null
 };
}

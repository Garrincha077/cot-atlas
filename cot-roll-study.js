/* COT Atlas v0.9 — COT signals replayed on contract-specific quote series.
 * Research-only: CFTC historical series may be revised; assumed Friday release;
 * Yahoo per-expiry DAILY CLOSE (not settlement). Do not call PIT audited.
 * Zero synthetic trading dates, zero stitching across different contract prices.
 */
(function(root){"use strict";
const HORIZONS=[1,2,4,8,12];
const STRATEGIES=[
 {id:"extreme_reversal",label:"Extreme Reversal",rule:"COT Index returns through 15/85 after a 10/90 extreme."},
 {id:"positioning_divergence",label:"Positioning Divergence",rule:"Counterparty minus speculator net/OI z-score crosses ±1.5."},
 {id:"position_acceleration",label:"Position Acceleration",rule:"4-week change in net/OI has z-score crossing ±1.5."},
 {id:"crowded_trade",label:"Crowded Trade",rule:"First entrance into >95 or <5 COT-index extremes, contrarian."},
 {id:"cot_price_trend",label:"COT + Contract Trend",rule:"Speculator COT index agrees with 20/100-day average of ONE quoted expiry."}
];
const iso=/^\d{4}-\d\d-\d\d$/,Ms=86400000;
const validDate=s=>typeof s==="string"&&iso.test(s)&&Number.isFinite(Date.parse(s+"T00:00:00Z"));
const addDays=(s,n)=>new Date(Date.parse(s+"T00:00:00Z")+n*Ms).toISOString().slice(0,10);
const mean=v=>v.reduce((a,b)=>a+b,0)/v.length;
const std=v=>{if(v.length<3)return 0;const m=mean(v);return Math.sqrt(v.reduce((s,x)=>s+(x-m)**2,0)/(v.length-1))};
const round=(v,n=2)=>v===null||!Number.isFinite(v)?null:+v.toFixed(n);
function index(values,i,lookback){
 const w=values.slice(Math.max(0,i-lookback+1),i+1).filter(Number.isFinite);
 if(w.length<Math.min(52,lookback))return null;
 const min=Math.min(...w),max=Math.max(...w);return max===min?50:100*(values[i]-min)/(max-min);
}
function zscore(values,i,window=104){
 const w=values.slice(Math.max(0,i-window+1),i+1).filter(Number.isFinite);
 if(w.length<40||!Number.isFinite(values[i]))return null;
 const sd=std(w);return sd===0?0:(values[i]-mean(w))/sd;
}
function positions(raw){
 return raw.map(r=>({date:String(r[0]),code:String(r[1]),oi:Number(r[4]),lng:Number(r[5]),short:Number(r[6])}))
 .filter(x=>validDate(x.date)&&x.oi>0&&Number.isFinite(x.lng)&&Number.isFinite(x.short))
 .sort((a,b)=>a.date.localeCompare(b.date));
}
function businessNext(all,date){
 let lo=0,hi=all.length;
 while(lo<hi){let m=(lo+hi)>>>1;if(all[m]<=date)lo=m+1;else hi=m}
 return all[lo]||null;
}
function businessOnOrAfter(all,date){
 let lo=0,hi=all.length;
 while(lo<hi){let m=(lo+hi)>>>1;if(all[m]<date)lo=m+1;else hi=m}
 return all[lo]||null;
}
function gapDays(a,b){return Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/Ms)}
function presumedRelease(date){
 // Match official date-by-date CFTC schedules where available, reject unmapped exceptional dates.
 // Standard Tuesdays outside the official calendar use an explicitly labelled Friday proxy.
 return root.COT_RELEASE_DATES?.lookup(date)||null;
}
function applicablePriceTrend(data,release,indexValue,lead){
 if(indexValue===null)return null;
 // Use only prior day's final known bar, and only ONE contract throughout the SMA window.
 const date=addDays(release,-1);
 const dates=data.dates.filter(x=>x<=date);const ref=dates.at(-1);
 if(!ref||gapDays(ref,date)>5)return null;
 const bars=data.bars.filter(x=>x.date===ref&&gapDays(ref,x.expiry)>lead).sort((a,b)=>a.expiry.localeCompare(b.expiry));
 const front=bars[0];if(!front)return null;
 const history=data.bars.filter(x=>x.contract===front.contract&&x.date<=ref).sort((a,b)=>a.date.localeCompare(b.date));
 if(history.length<100||gapDays(history.at(-100).date,ref)>165)return null;
 const avg20=mean(history.slice(-20).map(x=>x.settle)),avg100=mean(history.slice(-100).map(x=>x.settle));
 return indexValue>=65&&avg20>avg100?1:indexValue<=35&&avg20<avg100?-1:0;
}
function generate(primaryRaw,oppositeRaw,data,{lookback=156,rollDays=5}={}){
 if(!Array.isArray(primaryRaw)||!Array.isArray(oppositeRaw)||!data?.dates)throw Error("Missing price and COT inputs");
 if(![52,104,156].includes(lookback))throw Error("Invalid COT index history window");
 const cot=positions(primaryRaw),counter=new Map(positions(oppositeRaw).map(x=>[x.date,(x.lng-x.short)/x.oi]));
 if(cot.length<52)throw Error("At least 52 COT observations required");
 const net=cot.map(x=>(x.lng-x.short)/x.oi),ci=net.map((_,i)=>index(net,i,lookback));
 const spreads=cot.map((x,i)=>counter.has(x.date)?counter.get(x.date)-net[i]:null);
 const differences=net.map((v,i)=>i<4?null:v-net[i-4]);
 const spreadZ=net.map((_,i)=>zscore(spreads,i)),deltaZ=net.map((_,i)=>zscore(differences,i));
 const signals=Object.fromEntries(STRATEGIES.map(s=>[s.id,[]]));
 let excluded=0,trendPreviously=0;const releaseSources={};
 for(let i=1;i<cot.length;i++){
  const row=cot[i],release=presumedRelease(row.date),c=ci[i],last=ci[i-1];
  if(!release){excluded++;trendPreviously=0;continue}
  const rel=release.releaseDate;
  releaseSources[release.source]=(releaseSources[release.source]||0)+1;
  if(c===null||last===null)continue;
  const push=(k,side)=>signals[k].push({date:row.date,availableAfter:rel,side,positionIndex:round(c,1),releaseSource:release.source});
  if(last<=10&&c>=15)push("extreme_reversal",1);
  if(last>=90&&c<=85)push("extreme_reversal",-1);
  if(spreadZ[i]!==null&&spreadZ[i-1]!==null){
   if(spreadZ[i]>=1.5&&spreadZ[i-1]<1.5)push("positioning_divergence",1);
   if(spreadZ[i]<=-1.5&&spreadZ[i-1]>-1.5)push("positioning_divergence",-1);
  }
  if(deltaZ[i]!==null&&deltaZ[i-1]!==null){
   if(deltaZ[i]>=1.5&&deltaZ[i-1]<1.5)push("position_acceleration",1);
   if(deltaZ[i]<=-1.5&&deltaZ[i-1]>-1.5)push("position_acceleration",-1);
  }
  if(last<95&&c>=95)push("crowded_trade",-1);
  if(last>5&&c<=5)push("crowded_trade",1);
  const trend=applicablePriceTrend(data,rel,c,rollDays);
  if(trend!==null&&trend!==0&&trend!==trendPreviously)push("cot_price_trend",trend);
  trendPreviously=trend??0;
 }
 return {cot,signals,excluded,releaseSources,firstCot:cot[0].date,lastCot:cot.at(-1).date};
}
function metrics(trades){
 if(!trades.length)return {trades:0,wins:null,winRate:null,avgNetUSD:null,medianNetUSD:null,totalNetUSD:null,avgLongBenchmarkUSD:null,maxDrawdownUSD:null,rolls:0};
 const n=trades.length,values=trades.map(t=>t.netUSD),sorted=[...values].sort((a,b)=>a-b);
 let capital=0,peak=0,maxDD=0;
 for(const trade of trades){capital+=trade.netUSD;peak=Math.max(peak,capital);maxDD=Math.min(maxDD,capital-peak)}
 const wins=trades.filter(x=>x.netUSD>0).length;
 return {trades:n,wins,winRate:round(100*wins/n,1),avgNetUSD:round(mean(values)),medianNetUSD:round(sorted[Math.floor((n-1)/2)]),
 totalNetUSD:round(capital),avgLongBenchmarkUSD:round(mean(trades.map(t=>t.benchmarkUSD))),
 maxDrawdownUSD:round(maxDD),rolls:trades.reduce((a,b)=>a+b.rolls,0)};
}
function study(primaryRaw,oppositeRaw,data,rollEngine,opts={}){
 if(!rollEngine?.simulate)throw Error("The contract roll simulator must be loaded");
 const options={lookback:156,rollDays:5,method:"fixed",commissionPerSide:2,slippageTicks:1,contracts:1,...opts};
 if(!["fixed","volume2"].includes(options.method)||!Number.isInteger(options.rollDays)||options.rollDays<1||options.rollDays>45)throw Error("Invalid roll settings");
 const {cot,signals,excluded,releaseSources,firstCot,lastCot}=generate(primaryRaw,oppositeRaw,data,options);
 const dates=data.dates;
 if(dates.length<3)throw Error("Insufficient contract-specific prices");
 const splitDate=dates[Math.floor(dates.length*.7)];
 const out=[];
 for(const strategy of STRATEGIES){
  for(const horizonWeeks of HORIZONS){
   const diagnostics={signals:signals[strategy.id].length,outsideCoverage:0,noEntry:0,noExit:0,missingContractBars:0,overlap:0,eligible:0};
   const trades=[];let lastExit="";
   for(const sig of signals[strategy.id]){
    if(sig.availableAfter<dates[0]||sig.availableAfter>=dates.at(-1)){diagnostics.outsideCoverage++;continue}
    const entry=businessNext(dates,sig.availableAfter);
    if(!entry||gapDays(sig.availableAfter,entry)>5){diagnostics.noEntry++;continue}
    if(lastExit&&entry<=lastExit){diagnostics.overlap++;continue}
    const goal=addDays(entry,7*horizonWeeks),exit=businessOnOrAfter(dates,goal);
    if(!exit||gapDays(goal,exit)>6){diagnostics.noExit++;continue}
    try{
     const params={start:entry,end:exit,side:sig.side>0?"long":"short",rollDays:options.rollDays,method:options.method,
       contracts:options.contracts,commissionPerSide:options.commissionPerSide,slippageTicks:options.slippageTicks};
     const trade=rollEngine.simulate(data,params);
     const control=rollEngine.simulate(data,{...params,side:"long"});
     trades.push({signalDate:sig.date,availableAfter:sig.availableAfter,entry,exit,side:params.side,
       netUSD:trade.result.netUSD,grossUSD:trade.result.grossUSD,costUSD:trade.result.costsUSD,
       benchmarkUSD:control.result.netUSD,rolls:trade.result.rolls,entryContract:trade.transactions[0]?.to,
       strategy:strategy.id});
     diagnostics.eligible++;lastExit=exit;
    }catch(e){diagnostics.missingContractBars++;continue}
   }
   // Purged chronological split: positions entered before the boundary but exited after it
   // cannot be included in either training or holdout profitability aggregates.
   const train=trades.filter(t=>t.exit<splitDate);
   const holdout=trades.filter(t=>t.entry>=splitDate);
   const excludedBoundary=trades.filter(t=>t.entry<splitDate&&t.exit>=splitDate);
   if(train.length+holdout.length+excludedBoundary.length!==trades.length)throw Error("Invalid chronological cohort assignment");
   diagnostics.crossSplitPurged=excludedBoundary.length;
   if(!root.COT_QUALITY?.assess)throw Error("Load COT evidence gate module first");
   const quality=root.COT_QUALITY.assess({train,holdout,boundaryExcluded:excludedBoundary,splitDate,priceDates:dates});
   out.push({strategy:strategy.id,label:strategy.label,horizonWeeks,diagnostics,quality,
     inSample:metrics(train),outOfSample:metrics(holdout),combined:metrics(trades),
     completedSignalDates:trades.map(x=>x.signalDate),
     completedHoldoutSignalDates:holdout.map(x=>x.signalDate),
     recent:trades.slice(-15)});
  }
 }
 return {mode:"PRIVATE_EXPLORATORY_COT_CONTRACT_ROLL_V0_9",
   positionSource:"CFTC official historical positioning (potentially revised)",
   priceSource:data.source||"User-supplied contract-level prices, unverified",
   priceBasis:data.proxyPriceBasis||"USER_IMPORT_UNVERIFIED",
   publicationTiming:"Official CFTC special 2025 and tentative 2026 dates used when mapped; other standard Tuesdays use Friday proxy. Entry strictly AFTER mapped publication date.",
   asPublishedCOTVintageVerified:false,exchangeSettlementVerified:false,executionPriceVerified:false,
   lookaheadLimits:"CFTC historical revisions and exact publication-time/vintage timestamps are not audited; do not treat as certified point-in-time.",
   moneyUnits:"Hypothetical USD P&L per specified number of futures contracts, NOT return on invested capital.",
   multipleTestingWarning:"25 predefined configurations carry multiplicity and selection risk; EXPLORATORY_ONLY does not mean PIT confirmed.",
   holdoutMethod:"PURGED_CHRONOLOGICAL_BY_ENTRY_EXIT: training exits strictly before split, holdout entries on/after split, boundary-spanning trades excluded from both subsets.",
   root:data.marketRoot,contractCount:data.contracts,quoteRows:data.bars.length,
   firstPrice:dates[0],lastPrice:dates.at(-1),firstCot,lastCot,excludedReleaseReports:excluded,releaseSources,splitDate,
   options,strategies:STRATEGIES,rows:out,
   // Distinct Tuesday COT observation dates; not statistically independent trades.
   distinctCompletedCotReportDates:[...new Set(out.flatMap(x=>x.completedSignalDates))].sort(),
   distinctHoldoutCotReportDates:[...new Set(out.flatMap(x=>x.completedHoldoutSignalDates))].sort(),
   distinctSignalCaution:"Distinct COT report dates can still produce overlapping positions, correlated strategies and multiple-tested horizons; this is NOT an independent-trade count."};
}
root.COT_ROLL_STUDY={study,generate,HORIZONS,STRATEGIES};
})(typeof window!=="undefined"?window:globalThis);

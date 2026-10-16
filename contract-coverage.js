/* Private COT Atlas v1.1 — strict quote/roll coverage audit, never a profitability statistic.
 * Works entirely on already user-requested quotes, and never persists price data.
 */
(function(root){"use strict";
const MS=86400000, date=s=>Date.parse(s+"T00:00:00Z"), shift=(s,n)=>new Date(date(s)+n*MS).toISOString().slice(0,10);
const dayDiff=(a,b)=>Math.round((date(b)-date(a))/MS);
const valid=s=>typeof s==="string"&&/^\d{4}-\d\d-\d\d$/.test(s)&&!Number.isNaN(date(s));
const median=x=>{if(!x.length)return null;const y=[...x].sort((a,b)=>a-b),i=Math.floor(y.length/2);return y.length%2?y[i]:(y[i-1]+y[i])/2};
function weekdayCount(a,b){
 let n=0;for(let x=date(a);x<=date(b);x+=MS){const w=new Date(x).getUTCDay();if(w>0&&w<6)n++}return n
}
function prices(raw,{rollEngine=null,rollDays=5,horizonWeeks=4,stepDays=7,maxTrials=240}={}){
 if(!raw||!Array.isArray(raw.rows)||!Array.isArray(raw.contracts))throw Error("Expected individual-contract quote records and a contract registry");
 if(!Number.isInteger(rollDays)||rollDays<1||rollDays>45||![1,2,4,8,12].includes(horizonWeeks)||stepDays<1||stepDays>30)throw Error("Invalid roll audit parameters");
 const items=new Map();
 for(const c of raw.contracts){
  if(!c.contract||!valid(c.expiry)||items.has(c.contract))throw Error("Invalid or duplicate listed contract");
  items.set(c.contract,{symbol:c.symbol||"",contract:c.contract,expiry:c.expiry,upstreamAvailable:c.available===true,rows:[],reportedRows:c.rows||0,excludedAfterExpiry:c.excludedAfterExpiry||0,reason:c.reason||""});
 }
 let invalid=0,duplicates=0,wrongExpiry=0,wrongContract=0;
 const observed=new Set();
 for(const r of raw.rows){
  const c=items.get(r.contract);
  if(!c){wrongContract++;continue}
  if(r.expiry!==c.expiry||r.date>r.expiry){wrongExpiry++;continue}
  if(!valid(r.date)||!Number.isFinite(Number(r.price))||!Number.isFinite(Number(r.volume))||Number(r.volume)<=0){invalid++;continue}
  const key=r.contract+"|"+r.date;if(observed.has(key)){duplicates++;continue}observed.add(key);
  c.rows.push({date:r.date,price:Number(r.price),volume:Number(r.volume)});
 }
 const perContract=[...items.values()].map(c=>{
  c.rows.sort((a,b)=>a.date.localeCompare(b.date));
  const first=c.rows[0]?.date||null,last=c.rows.at(-1)?.date||null;
  const gaps=[];
  for(let i=1;i<c.rows.length;i++){
   const d=dayDiff(c.rows[i-1].date,c.rows[i].date);
   if(d>4)gaps.push({from:c.rows[i-1].date,to:c.rows[i].date,days:d});
  }
  gaps.sort((a,b)=>b.days-a.days);
  const sessions=first?weekdayCount(first,last):0;
  return {symbol:c.symbol,contract:c.contract,expiry:c.expiry,upstreamAvailable:c.upstreamAvailable,reason:c.reason,
   count:c.rows.length,first,last,medianDailyVolume:median(c.rows.map(r=>r.volume)),
   weekdayCoveragePct:sessions?Math.round(c.rows.length/sessions*1000)/10:null,
   // Exchange holidays, market closures, and far-expiry inactivity are NOT distinguished.
   maxCalendarGapDays:gaps[0]?.days||0,largeGapCount:gaps.length,largestGaps:gaps.slice(0,5),
   ignoredAfterExpiry:c.excludedAfterExpiry,providerRows:c.reportedRows};
 });
 const dates=[...new Set([...items.values()].flatMap(c=>c.rows.map(x=>x.date)))].sort();
 let trial={tested:0,completed:0,missingExit:0,failedCoverage:0,failedOther:0,sampleTradeDates:[],errorSamples:[]};
 if(rollEngine?.simulate&&dates.length>=3){
  const first=dates[0],last=dates.at(-1),candidates=[];
  // Candidate entries sampled at least 7 calendar days apart; no synthetic dates.
  let lastSample=null;
  for(const x of dates){if(!lastSample||dayDiff(lastSample,x)>=stepDays){candidates.push(x);lastSample=x}}
  const subset=candidates.slice(-maxTrials);
  const csvRows=raw.rows.filter(r=>items.has(r.contract)&&r.date<=r.expiry&&valid(r.date)&&Number.isFinite(Number(r.price))&&Number.isFinite(Number(r.volume))&&Number(r.volume)>0);
  const parsed=rollEngine.parseCSV(["date,root,contract,expiry,settle,multiplier,tick_size,volume",
   ...csvRows.map(x=>[x.date,x.root,x.contract,x.expiry,x.price,x.multiplier,x.tick_size,x.volume].join(","))].join("\n"));
  for(const entry of subset){
   const due=shift(entry,horizonWeeks*7),exit=dates.find(d=>d>=due);
   if(!exit||dayDiff(due,exit)>6){trial.missingExit++;continue}
   trial.tested++;
   try{
    const report=rollEngine.simulate(parsed,{start:entry,end:exit,rollDays,method:"fixed",contracts:1,side:"long",commissionPerSide:0,slippageTicks:0});
    trial.completed++;if(trial.sampleTradeDates.length<8)trial.sampleTradeDates.push({entry,exit,rolls:report.result.rolls})
   }catch(e){
    const reason=String(e.message||e);
    if(/Missing settlement|Roll required|No eligible contract|far from an available|Market session gap/.test(reason))trial.failedCoverage++;
    else trial.failedOther++;
    if(trial.errorSamples.length<6&&!trial.errorSamples.includes(reason))trial.errorSamples.push(reason);
   }
  }
  trial={...trial,firstQuote:first,lastQuote:last};
 }
 const short=perContract.filter(x=>x.count===0).length;
 const totals={root:raw.root||"",contractsListed:perContract.length,withQuotes:perContract.length-short,
  noQuotes:short,contractDayBars:[...items.values()].reduce((s,x)=>s+x.rows.length,0),uniqueQuotedDates:dates.length,
  firstQuote:dates[0]||null,lastQuote:dates.at(-1)||null,invalid,duplicates,wrongExpiry,wrongContract,
  reportedMinVolume:raw.minVolume,reportedHistoryYears:raw.years,
  priceSource:raw.priceBasis||"UNKNOWN",exchangeSettlementVerified:false,
  quoteCompletenessVerified:false,
  caveat:"Weekday coverage excludes weekends ONLY, not holidays. Missing entire exchange trading days cannot be certified without official exchange calendars. Sampled roll-ready windows are NOT actual strategy signals, independent trades, or execution-quality proof."};
 return {totals,perContract,rollAudit:{horizonWeeks,rollDays,...trial}};
}
root.COT_COVERAGE={audit:prices};
})(typeof window!=="undefined"?window:globalThis);

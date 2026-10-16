/* COT Atlas v1.7 — ES 2023/24 historical contract acquisition and proof-of-coverage workbench.
 * Input futures price files remain in the BROWSER. No fabricated bars or roll adjustments.
 * Price format authenticity / licensed redistribution are NOT established by this parser.
 */
(function(root){"use strict";
const HEADER="date,root,contract,expiry,settle,multiplier,tick_size,volume";
const CODES=[["H",3],["M",6],["U",9],["Z",12]];
const MS=86400000;
function shift(s,n){return new Date(Date.parse(s+"T00:00:00Z")+n*MS).toISOString().slice(0,10)}
function thirdFriday(year,month){const d=new Date(Date.UTC(year,month-1,1)),fri=1+(5-d.getUTCDay()+7)%7;return new Date(Date.UTC(year,month-1,fri+14)).toISOString().slice(0,10)}
const CONTRACTS=[];
for(const year of [2023,2024,2025])for(const [code,month] of CODES){
 CONTRACTS.push({contract:"ES"+code+String(year).slice(-2),expiry:thirdFriday(year,month),year,required:year<2025});
}
const BY_CONTRACT=new Map(CONTRACTS.map(x=>[x.contract,x]));
function makeCSV(bars){return [HEADER,...bars.map(b=>[b.date,"ES",b.contract,b.expiry,b.settle,50,0.25,b.volume].join(","))].join("\n")}
function readFiles(files,rollEngine,localValidator,{minimumVolume=10,limitBytes=30*1024*1024}={}){
 if(!Array.isArray(files)||files.length===0||files.length>24)throw Error("Odaberi 1–24 CSV datoteke stvarnih ES dospijeća");
 if(![1,10,100].includes(minimumVolume))throw Error("Volumen mora biti 1, 10 ili 100");
 let totalBytes=0,rejected=0;const records=[],manifest=[],seen=new Set();
 for(const input of files){
  if(typeof input?.text!=="string"||!input.name)throw Error("Nevaljana lokalna datoteka");
  totalBytes+=input.text.length;if(totalBytes>limitBytes)throw Error("Prevelik skup CSV datoteka: 30 MB limit");
  const parsed=localValidator.validate(input.text,rollEngine,{selectedRoot:"ES",minimumVolume, maxBytes:limitBytes});
  const contracts=new Set();
  for(const b of parsed.bars){
   const c=BY_CONTRACT.get(b.contract);
   if(!c||c.expiry!==b.expiry)throw Error("Ugovor ili datum isteka nije potvrđen u ES 2023–2025 kalendaru: "+b.contract+" / "+b.expiry);
   const key=b.contract+"|"+b.date;
   if(seen.has(key))throw Error("Isti ugovor/datum pojavljuje se u više datoteka: "+key);
   seen.add(key);contracts.add(b.contract);records.push(b);
  }
  rejected+=parsed.localAudit.rejectedLowVolume;
  manifest.push({file:input.name,accepted:parsed.bars.length,rejectedLowVolume:parsed.localAudit.rejectedLowVolume,contracts:[...contracts].sort()});
 }
 if(records.length<3)throw Error("Premalo stvarnih cjenovnih zapisa za analizu");
 const data=localValidator.validate(makeCSV(records),rollEngine,{selectedRoot:"ES",minimumVolume});
 data.source="Browser-local ES 2023–25 labelled contract-close CSVs; original provenance UNVERIFIED";
 data.proxyPriceBasis="USER_SUPPLIED_CONTRACT_DAILY_CLOSE_NOT_CME_SETTLEMENT";
 return {data,manifest,files:files.length,rows:data.bars.length,rejectedLowVolume:rejected,sourceVerified:false,sourceLicensedForRedistribution:false};
}
function coverage(imported){
 const grouped=new Map();
 for(const b of imported?.bars||[]){if(!grouped.has(b.contract))grouped.set(b.contract,[]);grouped.get(b.contract).push(b.date)}
 return CONTRACTS.map((c,i)=>{
  const previous=i?CONTRACTS[i-1].expiry:"2022-12-16";
  const from=shift(previous,1),through=shift(c.expiry,-7);
  const all=[...new Set(grouped.get(c.contract)||[])].sort();
  const active=all.filter(d=>d>=from&&d<=through);
  let biggestGap=0;
  for(let k=1;k<active.length;k++)biggestGap=Math.max(biggestGap,Math.round((Date.parse(active[k])-Date.parse(active[k-1]))/MS));
  const first=active[0]||null,last=active.at(-1)||null;
  const firstDelay=first?Math.round((Date.parse(first)-Date.parse(from))/MS):null;
  const finalLag=last?Math.round((Date.parse(through)-Date.parse(last))/MS):null;
  const status=active.length===0?"NO_SOURCE":active.length<40||firstDelay>12||finalLag>13?"SPARSE_OR_TRUNCATED":biggestGap>8?"GAPS_REJECT":"REVIEW_CANDIDATE";
  return {...c,from,through,allRows:all.length,activeRows:active.length,first,last,biggestGap,status,
   sourceAuthenticityConfirmed:false,note:"40 active closes and gap<=8d are triage heuristics, not exchange session certification."};
 });
}
function merge(baseline,backfill,rollEngine,localValidator,{minimumVolume=10}={}){
 if(!baseline?.bars?.length||baseline.marketRoot!=="ES"||!backfill?.data?.bars?.length)throw Error("Both real baseline ES quotes and imported historical ES quotes required");
 const rows=[],keys=new Set();
 for(const b of [...baseline.bars,...backfill.data.bars]){
  const key=b.contract+"|"+b.date;
  if(keys.has(key))throw Error("Duplicate ES bar during source merge: "+key);
  keys.add(key);rows.push(b);
 }
 const merged=localValidator.validate(makeCSV(rows),rollEngine,{selectedRoot:"ES",minimumVolume});
 merged.source="2023–25 user-supplied contract closes + 2025–26 community ES-labelled close proxy. Neither feed exchange-certified.";
 merged.proxyPriceBasis="MIXED_ES_INDIVIDUAL_CONTRACT_CLOSE_PROXIES_NOT_CME_SETTLEMENT";
 return merged;
}
function summarizeStudy(result){
 if(!result?.rows||!result.distinctCompletedCotReportDates||!result.distinctHoldoutCotReportDates)throw Error("COT roll study with distinct actual report dates required");
 return {uniqueReportDates:result.distinctCompletedCotReportDates.length,
  uniqueHoldoutReportDates:result.distinctHoldoutCotReportDates.length,
  repeatedHypotheticalTradeOutcomes:result.rows.reduce((s,x)=>s+x.combined.trades,0),
  qualifyingExploratoryCells:result.rows.filter(x=>x.quality.comparisonEligible).length,
  splitDate:result.splitDate,priceStart:result.firstPrice,priceEnd:result.lastPrice,priceRows:result.quoteRows};
}
function compare(base,extended){
 const before=summarizeStudy(base),after=summarizeStudy(extended);
 if(before.splitDate!==after.splitDate||!base.holdoutFixedForComparison||!extended.holdoutFixedForComparison)
  throw Error("Source comparisons require the SAME deliberately frozen holdout boundary");
 const changes={};
 for(const key of ["uniqueReportDates","uniqueHoldoutReportDates","repeatedHypotheticalTradeOutcomes","qualifyingExploratoryCells","priceRows"])changes[key]=after[key]-before[key];
 return {before,after,changes,interpretation:"Counts measure NEW observable COT signal dates and price coverage only. Repeated trade outcomes, different source vintages and shared entry periods mean NO independent profitability proof."};
}
root.COT_ES_BACKFILL={HEADER,CONTRACTS,thirdFriday,readFiles,coverage,merge,summarizeStudy,compare};
})(typeof window!=="undefined"?window:globalThis);

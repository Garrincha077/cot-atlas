import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const root={window:{}};vm.runInNewContext(fs.readFileSync(new URL("../contract-roll-engine.js",import.meta.url),"utf8"),root);
vm.runInNewContext(fs.readFileSync(new URL("../cot-release-calendar.js",import.meta.url),"utf8"),root);
vm.runInNewContext(fs.readFileSync(new URL("../cot-quality-gates.js",import.meta.url),"utf8"),root);
vm.runInNewContext(fs.readFileSync(new URL("../cot-roll-study.js",import.meta.url),"utf8"),root);
const roll=root.window.COT_ROLL_ENGINE,lab=root.window.COT_ROLL_STUDY;
const shifted=(date,n)=>new Date(Date.parse(date+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
function inputs(){
 const p=[],q=[],lines=["date,root,contract,expiry,settle,multiplier,tick_size,volume"];
 for(let i=0;i<300;i++){
  const dt=shifted("2021-03-02",i*7),z=Math.sin(i/9)*.31+Math.sin(i/2)*.038;
  p.push([dt,"088691","GC","Metals",3000,1300+z*1300,1300-z*1300]);
  q.push([dt,"088691","GC","Metals",3000,1300-z*1600,1300+z*1600]);
 }
 for(let d="2025-07-01";d<="2026-11-27";d=shifted(d,1)){
  const weekday=new Date(d+"T00:00:00Z").getUTCDay();if(weekday===0||weekday===6)continue;
  const step=Math.round((Date.parse(d+"T00:00:00Z")-Date.parse("2025-07-01T00:00:00Z"))/86400000);
  if(d<="2026-06-30")lines.push([d,"GC","GCZ26","2026-06-30",100+step*.05,100,.1,100].join(","));
  lines.push([d,"GC","GCG27","2027-02-26",205+step*.05,100,.1,100].join(","));
 }
 return {p,q,data:roll.parseCSV(lines.join("\n"))};
}
const {p,q,data}=inputs();
test("entire integrated study generates 25 strategies×holding periods with provenance",()=>{
 const out=lab.study(p,q,data,roll,{lookback:104,rollDays:5});
 assert.equal(out.rows.length,25);
 assert.equal(out.distinctCompletedCotReportDates.length,new Set(out.rows.flatMap(x=>x.completedSignalDates)).size);
 assert.equal(out.distinctHoldoutCotReportDates.length,new Set(out.rows.flatMap(x=>x.completedHoldoutSignalDates)).size);
 assert.ok(out.distinctCompletedCotReportDates.length<=out.rows.reduce((s,x)=>s+x.combined.trades,0));
 assert.equal(out.mode,"PRIVATE_EXPLORATORY_COT_CONTRACT_ROLL_V0_9");
 assert.equal(out.asPublishedCOTVintageVerified,false);
 assert.equal(out.exchangeSettlementVerified,false);
 assert.equal(out.priceBasis,"USER_IMPORT_UNVERIFIED");
 assert.ok(out.rows.every(x=>x.diagnostics.signals>=x.diagnostics.eligible));
 assert.ok(out.rows.every(x=>x.inSample.trades+x.outOfSample.trades+x.quality.excludedCrossSplit===x.combined.trades));
 assert.ok(out.rows.every(x=>x.quality.vintagePITCertified===false));
});
test("signal entry always after assumed Friday, and delayed COT publication period removed",()=>{
 const out=lab.generate(p,q,data,{lookback:104,rollDays:5});
 for(const signals of Object.values(out.signals))for(const t of signals){
  assert.ok(t.availableAfter>t.date);
  const release=root.window.COT_RELEASE_DATES.lookup(t.date);
  assert.ok(release);
  assert.equal(t.availableAfter,release.releaseDate);
  assert.ok(["CFTC_OFFICIAL_SPECIAL_SCHEDULE","CFTC_OFFICIAL_TENTATIVE_2026","UNVERIFIED_FRIDAY_PROXY"].includes(t.releaseSource));
 }
});
test("fee costs reduce hypothetical net P&L, but not COT signal counts",()=>{
 const a=lab.study(p,q,data,roll,{lookback:104,commissionPerSide:0,slippageTicks:0});
 const b=lab.study(p,q,data,roll,{lookback:104,commissionPerSide:8,slippageTicks:2});
 for(let i=0;i<25;i++){
  assert.equal(a.rows[i].diagnostics.signals,b.rows[i].diagnostics.signals);
  assert.equal(a.rows[i].diagnostics.eligible,b.rows[i].diagnostics.eligible);
  if(a.rows[i].combined.trades>0)assert.ok(a.rows[i].combined.totalNetUSD>=b.rows[i].combined.totalNetUSD);
 }
});
test("same-expiry P&L does not include a 100-point spread on a roll",()=>{
 const result=roll.simulate(data,{start:"2026-06-18",end:"2026-07-17",method:"fixed",rollDays:5,commissionPerSide:0,slippageTicks:0});
 assert.equal(result.result.rolls,1);
 assert.ok(Math.abs(result.result.grossUSD)<1000,"Spurious 100-point cross-contract price gap detected");
});
test("absence of actual price observations yields zeros and diagnostics, never invented performance",()=>{
 const tooLate={...data,bars:data.bars.filter(x=>x.date>="2026-10-01"),dates:data.dates.filter(x=>x>="2026-10-01")};
 const out=lab.study(p,q,tooLate,roll,{lookback:104});
 assert.equal(out.rows.length,25);
 for(const x of out.rows)if(!x.combined.trades){assert.equal(x.combined.totalNetUSD,null);assert.equal(x.outOfSample.avgNetUSD,null)}
});
test("integrated browser UI script parses and requests both COT counterpart histories",()=>{
 const html=fs.readFileSync(new URL("../roll-research.html",import.meta.url),"utf8");
 const match=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match);assert.doesNotThrow(()=>new Function(match[1]));
 assert.match(html,/\/api\/core-history\?/);assert.match(html,/\/api\/free-contracts\?/);
 assert.match(html,/\/cot-roll-study.js/);
 assert.match(html,/\/cot-release-calendar.js/);assert.match(html,/\/contract-roll-engine.js/);
 assert.match(html,/Holdout/);
});

test("2025 shutdown backlogs use official later publication dates, never naive Fridays",()=>{
 const c=root.window.COT_RELEASE_DATES;
 assert.equal(c.lookup("2025-09-30").releaseDate,"2025-11-19");
 assert.equal(c.lookup("2025-11-10").releaseDate,"2025-12-10"); // Monday observation
 assert.equal(c.lookup("2025-12-23").releaseDate,"2025-12-29");
 assert.equal(c.lookup("2025-12-30").releaseDate,"2026-01-05");
 assert.equal(c.lookup("2026-06-16").releaseDate,"2026-06-22"); // US holiday
 assert.equal(c.lookup("2026-10-13").releaseDate,"2026-10-16");
 assert.equal(c.lookup("2024-10-15").source,"UNVERIFIED_FRIDAY_PROXY");
 assert.equal(c.lookup("2026-06-15"),null);
});

test("quality gate rejects tiny and time-clustered holdout without fabricating confidence",()=>{
 const gate=root.window.COT_QUALITY.assess;
 const train=[{entry:"2024-01-04",exit:"2024-01-12"}];
 const holdout=[{entry:"2025-10-01",exit:"2025-10-30"}];
 const x=gate({train,holdout,boundaryExcluded:[],splitDate:"2025-01-01",priceDates:["2024-01-01","2026-01-10"]});
 assert.equal(x.classification,"INSUFFICIENT");
 assert.ok(x.reasonCodes.includes("HOLDOUT_FEWER_THAN_8"));
 assert.ok(x.reasonCodes.includes("HOLDOUT_FEWER_THAN_4_DISTINCT_MONTHS"));
 assert.equal(x.vintagePITCertified,false);
});
test("quality gate enforces chronological purge and rewards only sufficiently spread hypothetical samples",()=>{
 const gate=root.window.COT_QUALITY.assess;
 const train=Array.from({length:9},(_,i)=>({entry:shifted("2023-01-04",i*35),exit:shifted("2023-01-04",i*35+14)}));
 const holdout=Array.from({length:10},(_,i)=>({entry:shifted("2025-03-01",i*24),exit:shifted("2025-03-01",i*24+7)}));
 const q=gate({train,holdout,boundaryExcluded:[{entry:"2025-02-22",exit:"2025-03-06"}],splitDate:"2025-03-01",priceDates:["2023-01-01","2026-05-01"]});
 assert.equal(q.classification,"EXPLORATORY_ONLY");
 assert.equal(q.excludedCrossSplit,1);
 assert.equal(q.comparisonEligible,true);
 assert.equal(q.exchangeSettlementCertified,false);
 assert.throws(()=>gate({train:[{entry:"2025-02-23",exit:"2025-03-02"}],holdout,splitDate:"2025-03-01"}),/Leakage/);
});

test("frozen holdout boundary remains fixed when earlier contract dates are added",()=>{
 const baseline=lab.study(p,q,data,roll,{lookback:104,rollDays:5,fixedSplitDate:"2026-07-01"});
 assert.equal(baseline.splitDate,"2026-07-01");
 assert.equal(baseline.holdoutFixedForComparison,true);
 assert.equal(baseline.rows.length,25);
 assert.ok(baseline.rows.every(x=>x.inSample.trades+x.outOfSample.trades+x.quality.excludedCrossSplit===x.combined.trades));
 const normal=lab.study(p,q,data,roll,{lookback:104,rollDays:5});
 assert.equal(normal.holdoutFixedForComparison,false);
 assert.throws(()=>lab.study(p,q,data,roll,{lookback:104,fixedSplitDate:"2025-07-03"}),/at least ten/);
 assert.throws(()=>lab.study(p,q,data,roll,{lookback:104,fixedSplitDate:"2027-02-01"}),/at least ten/);
});

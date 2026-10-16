import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync(new URL("../contract-roll-engine.js",import.meta.url),"utf8"),ctx);
vm.runInNewContext(fs.readFileSync(new URL("../private-expiry-import.js",import.meta.url),"utf8"),ctx);
const {validate,annual,futureContractIsExplicit}=ctx.window.COT_LOCAL_PRICES,engine=ctx.window.COT_ROLL_ENGINE;
const header="date,root,contract,expiry,settle,multiplier,tick_size,volume";
const rows=[
 "2024-09-12,NQ,NQU24,2024-09-20,19720.25,20,0.25,100",
 "2024-09-13,NQ,NQU24,2024-09-20,19725.25,20,0.25,101",
 "2024-09-16,NQ,NQU24,2024-09-20,19750.25,20,0.25,99",
 "2024-09-13,NQ,NQZ24,2024-12-20,19960.25,20,0.25,150",
 "2024-09-16,NQ,NQZ24,2024-12-20,19965.25,20,0.25,148",
 "2024-09-17,NQ,NQZ24,2024-12-20,20000.25,20,0.25,156"
];
test("only real month-labelled ES/NQ contracts with matching expiry metadata pass",()=>{
 assert.equal(futureContractIsExplicit("NQ","NQZ24","2024-12-20"),true);
 assert.equal(futureContractIsExplicit("ES","ESH24","2024-03-15"),true);
 assert.equal(futureContractIsExplicit("NQ","NQ=F","2024-12-20"),false);
 assert.equal(futureContractIsExplicit("ES","ESH24","2024-06-21"),false);
 assert.equal(futureContractIsExplicit("ES","ES_CONTINUOUS","2024-03-15"),false);
});
test("strict private import accepts user-provided labelled 2024 expiries and computes local data audit",()=>{
 const d=validate([header,...rows].join("\n"),engine,{selectedRoot:"NQ",minimumVolume:10});
 assert.equal(d.marketRoot,"NQ");assert.equal(d.bars.length,6);assert.equal(d.contracts,2);
 assert.equal(d.localAudit.inputRows,6);assert.equal(d.localAudit.acceptedRows,6);
 assert.equal(d.proxyPriceBasis,"PRIVATE_USER_SUPPLIED_EXPLICIT_EXPIRY_CLOSE_PROXY_NOT_CME_SETTLEMENT");
 const yearly=annual([["2022-10-04"],["2024-09-10"],["2024-09-17"]],d);
 const a=yearly.find(x=>x.year==="2024"),b=yearly.find(x=>x.year==="2022");
 assert.equal(a.cotReports,2);assert.equal(a.uniquePriceDates,4);assert.equal(a.contractDayQuotes,6);
 assert.equal(a.individualContracts,2);assert.equal(b.cotReports,1);
 assert.equal(b.quoteAvailability,"NO_PRICE_SOURCE");
});
test("wrong root, impossible expiry, continuous ticker, and invalid multiplier are rejected",()=>{
 const csv=[header,...rows].join("\n");
 assert.throws(()=>validate(csv,engine,{selectedRoot:"ES"}),/Root/);
 assert.throws(()=>validate(csv.replaceAll("NQU24","NQU25"),engine,{selectedRoot:"NQ"}),/dospijeće nije dokazano/);
 assert.throws(()=>validate(csv.replaceAll("NQZ24","NQ=F"),engine,{selectedRoot:"NQ"}),/Invalid contract|dospijeće nije dokazano/);
 assert.throws(()=>validate(csv.replaceAll(",20,0.25,",",50,0.25,"),engine,{selectedRoot:"NQ"}),/multiplier/);
});
test("non-grid NQ CLOSE is not rounded into hypothetical fill",()=>{
 const bad=rows.map((x,i)=>i===1?x.replace("19725.25","19725.13"):x);
 assert.throws(()=>validate([header,...bad].join("\n"),engine,{selectedRoot:"NQ"}),/izvan futures tick koraka/);
});
test("volume gate never invents prices or accepts price-only continuous feeds",()=>{
 const s=[header,...rows].join("\n");
 const d=validate(s,engine,{selectedRoot:"NQ",minimumVolume:100});
 assert.equal(d.localAudit.acceptedRows,5);
 assert.equal(d.localAudit.rejectedLowVolume,1);
 const missingVolume=s.replaceAll(/,(\d+)$|,(\d+)\n/gm, (_m)=>""); // verify explicitly with blank volume in one row below
 const arr=[header,...rows];arr[1]=arr[1].replace(/,\d+$/,",");
 assert.throws(()=>validate(arr.join("\n"),engine,{selectedRoot:"NQ"}),/volumen svakog/);
 assert.ok(missingVolume.length>0);
});
test("UI exposes local-only CSV without uploading data, and shows per-year price gaps",()=>{
 const html=fs.readFileSync(new URL("../roll-research.html",import.meta.url),"utf8");
 const m=html.match(/<script>([\s\S]*?)<\/script>/);assert.ok(m);
 assert.doesNotThrow(()=>new Function(m[1]));
 assert.match(html,/id="localCsvFile"/);
 assert.match(html,/value="local"/);
 assert.match(html,/window\.COT_LOCAL_PRICES\.validate/);
 assert.match(html,/window\.COT_LOCAL_PRICES\.annual/);
 assert.match(html,/provider==="local"\?file\.text\(\)/);
 assert.match(html,/id="yearRows"/);
 assert.match(html,/id="signalUniqueStats"/);
 assert.match(html,/distinctCompletedCotReportDates/);
 assert.ok(!html.includes('formData.append'));
});

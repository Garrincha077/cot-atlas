import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ctx={window:{}};
for(const file of ["contract-roll-engine.js","private-expiry-import.js","es-backfill.js"])
 vm.runInNewContext(fs.readFileSync(new URL("../"+file,import.meta.url),"utf8"),ctx);
const E=ctx.window.COT_ES_BACKFILL,R=ctx.window.COT_ROLL_ENGINE,V=ctx.window.COT_LOCAL_PRICES;
const day=(d,n)=>new Date(Date.parse(d+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
function source(c,start,n=48){
 const lines=[E.HEADER];let i=0;
 for(let d=start;i<n;d=day(d,1)){let w=new Date(d+"T00:00:00Z").getUTCDay();if(w===0||w===6)continue;
  lines.push([d,"ES",c.contract,c.expiry,4500+i*.25,50,.25,500+i].join(","));i++}
 return {name:c.contract+"-2024-real-labelled-fixture.csv",text:lines.join("\n")};
}
test("eight 2023-24 target contracts follow CME third-Friday expiries, plus four optional 2025 contracts",()=>{
 assert.equal(E.CONTRACTS.length,12);
 assert.equal(E.CONTRACTS.filter(c=>c.required).length,8);
 assert.deepEqual([...E.CONTRACTS.slice(0,8).map(x=>x.contract)],
  ["ESH23","ESM23","ESU23","ESZ23","ESH24","ESM24","ESU24","ESZ24"]);
 assert.deepEqual([...E.CONTRACTS.slice(0,8).map(x=>x.expiry)],
  ["2023-03-17","2023-06-16","2023-09-15","2023-12-15","2024-03-15","2024-06-21","2024-09-20","2024-12-20"]);
});
test("local multiple CSV files retain exact contract prices and distinct expiries",()=>{
 const z=E.CONTRACTS.find(x=>x.contract==="ESZ23"),h=E.CONTRACTS.find(x=>x.contract==="ESH24");
 const one=source(z,"2023-10-02"),two=source(h,"2024-01-02");
 const result=E.readFiles([one,two],R,V,{minimumVolume:10});
 assert.equal(result.rows,96);assert.equal(result.files,2);
 assert.equal(result.data.contracts,2);
 assert.equal(result.sourceVerified,false);
 assert.equal(result.sourceLicensedForRedistribution,false);
 assert.equal(E.coverage(result.data).filter(x=>x.activeRows>=40).length,2);
 assert.equal(E.coverage(result.data).find(x=>x.contract==="ESZ24").status,"NO_SOURCE");
});
test("cross-file duplicated contract-day data is rejected rather than double counted",()=>{
 const z=E.CONTRACTS.find(x=>x.contract==="ESZ23"),x=source(z,"2023-10-02");
 assert.throws(()=>E.readFiles([x,{...x,name:"duplicate.csv"}],R,V),/više datoteka/);
});
test("wrong expiry, continuous ticker, wrong multiplier and off-grid trades fail closed",()=>{
 const z=E.CONTRACTS.find(x=>x.contract==="ESZ23"),s=source(z,"2023-10-02");
 assert.throws(()=>E.readFiles([{...s,text:s.text.replaceAll("2023-12-15","2023-12-22")}],R,V),/kalendaru/);
 assert.throws(()=>E.readFiles([{...s,text:s.text.replaceAll("ESZ23","ES=F")}],R,V),/contract|dospijeće/i);
 assert.throws(()=>E.readFiles([{...s,text:s.text.replaceAll(",50,0.25,",",5,0.25,")}],R,V),/multiplier/i);
 assert.throws(()=>E.readFiles([{...s,text:s.text.replace("4500.25","4500.13")}],R,V),/tick koraka/i);
});
test("sample amount and volume never manufacture fully verified history",()=>{
 const z=E.CONTRACTS.find(x=>x.contract==="ESZ23"),s=source(z,"2023-10-02");
 const low=E.readFiles([s],R,V,{minimumVolume:100});
 const group=E.coverage(low.data).find(x=>x.contract==="ESZ23");
 assert.equal(group.sourceAuthenticityConfirmed,false);
 assert.ok(["SPARSE_OR_TRUNCATED","GAPS_REJECT","REVIEW_CANDIDATE"].includes(group.status));
 assert.throws(()=>E.readFiles([s],R,V,{minimumVolume:2}),/Volumen/);
 assert.throws(()=>E.readFiles([s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s],R,V),/1–24/);
});
test("combined 2023-24 local prices and later ES source preserve exact roots with no overlap",()=>{
 const old=source(E.CONTRACTS.find(x=>x.contract==="ESZ23"),"2023-10-02");
 const back=E.readFiles([old],R,V);
 const currentCSV=[E.HEADER];
 for(let i=0;i<40;i++){const d=day("2026-03-02",i);if([0,6].includes(new Date(d+"T00:00:00Z").getUTCDay()))continue;
  currentCSV.push([d,"ES","ESM26","2026-06-18",6500+i*.25,50,.25,100].join(","))}
 const baseline=V.validate(currentCSV.join("\n"),R,{selectedRoot:"ES"});
 const merged=E.merge(baseline,back,R,V);
 assert.ok(merged.bars.length>baseline.bars.length);
 assert.equal(merged.marketRoot,"ES");
 assert.ok(merged.bars.some(x=>x.contract==="ESZ23")&&merged.bars.some(x=>x.contract==="ESM26"));
 const dup=E.readFiles([source(E.CONTRACTS.find(x=>x.contract==="ESZ23"),"2023-10-02")],R,V);
 // Source revisions are not implicitly merged or accepted as another independent sample.
 assert.equal(dup.sourceVerified,false);
});
test("same deliberately frozen holdout is required to compare signal availability",()=>{
 const make=(n,h,split="2026-07-01",fixed=true)=>({
   splitDate:split,holdoutFixedForComparison:fixed,firstPrice:"2023-01-01",lastPrice:"2026-10-01",quoteRows:n*10,
   distinctCompletedCotReportDates:Array.from({length:n},(_,i)=>"2024-01-"+String(i+1).padStart(2,"0")),
   distinctHoldoutCotReportDates:Array.from({length:h},(_,i)=>"2026-07-"+String(i+1).padStart(2,"0")),
   rows:[{combined:{trades:n*2},quality:{comparisonEligible:false}}]});
 const c=E.compare(make(4,1),make(11,3));
 assert.equal(c.changes.uniqueReportDates,7);
 assert.equal(c.changes.uniqueHoldoutReportDates,2);
 assert.equal(c.changes.repeatedHypotheticalTradeOutcomes,14);
 assert.throws(()=>E.compare(make(4,1),make(11,3,"2026-08-01")),/SAME/);
 assert.throws(()=>E.compare(make(4,1),make(11,3,"2026-07-01",false)),/SAME/);
});
test("ES acquisition UI is usable static JS and does not upload local CSV content",()=>{
 const page=fs.readFileSync(new URL("../es-backfill.html",import.meta.url),"utf8");
 const scripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);assert.doesNotThrow(()=>new Function(scripts[0][1]));
 for(const s of ['/es-backfill.js','id="files"','multiple','id="contracts"','id="years"','id="metrics"','fixedSplitDate:"2026-07-01"'])
  assert.ok(page.includes(s),s);
 assert.match(page,/await f\.text\(\)/);
 assert.ok(!page.includes("formData.append"));
 assert.ok(!page.includes("fetch('/upload"));
});

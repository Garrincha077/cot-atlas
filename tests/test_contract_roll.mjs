import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const script=fs.readFileSync(new URL("../contract-roll-engine.js",import.meta.url),"utf8");
const context={window:{}};vm.runInNewContext(script,context);
const {parseCSV,simulate}=context.window.COT_ROLL_ENGINE;
const header="date,root,contract,expiry,settle,multiplier,tick_size,volume";
function csvFixture({priceGap=false,volumeShift=false,duplicate=false,mismatch=false}={}){
 const lines=[header];
 for(let day=1;day<=6;day++){
  const d="2026-01-0"+day;
  const aVol=volumeShift?(day>=3?20:90):90,bVol=volumeShift?(day>=3?100:10):10;
  if(!(priceGap&&day===4))lines.push([d,"GC","GCF26","2026-01-08",99+day,10,.25,aVol].join(","));
  lines.push([d,"GC","GCG26","2026-01-15",199+day,mismatch&&day===6?20:10,.25,bVol].join(","));
 }
 if(duplicate)lines.push(lines[1]);
 return lines.join("\n");
}
const options={start:"2026-01-01",end:"2026-01-06",side:"long",contracts:1,rollDays:5,method:"fixed",commissionPerSide:2,slippageTicks:1};
test("validated settlement CSV and deterministic header parsing",()=>{
 const d=parseCSV(csvFixture());
 assert.equal(d.bars.length,12);assert.equal(d.contracts,2);assert.equal(d.marketRoot,"GC");assert.equal(d.multiplier,10);assert.equal(d.tickSize,.25);
 assert.equal(d.firstDate,"2026-01-01");
});
test("roll does not book artificial 100-point spread between maturities",()=>{
 const d=parseCSV(csvFixture()),r=simulate(d,options);
 assert.equal(r.result.grossUSD,50);assert.equal(r.result.rolls,1);
 assert.equal(r.result.costsUSD,18);assert.equal(r.result.netUSD,32);
 assert.equal(r.transactions.length,3);
 assert.equal(r.transactions[1].event,"roll");
 assert.equal(r.transactions[1].date,"2026-01-03");
 assert.equal(r.transactions[1].oldSettle,102);
 assert.equal(r.transactions[1].newSettle,202);
 assert.equal(r.equity[3].dailyGrossUSD,10);
});
test("short side has opposite gross price P&L while paying same fees",()=>{
 const r=simulate(parseCSV(csvFixture()),{...options,side:"short"});
 assert.equal(r.result.grossUSD,-50);assert.equal(r.result.costsUSD,18);assert.equal(r.result.netUSD,-68);
});
test("volume crossover requires two observed prior days and not future volume",()=>{
 const d=parseCSV(csvFixture({volumeShift:true}));
 const r=simulate(d,{...options,rollDays:1,method:"volume2"});
 assert.equal(r.result.rolls,1);assert.equal(r.transactions[1].date,"2026-01-04");
});
test("missing held-contract settlement refuses fabrication and halt",()=>{
 const d=parseCSV(csvFixture({priceGap:true}));
 assert.throws(()=>simulate(d,{...options,rollDays:1}),/Missing settlement for HELD contract/);
});
test("malformed, conflicting and duplicate inputs are not accepted",()=>{
 assert.throws(()=>parseCSV(csvFixture({duplicate:true})),/Duplicate/);
 assert.throws(()=>parseCSV(csvFixture({mismatch:true})),/Mixed contract specifications/);
 assert.throws(()=>parseCSV(csvFixture().replace("GC,GCG26","CL,GCG26")),/Mixed underlying roots/);
 assert.throws(()=>parseCSV(header+"\n2026-02-31,GC,GCF26,2026-03-01,100,10,.25,10\n2026-02-28,GC,GCF26,2026-03-01,101,10,.25,10"),/Invalid trade date/);
});
test("cannot roll if next contract bar absent",()=>{
 const only=csvFixture().split("\n").filter((row,i)=>i===0||!row.includes(",GCG26,")).join("\n");
 assert.throws(()=>simulate(parseCSV(only),options),/Roll required/);
});
test("local-only UI cannot silently load simulated data",()=>{
 const html=fs.readFileSync(new URL("../roll-lab.html",import.meta.url),"utf8");
 const js=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(js);assert.doesNotThrow(()=>new Function(js[1]));
 assert.match(html,/id="csv"/);assert.match(html,/Uvoz radi lokalno/);
 assert.ok(!html.includes("window.addEventListener('load',()=>loadSample()"));
});

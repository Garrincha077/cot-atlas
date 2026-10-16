import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ctx={window:{}};
vm.runInNewContext(fs.readFileSync(new URL("../contract-roll-engine.js",import.meta.url),"utf8"),ctx);
vm.runInNewContext(fs.readFileSync(new URL("../contract-coverage.js",import.meta.url),"utf8"),ctx);
const {audit}=ctx.window.COT_COVERAGE,roll=ctx.window.COT_ROLL_ENGINE;
const next=(d,n)=>new Date(Date.parse(d+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
function fixture({missingBar=false}={}){
 const contracts=[
  {contract:"ESG26",symbol:"ESG26.CME",expiry:"2026-02-27",available:true,rows:0},
  {contract:"ESH26",symbol:"ESH26.CME",expiry:"2026-05-15",available:true,rows:0},
  {contract:"ESZ26",symbol:"ESZ26.CME",expiry:"2026-12-18",available:false,reason:"HTTP 404",rows:0}];
 const rows=[];for(let n=0;n<85;n++){
  const date=next("2026-01-05",n),wd=new Date(date+"T00:00:00Z").getUTCDay();
  if(wd===0||wd===6)continue;
  for(const c of contracts.slice(0,2)){
   if(date>c.expiry)continue;
   if(missingBar&&c.contract==="ESG26"&&date==="2026-01-20")continue;
   rows.push({date,root:"ES",contract:c.contract,expiry:c.expiry,price:c.contract==="ESG26"?5000+n:5100+n,multiplier:50,tick_size:0.25,volume:100});
  }
 }
 for(const c of contracts)c.rows=rows.filter(x=>x.contract===c.contract).length;
 return {root:"ES",priceBasis:"YAHOO_DAILY_CLOSE_PROXY__NOT_EXCHANGE_SETTLEMENT",minVolume:10,years:10,rows,contracts};
}
test("separates unique quote dates from contract-day observations",()=>{
 const q=audit(fixture(),{rollEngine:roll,horizonWeeks:4,rollDays:5});
 assert.equal(q.totals.contractsListed,3);
 assert.equal(q.totals.withQuotes,2);
 assert.equal(q.totals.noQuotes,1);
 assert.ok(q.totals.contractDayBars>q.totals.uniqueQuotedDates);
 assert.ok(q.rollAudit.completed>0);
 assert.equal(q.totals.exchangeSettlementVerified,false);
 assert.equal(q.totals.quoteCompletenessVerified,false);
});
test("no fictitious quotes generated for reported but absent expiries",()=>{
 const q=audit(fixture(),{horizonWeeks:4});
 const absent=q.perContract.find(x=>x.contract==="ESZ26");
 assert.equal(absent.count,0);
 assert.equal(absent.upstreamAvailable,false);
 assert.equal(absent.first,null);
 assert.equal(absent.last,null);
});
test("quote gap remains visible and never silently forward-filled in simulated holding",()=>{
 const full=audit(fixture(),{rollEngine:roll,horizonWeeks:4,rollDays:5});
 const missing=audit(fixture({missingBar:true}),{rollEngine:roll,horizonWeeks:4,rollDays:5});
 assert.ok(missing.rollAudit.completed<=full.rollAudit.completed);
 assert.ok(missing.rollAudit.failedCoverage>=full.rollAudit.failedCoverage);
 assert.ok(missing.totals.contractDayBars<full.totals.contractDayBars);
});
test("flags bad contract membership or expiry, never counts as coverage",()=>{
 const q=fixture();
 q.rows.push({...q.rows[0],contract:"UNKNOWN"});
 q.rows.push({...q.rows[0],date:"2027-04-01"});
 q.rows.push({...q.rows[0]});
 const v=audit(q);
 assert.equal(v.totals.wrongContract,1);
 assert.equal(v.totals.wrongExpiry,1);
 assert.equal(v.totals.duplicates,1);
});
test("rejects invalid audit configurations and duplicates in catalog",()=>{
 const q=fixture();
 assert.throws(()=>audit(q,{rollDays:0}),/Invalid roll audit/);
 assert.throws(()=>audit(q,{horizonWeeks:3}),/Invalid roll audit/);
 q.contracts.push({...q.contracts[0]});
 assert.throws(()=>audit(q),/duplicate listed contract/);
});
test("coverage UI displays all 13 markets, source gaps, on-demand only, and passes syntax",()=>{
 const html=fs.readFileSync(new URL("../coverage.html",import.meta.url),"utf8");
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new Function(scripts[0][1]));
 for(const key of ['id="two"','id="all"','id="detail"','id="export"','id="horizon"'])assert.ok(html.includes(key));
 for(const key of ["ES","NQ","GC","SI","HG","PL","CL","NG","ZN","ZB","ZC","ZS","ZW"])assert.ok(html.includes('value="'+key+'"'));
 assert.match(html,/\/api\/free-contracts\?/);
 assert.match(html,/\/contract-coverage.js/);
 assert.match(html,/\/contract-roll-engine.js/);
});

test("whole-market missing week cannot be treated as continuous tradable P&L",()=>{
 const raw=fixture();
 raw.rows=raw.rows.filter(x=>x.date<"2026-02-01"||x.date>"2026-02-20");
 const head="date,root,contract,expiry,settle,multiplier,tick_size,volume";
 const parsed=roll.parseCSV([head,...raw.rows.map(x=>[x.date,x.root,x.contract,x.expiry,x.price,x.multiplier,x.tick_size,x.volume].join(","))].join("\n"));
 assert.throws(()=>roll.simulate(parsed,{start:"2026-01-22",end:"2026-03-09",rollDays:5}),/Market session gap/);
 const audited=audit(raw,{rollEngine:roll,horizonWeeks:4,rollDays:5});
 assert.ok(audited.rollAudit.failedCoverage>0);
 assert.ok(audited.perContract.some(x=>x.maxCalendarGapDays>8));
});

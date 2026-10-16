import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {normalizeNQDaily} from "../api/nq-evaluation.js";
const ms=d=>Date.parse(d+"T00:00:00Z");
const bar=(contract_code,date,close=25000,volume=100)=>({contract_code,timestamp:BigInt(ms(date)),open:close,high:close+10,low:close-10,close,volume:BigInt(volume),exchange:"GBLX"});
test("explicit NQH/M/U/Z 2026 contract labels and independent IBKR expiry metadata",()=>{
 const src=fs.readFileSync(new URL("../api/nq-evaluation.js",import.meta.url),"utf8");
 for(const s of ["NQH26","NQM26","NQU26","NQZ26","2026-03-20","2026-06-18","2026-09-18","2026-12-18"])assert.ok(src.includes(s));
 assert.match(src,/EXPECTED_SHA256="9d663cf2425e5f11c19a4d5292c75e6bfec96880e28d7446897f165d6f1bffb6"/);
 assert.match(src,/Cache-Control","private,no-store/);
});
test("NQ sample normalization keeps only explicit, in-expiry, volume-gated tradable prices",()=>{
 const data=[
  bar("NQH26","2026-03-19"),bar("NQM26","2026-06-17"),
  bar("NQU26","2026-07-09"),bar("NQZ26","2026-07-09"),
  bar("NQZ26","2026-07-09"), // duplicate
  bar("NQM26","2026-06-19"), // beyond last trade
  bar("NQH26","2026-03-20",24291.78,100), // non tradable final cash settlement
  bar("NQH26","2025-06-20",25000,0), // no volume
  bar("NQK26","2026-05-10"), // unrecognized label must never be invented
 ];
 const d=normalizeNQDaily(data,{earliest:"2025-01-01",minVolume:10});
 assert.equal(d.rows.length,4);
 assert.deepEqual(d.rows.map(x=>x.contract),["NQH26","NQM26","NQU26","NQZ26"]);
 for(const row of d.rows){assert.equal(row.root,"NQ");assert.equal(row.multiplier,20);assert.equal(row.tick_size,0.25);assert.ok(row.date<=row.expiry)}
 assert.equal(d.contracts.find(x=>x.contract==="NQH26").excluded.nonTradableTick,1);
 assert.equal(d.contracts.find(x=>x.contract==="NQM26").excluded.outsideDate,1);
 assert.equal(d.contracts.find(x=>x.contract==="NQZ26").excluded.duplicate,1);
});
test("complete OHLC boundaries cannot be silently misinterpreted",()=>{
 const wrong=bar("NQU26","2026-07-08");wrong.low=wrong.high+1;
 const d=normalizeNQDaily([wrong,bar("NQU26","2026-07-07",25000.05,100)]);
 assert.equal(d.rows.length,0);
 assert.equal(d.contracts.find(x=>x.contract==="NQU26").excluded.invalid,1);
 assert.equal(d.contracts.find(x=>x.contract==="NQU26").excluded.nonTradableTick,1);
});
test("validation refuses unsupported settings",()=>{
 assert.throws(()=>normalizeNQDaily([], {minVolume:2}),/Invalid/);
 assert.throws(()=>normalizeNQDaily([], {earliest:"bad"}),/Invalid/);
});
test("all three private research apps expose an NQ evaluation option without substituting ES contract history",()=>{
 for(const path of ["roll-research.html","roll-lab.html","coverage.html"]){
  const html=fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
  const m=html.match(/<script>([\s\S]*?)<\/script>/);assert.ok(m);
  assert.doesNotThrow(()=>new Function(m[1]),path);
  assert.ok(html.includes("/api/nq-evaluation?"),path);
  assert.ok(html.includes("/api/community-expiries?"),path);
  assert.ok(html.includes("/api/free-contracts?"),path);
 }
});

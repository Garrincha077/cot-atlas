import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {Buffer} from "node:buffer";
import handler,{SOURCES,createHandler} from "../api/community-expiries.js";
import {createHash} from "node:crypto";

const fixture=(tag,dates=["2026-01-05","2026-01-06","2026-01-07","2026-01-08"])=>{
 const lines=["contract,datetime,open,high,low,close,volume"];
 for(const date of dates)for(let n=0;n<300;n++){
  const h=12+Math.floor(n/60),m=n%60,ts=date+" "+String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":00-0500";
  lines.push([tag,ts,5000,5000,4999,5000+n*.25,5].join(","));
 }
 return lines.join("\n")+"\n";
};
const mocks={
 "ESH6":fixture("ESH6"),
 "ESM6":fixture("ESM6",["2026-04-06","2026-04-07","2026-04-08","2026-04-09"]),
 "ESU6":fixture("ESU6",["2026-07-06","2026-07-07","2026-07-08","2026-07-09"]),
 "ESZ6":fixture("ESZ6",["2026-09-21","2026-09-22","2026-09-23","2026-09-24"])
};
const mockHandler=createHandler(SOURCES.map(s=>({...s,sha256:createHash("sha256").update(mocks[s.tag]).digest("hex")})));
const fakeReq=(query={})=>({method:"GET",query:{root:"ES",years:"10",minVolume:"10",...query}});
const fakeRes=()=>({code:200,headers:{},status(x){this.code=x;return this},setHeader(k,v){this.headers[k]=v},json(v){this.data=v;return v}});
async function guarded(action){
 const saved=globalThis.fetch;
 globalThis.fetch=async url=>{
  const tag=String(url).match(/-ES(H|M|U|Z)6\.csv/)?.[1];
  const body=mocks[tag?"ES"+tag+"6":"BAD"];
  if(!body)return {ok:false,status:404,headers:{get:()=>null}};
  const bytes=Buffer.from(body);
  return {ok:true,headers:{get:k=>k==="content-length"?String(bytes.length):null},arrayBuffer:async()=>bytes};
 };
 try{return await action()}finally{globalThis.fetch=saved}
}
test("reject invalid market roots or unsupported lookback/liquidity inputs",async()=>{
 let x=fakeRes();await handler(fakeReq({root:"NQ"}),x);assert.equal(x.code,400);
 x=fakeRes();await handler(fakeReq({years:"20"}),x);assert.equal(x.code,400);
 x=fakeRes();await handler(fakeReq({minVolume:"-1"}),x);assert.equal(x.code,400);
});
test("strict ES importer reads only explicit IBKR-labelled expiries and matches quote semantics",async()=>{
 await guarded(async()=>{
  const x=fakeRes();await mockHandler(fakeReq(),x);
  assert.equal(x.code,200);
  assert.equal(x.data.rows.length,16);
  assert.equal(x.data.contracts.length,4);
  assert.ok(x.data.contracts.every(c=>c.rows===4));
  assert.equal(x.data.originalProviderAuthenticated,false);
  assert.equal(x.data.licensedExchangeSettlements,false);
  assert.equal(x.headers["Cache-Control"],"private,no-store,max-age=0");
  assert.ok(x.data.contracts.every(c=>/^[0-9a-f]{64}$/.test(c.sourceFileSha256)));
  for(const bar of x.data.rows){assert.equal(bar.root,"ES");assert.equal(bar.multiplier,50);assert.equal(bar.tick_size,.25);assert.ok(bar.volume>=10);assert.ok(bar.date<=bar.expiry);}
 });
});
test("missing upstream contract CSV never causes synthetic backfill",async()=>{
 const original=mocks.ESZ6;delete mocks.ESZ6;
 try{await guarded(async()=>{
  const x=fakeRes();await mockHandler(fakeReq(),x);
  assert.equal(x.code,200);assert.equal(x.data.rows.length,12);
  const absent=x.data.contracts.find(c=>c.contract==="ESZ26");
  assert.equal(absent.available,false);
  assert.equal(absent.rows,undefined);
 })}finally{mocks.ESZ6=original}
});
test("do not treat off-session minutes or unlabelled root data as valid close",async()=>{
 const original=mocks.ESH6;
 mocks.ESH6=fixture("NQH6"); // wrong contract, must not quietly accept
 try{await guarded(async()=>{
  const x=fakeRes();await mockHandler(fakeReq(),x);
  assert.equal(x.code,200);assert.equal(x.data.rows.length,12);
  assert.equal(x.data.contracts.find(c=>c.contract==="ESH26").available,false);
 })}finally{mocks.ESH6=original}
});
test("research & roll UIs load community ES only on ES, with Yahoo fallback for NQ",()=>{
 for(const path of ["roll-research.html","roll-lab.html","coverage.html"]){
  const html=fs.readFileSync(new URL("../"+path,import.meta.url),"utf8");
  const m=html.match(/<script>([\s\S]*?)<\/script>/);assert.ok(m,path);
  assert.doesNotThrow(()=>new Function(m[1]),path);
  assert.ok(html.includes("/api/community-expiries?"),path);
  assert.ok(html.includes("/api/free-contracts?"),path);
 }
});

test("modified upstream ES payload fails SHA-256 verification without substituting another contract",async()=>{
 const orig=mocks.ESM6;
 mocks.ESM6=orig.replace("2026-04-06", "2026-04-05"); // Source changed: pinned fixture bytes must fail
 try{await guarded(async()=>{
  const x=fakeRes();await mockHandler(fakeReq(),x);
  assert.equal(x.code,200);
  assert.ok(x.data.contracts.find(c=>c.contract==="ESM26").reason.includes("SHA-256 changed"));
  assert.ok(!x.data.rows.some(r=>r.contract==="ESM26"));
  assert.equal(x.data.rows.length,12);
 })}finally{mocks.ESM6=orig}
});

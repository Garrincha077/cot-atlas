import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=p=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("private per-expiry feed includes contract-specific symbols across 13 market roots",()=>{
 const api=read("api/free-contracts.js");
 for(const x of ["GCZ25.CMX","GCZ26.CMX","GCG27.CMX","ESZ26.CME","CLZ26.NYM","SIZ26.CMX","NQZ26.CME","NGZ26.NYM","HGZ26.CMX","ZCZ26.CBT","ZSX26.CBT","ZWZ26.CBT","ZNZ26.CBT","ZBZ26.CBT","PLF27.NYM"])assert.ok(api.includes(x),x);
 const roots=[...api.matchAll(/^ (GC|ES|CL|SI|NQ|NG|HG|ZC|ZS|ZW|ZN|ZB|PL):\{label:/gm)].map(m=>m[1]);
 assert.equal(roots.length,13);
 assert.equal(new Set(roots).size,13);
 for(const entry of ['ZC:{label:"CBOT Corn",exchange:"CBOT",multiplier:50,tickSize:0.25','ZS:{label:"CBOT Soybeans",exchange:"CBOT",multiplier:50,tickSize:0.25','ZW:{label:"CBOT Chicago SRW Wheat",exchange:"CBOT",multiplier:50,tickSize:0.25'])assert.ok(api.includes(entry));
 // Yahoo grain prices are in cents/bushel: a 0.25 cent tick × $50/cent = $12.50, not 5000×0.25.
 assert.equal(0.25*50,12.5);
 for(const x of ['expiry:"2025-12-29"','expiry:"2026-12-29"','expiry:"2026-12-18"','expiry:"2026-11-20"'])assert.ok(api.includes(x),x);
 assert.ok(api.includes('Cache-Control","private,no-store'));
 assert.ok(api.includes("YAHOO_DAILY_CLOSE_PROXY__NOT_EXCHANGE_SETTLEMENT"));
});
test("free contract feed excludes post-expiry prices and volume-zero quotes",()=>{
 const api=read("api/free-contracts.js");
 assert.match(api,/x\.date<=c\.expiry/);
 assert.match(api,/x\.volume>=minVolume/);
 assert.match(api,/if\(!conf\)return res\.status\(400\)/);
 assert.match(api,/licensedExchangeSettlements:false/);
});
test("free contract UI retains manual local file import with unambiguous provenance",()=>{
 const html=read("roll-lab.html"),inline=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(inline);
 assert.doesNotThrow(()=>new Function(inline[1]));
 for(const id of ['id="freeLoad"','id="freeRoot"','id="csv"','id="simulate"','id="sourceStatus"'])assert.ok(html.includes(id),id);
 assert.ok(html.includes("NE službeni settlementi"));
 for(const root of ["SI","NQ","NG","HG","ZC","ZS","ZW","ZN","ZB","PL"])assert.ok(html.includes('value="'+root+'"'),root);
 assert.ok(html.includes("crypto.subtle.digest"));
});

test("per-expiry fetch supports 10-year individual-contract chart plus explicit volume gate",()=>{
 const api=read("api/free-contracts.js");
 assert.ok(api.includes("years??10"));
 assert.ok(api.includes("minVolume??10"));
 assert.ok(api.includes("[2,5,10].includes(years)"));
 assert.ok(api.includes("[1,10,100].includes(minVolume)"));
 assert.ok(api.includes("x.volume>=minVolume"));
 assert.ok(api.includes('private,no-store'));
});
